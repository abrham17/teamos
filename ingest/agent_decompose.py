"""
Agent-driven document decomposition.

Instead of dumping raw extracted text into a single flat WikiPage,
the agent reads the full text and decomposes it into multiple
interlinked wiki pages with typed relationships.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.utils.text import slugify

from graph_engine.models import GraphEdge
from ingest.models import IngestJob, KnowledgeActivity, RawSource, WikiSourceCitation
from ingest.vectors import vector_store
from llm_orchestrator.orchestrator import llm_json_call
from wiki.models import WikiPage

logger = logging.getLogger(__name__)


def _slug_for_page(team, title: str) -> str:
    """Generate a unique slug for a wiki page."""
    base = slugify(title) or "ingested-page"
    slug = base
    n = 1
    while WikiPage.objects.filter(team=team, slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


# ── Phase 1: Decompose document into multiple page proposals ──────────


DECOMPOSE_SYSTEM_PROMPT = """\
You are the TeamOS Knowledge Architect. You analyze raw documents and decompose
them into multiple interconnected wiki pages.

For each page you create, provide:
- title: A clear, descriptive title
- content: Full markdown content for this page
- page_type: One of "standard", "decision", "meeting", "brief", "incident", "sop"
- internal_links: List of titles of OTHER pages you're creating that this page should link to

Rules:
- If the document has clearly distinct topics/sections, split them into separate pages.
- If the document is short or focused on a single topic, create one page.
- Create between 1 and 8 pages max.
- Each page should be self-contained but link to related pages using [[Page Title]] syntax.
- Inject [[wikilinks]] in the content where references to other pages make sense.
- For each page, include a "citations" array mapping your content sections back to
  approximate character ranges in the original text: {"section": "heading", "source_start": 0, "source_end": 500}

Respond with JSON:
{
  "pages": [
    {
      "title": "...",
      "content": "... markdown with [[wikilinks]] ...",
      "page_type": "standard",
      "internal_links": ["Other Page Title"],
      "citations": [{"section": "Introduction", "source_start": 0, "source_end": 500}]
    }
  ]
}
"""


def decompose_document(team, raw_text: str) -> list[dict]:
    """
    Ask the agent to split a document into multiple wiki page proposals.
    Returns a list of page dicts with title, content, page_type, internal_links, citations.
    """
    # Truncate very large documents to fit context window
    text_for_llm = raw_text[:12000]
    if len(raw_text) > 12000:
        text_for_llm += f"\n\n[... truncated, {len(raw_text) - 12000} more characters ...]"

    result = llm_json_call(
        team=team,
        operation="ingest_decompose",
        messages=[
            {"role": "system", "content": DECOMPOSE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Decompose this document:\n\n{text_for_llm}"},
        ],
        default_on_error={"pages": []},
    )

    if not result or not isinstance(result.get("pages"), list) or not result["pages"]:
        # Fallback: treat entire document as a single page
        logger.info("Agent decomposition returned no pages, falling back to single page.")
        return [
            {
                "title": _derive_title_from_text(raw_text),
                "content": raw_text,
                "page_type": "standard",
                "internal_links": [],
                "citations": [{"section": "Full Document", "source_start": 0, "source_end": len(raw_text)}],
            }
        ]

    return result["pages"]


def _derive_title_from_text(text: str) -> str:
    """Extract title from first heading or first line."""
    m = re.search(r"^\s*#\s+(.+?)\s*$", text[:4000], re.MULTILINE)
    if m:
        return m.group(1).strip()[:120]
    first_line = (text.strip().split("\n")[0] or "").strip()
    return (first_line[:120] if first_line else "Ingested Content")


# ── Phase 2: Relate new pages to existing wiki ──────────────────────


RELATE_SYSTEM_PROMPT = """\
You are the TeamOS Knowledge Analyst. Given a NEW wiki page and a list of
EXISTING wiki pages, classify the relationship between them.

For each existing page, return one of:
- "extends" — new page adds to or elaborates on existing topic
- "contradicts" — new page says something different or conflicting
- "depends_on" — new page requires knowledge from existing page
- "supersedes" — new page replaces or updates existing information
- "prerequisite" — existing page must be read/done before new page
- "implements" — new page is a practical implementation of existing spec
- "references" — simple mention or citation relationship
- "parent_child" — hierarchical topic relationship
- "unrelated" — no meaningful relationship

For contradictions, extract the specific conflicting snippets.

Respond with JSON:
{
  "relations": [
    {
      "existing_page_id": "...",
      "existing_page_title": "...",
      "relation_type": "extends",
      "confidence": 0.85,
      "reason": "Brief explanation",
      "contradiction_details": null
    }
  ],
  "suggested_wikilinks_in_existing": [
    {
      "existing_page_id": "...",
      "insert_near": "text near where wikilink should go",
      "wikilink_title": "New Page Title"
    }
  ]
}
"""


def classify_relations(
    team,
    new_page_content: str,
    new_page_title: str,
    existing_pages: list[dict],
) -> dict:
    """
    Ask the agent to classify relationships between a new page and existing pages.
    existing_pages: list of {"id": str, "title": str, "content_excerpt": str}
    """
    if not existing_pages:
        return {"relations": [], "suggested_wikilinks_in_existing": []}

    existing_text = "\n\n".join(
        f"--- EXISTING PAGE (id={p['id']}) ---\nTitle: {p['title']}\n{p['content_excerpt']}"
        for p in existing_pages
    )

    result = llm_json_call(
        team=team,
        operation="ingest_relate",
        messages=[
            {"role": "system", "content": RELATE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"NEW PAGE TITLE: {new_page_title}\n\n"
                    f"NEW PAGE CONTENT:\n{new_page_content[:3000]}\n\n"
                    f"EXISTING PAGES:\n{existing_text}"
                ),
            },
        ],
        default_on_error={"relations": [], "suggested_wikilinks_in_existing": []},
    )

    return result or {"relations": [], "suggested_wikilinks_in_existing": []}


# ── Phase 3: Full agent decomposition pipeline ──────────────────────


def run_agent_decomposition(
    job: IngestJob,
    raw_text: str,
    raw_source: RawSource | None = None,
    trace_id: str | None = None,
) -> list[WikiPage]:
    """
    Full agent-driven ingestion:
    1. Decompose document into multiple page proposals
    2. For each page, find related existing pages
    3. Classify relations and detect contradictions
    4. Create wiki pages with [[wikilinks]]
    5. Create typed graph edges
    6. Create source citations
    7. If contradictions found and auto_approve=False → return for review

    Returns list of created/updated WikiPages.
    """
    from ingest.contradiction_resolver import create_contradiction_changeset
    from wiki.services.reindex import reindex_wiki_page

    team = job.team

    # Step 1: Decompose
    logger.info("Agent decomposing document for job %s", job.id)
    page_proposals = decompose_document(team, raw_text)

    created_pages: list[WikiPage] = []
    all_contradictions: list[dict] = []

    for proposal in page_proposals:
        title = proposal.get("title", "Untitled")
        content = proposal.get("content", "")
        page_type = proposal.get("page_type", "standard")
        internal_links = proposal.get("internal_links", [])
        citations = proposal.get("citations", [])

        # Inject [[wikilinks]] for internal links
        for link_title in internal_links:
            if link_title in content:
                continue  # Already present
            # Find natural insertion points (mentions of the title without brackets)
            pattern = re.compile(re.escape(link_title), re.IGNORECASE)
            content = pattern.sub(f"[[{link_title}]]", content, count=1)

        # Step 2: Find related existing pages via vector search
        try:
            search_results = vector_store.search_similar_pages(team.id, content[:1000], limit=10)
        except Exception:
            logger.exception("Vector search failed during agent decomposition")
            search_results = []

        existing_pages_for_relation = []
        for res in search_results:
            pid = res.payload.get("page_id")
            if not pid:
                continue
            try:
                ep = WikiPage.objects.get(id=pid, is_deleted=False)
                existing_pages_for_relation.append({
                    "id": str(ep.id),
                    "title": ep.title,
                    "content_excerpt": ep.content[:800],
                })
            except WikiPage.DoesNotExist:
                continue

        # Step 3: Classify relations
        relation_result = classify_relations(team, content, title, existing_pages_for_relation)
        relations = relation_result.get("relations", [])
        suggested_links = relation_result.get("suggested_wikilinks_in_existing", [])

        # Check for contradictions
        contradictions = [r for r in relations if r.get("relation_type") == "contradicts"]
        if contradictions and not job.auto_approve:
            all_contradictions.extend(contradictions)

        # Step 4: Create the wiki page
        slug = _slug_for_page(team, title)
        page, created = WikiPage.objects.get_or_create(
            team=team,
            title=title,
            defaults={
                "slug": slug,
                "content": content,
                "raw_content": content,
                "created_by": job.created_by,
                "page_type": page_type,
                "frontmatter": {"source_job_id": str(job.id)},
            },
        )
        if not created:
            page.content = content
            page.raw_content = content
            page.save(update_fields=["content", "raw_content", "updated_at"])

        created_pages.append(page)

        # Step 5: Create typed graph edges
        for rel in relations:
            rel_type = rel.get("relation_type", "unrelated")
            if rel_type == "unrelated":
                continue
            existing_page_id = rel.get("existing_page_id")
            if not existing_page_id:
                continue
            try:
                target_page = WikiPage.objects.get(id=existing_page_id)
                GraphEdge.objects.update_or_create(
                    from_page=page,
                    to_page=target_page,
                    edge_type=rel_type,
                    defaults={
                        "confidence": float(rel.get("confidence", 0.8)),
                        "reason": rel.get("reason", ""),
                        "metadata": {"contradiction_details": rel.get("contradiction_details")}
                        if rel.get("contradiction_details")
                        else {},
                        "created_by": "agent",
                    },
                )
            except WikiPage.DoesNotExist:
                continue

        # Step 6: Inject [[wikilinks]] into existing pages
        for link_suggestion in suggested_links:
            existing_page_id = link_suggestion.get("existing_page_id")
            wikilink_title = link_suggestion.get("wikilink_title", title)
            if not existing_page_id:
                continue
            try:
                existing_page = WikiPage.objects.get(id=existing_page_id, is_deleted=False)
                _inject_wikilink_if_missing(existing_page, wikilink_title)
            except WikiPage.DoesNotExist:
                continue

        # Step 7: Create source citations
        if raw_source and citations:
            for cit in citations:
                WikiSourceCitation.objects.create(
                    wiki_page=page,
                    raw_source=raw_source,
                    wiki_section=cit.get("section", ""),
                    source_char_start=int(cit.get("source_start", 0)),
                    source_char_end=int(cit.get("source_end", 0)),
                )

        # Step 8: Index the page (chunks + vectors + wikilink graph wiring)
        try:
            reindex_wiki_page(page, trace_id=trace_id, queue_graph=True)
        except Exception:
            logger.exception("Failed to reindex page %s after agent decomposition", page.id)

        # Activity log
        KnowledgeActivity.objects.create(
            team=team,
            user=job.created_by,
            event_type="ingest_create" if created else "ingest_merge",
            page=page,
            summary=f"Agent {'created' if created else 'updated'} from decomposition: {page.title}",
            metadata={"job_id": str(job.id), "page_type": page_type, "relation_count": len(relations)},
        )

    # Handle contradictions if auto_approve is false
    if all_contradictions and not job.auto_approve:
        create_contradiction_changeset(
            job=job,
            pages=created_pages,
            contradictions=all_contradictions,
            raw_text=raw_text,
        )
        job.status = "review_required"
        job.ingest_stage = "governance"
        job.ingest_stage_detail = f"Found {len(all_contradictions)} contradiction(s) requiring review"
        job.save(update_fields=["status", "ingest_stage", "ingest_stage_detail", "updated_at"])
        return created_pages

    # Mark job done
    job.wiki_page = created_pages[0] if created_pages else None
    job.chunk_count = sum(p.chunks.count() for p in created_pages)
    job.status = "done"
    job.ingest_stage = "completed"
    job.ingest_stage_detail = f"Agent created {len(created_pages)} wiki page(s)"
    job.save(
        update_fields=[
            "wiki_page", "chunk_count", "status",
            "ingest_stage", "ingest_stage_detail", "updated_at",
        ]
    )

    return created_pages


def _inject_wikilink_if_missing(page: WikiPage, link_title: str) -> bool:
    """Inject a [[wikilink]] into an existing page if the title is mentioned but not linked."""
    if f"[[{link_title}]]" in page.content:
        return False

    # Find plain-text mentions of the title
    pattern = re.compile(re.escape(link_title), re.IGNORECASE)
    if not pattern.search(page.content):
        return False

    # Replace first occurrence with wikilink
    page.content = pattern.sub(f"[[{link_title}]]", page.content, count=1)
    page.save(update_fields=["content", "updated_at"])
    return True
