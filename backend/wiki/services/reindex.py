"""
Rebuild PageChunk rows + Qdrant vectors for a wiki page (same logic as ingest materialization).
Optionally queue wikilink graph wiring.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ingest.pipeline import _derive_chunk_config, _persist_chunks
from ingest.vectors import vector_store
from wiki.models import WikiPage, PageChunk

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


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

    chunk_count = _persist_chunks(page, chunks)

    chunks_data = [
        {"id": str(c.id), "content": c.content, "index": c.chunk_index, "title": page.title}
        for c in PageChunk.objects.filter(page=page)
    ]
    vector_store.upsert_chunks(page.team_id, page.id, chunks_data)

    if queue_graph:
        from ingest.tasks import wire_page_graph

        try:
            wire_page_graph.delay(str(page.id), trace_id=trace_id)
        except Exception:
            logger.exception(
                "Failed to queue wire_page_graph after reindex",
                extra={"page_id": str(page.id), "team_id": str(page.team_id)},
            )

    return chunk_count
