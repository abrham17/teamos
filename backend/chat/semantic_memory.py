"""Semantic memory recall using vector similarity search."""

import logging
from llm_orchestrator.orchestrator import llm_call
from chat.models import AgentEpisode, AgentMemory

logger = logging.getLogger(__name__)


def _embed(text: str) -> list[float]:
    """Generate embedding vector for a text string."""
    resp, _, _ = llm_call(
        operation="embedding",
        messages=[{"role": "user", "content": text}],
        embedding=True,
    )
    if resp and hasattr(resp, "data") and resp.data:
        return resp.data[0].embedding
    return []


def recall_similar_episodes(team_id: str, query: str, top_k: int = 5) -> list[dict]:
    """Recall past episodes semantically similar to the current query."""
    episodes = AgentEpisode.objects.filter(team_id=team_id).order_by("-created_at")[:50]

    if not episodes:
        return []

    # Build a search corpus from episode triggers and learnings
    corpus = []
    for ep in episodes:
        text = f"Trigger: {ep.trigger}\nLearnings: {ep.learnings or 'None'}"
        corpus.append({"id": str(ep.id), "text": text, "episode": ep})

    query_embedding = _embed(query)
    if not query_embedding:
        return _fallback_keyword_recall(episodes, query, top_k)

    # Score each episode by cosine similarity
    import math

    def cosine_sim(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

    scored = []
    for item in corpus:
        emb = _embed(item["text"])
        if emb:
            sim = cosine_sim(query_embedding, emb)
            scored.append((sim, item["episode"]))

    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        {
            "id": str(ep.id),
            "trigger": ep.trigger,
            "learnings": ep.learnings,
            "success": ep.success,
            "similarity": round(sim, 3),
        }
        for sim, ep in scored[:top_k]
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


def should_remember(trigger: str, success: bool, learnings: str) -> bool:
    """Determine if this interaction is worth persisting as an episode."""
    # Always remember failures
    if not success:
        return True

    # Remember if there are explicit learnings
    if learnings and len(learnings) > 50:
        return True

    # Remember if the trigger contains decision-making keywords
    decision_keywords = ["decide", "decision", "priority", "blocker", "risk", "conflict", "resolve"]
    trigger_lower = trigger.lower()
    if any(kw in trigger_lower for kw in decision_keywords):
        return True

    return False


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
