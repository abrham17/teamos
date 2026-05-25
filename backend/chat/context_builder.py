"""
Dynamic Context Builder.

Intelligently constructs the agent's context window within a token budget,
prioritizing the most relevant information from memory, RAG, graph, and history.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from chat.models import AgentMemory, ChatSession
from ingest.vectors import vector_store

logger = logging.getLogger(__name__)

DEFAULT_MAX_TOKENS = 14000
CHARS_PER_TOKEN = 3.8  # approximate


@dataclass
class ContextBlock:
    """A ranked block of context text with metadata."""
    source: str
    content: str
    relevance: float = 1.0
    token_estimate: int = 0

    def __post_init__(self):
        if not self.token_estimate:
            self.token_estimate = int(len(self.content) / CHARS_PER_TOKEN)


@dataclass
class BuiltContext:
    """Result of context building."""
    system_context: str
    memory_block: str
    rag_block: str
    graph_block: str
    history_block: str
    total_tokens_used: int = 0
    blocks_included: int = 0
    blocks_dropped: int = 0


class TokenBudget:
    """Manages allocation of tokens across context sections."""

    def __init__(self, max_tokens: int = DEFAULT_MAX_TOKENS):
        self.max_tokens = max_tokens
        self.used = 0

    @property
    def remaining(self) -> int:
        return max(0, self.max_tokens - self.used)

    def can_fit(self, tokens: int) -> bool:
        return self.used + tokens <= self.max_tokens

    def allocate(self, tokens: int) -> bool:
        if self.can_fit(tokens):
            self.used += tokens
            return True
        return False

    def allocate_partial(self, content: str, max_pct: float) -> str:
        """Allocate up to max_pct of total budget, truncating if needed."""
        max_allowed = int(self.max_tokens * max_pct)
        content_tokens = int(len(content) / CHARS_PER_TOKEN)

        if content_tokens <= max_allowed and self.can_fit(content_tokens):
            self.used += content_tokens
            return content

        # Truncate to fit
        available = min(max_allowed, self.remaining)
        if available <= 0:
            return ""
        max_chars = int(available * CHARS_PER_TOKEN)
        truncated = content[:max_chars] + "\n... [truncated]"
        self.used += available
        return truncated


class ContextBuilder:
    """
    Builds optimal context for the agent within a token budget.

    Allocation strategy:
    - Agent memory (critical persistent context): 12% budget
    - RAG results (most relevant wiki/plan content): 40% budget
    - Graph-connected context (deeper relationships): 18% budget
    - Session history (recent conversation): 30% budget
    """

    MEMORY_PCT = 0.12
    RAG_PCT = 0.40
    GRAPH_PCT = 0.18
    HISTORY_PCT = 0.30

    def __init__(self, team_id: str, max_tokens: int = DEFAULT_MAX_TOKENS):
        self.team_id = team_id
        self.max_tokens = max_tokens

    def build(
        self,
        query: str,
        session: ChatSession,
        *,
        include_graph: bool = True,
        history_limit: int = 12,
        preloaded_rag: list | None = None,
    ) -> BuiltContext:
        """Build the full context for an agent call.

        Args:
            preloaded_rag: Optional pre-fetched RAG results to avoid redundant
                           vector searches (e.g. already done in universal_stream).
        """
        budget = TokenBudget(self.max_tokens)
        blocks_included = 0
        blocks_dropped = 0

        # ── 1. Agent Memory (persistent awareness) ─────────────────
        memory_block = self._build_memory_block(budget)
        if memory_block:
            blocks_included += 1

        # ── 2. RAG: Vector search for relevant content ─────────────
        # Single search, reused for both RAG and graph expansion
        if preloaded_rag is not None:
            rag_results = preloaded_rag
        else:
            try:
                rag_results = vector_store.search_similar_pages(self.team_id, query, limit=10)
            except Exception:
                logger.exception("RAG search failed in context builder")
                rag_results = []

        rag_block, rag_count = self._build_rag_block(rag_results, budget)
        blocks_included += rag_count

        # ── 3. Graph: Expand from top RAG hits (reuse same results) ─
        graph_block = ""
        if include_graph:
            graph_block = self._build_graph_block(rag_results[:3], budget)
            if graph_block:
                blocks_included += 1

        # ── 4. Session History ─────────────────────────────────────
        history_block = self._build_history_block(session, budget, limit=history_limit)

        return BuiltContext(
            system_context=self._compose(memory_block, rag_block, graph_block),
            memory_block=memory_block,
            rag_block=rag_block,
            graph_block=graph_block,
            history_block=history_block,
            total_tokens_used=budget.used,
            blocks_included=blocks_included,
            blocks_dropped=blocks_dropped,
        )

    def _build_memory_block(self, budget: TokenBudget) -> str:
        """Load persistent agent memories."""
        from chat.agent_memory_service import get_agent_context_block

        try:
            raw = get_agent_context_block(self.team_id)
            if not raw.strip():
                return ""
            return budget.allocate_partial(raw, self.MEMORY_PCT)
        except Exception:
            logger.exception("Failed to load agent memory for context")
            return ""

    def _build_rag_block(self, results: list, budget: TokenBudget) -> tuple[str, int]:
        """Format pre-fetched vector search results within budget."""
        if not results:
            return "No retrieval snippets were returned for this query.", 0

        parts = []
        count = 0
        max_chars = int(self.max_tokens * self.RAG_PCT * CHARS_PER_TOKEN)
        current_chars = 0

        for res in results:
            source = (
                res.payload.get("page_title")
                or res.payload.get("project_name")
                or "Knowledge"
            )
            content = res.payload.get("content", "")
            entry = f"[{source}]: {content}"

            if current_chars + len(entry) > max_chars:
                break

            parts.append(entry)
            current_chars += len(entry)
            count += 1

        block = "\n\n".join(parts)
        allocated = budget.allocate_partial(block, self.RAG_PCT)
        return allocated, count

    def _build_graph_block(self, rag_results: list, budget: TokenBudget) -> str:
        """Expand graph connections from pre-fetched top RAG results.

        Accepts already-fetched results so we don't call
        vector_store.search_similar_pages a second time.
        """
        try:
            from graph_engine.traversal import traverse_neighbors

            if not rag_results:
                return ""

            graph_parts = []
            seen_page_ids = set()

            for res in rag_results[:3]:
                pid = res.payload.get("page_id")
                if not pid or pid in seen_page_ids:
                    continue
                seen_page_ids.add(pid)

                neighbors = traverse_neighbors(
                    pid, self.team_id, max_hops=1, include_content=True, max_results=3
                )
                for n in neighbors:
                    if n["page_id"] not in seen_page_ids:
                        seen_page_ids.add(n["page_id"])
                        excerpt = n.get("content_excerpt", "")[:300]
                        graph_parts.append(
                            f"[Graph→ {n['title']}]: {excerpt}"
                        )

            if not graph_parts:
                return ""

            block = "\n".join(graph_parts)
            return budget.allocate_partial(block, self.GRAPH_PCT)

        except Exception:
            logger.exception("Graph expansion failed in context builder")
            return ""

    def _build_history_block(
        self, session: ChatSession, budget: TokenBudget, limit: int = 12
    ) -> str:
        """Format recent session history within budget."""
        recent = list(session.messages.order_by("-created_at")[:limit])
        if not recent:
            return ""

        parts = []
        for msg in reversed(recent):
            if msg.role not in ("user", "assistant"):
                continue
            parts.append(f"{msg.role}: {msg.content}")

        block = "\n".join(parts)
        return budget.allocate_partial(block, self.HISTORY_PCT)

    def _compose(self, memory: str, rag: str, graph: str) -> str:
        """Compose the system context block from parts."""
        sections = []

        if memory:
            sections.append(memory)

        if rag:
            sections.append(f"Retrieved team knowledge:\n{rag}")

        if graph:
            sections.append(f"Graph-connected context:\n{graph}")

        if not sections:
            return "No retrieval snippets were returned for this query."

        return "\n\n".join(sections)
