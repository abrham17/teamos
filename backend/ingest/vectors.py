import hashlib
import logging
import random

from django.conf import settings
from openai import OpenAI, OpenAIError
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest

from teamos_project.llm_config import effective_embedding_dimensions, embedding_model_name

logger = logging.getLogger(__name__)


class VectorStore:
    """
    Qdrant + OpenAI-compatible SDK.

    - ``LLM_BACKEND=groq`` (development): chat completions go to Groq; embeddings use
      ``OPENAI_API_KEY`` when configured and ``USE_DETERMINISTIC_EMBEDDINGS`` is false,
      otherwise deterministic local vectors.
    - ``LLM_BACKEND=openai`` (production): OpenAI client for chat + embeddings when key set.
    """

    def __init__(self):
        self.qdrant = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
        )
        backend = getattr(settings, "LLM_BACKEND", "openai").lower()
        self._llm_backend = backend

        self._embed_client: OpenAI | None = None
        if settings.OPENAI_API_KEY:
            self._embed_client = OpenAI(api_key=settings.OPENAI_API_KEY)

        self.openai: OpenAI | None = None
        if backend == "groq" and getattr(settings, "GROQ_API_KEY", ""):
            self.openai = OpenAI(
                api_key=settings.GROQ_API_KEY,
                base_url=getattr(
                    settings,
                    "GROQ_API_BASE",
                    "https://api.groq.com/openai/v1",
                ),
            )
        elif settings.OPENAI_API_KEY:
            self.openai = OpenAI(api_key=settings.OPENAI_API_KEY)
            if self._embed_client is None:
                self._embed_client = self.openai

    def _mock_embedding(self, text: str, dim: int = 1536) -> list[float]:
        """
        Deterministic unit vector from text so local/Qdrant semantic search
        differentiates pages without OpenAI (all-zero vectors collapse similarity).
        """
        digest = hashlib.sha256((text or "").encode("utf-8", errors="ignore")).hexdigest()
        rng = random.Random(digest)
        vec = [rng.gauss(0.0, 1.0) for _ in range(dim)]
        mag = sum(x * x for x in vec) ** 0.5
        if mag <= 0:
            return [0.0] * dim
        return [x / mag for x in vec]

    def _get_embedding(self, text: str, model: str | None = None):
        dim = effective_embedding_dimensions()
        if getattr(settings, "USE_DETERMINISTIC_EMBEDDINGS", False):
            return self._mock_embedding(text, dim=dim)

        if model is None:
            model = embedding_model_name()

        embedder = self._embed_client
        if not embedder:
            logger.warning(
                "No OpenAI embedding client (set OPENAI_API_KEY for vectors, or use deterministic fallback)."
            )
            return self._mock_embedding(text, dim=dim)

        try:
            response = embedder.embeddings.create(
                input=[text.replace("\n", " ")],
                model=model,
            )
            return response.data[0].embedding
        except OpenAIError as exc:
            logger.warning(
                "OpenAI embedding failed (%s: %s); using deterministic local fallback.",
                type(exc).__name__,
                exc,
            )
            return self._mock_embedding(text, dim=dim)

    def ensure_collection(self, team_id: str, vector_size: int | None = None):
        if vector_size is None:
            vector_size = effective_embedding_dimensions()
        collection_name = f"team_{team_id}"
        collections = self.qdrant.get_collections().collections
        if not any(c.name == collection_name for c in collections):
            logger.info("Creating Qdrant collection: %s", collection_name)
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=rest.VectorParams(
                    size=vector_size,
                    distance=rest.Distance.COSINE,
                ),
            )
        return collection_name

    def upsert_chunks(self, team_id: str, page_id: str, chunks_data: list):
        """
        chunks_data: list of dicts with {id, content, index, title}
        """
        collection_name = self.ensure_collection(str(team_id))
        points = []

        for chunk in chunks_data:
            vector = self._get_embedding(chunk["content"])
            points.append(
                rest.PointStruct(
                    id=chunk["id"],
                    vector=vector,
                    payload={
                        "page_id": str(page_id),
                        "page_title": chunk["title"],
                        "chunk_index": chunk["index"],
                        "content": chunk["content"],
                        "team_id": str(team_id),
                    },
                )
            )

        self.qdrant.upsert(
            collection_name=collection_name,
            points=points,
        )

    def search_similar_pages(self, team_id: str, query_text: str, limit: int = 5):
        collection_name = self.ensure_collection(str(team_id))
        vector = self._get_embedding(query_text)

        if hasattr(self.qdrant, "query_points"):
            resp = self.qdrant.query_points(
                collection_name=collection_name,
                query=vector,
                limit=limit,
                with_payload=True,
            )
            return list(resp.points)

        return self.qdrant.search(
            collection_name=collection_name,
            query_vector=vector,
            limit=limit,
            with_payload=True,
        )


vector_store = VectorStore()
