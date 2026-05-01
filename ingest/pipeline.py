import hashlib
import logging
import os
import re
import shutil
import subprocess
import tempfile
import json
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.utils.text import slugify

from wiki.models import WikiPage, PageChunk
from ingest.models import IngestJob, WikiChangeSet, KnowledgeActivity
from ingest.vectors import vector_store

logger = logging.getLogger(__name__)


def _set_job_stage(job: IngestJob, stage: str, detail: str = "") -> None:
    job.ingest_stage = stage
    job.ingest_stage_detail = detail
    job.save(update_fields=["ingest_stage", "ingest_stage_detail", "updated_at"])


def _derive_chunk_config(team_plan: str) -> tuple[int, int]:
    tiers = getattr(settings, "PLAN_TIERS", {})
    plan_cfg = tiers.get(team_plan) or tiers.get("free") or {}
    chunk_size = int(plan_cfg.get("chunk_size", 300))
    chunk_overlap = int(plan_cfg.get("chunk_overlap", 30))
    return max(chunk_size, 100), max(min(chunk_overlap, chunk_size - 1), 0)


def _clean_html_to_text(raw_html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", raw_html, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _fetch_url_text(url: str) -> str:
    response = requests.get(url, timeout=20)
    response.raise_for_status()
    content_type = response.headers.get("Content-Type", "").lower()
    body = response.text
    if "html" in content_type:
        return _clean_html_to_text(body)
    return body.strip()


def _fetch_repo_text(repo_url: str) -> str:
    temp_dir = tempfile.mkdtemp()
    try:
        subprocess.run(["git", "clone", "--depth", "1", repo_url, temp_dir], check=True, capture_output=True)
        aggregated_text = []
        extensions = (".py", ".js", ".ts", ".tsx", ".jsx", ".md", ".txt")
        for root, _, files in os.walk(temp_dir):
            for file in files:
                if file.endswith(extensions):
                    rel_path = os.path.relpath(os.path.join(root, file), temp_dir)
                    with open(os.path.join(root, file), "r", encoding="utf-8", errors="ignore") as f:
                        aggregated_text.append(f"\n--- FILE: {rel_path} ---\n{f.read()}")
        return "\n".join(aggregated_text)
    finally:
        shutil.rmtree(temp_dir)


def _detect_template_and_type(text: str) -> tuple[str, str]:
    """Uses AI to categorize the document type and suggested template."""
    if not vector_store.openai:
        return "standard", "Standard Page"
        
    prompt = (
        "Analyze this text and categorize its document type. "
        "Types: 'decision_record', 'project_brief', 'meeting_notes', 'sop', 'standard'. "
        "Return JSON: {\"type\": \"...\", \"template_name\": \"...\"}"
    )
    try:
        resp = vector_store.openai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": prompt}, {"role": "user", "content": text[:2000]}],
            response_format={"type": "json_object"}
        )
        data = json.loads(resp.choices[0].message.content)
        return data.get("type", "standard"), data.get("template_name", "Standard Page")
    except:
        return "standard", "Standard Page"


def _analyze_governance(job, new_text: str):
    results = vector_store.search_similar_pages(job.team.id, new_text[:1000], limit=5)
    related_content = [f"PAGE: {res.payload.get('page_title')}\nCONTENT: {res.payload.get('content')[:500]}" for res in results]
    context = "\n\n".join(related_content)
    
    diff_summary = {"contradictions": [], "additions": [], "related_pages": [res.payload.get('page_title') for res in results]}
    
    if vector_store.openai:
        prompt = f"Compare this new information with existing wiki knowledge.\n\nNEW INFO:\n{new_text[:2000]}\n\nEXISTING KNOWLEDGE:\n{context}\n\nIdentify contradictions. Respond in JSON: {{\"contradictions\": [\"...\"], \"additions\": [\"...\"]}}"
        try:
            resp = vector_store.openai.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            diff_summary = json.loads(resp.choices[0].message.content)
        except: pass

    WikiChangeSet.objects.create(job=job, proposed_content=new_text, diff_summary=diff_summary)


def _slug_for_ingested_page(team, title: str) -> str:
    base = slugify(title) or "ingested-page"
    slug = base
    n = 1
    while WikiPage.objects.filter(team=team, slug=slug).exists():
        slug = f"{base}-{n}"; n += 1
    return slug


def _derive_title(job, source_text: str) -> str:
    if job.source_type == "repo":
        return f"Repo: {urlparse(job.source_url).path.strip('/')}"[:120]
    if job.source_url:
        return (urlparse(job.source_url).path.strip("/") or "Ingested URL")[:120]
    return "Ingested Content"


def _persist_chunks(page: WikiPage, chunks: list[str]) -> int:
    PageChunk.objects.filter(page=page).delete()
    rows = [
        PageChunk(
            page=page, chunk_index=idx, content=c,
            content_hash=hashlib.sha256(c.encode()).hexdigest(),
            qdrant_point_id=f"{page.id}:{idx}"
        ) for idx, c in enumerate(chunks)
    ]
    PageChunk.objects.bulk_create(rows)
    return len(rows)


def run_pipeline(job, source_text: str = "", trace_id: str | None = None):
    _set_job_stage(job, "extracting", "Extracting source content")
    parsed_text = (source_text or "").strip()
    if job.source_type == "url":
        parsed_text = _fetch_url_text(job.source_url)
    elif job.source_type == "repo":
        parsed_text = _fetch_repo_text(job.source_url)

    if not parsed_text:
        raise ValueError("No extractable text content found.")

    job.raw_data = parsed_text
    job.save(update_fields=["raw_data"])

    # Advanced AI: Template Detection
    _set_job_stage(job, "governance", "Classifying content and governance checks")
    page_type, template_name = _detect_template_and_type(parsed_text)

    # Governance Gate
    if not job.auto_approve:
        _analyze_governance(job, parsed_text)
        job.status = "review_required"
        job.save(update_fields=["status"])
        return

    # Materialization
    _set_job_stage(job, "materializing", "Creating/updating wiki page")
    title = _derive_title(job, parsed_text)
    page, created = WikiPage.objects.get_or_create(
        team=job.team, title=title,
        defaults={
            "slug": _slug_for_ingested_page(job.team, title),
            "content": parsed_text,
            "raw_content": parsed_text,
            "created_by": job.created_by,
            "page_type": page_type,
            "frontmatter": {"template": template_name}
        }
    )
    if not created:
        page.content = parsed_text
        page.raw_content = parsed_text
        page.save(update_fields=["content", "raw_content", "updated_at"])

    # Vectorization
    _set_job_stage(job, "vectorizing", "Chunking and embedding content")
    chunk_size, chunk_overlap = _derive_chunk_config(job.team.plan)
    words = parsed_text.split()
    chunks = [" ".join(words[i:i+chunk_size]) for i in range(0, len(words), chunk_size - chunk_overlap)]
    chunk_count = _persist_chunks(page, chunks)

    # Sync to Qdrant
    chunks_data = [{"id": str(c.id), "content": c.content, "index": c.chunk_index, "title": page.title} for c in PageChunk.objects.filter(page=page)]
    vector_store.upsert_chunks(job.team.id, page.id, chunks_data)

    # Graph
    _set_job_stage(job, "graph_sync", "Wiring graph relationships")
    from ingest.tasks import wire_page_graph
    wire_page_graph.delay(str(page.id), trace_id=trace_id)

    job.chunk_count = chunk_count
    job.status = "done"
    job.ingest_stage = "completed"
    job.ingest_stage_detail = "Ingestion completed successfully"
    job.wiki_page = page
    job.save(update_fields=["chunk_count", "status", "ingest_stage", "ingest_stage_detail", "wiki_page", "updated_at"])

    # Log Activity
    KnowledgeActivity.objects.create(
        team=job.team,
        user=job.created_by,
        event_type="ingest_create" if created else "ingest_merge",
        page=page,
        summary=f"AI {'created' if created else 'updated'} {template_name}: {page.title}",
        metadata={"job_id": str(job.id), "page_type": page_type}
    )
