import logging
import numpy as np
from chat.intent.examples import INTENT_EXAMPLES
from chat.intent.schema import IntentSchema
from ingest.vectors import vector_store

logger = logging.getLogger(__name__)

class EmbeddingClassifier:
    def __init__(self):
        self.index = None  # shape: (n_examples, 1536)
        self.examples = []
        
    def _build_index(self):
        """Pre-compute embeddings for all static examples."""
        if self.index is not None:
            return
            
        embeddings = []
        valid_examples = []
        for ex in INTENT_EXAMPLES:
            try:
                emb = vector_store._get_embedding(ex["message"])
                if emb:
                    arr = np.array(emb, dtype=np.float32)
                    norm = np.linalg.norm(arr)
                    if norm > 0:
                        arr = arr / norm
                    embeddings.append(arr)
                    valid_examples.append(ex)
            except Exception:
                logger.warning(f"Failed to generate embedding for example: {ex['message']}")
                
        if embeddings:
            self.index = np.vstack(embeddings)
            self.examples = valid_examples
            logger.info("Successfully built intent examples embedding index with %d items.", len(self.examples))
        else:
            logger.error("Failed to build intent embedding index: no embeddings generated")
            
    def classify(self, message: str, confidence_threshold: float = 0.82) -> tuple[IntentSchema | None, float]:
        """
        Calculates similarity with pre-computed examples and returns matched intent.
        """
        try:
            self._build_index()
        except Exception:
            logger.exception("Failed to build/initialize embedding classifier index")
            return None, 0.0
            
        if self.index is None or not self.examples:
            return None, 0.0
            
        # Get query embedding
        try:
            emb = vector_store._get_embedding(message)
            if not emb:
                return None, 0.0
        except Exception:
            logger.exception("Failed to embed query message")
            return None, 0.0
            
        q_arr = np.array(emb, dtype=np.float32)
        q_norm = np.linalg.norm(q_arr)
        if q_norm > 0:
            q_arr = q_arr / q_norm
            
        # Cosine similarity via dot product
        similarities = np.dot(self.index, q_arr)
        best_idx = np.argmax(similarities)
        best_score = float(similarities[best_idx])
        
        if best_score >= confidence_threshold:
            matched = self.examples[best_idx]["intent"]
            # Create a copy so we don't modify the static template
            intent = IntentSchema(
                intent_type=matched.intent_type,
                complexity=matched.complexity,
                domains=matched.domains,
                required_capabilities=matched.required_capabilities,
                parallelizable=matched.parallelizable,
                estimated_rounds=matched.estimated_rounds,
                requires_external=matched.requires_external,
                confidence=best_score
            )
            return intent, best_score
            
        return None, best_score

    def add_example(self, message: str, intent: IntentSchema):
        """Dynamically add an example to the in-memory index."""
        try:
            self._build_index()
            emb = vector_store._get_embedding(message)
            if emb:
                arr = np.array(emb, dtype=np.float32)
                norm = np.linalg.norm(arr)
                if norm > 0:
                    arr = arr / norm
                if self.index is not None:
                    self.index = np.vstack([self.index, arr])
                else:
                    self.index = np.array([arr])
                self.examples.append({"message": message, "intent": intent})
        except Exception:
            logger.exception("Failed to dynamically add intent example")

_classifier = None

def get_classifier() -> EmbeddingClassifier:
    global _classifier
    if _classifier is None:
        _classifier = EmbeddingClassifier()
    return _classifier
