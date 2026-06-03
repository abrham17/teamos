import hashlib
import time
import logging
from chat.intent.schema import IntentSchema, ClassificationResult, HybridClassification
from chat.intent.cache import get_cached_intent, cache_intent
from chat.intent.embedding_classifier import get_classifier
from chat.intent.llm_classifier import llm_classify

logger = logging.getLogger(__name__)

class HybridIntentClassifier:
    EMBEDDING_CONFIDENCE_THRESHOLD = 0.82
    
    def classify(self, message: str, team, session_id: str = "") -> HybridClassification:
        res = self.classify_with_metadata(message, team, session_id)
        return HybridClassification(
            intent=res.intent,
            layer_used=res.layer_used,
            similarity_score=res.similarity_score,
            latency_ms=res.latency_ms
        )
        
    def classify_with_metadata(self, message: str, team, session_id: str = "") -> ClassificationResult:
        from chat.models import IntentClassificationLog
        
        start = time.monotonic()
        team_id = str(team.id)
        
        # Layer 1: Cache
        cached = get_cached_intent(message, team_id)
        if cached:
            latency = int((time.monotonic() - start) * 1000)
            res = ClassificationResult(intent=cached, layer_used=1, latency_ms=latency)
            self._log_classification(message, team, session_id, res)
            return res
            
        # Layer 2: Embedding Similarity
        intent = None
        score = None
        try:
            intent, score = get_classifier().classify(message, self.EMBEDDING_CONFIDENCE_THRESHOLD)
        except Exception:
            logger.exception("Layer 2 classification failed, proceeding to Layer 3 fallback")
            
        if intent:
            cache_intent(message, team_id, intent)
            latency = int((time.monotonic() - start) * 1000)
            res = ClassificationResult(intent=intent, layer_used=2, similarity_score=score, latency_ms=latency)
            self._log_classification(message, team, session_id, res)
            return res
            
        # Layer 3: LLM Classifier (Fallback)
        intent = llm_classify(message, team)
        cache_intent(message, team_id, intent)
        latency = int((time.monotonic() - start) * 1000)
        res = ClassificationResult(intent=intent, layer_used=3, similarity_score=score, latency_ms=latency)
        self._log_classification(message, team, session_id, res)
        return res
        
    def _log_classification(self, message: str, team, session_id: str, res: ClassificationResult):
        try:
            from chat.models import IntentClassificationLog
            h = hashlib.sha256(message.strip().lower().encode()).hexdigest()
            IntentClassificationLog.objects.create(
                team=team,
                session_id=session_id,
                message=message[:2000],
                message_hash=h,
                intent_type=res.intent.intent_type,
                complexity=res.intent.complexity,
                domains=res.intent.domains,
                required_capabilities=res.intent.required_capabilities,
                intent_confidence=res.intent.confidence,
                layer_used=res.layer_used,
                similarity_score=res.similarity_score,
                latency_ms=res.latency_ms
            )
        except Exception:
            logger.exception("Failed to write IntentClassificationLog")
