import hashlib
import json
import logging
import re
from urllib.parse import urlparse

from django.utils.text import slugify

from wiki.models import WikiPage, PageChunk
from ingest.models import IngestJob, WikiChangeSet, KnowledgeActivity
from ingest.vectors import vector_store
from teamos_project.llm_config import chat_completion_model
from ingest.extractors import extract_plain_text
from ingest.extractors import youtube_text as youtube_extract

logger = logging.getLogger(__name__)


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


def _detect_template_and_type(text: str) -> tuple[str, str]:
    """Uses AI to categorize the document type and suggested template."""
    if not vector_store.openai:
        return "standard", "Standard Page"

    prompt = (
        "Analyze this text and categorize its document type. "
        "Types: 'decision_record', 'project_brief', 'meeting_notes', 'sop', 'standard'. "
        'Return JSON: {"type": "...", "template_name": "..."}'
    )
    try:
        resp = vector_store.openai.chat.completions.create(
            model=chat_completion_model(),
            messages=[{"role": "system", "content": prompt}, {"role": "user", "content": text[:2000]}],
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content)
        return data.get("type", "standard"), data.get("template_name", "Standard Page")
    except Exception:
        return "standard", "Standard Page"


def _analyze_governance(job, new_text: str):
    results = vector_store.search_similar_pages(job.team.id, new_text[:1000], limit=5)
    related_content = [
        f"PAGE: {res.payload.get('page_title')}\nCONTENT: {res.payload.get('content')[:500]}" for res in results
    ]
    context = "\n\n".join(related_content)

    diff_summary = {
        "contradictions": [],
        "additions": [],
        "related_pages": [res.payload.get("page_title") for res in results],
    }

    if vector_store.openai:
        prompt = (
            f"Compare this new information with existing wiki knowledge.\n\nNEW INFO:\n{new_text[:2000]}\n\n"
            f"EXISTING KNOWLEDGE:\n{context}\n\nIdentify contradictions. Respond in JSON: "
            '{"contradictions": ["..."], "additions": ["..."]}'
        )
        try:
            resp = vector_store.openai.chat.completions.create(
                model=chat_completion_model(),
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            diff_summary = json.loads(resp.choices[0].message.content)
        except Exception:
            pass

    WikiChangeSet.objects.create(job=job, proposed_content=new_text, diff_summary=diff_summary)


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
    try:
        parsed_text = extract_plain_text(job, source_text=source_text or "").strip()
    finally:
        _clear_staging_file(job)

    if not parsed_text:
        raise ValueError("No extractable text content found.")

    job.raw_data = parsed_text
    job.save(update_fields=["raw_data"])

    _set_job_stage(job, "governance", "Classifying content and governance checks")
    page_type, template_name = _detect_template_and_type(parsed_text)

    if not job.auto_approve:
        _analyze_governance(job, parsed_text)
        job.status = "review_required"
        job.save(update_fields=["status"])
        return

    _set_job_stage(job, "materializing", "Creating/updating wiki page")
    title = _derive_title(job, parsed_text)
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
        page.content = parsed_text
        page.raw_content = parsed_text
        page.save(update_fields=["content", "raw_content", "updated_at"])

    _set_job_stage(job, "vectorizing", "Chunking and embedding content")
    from wiki.services.reindex import reindex_wiki_page

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
