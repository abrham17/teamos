import hashlib
import logging
import math
from django.conf import settings
from django.db import connection
from openai import OpenAI, OpenAIError
from pgvector.django import CosineDistance

from teamos_project.llm_config import embedding_model_name

logger = logging.getLogger(__name__)


def _deterministic_embedding(text: str) -> list[float]:
    """Stable local embedding fallback for dev/test and API outage paths."""
    dim = getattr(settings, "OPENAI_EMBEDDING_DIMENSIONS", None) or 1536
    try:
        dim = int(dim)
    except (TypeError, ValueError):
        dim = 1536

    seed = hashlib.sha256((text or "Empty content").encode("utf-8", errors="ignore")).digest()
    values: list[float] = []
    counter = 0
    while len(values) < dim:
        block = hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
        for byte in block:
            values.append((byte / 127.5) - 1.0)
            if len(values) >= dim:
                break
        counter += 1

    norm = math.sqrt(sum(v * v for v in values)) or 1.0
    return [v / norm for v in values]


class VectorStore:
    """
    PGVector + OpenAI-compatible SDK.
    Uses Django models (PageChunk, PlanChunk) to store and search embeddings.
    """

    def __init__(self):
        backend = getattr(settings, "LLM_BACKEND", "openai").lower()
        self._llm_backend = backend

        self._embed_client: OpenAI | None = None
        self.openai: OpenAI | None = None

        openai_key = getattr(settings, "OPENAI_API_KEY", "")
        openrouter_key = getattr(settings, "OPENROUTER_API_KEY", "")
        
        def is_valid(k):
            return k and k.strip() and k.lower() != "not_set"

        # 1. Setup OpenRouter if valid
        if is_valid(openrouter_key):
            self.openai = OpenAI(
                api_key=openrouter_key,
                base_url=getattr(settings, "OPENROUTER_API_BASE", "https://openrouter.ai/api/v1"),
                default_headers={
                    "HTTP-Referer": "https://team-os.tech",
                    "X-Title": "TeamOS",
                }
            )
            self._embed_client = self.openai

        # 2. Setup OpenAI if valid (overrides OpenRouter for embeddings)
        if is_valid(openai_key):
            openai_client = OpenAI(api_key=openai_key)
            self._embed_client = openai_client
            if backend == "openai":
                self.openai = openai_client

    def _get_embedding(self, text: str, model: str | None = None):
        clean_text = text.replace("\n", " ").strip()
        if not clean_text:
            clean_text = "Empty content"

        if getattr(settings, "USE_DETERMINISTIC_EMBEDDINGS", False) or self._embed_client is None:
            return _deterministic_embedding(clean_text)

        if model is None:
            model = embedding_model_name()

        last_err = None
        for attempt in range(3):
            try:
                response = self._embed_client.embeddings.create(
                    input=[clean_text],
                    model=model,
                )
                if not response or not getattr(response, "data", None) or len(response.data) == 0:
                    raise ValueError("No embedding data received from API")
                
                return response.data[0].embedding
            except Exception as exc:
                last_err = exc
                logger.warning("Embedding attempt %s failed: %s", attempt + 1, exc)
                import time
                time.sleep(1) # Brief backoff
        
        logger.error("All embedding attempts failed. Last error: %s", last_err)
        return _deterministic_embedding(clean_text)

    def upsert_chunks(self, team_id, page_id, chunks_data: list):
        """
        chunks_data: list of dicts with {id, content, index, title}
        """
        from wiki.models import PageChunk
        
        for chunk in chunks_data:
            # Include title in embedding text for better context retrieval
            title = chunk.get("title", "Untitled")
            embed_text = f"Title: {title}\n\n{chunk['content']}"
            vector = self._get_embedding(embed_text)
            PageChunk.objects.filter(id=chunk["id"]).update(embedding=vector)

    def search_similar_pages(self, team_id: str, query_text: str, limit: int = 10):
        from wiki.models import PageChunk

        if connection.vendor != "postgresql":
            return self._keyword_search_similar_pages(team_id, query_text, limit=limit)
        
        vector = self._get_embedding(query_text)
        
        wiki_results = (
            PageChunk.objects.filter(page__team_id=team_id)
            .annotate(distance=CosineDistance("embedding", vector))
            .filter(distance__lt=0.45)
            .order_by("distance")[:limit]
        )
        
        class MockPoint:
            def __init__(self, obj):
                self.id = str(obj.id)
                self.score = 1.0 - float(obj.distance)
                self.payload = {
                    "source_type": "wiki",
                    "page_id": str(obj.page_id),
                    "page_title": obj.page.title,
                    "slug": obj.page.slug,
                    "chunk_index": obj.chunk_index,
                    "section_title": obj.section_title,
                    "content": obj.content,
                    "team_id": str(team_id),
                }
        
        return [MockPoint(r) for r in wiki_results]

    def _keyword_search_similar_pages(self, team_id: str, query_text: str, limit: int = 10):
        """SQLite/dev fallback when pgvector distance SQL is unavailable."""
        from wiki.models import PageChunk

        terms = [t.lower() for t in (query_text or "").split() if len(t) > 2][:12]

        def score_text(value: str) -> int:
            lowered = (value or "").lower()
            return sum(1 for term in terms if term in lowered)

        combined = []
        for chunk in PageChunk.objects.filter(page__team_id=team_id).select_related("page")[:200]:
            score = score_text(f"{chunk.page.title} {chunk.content}")
            if score:
                combined.append((score, chunk))

        combined.sort(key=lambda item: item[0], reverse=True)

        class MockPoint:
            def __init__(self, item):
                score, obj = item
                self.id = str(obj.id)
                self.score = float(score)
                self.payload = {
                    "source_type": "wiki",
                    "page_id": str(obj.page_id),
                    "page_title": obj.page.title,
                    "slug": obj.page.slug,
                    "chunk_index": obj.chunk_index,
                    "section_title": obj.section_title,
                    "content": obj.content,
                    "team_id": str(team_id),
                }

        return [MockPoint(item) for item in combined[:limit]]

    def upsert_plan_chunks(self, team_id: str, project_id: str, chunks_data: list):
        """
        chunks_data: list of dicts with
        {id, content, index, project_name, source_kind, source_ref_id, title}
        """
        from planning.models import PlanChunk
        
        for chunk in chunks_data:
            # Include title in embedding text for better context retrieval
            title = chunk.get("title") or chunk.get("project_name", "Untitled Plan")
            embed_text = f"Plan: {title}\n\n{chunk['content']}"
            vector = self._get_embedding(embed_text)
            PlanChunk.objects.filter(id=chunk["id"]).update(embedding=vector)

    def delete_points(self, team_id: str, point_ids: list[str]):
        """
        In PGVector, deleting the DB rows (PageChunk/PlanChunk) handles this.
        This method is kept for API compatibility but doesn't need to do anything
        if the caller already deletes the rows.
        """
        pass


vector_store = VectorStore()
