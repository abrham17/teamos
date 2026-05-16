"""
Agent-driven document decomposition.

Large documents are segmented (chapters/sections), decomposed per segment in parallel,
then merged into up to MAX_WIKI_PAGES deep, citation-grounded wiki pages.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from django.utils.text import slugify

from graph_engine.models import GraphEdge
from ingest.models import IngestJob, KnowledgeActivity, RawSource, WikiSourceCitation
from ingest.vectors import vector_store
from llm_orchestrator.orchestrator import llm_json_call
from wiki.models import WikiPage

logger = logging.getLogger(__name__)

# ── Limits ────────────────────────────────────────────────────────────

MAX_WIKI_PAGES = 30
MIN_PAGE_CONTENT_CHARS = 450
SEGMENT_TARGET_CHARS = 22_000
SMALL_DOC_CHARS = 28_000
OUTLINE_SAMPLE_CHARS = 16_000

VALID_PAGE_TYPES = frozenset(
    {"standard", "decision", "meeting", "brief", "incident", "sop"}
)

# Map prompt relationship types → GraphEdge.edge_type (must exist in model choices)
EDGE_TYPE_MAP = {
    "depends_on": "depends_on",
    "references": "references",
    "contradicts": "contradicts",
    "extends": "extends",
    "supersedes": "supersedes",
    "related_to": "references",
    "caused_by": "references",
    "causes": "references",
    "implements": "implements",
    "owned_by": "references",
    "part_of": "parent_child",
    "blocks": "depends_on",
    "replaces": "supersedes",
    "derived_from": "references",
    "uses": "depends_on",
    "integrates_with": "implements",
    "documents": "references",
    "validates": "references",
    "deprecated_by": "supersedes",
    "duplicate_of": "references",
    "prerequisite": "prerequisite",
    "parent_child": "parent_child",
}

CHAPTER_LINE_RE = re.compile(
    r"^(?:"
    r"(?:chapter|part|section|unit|module|lecture|appendix)\s+[\dIVXLC]+[.:\)\s-]*"
    r"|#{1,2}\s+"
    r")(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)


DECOMPOSE_SYSTEM_PROMPT = """\
You are the TeamOS Knowledge Architect. Transform source text into interconnected,
deep, professionally formatted wiki pages for enterprise RAG and knowledge graphs.

You receive ONE section of a larger document. Use the global character offsets provided
so citations reference the FULL original document.

─── OUTPUT REQUIREMENTS ───
Return ONLY valid JSON: {"pages": [ ... ]}

Each page MUST include:
- title: clear, specific (not "Introduction" alone unless truly standalone)
- page_type: one of standard, decision, meeting, brief, incident, sop
- summary: 2-3 sentences
- content: rich markdown (see formatting rules)
- internal_links: titles of OTHER pages you create in this response
- citations: REQUIRED — at least one per page, with source_start/source_end as GLOBAL offsets
- relationships: links to other pages (by exact title) from this batch
- entities: key technologies, systems, people, processes (optional but encouraged)

─── DEPTH RULES (CRITICAL) ───
- NEVER produce thin pages (few bullets only). Each page needs substantive depth.
- Target at least 4-8 ## sections per page when the source material supports it.
- Preserve lists, tables, formulas, code, definitions, examples, and nuance from the source.
- If a topic deserves depth, use ONE rich page — do not split into shallow fragments.
- If multiple distinct major topics exist in this section, create multiple DEEP pages.

─── MARKDOWN FORMATTING ───
- ## and ### headings, **bold** for key terms, bullet/numbered lists
- Pipe tables for comparisons and structured data
- ```lang fenced code blocks with language tags
- > blockquotes and > [!NOTE] / > [!WARNING] callouts where appropriate
- $$ ... $$ or $ ... $ for math
- [[Page Title]] wikilinks to related pages

─── CITATIONS (MANDATORY) ───
Every page needs citations array entries like:
{"section": "Section name", "source_start": <global int>, "source_end": <global int>}
Offsets are relative to the FULL document (not just this section).

─── RELATIONSHIPS ───
{"target": "Exact Page Title", "relationship_type": "depends_on|extends|references|...",
 "confidence": 0.0-1.0, "reason": "...", "direct": true,
 "evidence": {"source_start": N, "source_end": M}}

Only include relationships you are confident about (confidence >= 0.65).
"""

OUTLINE_SYSTEM_PROMPT = """\
You are the TeamOS Knowledge Architect planning how to split a large document into wiki pages.

Analyze the document structure and return JSON:
{
  "document_title": "...",
  "estimated_page_count": <int 1-30>,
  "segments": [
    {
      "title": "Chapter or section name",
      "char_start": 0,
      "char_end": 50000,
      "suggested_pages": 3,
      "topics": ["topic1", "topic2"]
    }
  ]
}

Rules:
- For books, manuals, and multi-chapter PDFs: one segment per major chapter/section.
- char_start/char_end must cover the full document without large gaps.
- suggested_pages: how many DEEP wiki pages to create from that segment (1-10 per segment).
- Total suggested pages across segments should reflect document size (large docs: 10-30 pages).
- Do NOT plan one page for an entire textbook.
"""


def _slug_for_page(team, title: str) -> str:
    base = slugify(title) or "ingested-page"
    slug = base
    n = 1
    while WikiPage.objects.filter(team=team, slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


def _derive_title_from_text(text: str) -> str:
    m = re.search(r"^\s*#\s+(.+?)\s*$", text[:4000], re.MULTILINE)
    if m:
        return m.group(1).strip()[:120]
    first_line = (text.strip().split("\n")[0] or "").strip()
    return (first_line[:120] if first_line else "Ingested Content")


def detect_document_segments(raw_text: str, structure_map: dict | None = None) -> list[dict]:
    """
    Split document into segments with global char offsets.
    Returns [{title, char_start, char_end}, ...]
    """
    text = raw_text or ""
    n = len(text)
    if n == 0:
        return []

    structure_map = structure_map or {}
    breakpoints: list[tuple[int, str]] = [(0, "Document Start")]

    # Structure map sections (markdown / url)
    for sec in structure_map.get("sections") or []:
        start = int(sec.get("char_start", 0))
        heading = (sec.get("heading") or "").strip()
        level = int(sec.get("level", 1))
        if heading and level <= 2 and 0 <= start < n:
            breakpoints.append((start, heading))

    # Chapter-style lines in plain text (PDF, docx extracts)
    for m in CHAPTER_LINE_RE.finditer(text):
        title = (m.group(1) or m.group(0)).strip()[:120]
        if len(title) >= 3:
            breakpoints.append((m.start(), title))

    # Dedupe by position
    seen_pos: set[int] = set()
    unique: list[tuple[int, str]] = []
    for pos, title in sorted(breakpoints, key=lambda x: x[0]):
        if pos in seen_pos:
            continue
        seen_pos.add(pos)
        unique.append((pos, title))

    if len(unique) <= 1:
        return _split_by_size(text, SEGMENT_TARGET_CHARS)

    segments: list[dict] = []
    for i, (start, title) in enumerate(unique):
        end = unique[i + 1][0] if i + 1 < len(unique) else n
        if end - start < 200 and i + 1 < len(unique):
            continue
        segments.append({
            "title": title,
            "char_start": start,
            "char_end": end,
        })

    # Merge tiny segments
    merged: list[dict] = []
    for seg in segments:
        if merged and (seg["char_end"] - seg["char_start"]) < 1500:
            merged[-1]["char_end"] = seg["char_end"]
            merged[-1]["title"] = f"{merged[-1]['title']} / {seg['title']}"[:200]
        else:
            merged.append(dict(seg))

    # Split oversized segments
    final: list[dict] = []
    for seg in merged:
        span = seg["char_end"] - seg["char_start"]
        if span <= SEGMENT_TARGET_CHARS * 1.2:
            final.append(seg)
        else:
            sub_text = text[seg["char_start"]: seg["char_end"]]
            for sub in _split_by_size(sub_text, SEGMENT_TARGET_CHARS):
                final.append({
                    "title": f"{seg['title']} — {sub['title']}",
                    "char_start": seg["char_start"] + sub["char_start"],
                    "char_end": seg["char_start"] + sub["char_end"],
                })
    return final or _split_by_size(text, SEGMENT_TARGET_CHARS)


def _split_by_size(text: str, chunk_size: int) -> list[dict]:
    n = len(text)
    if n <= chunk_size:
        return [{"title": "Document", "char_start": 0, "char_end": n}]
    segments = []
    start = 0
    part = 1
    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            # break at paragraph
            break_at = text.rfind("\n\n", start + chunk_size // 2, end)
            if break_at > start:
                end = break_at
        segments.append({
            "title": f"Section {part}",
            "char_start": start,
            "char_end": end,
        })
        start = end
        part += 1
    return segments


def _plan_large_document(team, raw_text: str, segments: list[dict]) -> list[dict]:
    """Optional LLM outline to refine segment page budgets for very large docs."""
    if len(raw_text) < 80_000 or len(segments) <= 2:
        return segments

    sample = raw_text[:OUTLINE_SAMPLE_CHARS]
    if len(raw_text) > OUTLINE_SAMPLE_CHARS:
        sample += f"\n\n[... {len(raw_text) - OUTLINE_SAMPLE_CHARS:,} more characters ...]"

    seg_summary = "\n".join(
        f"- {s['title']}: chars {s['char_start']}-{s['char_end']} "
        f"({s['char_end'] - s['char_start']:,} chars)"
        for s in segments[:40]
    )

    result = llm_json_call(
        team=team,
        operation="ingest_decompose_outline",
        messages=[
            {"role": "system", "content": OUTLINE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Document length: {len(raw_text):,} characters.\n"
                    f"Detected segments:\n{seg_summary}\n\n"
                    f"Document sample:\n{sample}"
                ),
            },
        ],
        default_on_error=None,
        max_tokens=4096,
        temperature=0.2,
    )

    if not result or not isinstance(result.get("segments"), list):
        return segments

    planned = []
    for ps in result["segments"]:
        try:
            planned.append({
                "title": str(ps.get("title", "Section"))[:200],
                "char_start": int(ps.get("char_start", 0)),
                "char_end": int(ps.get("char_end", 0)),
                "suggested_pages": min(10, max(1, int(ps.get("suggested_pages", 2)))),
            })
        except (TypeError, ValueError):
            continue

    if not planned:
        return segments

    # Clamp to valid ranges inside document
    n = len(raw_text)
    validated = []
    for p in planned:
        start = max(0, min(p["char_start"], n))
        end = max(start + 100, min(p["char_end"], n))
        validated.append({**p, "char_start": start, "char_end": end})

    return validated or segments


def _pages_budget_for_segment(segment: dict, total_segments: int, remaining: int) -> int:
    suggested = segment.get("suggested_pages")
    if suggested is not None:
        return min(10, max(1, int(suggested)))
    span = segment["char_end"] - segment["char_start"]
    if span > 80_000:
        base = 8
    elif span > 40_000:
        base = 5
    elif span > 15_000:
        base = 3
    else:
        base = 2
    per_seg = max(1, MAX_WIKI_PAGES // max(total_segments, 1))
    return min(10, base, per_seg, remaining)


def _decompose_segment(
    team,
    raw_text: str,
    segment: dict,
    max_pages: int,
) -> list[dict]:
    """Decompose one document segment into page proposals."""
    start = segment["char_start"]
    end = segment["char_end"]
    section_text = raw_text[start:end]
    if not section_text.strip():
        return []

    title = segment.get("title", "Section")
    max_pages = max(1, min(max_pages, 10))

    user_msg = (
        f"SECTION: {title}\n"
        f"GLOBAL CHAR OFFSET: this section starts at {start} in the full document.\n"
        f"Create 1 to {max_pages} DEEP wiki pages from this section only.\n"
        f"Add {start} to local offsets when setting citation source_start/source_end.\n\n"
        f"--- SECTION TEXT ---\n{section_text}"
    )

    result = llm_json_call(
        team=team,
        operation="ingest_decompose",
        messages=[
            {"role": "system", "content": DECOMPOSE_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        default_on_error={"pages": []},
        max_tokens=16_000,
        temperature=0.25,
    )

    pages = []
    if result and isinstance(result.get("pages"), list):
        for p in result["pages"]:
            normalized = _normalize_page_proposal(p, global_offset=start, segment_end=end)
            if normalized:
                pages.append(normalized)

    return pages


def _normalize_page_proposal(
    page: dict,
    *,
    global_offset: int,
    segment_end: int,
) -> dict | None:
    title = (page.get("title") or "").strip()
    content = (page.get("content") or "").strip()
    if not title or not content:
        return None

    page_type = (page.get("page_type") or "standard").strip().lower()
    if page_type not in VALID_PAGE_TYPES:
        page_type = "standard"

    if len(content) < MIN_PAGE_CONTENT_CHARS:
        # Allow shorter only if genuinely minimal section
        if len(content) < 120:
            return None

    citations = page.get("citations") or []
    fixed_citations = []
    for cit in citations:
        if not isinstance(cit, dict):
            continue
        try:
            cs = int(cit.get("source_start", global_offset))
            ce = int(cit.get("source_end", segment_end))
        except (TypeError, ValueError):
            continue
        if ce <= cs:
            ce = min(segment_end, cs + 500)
        cs = max(global_offset, cs)
        ce = min(segment_end, max(cs + 1, ce))
        fixed_citations.append({
            "section": str(cit.get("section", "Content"))[:200],
            "source_start": cs,
            "source_end": ce,
        })

    if not fixed_citations:
        fixed_citations = [{
            "section": title[:200],
            "source_start": global_offset,
            "source_end": segment_end,
        }]

    relationships = []
    for rel in page.get("relationships") or []:
        if not isinstance(rel, dict):
            continue
        target = (rel.get("target") or "").strip()
        if not target:
            continue
        rel_type = EDGE_TYPE_MAP.get(
            (rel.get("relationship_type") or "references").strip().lower(),
            "references",
        )
        try:
            conf = float(rel.get("confidence", 0.75))
        except (TypeError, ValueError):
            conf = 0.75
        if conf < 0.65:
            continue
        evidence = rel.get("evidence") or {}
        relationships.append({
            "target": target,
            "relationship_type": rel_type,
            "confidence": conf,
            "reason": str(rel.get("reason", ""))[:500],
            "direct": bool(rel.get("direct", True)),
            "evidence": evidence,
        })

    entities = []
    for ent in page.get("entities") or []:
        if isinstance(ent, dict) and ent.get("name"):
            entities.append(ent)

    internal_links = [
        str(x).strip() for x in (page.get("internal_links") or []) if str(x).strip()
    ]

    return {
        "title": title[:300],
        "page_type": page_type,
        "summary": str(page.get("summary", ""))[:1000],
        "content": content,
        "internal_links": internal_links,
        "citations": fixed_citations,
        "relationships": relationships,
        "entities": entities,
    }


def _dedupe_pages(pages: list[dict]) -> list[dict]:
    by_key: dict[str, dict] = {}
    for p in pages:
        key = re.sub(r"\s+", " ", p["title"].lower()).strip()
        if key in by_key:
            existing = by_key[key]
            if len(p.get("content", "")) > len(existing.get("content", "")):
                by_key[key] = p
        else:
            by_key[key] = p
    return list(by_key.values())[:MAX_WIKI_PAGES]


def decompose_document(
    team,
    raw_text: str,
    structure_map: dict | None = None,
) -> list[dict]:
    """
    Decompose a document into up to MAX_WIKI_PAGES deep wiki page proposals.
    Uses segmentation + parallel per-section LLM calls for large documents.
    """
    text = (raw_text or "").strip()
    if not text:
        return []

    # Small documents: single pass
    if len(text) <= SMALL_DOC_CHARS:
        segments = [{"title": _derive_title_from_text(text), "char_start": 0, "char_end": len(text)}]
        max_pages = min(MAX_WIKI_PAGES, max(2, len(text) // 8000))
        pages = _decompose_segment(team, text, segments[0], max_pages)
        if pages:
            return _dedupe_pages(pages)

    segments = detect_document_segments(text, structure_map)
    segments = _plan_large_document(team, text, segments)

    logger.info(
        "Decomposing document (%s chars) into %s segments, max %s pages",
        len(text),
        len(segments),
        MAX_WIKI_PAGES,
    )

    all_pages: list[dict] = []

    def process_segment(seg: dict) -> list[dict]:
        budget = _pages_budget_for_segment(seg, len(segments), MAX_WIKI_PAGES)
        return _decompose_segment(team, text, seg, budget)

    with ThreadPoolExecutor(max_workers=min(len(segments), 6)) as executor:
        futures = {executor.submit(process_segment, seg): seg for seg in segments}
        for future in as_completed(futures):
            try:
                seg_pages = future.result()
                all_pages.extend(seg_pages)
            except Exception:
                seg = futures[future]
                logger.exception("Segment decomposition failed: %s", seg.get("title"))

    all_pages = _dedupe_pages(all_pages)

    if not all_pages:
        logger.warning("All decomposition passes failed; using structured fallback split.")
        all_pages = _fallback_multi_page_split(team, text)

    if not all_pages:
        return [{
            "title": _derive_title_from_text(text),
            "content": text[:100_000],
            "page_type": "standard",
            "summary": "",
            "internal_links": [],
            "citations": [{"section": "Full Document", "source_start": 0, "source_end": len(text)}],
            "relationships": [],
            "entities": [],
        }]

    logger.info("Decomposition produced %s wiki page proposals", len(all_pages))
    return all_pages


def _fallback_multi_page_split(team, text: str) -> list[dict]:
    """Mechanical split + light decomposition when LLM returns nothing."""
    segments = detect_document_segments(text, None)
    pages: list[dict] = []
    remaining = MAX_WIKI_PAGES
    for seg in segments:
        if remaining <= 0:
            break
        budget = min(3, remaining)
        seg_pages = _decompose_segment(team, text, seg, budget)
        pages.extend(seg_pages)
        remaining -= len(seg_pages)
    return _dedupe_pages(pages)


# ── Phase 2: Relate new pages to existing wiki ──────────────────────


RELATE_SYSTEM_PROMPT = """\
You are the TeamOS Knowledge Analyst. Given a NEW wiki page and EXISTING wiki pages,
classify relationships.

Return JSON:
{
  "relations": [
    {
      "existing_page_id": "...",
      "existing_page_title": "...",
      "relation_type": "extends|contradicts|depends_on|supersedes|prerequisite|implements|references|parent_child|unrelated",
      "confidence": 0.85,
      "reason": "...",
      "contradiction_details": null
    }
  ],
  "suggested_wikilinks_in_existing": [
    {
      "existing_page_id": "...",
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
                    f"NEW PAGE CONTENT:\n{new_page_content[:4000]}\n\n"
                    f"EXISTING PAGES:\n{existing_text}"
                ),
            },
        ],
        default_on_error={"relations": [], "suggested_wikilinks_in_existing": []},
        max_tokens=4096,
        temperature=0.2,
    )

    return result or {"relations": [], "suggested_wikilinks_in_existing": []}


def _resolve_title_to_page(title: str, title_map: dict[str, WikiPage]) -> WikiPage | None:
    if not title:
        return None
    key = re.sub(r"\s+", " ", title.lower()).strip()
    if key in title_map:
        return title_map[key]
    for k, page in title_map.items():
        if key in k or k in key:
            return page
    return None


def _apply_intra_batch_edges(
    from_page: WikiPage,
    proposal: dict,
    title_map: dict[str, WikiPage],
) -> None:
    for rel in proposal.get("relationships") or []:
        target_title = (rel.get("target") or "").strip()
        target_page = _resolve_title_to_page(target_title, title_map)
        if not target_page or target_page.id == from_page.id:
            continue
        rel_type = rel.get("relationship_type", "references")
        if rel_type not in GraphEdge.TYPED_RELATION_TYPES:
            rel_type = "references"
        try:
            GraphEdge.objects.update_or_create(
                from_page=from_page,
                to_page=target_page,
                edge_type=rel_type,
                defaults={
                    "confidence": float(rel.get("confidence", 0.8)),
                    "reason": str(rel.get("reason", ""))[:500],
                    "metadata": {"evidence": rel.get("evidence"), "source": "decompose"},
                    "created_by": "agent",
                },
            )
        except Exception:
            logger.exception("Failed intra-batch edge %s -> %s", from_page.title, target_title)


# ── Phase 3: Full agent decomposition pipeline ──────────────────────


def run_agent_decomposition(
    job: IngestJob,
    raw_text: str,
    raw_source: RawSource | None = None,
    trace_id: str | None = None,
) -> list[WikiPage]:
    from ingest.contradiction_resolver import create_contradiction_changeset
    from wiki.services.reindex import reindex_wiki_page

    team = job.team
    structure_map = {}
    if raw_source and raw_source.structure_map:
        structure_map = raw_source.structure_map

    logger.info("Agent decomposing document for job %s (%s chars)", job.id, len(raw_text or ""))
    page_proposals = decompose_document(team, raw_text, structure_map=structure_map)

    if not page_proposals:
        logger.warning("No page proposals generated for job %s", job.id)
        return []

    created_pages: list[WikiPage] = []
    all_contradictions: list[dict] = []

    def process_proposal_ai(proposal):
        title = proposal.get("title", "Untitled")
        content = proposal.get("content", "")
        if not content.strip() and raw_text.strip():
            content = f"# {title}\n\n[Content generation failed]\n\n{raw_text[:3000]}"

        for link_title in proposal.get("internal_links", []):
            if link_title in content:
                continue
            pattern = re.compile(re.escape(link_title), re.IGNORECASE)
            content = pattern.sub(f"[[{link_title}]]", content, count=1)

        try:
            search_results = vector_store.search_similar_pages(team.id, content[:1000], limit=10)
        except Exception:
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

        relation_result = classify_relations(team, content, title, existing_pages_for_relation)

        return {
            "proposal": proposal,
            "content": content,
            "title": title,
            "relations": relation_result.get("relations", []),
            "suggested_links": relation_result.get("suggested_wikilinks_in_existing", []),
        }

    logger.info("Processing %s proposals for job %s", len(page_proposals), job.id)
    with ThreadPoolExecutor(max_workers=min(len(page_proposals), 8)) as executor:
        ai_results = list(executor.map(process_proposal_ai, page_proposals))

    title_map: dict[str, WikiPage] = {}

    for res in ai_results:
        proposal = res["proposal"]
        content = res["content"]
        title = res["title"]
        relations = res["relations"]
        suggested_links = res["suggested_links"]
        page_type = proposal.get("page_type", "standard")
        citations = proposal.get("citations", [])

        contradictions = [r for r in relations if r.get("relation_type") == "contradicts"]
        if contradictions and not job.auto_approve:
            all_contradictions.extend(contradictions)

        slug = _slug_for_page(team, title)
        fm = {
            "source_job_id": str(job.id),
            "ingest_summary": proposal.get("summary", ""),
            "ingest_entities": proposal.get("entities", []),
        }

        page, created = WikiPage.objects.get_or_create(
            team=team,
            title=title,
            defaults={
                "slug": slug,
                "content": content,
                "raw_content": content,
                "created_by": job.created_by,
                "page_type": page_type,
                "frontmatter": fm,
            },
        )
        if not created:
            page.content = content
            page.raw_content = content
            merged_fm = dict(page.frontmatter or {})
            merged_fm.update(fm)
            page.frontmatter = merged_fm
            page.save(update_fields=["content", "raw_content", "frontmatter", "updated_at"])

        created_pages.append(page)
        title_map[re.sub(r"\s+", " ", title.lower()).strip()] = page

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

        if raw_source and citations:
            WikiSourceCitation.objects.filter(wiki_page=page, raw_source=raw_source).delete()
            for cit in citations:
                try:
                    WikiSourceCitation.objects.create(
                        wiki_page=page,
                        raw_source=raw_source,
                        wiki_section=cit.get("section", ""),
                        source_char_start=int(cit.get("source_start", 0)),
                        source_char_end=int(cit.get("source_end", 0)),
                    )
                except (TypeError, ValueError):
                    continue

        try:
            reindex_wiki_page(page, trace_id=trace_id, queue_graph=True)
        except Exception:
            logger.exception("Failed to reindex page %s after agent decomposition", page.id)

        KnowledgeActivity.objects.create(
            team=team,
            user=job.created_by,
            event_type="ingest_create" if created else "ingest_merge",
            page=page,
            summary=f"Agent {'created' if created else 'updated'} from decomposition: {page.title}",
            metadata={
                "job_id": str(job.id),
                "page_type": page_type,
                "relation_count": len(relations),
                "citation_count": len(citations),
            },
        )

    # Intra-batch graph edges from decompose relationships
    for res in ai_results:
        page = _resolve_title_to_page(res["title"], title_map)
        if page:
            _apply_intra_batch_edges(page, res["proposal"], title_map)

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

    job.wiki_page = created_pages[0] if created_pages else None
    job.chunk_count = sum(p.chunks.count() for p in created_pages)
    job.status = "done"
    job.ingest_stage = "completed"
    job.ingest_stage_detail = f"Agent created {len(created_pages)} wiki page(s)"
    job.save(
        update_fields=[
            "wiki_page",
            "chunk_count",
            "status",
            "ingest_stage",
            "ingest_stage_detail",
            "updated_at",
        ]
    )

    return created_pages


def _inject_wikilink_if_missing(page: WikiPage, link_title: str) -> bool:
    if f"[[{link_title}]]" in page.content:
        return False
    pattern = re.compile(re.escape(link_title), re.IGNORECASE)
    if not pattern.search(page.content):
        return False
    page.content = pattern.sub(f"[[{link_title}]]", page.content, count=1)
    page.save(update_fields=["content", "updated_at"])
    return True
