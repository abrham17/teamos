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
them into multiple interconnected, professionally formatted wiki pages.

For each page you create, provide:
- title: A clear, descriptive title
- content: Rich, well-structured markdown matching the TeamOS editor toolbar (see below)
- page_type: One of "standard", "decision", "meeting", "brief", "incident", "sop"
- internal_links: List of titles of OTHER pages you're creating that this page should link to

─── TEAMOS EDITOR TOOLBAR — USE THESE FORMATS ───
The TeamOS wiki editor has these toolbar buttons. Your markdown MUST use the
corresponding syntax so pages render correctly:

**Text styling (B / I / U buttons):**
- **Bold** for key terms, people, decisions, important concepts on first mention
- *Italic* for secondary emphasis, titles of works, subtle distinctions
- <u>Underline</u> sparingly for critical warnings or legal terms

**Headings (H1 / H2 buttons):**
- # for the page title (only one, at the top)
- ## for major sections
- ### for subsections (use sparingly, max 3 levels deep)

**Lists (bullet / ordered / task buttons):**
- - for unordered bullet lists
- 1. for ordered step-by-step procedures
- - [ ] for task/checkbox lists (action items, TODOs)

**Block elements (quote / callout / code buttons):**
- > for blockquotes — direct quotes from source material
- > [!NOTE] for informational callouts
- > [!WARNING] for cautions, risks, or important alerts
- > [!TIP] for best practices or pro-tips
- ```lang for code blocks — ALWAYS include the language tag:
  ```python, ```javascript, ```yaml, ```json, ```bash, ```sql, ```dockerfile, ```html, ```css, etc.
- `inline code` for variable names, CLI commands, file paths, config keys

**Math (LaTeX button):**
- $$ ... $$ for display math on its own line
- $ ... $ for inline math expressions
- Format ALL equations, formulas, and numeric expressions properly

**Tables (table button):**
- Use pipe tables with header row for structured data:
  | Column A | Column B | Column C |
  |----------|----------|----------|
  | data     | data     | data     |
- Required for: meeting action items, comparisons, matrices, specs, config reference

**Diagrams (Mermaid button):**
- Use ```mermaid blocks for flowcharts, sequences, or architecture diagrams
  when the source describes processes, workflows, or system relationships

**Links (link / wikilink buttons):**
- [[Page Title]] for internal wiki links to other pages
- [link text](url) for external references

─── PER-TYPE STRUCTURAL REQUIREMENTS ───
Each page_type MUST include these sections as ## headings:

**"decision":**
## Context — background and what prompted this decision
## Options Considered — alternatives evaluated (use a table: Option | Pros | Cons)
## Decision — what was decided
## Rationale — why this option was chosen
## Consequences — what follows from this decision

**"meeting":**
## Date & Attendees — when and who
## Agenda — planned topics
## Discussion Points — what was discussed per topic
## Decisions Made — outcomes (use a table: Decision | Owner | Deadline)
## Action Items — (use a table: Action | Owner | Deadline | Status)

**"brief":**
## Objective — what this brief aims to achieve
## Scope — boundaries and constraints
## Key Deliverables — what will be produced
## Timeline — milestones and dates
## Stakeholders — who is involved

**"incident":**
## Timeline — chronological events (use a table: Time | Event)
## Impact Assessment — what was affected and severity
## Root Cause Analysis — why it happened
## Resolution — how it was fixed
## Prevention — measures to avoid recurrence

**"sop":**
## Purpose — what this procedure accomplishes
## Prerequisites — what's needed before starting
## Step-by-Step Procedure — numbered steps (1. ...)
## Expected Outcome — what success looks like
## Exceptions & Edge Cases — when to deviate

**"standard":**
Use ## sections appropriate to the content — always at least 2 sections.
Prefer descriptive headings that match the document's natural structure.

─── GENERAL RULES ───
- Split distinct topics/sections into separate pages (1-8 pages max).
- Short or single-topic documents → one well-structured page.
- Every page must be self-contained but link to related pages with [[Page Title]].
- Inject [[wikilinks]] where references to other pages make sense.
- Include a "citations" array mapping sections back to source character ranges:
  {"section": "heading name", "source_start": 0, "source_end": 500}
- NEVER output plain undecorated text. Every paragraph should have at least
  one of: bold terms, inline code, bullet lists, or a heading above it.

Respond with JSON:
{
  "pages": [
    {
      "title": "...",
      "content": "... rich markdown using the toolbar formats above ...",
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
    from concurrent.futures import ThreadPoolExecutor
    from ingest.contradiction_resolver import create_contradiction_changeset
    from wiki.services.reindex import reindex_wiki_page

    team = job.team

    # Step 1: Decompose
    logger.info("Agent decomposing document for job %s", job.id)
    page_proposals = decompose_document(team, raw_text)
    
    if not page_proposals:
        logger.warning("No page proposals generated for job %s", job.id)
        return []

    created_pages: list[WikiPage] = []
    all_contradictions: list[dict] = []

    def process_proposal_ai(proposal):
        """Heavy AI lifting for a single proposal (Vector Search + LLM Relation Classify)"""
        title = proposal.get("title", "Untitled")
        content = proposal.get("content", "")
        if not content.strip() and raw_text.strip():
             # Safety fallback: don't allow empty content if source wasn't empty
             content = f"# {title}\n\n[Content generation failed, using fallback]\n\n{raw_text[:2000]}"
        
        internal_links = proposal.get("internal_links", [])
        
        # Inject [[wikilinks]] for internal links
        for link_title in internal_links:
            if link_title in content:
                continue
            pattern = re.compile(re.escape(link_title), re.IGNORECASE)
            content = pattern.sub(f"[[{link_title}]]", content, count=1)

        # Vector Search
        try:
            search_results = vector_store.search_similar_pages(team.id, content[:1000], limit=10)
        except Exception:
            search_results = []

        existing_pages_for_relation = []
        for res in search_results:
            pid = res.payload.get("page_id")
            if not pid: continue
            try:
                ep = WikiPage.objects.get(id=pid, is_deleted=False)
                existing_pages_for_relation.append({
                    "id": str(ep.id),
                    "title": ep.title,
                    "content_excerpt": ep.content[:800],
                })
            except WikiPage.DoesNotExist:
                continue

        # Classify Relations (LLM CALL)
        relation_result = classify_relations(team, content, title, existing_pages_for_relation)
        
        return {
            "proposal": proposal,
            "content": content,
            "title": title,
            "relations": relation_result.get("relations", []),
            "suggested_links": relation_result.get("suggested_wikilinks_in_existing", []),
        }

    # Run AI processing in parallel (Speed up ingestion from hours to minutes)
    logger.info("Processing %s proposals in parallel for job %s", len(page_proposals), job.id)
    with ThreadPoolExecutor(max_workers=min(len(page_proposals), 8)) as executor:
        ai_results = list(executor.map(process_proposal_ai, page_proposals))

    # Step 4-8: Sequential DB operations (Save results)
    for res in ai_results:
        proposal = res["proposal"]
        content = res["content"]
        title = res["title"]
        relations = res["relations"]
        suggested_links = res["suggested_links"]
        page_type = proposal.get("page_type", "standard")
        citations = proposal.get("citations", [])

        # Check for contradictions
        contradictions = [r for r in relations if r.get("relation_type") == "contradicts"]
        if contradictions and not job.auto_approve:
            all_contradictions.extend(contradictions)

        # Create/Update wiki page
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

        # Graph Edges
        for rel in relations:
            rel_type = rel.get("relation_type", "unrelated")
            if rel_type == "unrelated": continue
            existing_page_id = rel.get("existing_page_id")
            if not existing_page_id: continue
            try:
                target_page = WikiPage.objects.get(id=existing_page_id)
                GraphEdge.objects.update_or_create(
                    from_page=page,
                    to_page=target_page,
                    edge_type=rel_type,
                    defaults={
                        "confidence": float(rel.get("confidence", 0.8)),
                        "reason": rel.get("reason", ""),
                        "metadata": {"contradiction_details": rel.get("contradiction_details")} if rel.get("contradiction_details") else {},
                        "created_by": "agent",
                    },
                )
            except WikiPage.DoesNotExist: continue

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
