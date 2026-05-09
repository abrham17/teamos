import logging
from django.conf import settings
from openai import OpenAI, OpenAIError
from pgvector.django import CosineDistance

from teamos_project.llm_config import embedding_model_name

logger = logging.getLogger(__name__)


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

        # 3. Fallback for Groq
        if backend == "groq" and getattr(settings, "GROQ_API_KEY", ""):
            self.openai = OpenAI(
                api_key=settings.GROQ_API_KEY,
                base_url=getattr(settings, "GROQ_API_BASE", "https://api.groq.com/openai/v1"),
            )

    def _get_embedding(self, text: str, model: str | None = None):
        if self._embed_client is None:
            raise RuntimeError("Neither OPENAI_API_KEY nor OPENROUTER_API_KEY is set. Embeddings are required.")

        if model is None:
            model = embedding_model_name()
        
        # Robustness: Remove problematic chars and retry up to 2 times
        clean_text = text.replace("\n", " ").strip()
        if not clean_text:
            clean_text = "Empty content"

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
        raise last_err

    def upsert_chunks(self, team_id, page_id, chunks_data: list):
        """
        chunks_data: list of dicts with {id, content, index, title}
        """
        from wiki.models import PageChunk
        
        for chunk in chunks_data:
            vector = self._get_embedding(chunk["content"])
            PageChunk.objects.filter(id=chunk["id"]).update(embedding=vector)

    def search_similar_pages(self, team_id: str, query_text: str, limit: int = 5):
        from wiki.models import PageChunk
        
        vector = self._get_embedding(query_text)
        
        # Filter by team_id (via page__team_id) and order by cosine distance
        results = (
            PageChunk.objects.filter(page__team_id=team_id)
            .annotate(distance=CosineDistance("embedding", vector))
            .order_by("distance")[:limit]
        )
        
        # Mocking the Qdrant response structure for compatibility
        class MockPoint:
            def __init__(self, chunk):
                self.id = str(chunk.id)
                self.payload = {
                    "page_id": str(chunk.page_id),
                    "page_title": chunk.page.title,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "team_id": str(team_id),
                }
                self.score = 1.0 # Could be derived from distance if needed
        
        return [MockPoint(r) for r in results]

    def upsert_plan_chunks(self, team_id: str, project_id: str, chunks_data: list):
        """
        chunks_data: list of dicts with
        {id, content, index, project_name, source_kind, source_ref_id, title}
        """
        from planning.models import PlanChunk
        
        for chunk in chunks_data:
            vector = self._get_embedding(chunk["content"])
            PlanChunk.objects.filter(id=chunk["id"]).update(embedding=vector)

    def delete_points(self, team_id: str, point_ids: list[str]):
        """
        In PGVector, deleting the DB rows (PageChunk/PlanChunk) handles this.
        This method is kept for API compatibility but doesn't need to do anything
        if the caller already deletes the rows.
        """
        pass


vector_store = VectorStore()
