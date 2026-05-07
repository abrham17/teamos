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

        # Initialize local HF model placeholder
        self._hf_model = None

    def _get_hf_model(self):
        """Lazy load the sentence-transformers model so it doesn't block startup."""
        if self._hf_model is None:
            try:
                from sentence_transformers import SentenceTransformer
                logger.info("Loading local HuggingFace embedding model (all-MiniLM-L6-v2)...")
                self._hf_model = SentenceTransformer("all-MiniLM-L6-v2")
            except ImportError:
                logger.error("sentence-transformers not installed. Fallback to mock.")
                return None
        return self._hf_model



    def _get_embedding(self, text: str, model: str | None = None):
        embedder = self._embed_client

        if embedder:
            if model is None:
                model = embedding_model_name()
            try:
                response = embedder.embeddings.create(
                    input=[text.replace("\n", " ")],
                    model=model,
                )
                return response.data[0].embedding
            except OpenAIError as exc:
                logger.warning(
                    "OpenAI embedding failed (%s: %s); falling back to local HuggingFace model.",
                    type(exc).__name__,
                    exc,
                )
        
        # Fall back to HF model if no OpenAI key or OpenAI failed
        hf_model = self._get_hf_model()
        if hf_model is not None:
            return hf_model.encode(text).tolist()
        
        raise RuntimeError("No embedding provider available. Set OPENAI_API_KEY or install sentence-transformers.")



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

    def upsert_plan_chunks(self, team_id: str, project_id: str, chunks_data: list):
        """
        chunks_data: list of dicts with
        {id, content, index, project_name, source_kind, source_ref_id, title}
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
                        "source_type": "plan",
                        "project_id": str(project_id),
                        "project_name": chunk["project_name"],
                        "source_kind": chunk["source_kind"],
                        "source_ref_id": chunk.get("source_ref_id"),
                        "title": chunk["title"],
                        "chunk_index": chunk["index"],
                        "chunk_id": chunk["id"],
                        "content": chunk["content"],
                        "team_id": str(team_id),
                    },
                )
            )
        self.qdrant.upsert(collection_name=collection_name, points=points)

    def delete_points(self, team_id: str, point_ids: list[str]):
        if not point_ids:
            return
        collection_name = self.ensure_collection(str(team_id))
        self.qdrant.delete(
            collection_name=collection_name,
            points_selector=rest.PointIdsList(points=point_ids),
        )


vector_store = VectorStore()
