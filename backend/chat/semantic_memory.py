"""Semantic memory recall using vector similarity search.

Performance-optimized: uses pre-computed embeddings stored on AgentEpisode
and pgvector CosineDistance for O(1)-embedding-call recall instead of
the previous N+1 approach (which made 50+ embedding API calls per query).
"""

import logging
from typing import Any

from django.db import connection

from chat.models import AgentEpisode, AgentMemory
from ingest.vectors import vector_store
from langsmith import traceable

logger = logging.getLogger(__name__)


# ── Embedding helper ──────────────────────────────────────────────────

def _embed_text(text: str) -> list[float] | None:
    """Generate an embedding vector via the shared VectorStore client.

    Uses the same embedding path as wiki/plan chunks — no separate
    llm_call overhead, shared retry logic, deterministic fallback.
    """
    try:
        return vector_store._get_embedding(text)
    except Exception:
        logger.exception("Embedding generation failed")
        return None


@traceable(name="compute_episode_embedding", run_type="chain")
def compute_episode_embedding(episode: AgentEpisode) -> None:
    """Compute and persist the embedding for an episode (called once on creation).

    This is the key optimisation: we embed once at write-time, not N times
    at read-time.
    """
    text = f"Trigger: {episode.trigger}\nLearnings: {episode.learnings or 'None'}"
    emb = _embed_text(text)
    if emb:
        AgentEpisode.objects.filter(id=episode.id).update(embedding=emb)


# ── Episode recall (was 51 API calls, now 1 + 1 DB query) ────────────

@traceable(name="recall_similar_episodes", run_type="retriever")
def recall_similar_episodes(team_id: str, query: str, top_k: int = 5) -> list[dict]:
    """Recall past episodes semantically similar to the current query.

    Uses pgvector CosineDistance when available (Postgres), falls back to
    keyword matching otherwise (SQLite/dev).
    """
    if connection.vendor != "postgresql":
        episodes = AgentEpisode.objects.filter(team_id=team_id).order_by("-created_at")[:50]
        return _fallback_keyword_recall(episodes, query, top_k)

    # Single embedding call for the query
    query_embedding = _embed_text(query)
    if not query_embedding:
        episodes = AgentEpisode.objects.filter(team_id=team_id).order_by("-created_at")[:50]
        return _fallback_keyword_recall(episodes, query, top_k)

    # pgvector: one fast indexed query instead of 50 API calls
    from pgvector.django import CosineDistance

    results = (
        AgentEpisode.objects.filter(team_id=team_id, embedding__isnull=False)
        .annotate(distance=CosineDistance("embedding", query_embedding))
        .filter(distance__lt=0.55)
        .order_by("distance")[:top_k]
    )

    if not results:
        # Fall back to keyword if no embedded episodes exist yet
        episodes = AgentEpisode.objects.filter(team_id=team_id).order_by("-created_at")[:50]
        return _fallback_keyword_recall(episodes, query, top_k)

    return [
        {
            "id": str(ep.id),
            "trigger": ep.trigger,
            "learnings": ep.learnings,
            "success": ep.success,
            "similarity": round(1.0 - float(ep.distance), 3),
        }
        for ep in results
    ]


def _fallback_keyword_recall(episodes, query: str, top_k: int) -> list[dict]:
    """Fallback: keyword-based recall when embeddings fail."""
    query_words = set(query.lower().split())
    scored = []

    for ep in episodes:
        text = f"{ep.trigger} {ep.learnings or ''}".lower()
        words = set(text.split())
        overlap = len(query_words & words)
        if overlap > 0:
            scored.append((overlap, ep))

    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        {
            "id": str(ep.id),
            "trigger": ep.trigger,
            "learnings": ep.learnings,
            "success": ep.success,
            "similarity": float(overlap),
        }
        for overlap, ep in scored[:top_k]
    ]


def recall_relevant_memories(team_id: str, query: str, top_k: int = 5) -> list[dict]:
    """Recall key-value memories relevant to the query."""
    memories = AgentMemory.objects.filter(team_id=team_id)

    if not memories:
        return []

    query_words = set(query.lower().split())
    scored = []

    for mem in memories:
        text = f"{mem.key} {mem.value or ''} {mem.summary or ''}".lower()
        words = set(text.split())
        overlap = len(query_words & words)
        if overlap > 0:
            scored.append((overlap, mem))

    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        {
            "key": mem.key,
            "value": mem.value,
            "summary": mem.summary,
            "category": mem.category,
            "relevance": float(overlap),
        }
        for overlap, mem in scored[:top_k]
    ]


def get_memory_context(team_id: str, query: str) -> str:
    """Build a memory context string for injection into the agent's system prompt."""
    episodes = recall_similar_episodes(team_id, query, top_k=3)
    memories = recall_relevant_memories(team_id, query, top_k=3)

    parts = []

    if episodes:
        parts.append("## Relevant Past Experiences\n")
        for ep in episodes:
            status = "✓" if ep["success"] else "✗"
            parts.append(f"- [{status}] {ep['trigger'][:100]}")
            if ep.get("learnings"):
                parts.append(f"  Learning: {ep['learnings'][:200]}")
        parts.append("")

    if memories:
        parts.append("## Relevant Stored Knowledge\n")
        for mem in memories:
            parts.append(f"- **{mem['key']}** ({mem['category']}): {mem.get('summary', mem.get('value', ''))[:200]}")
        parts.append("")

    return "\n".join(parts)
