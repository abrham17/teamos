from __future__ import annotations
import hashlib
import json
import logging
import re
from urllib.parse import urlparse

from django.utils.text import slugify

from wiki.models import WikiPage, PageChunk
from ingest.models import IngestJob, WikiChangeSet, KnowledgeActivity, RawSource
from ingest.vectors import vector_store
from llm_orchestrator.orchestrator import llm_json_call
from ingest.extractors import extract_plain_text
from ingest.extractors import youtube_text as youtube_extract

logger = logging.getLogger(__name__)


def _chat_json_completion(
    team,
    messages: list,
    *,
    operation: str = "ingest_decompose",
    user = None,
    default_on_error: dict | None = None,
) -> dict | None:
    """
    Refactored to use central llm_orchestrator.
    """
    return llm_json_call(
        team=team,
        operation=operation,
        messages=messages,
        user=user,
        default_on_error=default_on_error
    )


def _set_job_stage(job: IngestJob, stage: str, detail: str = "") -> None:
    job.ingest_stage = stage
    job.ingest_stage_detail = detail
    job.save(update_fields=["ingest_stage", "ingest_stage_detail", "updated_at"])


def _derive_chunk_config(team_plan: str) -> tuple[int, int]:
    from django.conf import settings

    tiers = getattr(settings, "PLAN_TIERS", {})
    plan_cfg = tiers.get(team_plan) or tiers.get("free") or {}
    chunk_size = int(plan_cfg.get("chunk_size", 300))
    chunk_overlap = int(plan_cfg.get("chunk_overlap", 30))
    return max(chunk_size, 100), max(min(chunk_overlap, chunk_size - 1), 0)


def _detect_template_and_type(team, text: str) -> tuple[str, str]:
    """Uses AI to categorize the document type and suggested template."""
    prompt = (
        "Analyze this text and categorize its document type. "
        "Types: 'decision_record', 'project_brief', 'meeting_notes', 'sop', 'standard'. "
        'Return JSON: {"type": "...", "template_name": "..."}'
    )
    data = _chat_json_completion(
        team=team,
        messages=[{"role": "system", "content": prompt}, {"role": "user", "content": text[:2000]}],
        operation="template_detect",
        default_on_error={"type": "standard", "template_name": "Standard Page"},
    )
    if not data:
        return "standard", "Standard Page"
    return data.get("type", "standard"), data.get("template_name", "Standard Page")


def _analyze_governance(job, new_text: str):
    try:
        results = vector_store.search_similar_pages(job.team.id, new_text[:1000], limit=5)
    except Exception:
        logger.exception("Governance vector search failed for job %s", job.id)
        results = []
    related_content = [
        f"PAGE: {res.payload.get('page_title')}\nCONTENT: {res.payload.get('content')[:500]}" for res in results
    ]
    context = "\n\n".join(related_content)

    diff_summary = {
        "contradictions": [],
        "additions": [],
        "related_pages": [res.payload.get("page_title") for res in results],
    }

    prompt = (
        f"Compare this new information with existing wiki knowledge.\n\nNEW INFO:\n{new_text[:2000]}\n\n"
        f"EXISTING KNOWLEDGE:\n{context}\n\nIdentify contradictions. Respond in JSON: "
        '{"contradictions": ["..."], "additions": ["..."]}'
    )
    merged = _chat_json_completion(
        team=job.team,
        messages=[{"role": "user", "content": prompt}],
        operation="ingest_governance",
        user=job.created_by,
        default_on_error=None,
    )
    if isinstance(merged, dict):
        diff_summary = {
            "contradictions": merged.get("contradictions") or [],
            "additions": merged.get("additions") or [],
            "related_pages": diff_summary["related_pages"],
        }

    WikiChangeSet.objects.create(
        job=job,
        proposed_content=new_text,
        diff_summary=diff_summary,
        status=WikiChangeSet.STATUS_PENDING,
    )


def _slug_for_ingested_page(team, title: str) -> str:
    base = slugify(title) or "ingested-page"
    slug = base
    n = 1
    while WikiPage.objects.filter(team=team, slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


def _derive_title(job, source_text: str) -> str:
    text = (source_text or "").strip()
    if job.source_type == "youtube":
        m = re.search(r"^Title:\s*(.+)$", text, re.MULTILINE)
        if m:
            return m.group(1).strip()[:120]
        vid = youtube_extract.youtube_video_id(job.source_url or "")
        return (f"YouTube {vid or 'video'}")[:120]
    m = re.search(r"^\s*#\s+(.+?)\s*$", text[:4000], re.MULTILINE)
    if m:
        return m.group(1).strip()[:120]
    if job.source_type == "repo":
        return f"Repo: {urlparse(job.source_url).path.strip('/')}"[:120]
    if job.source_url:
        return (urlparse(job.source_url).path.strip("/") or "Ingested URL")[:120]
    fn = (getattr(job, "source_filename", None) or "").strip()
    if fn and "." in fn:
        stem = fn.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").strip()
        if stem:
            return stem[:120]
    return "Ingested Content"


def _persist_chunks(page: WikiPage, chunks: list[str]) -> int:
    """Persist text chunks to ``PageChunk`` rows (shared with wiki reindex)."""
    PageChunk.objects.filter(page=page).delete()
    rows = [
        PageChunk(
            page=page,
            chunk_index=idx,
            content=c,
            content_hash=hashlib.sha256(c.encode()).hexdigest(),
            qdrant_point_id=f"{page.id}:{idx}",
        )
        for idx, c in enumerate(chunks)
    ]
    PageChunk.objects.bulk_create(rows)
    return len(rows)


def _prune_pipeline_semantic_edges(page: WikiPage) -> None:
    """Remove vector-inferred edges so re-ingest can rebuild without stale contradictions."""
    try:
        from graph_engine.models import GraphEdge

        GraphEdge.objects.filter(
            from_page=page,
            created_by="pipeline",
            edge_type__in=["semantic", "ai_inferred"],
        ).delete()
    except Exception:
        logger.exception("Failed pruning pipeline edges for page %s", page.id)


def _materialize_and_index(
    job: IngestJob,
    parsed_text: str,
    page_type: str,
    template_name: str,
    trace_id: str | None,
    *,
    prune_semantic: bool = False,
) -> tuple[WikiPage, bool, int]:
    _set_job_stage(job, "materializing", "Creating/updating wiki page")
    from wiki.services.reindex import reindex_wiki_page

    title = _derive_title(job, parsed_text)
    created = False

    if job.wiki_page_id:
        page = job.wiki_page
        if prune_semantic:
            _prune_pipeline_semantic_edges(page)
        page.content = parsed_text
        page.raw_content = parsed_text
        page.page_type = page_type
        fm = dict(page.frontmatter or {})
        fm["template"] = template_name
        page.frontmatter = fm
        page.save(update_fields=["content", "raw_content", "page_type", "frontmatter", "updated_at"])
    else:
        page, created = WikiPage.objects.get_or_create(
            team=job.team,
            title=title,
            defaults={
                "slug": _slug_for_ingested_page(job.team, title),
                "content": parsed_text,
                "raw_content": parsed_text,
                "created_by": job.created_by,
                "page_type": page_type,
                "frontmatter": {"template": template_name},
            },
        )
        if not created:
            if prune_semantic:
                _prune_pipeline_semantic_edges(page)
            page.content = parsed_text
            page.raw_content = parsed_text
            page.save(update_fields=["content", "raw_content", "updated_at"])

    _set_job_stage(job, "vectorizing", "Chunking and embedding content")
    chunk_count = reindex_wiki_page(page, body_text=parsed_text, trace_id=trace_id, queue_graph=True)
    _set_job_stage(job, "graph_sync", "Wiring graph relationships")

    job.chunk_count = chunk_count
    job.status = "done"
    job.ingest_stage = "completed"
    job.ingest_stage_detail = "Ingestion completed successfully"
    job.wiki_page = page
    job.save(
        update_fields=[
            "chunk_count",
            "status",
            "ingest_stage",
            "ingest_stage_detail",
            "wiki_page",
            "updated_at",
        ]
    )

    KnowledgeActivity.objects.create(
        team=job.team,
        user=job.created_by,
        event_type="ingest_create" if created else "ingest_merge",
        page=page,
        summary=f"AI {'created' if created else 'updated'} {template_name}: {page.title}",
        metadata={"job_id": str(job.id), "page_type": page_type},
    )
    return page, created, chunk_count


def approve_wiki_changeset(cs: WikiChangeSet, trace_id: str | None = None) -> WikiPage:
    """Apply a pending change set (post-review) and mark it approved."""
    if cs.status != WikiChangeSet.STATUS_PENDING:
        raise ValueError("Change set is not pending review.")
    job = cs.job
    text = cs.proposed_content
    page_type, template_name = _detect_template_and_type(job.team, text)
    page, _created, _chunk = _materialize_and_index(
        job, text, page_type, template_name, trace_id, prune_semantic=True
    )
    cs.status = WikiChangeSet.STATUS_APPROVED
    cs.save(update_fields=["status", "updated_at"])
    return page


def reject_wiki_changeset(cs: WikiChangeSet) -> None:
    if cs.status != WikiChangeSet.STATUS_PENDING:
        raise ValueError("Change set is not pending review.")
    job = cs.job
    cs.status = WikiChangeSet.STATUS_REJECTED
    cs.save(update_fields=["status", "updated_at"])
    job.status = "failed"
    job.ingest_stage = "failed"
    job.ingest_stage_detail = "Change set rejected by reviewer"
    job.save(update_fields=["status", "ingest_stage", "ingest_stage_detail", "updated_at"])


def _clear_staging_file(job: IngestJob) -> None:
    try:
        if getattr(job, "staging_file", None) and job.staging_file:
            job.staging_file.delete(save=False)
            job.staging_file = None
            job.save(update_fields=["staging_file", "updated_at"])
    except Exception:
        logger.exception("Failed to clear staging file for job %s", job.id)


def run_pipeline(job: IngestJob, source_text: str = "", trace_id: str | None = None):
    _set_job_stage(job, "extracting", "Extracting source content")

    # Preserve staging file reference for raw source before clearing
    staging_file_copy = None
    if getattr(job, "staging_file", None) and job.staging_file:
        staging_file_copy = job.staging_file.name

    try:
        parsed_text = extract_plain_text(job, source_text=source_text or "").strip()
    finally:
        _clear_staging_file(job)

    if not parsed_text:
        raise ValueError("No extractable text content found.")

    job.raw_data = parsed_text
    job.save(update_fields=["raw_data"])

    # ── Save raw source permanently ──────────────────────────────
    _set_job_stage(job, "governance", "Saving raw source and classifying content")
    raw_source = _save_raw_source(job, parsed_text, staging_file_copy)

    # ── Agent decomposition pipeline ─────────────────────────────
    _set_job_stage(job, "governance", "Agent analyzing and decomposing document")
    try:
        from ingest.agent_decompose import run_agent_decomposition

        pages = run_agent_decomposition(
            job=job,
            raw_text=parsed_text,
            raw_source=raw_source,
            trace_id=trace_id,
        )
        # run_agent_decomposition handles status updates internally
        # (sets "review_required" if contradictions found, "done" otherwise)
        return
    except Exception:
        logger.exception("Agent decomposition failed for job %s, falling back to legacy pipeline", job.id)
        # Fall through to legacy pipeline on error

    # ── Legacy fallback pipeline ─────────────────────────────────
    page_type, template_name = _detect_template_and_type(job.team, parsed_text)

    if not job.auto_approve:
        _analyze_governance(job, parsed_text)
        job.status = "review_required"
        job.save(update_fields=["status"])
        return

    prune = bool(job.wiki_page_id and job.auto_approve)
    _materialize_and_index(job, parsed_text, page_type, template_name, trace_id, prune_semantic=prune)


def _save_raw_source(job: IngestJob, parsed_text: str, staging_file_name: str | None) -> RawSource | None:
    """Persist the original source permanently for traceability."""
    try:
        source = RawSource.objects.create(
            team=job.team,
            source_type=job.source_type,
            source_url=job.source_url or "",
            original_filename=job.source_filename or "",
            extracted_text=parsed_text,
            structure_map=_build_structure_map(job.source_type, parsed_text),
            ingest_job=job,
            created_by=job.created_by,
        )
        # If there was a staging file, copy its reference
        if staging_file_name:
            from django.core.files.storage import default_storage

            if default_storage.exists(staging_file_name):
                source.file.name = staging_file_name
                source.save(update_fields=["file"])

        return source
    except Exception:
        logger.exception("Failed to save raw source for job %s", job.id)
        return None


def _build_structure_map(source_type: str, text: str) -> dict:
    """Build a basic structure map for the raw source."""
    import re

    structure: dict = {"type": source_type}

    if source_type == "youtube":
        # Parse timestamp markers from YouTube transcripts
        segments = []
        pattern = re.compile(r"(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(.+?)(?=\n\d{1,2}:\d{2}|\Z)", re.DOTALL)
        for match in pattern.finditer(text):
            segments.append({
                "timestamp": match.group(1),
                "char_start": match.start(),
                "char_end": match.end(),
                "heading": match.group(2).strip()[:100],
            })
        structure["segments"] = segments

    elif source_type in ("markdown", "url"):
        # Parse markdown headings as sections
        sections = []
        pattern = re.compile(r"^(#{1,3})\s+(.+?)$", re.MULTILINE)
        for match in pattern.finditer(text):
            sections.append({
                "level": len(match.group(1)),
                "heading": match.group(2).strip(),
                "char_start": match.start(),
                "char_end": match.end(),
            })
        structure["sections"] = sections

    else:
        # Generic: split by double newlines as paragraphs
        paragraphs = []
        pos = 0
        for i, block in enumerate(text.split("\n\n")):
            if block.strip():
                paragraphs.append({
                    "index": i,
                    "char_start": pos,
                    "char_end": pos + len(block),
                })
            pos += len(block) + 2
        structure["paragraphs"] = paragraphs[:50]

    return structure

