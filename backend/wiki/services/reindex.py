"""
Rebuild PageChunk rows + Qdrant vectors for a wiki page (same logic as ingest materialization).
Optionally queue wikilink graph wiring.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from ingest.pipeline import _derive_chunk_config, _persist_chunks
from ingest.vectors import vector_store
from wiki.models import WikiPage, PageChunk

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def _extract_heading(text: str) -> str:
    """Return the first markdown heading text found in ``text``, or empty string."""
    m = re.search(r"^#{1,6}\s+(.+)$", text, re.MULTILINE)
    return m.group(1).strip()[:300] if m else ""


def reindex_wiki_page(
    page: WikiPage,
    *,
    body_text: str | None = None,
    trace_id: str | None = None,
    queue_graph: bool = True,
) -> int:
    """
    Chunk ``body_text`` or ``page.content``, persist PageChunks, upsert Qdrant, optionally queue graph wiring.

    Returns number of chunks written.
    """
    text = (body_text if body_text is not None else (page.content or "")).strip()
    if not text:
        text = " "

    chunk_size, chunk_overlap = _derive_chunk_config(page.team.plan)
    words = text.split()
    if not words:
        chunks = [text]
    else:
        chunks = [
            " ".join(words[i : i + chunk_size])
            for i in range(0, len(words), max(chunk_size - chunk_overlap, 1))
        ]

    section_titles = [_extract_heading(c) for c in chunks]
    chunk_count = _persist_chunks(page, chunks, section_titles=section_titles)

    chunks_data = [
        {
            "id": str(c.id),
            "content": c.content,
            "index": c.chunk_index,
            "title": page.title,
            "section_title": c.section_title,
        }
        for c in PageChunk.objects.filter(page=page)
    ]
    vector_store.upsert_chunks(page.team_id, page.id, chunks_data)

    if queue_graph:
        from ingest.tasks import wire_page_graph

        def _queue_or_skip(label: str, fn, *args) -> None:
            try:
                fn(*args)
            except Exception as exc:
                logger.debug(
                    "Skipped queue %s (broker unavailable): %s",
                    label,
                    exc,
                    extra={"page_id": str(page.id), "team_id": str(page.team_id)},
                )

        _queue_or_skip(
            "wire_page_graph",
            lambda: wire_page_graph.delay(str(page.id), trace_id=trace_id),
        )

        from ingest.tasks import agent_react_to_page_change, agent_sync_wiki_to_plans

        _queue_or_skip(
            "agent_react_to_page_change",
            lambda: agent_react_to_page_change.delay(str(page.id), "update", trace_id=trace_id),
        )
        _queue_or_skip(
            "agent_sync_wiki_to_plans",
            lambda: agent_sync_wiki_to_plans.delay(str(page.id), trace_id=trace_id),
        )

    return chunk_count
