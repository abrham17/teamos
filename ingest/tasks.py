"""
Ingestion Celery tasks — Phase 2 implements full pipeline.
Phase 1: only wire_page_graph is needed (called after page save).
"""
import re
import logging
from collections import Counter
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def wire_page_graph(page_id: str):
    """
    Parse [[wikilinks]] from a WikiPage and create/delete GraphEdge rows.
    Called after every page create or update.
    """
    from wiki.models import WikiPage
    from graph_engine.models import GraphEdge
    from graph_engine.analytics import invalidate_team_graph_analytics_cache

    try:
        page = WikiPage.objects.get(id=page_id)
    except WikiPage.DoesNotExist:
        logger.warning(f"wire_page_graph: page {page_id} not found")
        return

    # Extract all [[Page Title]] references
    pattern = re.compile(r"\[\[([^\]]+)\]\]")
    linked_titles = set(pattern.findall(page.content))

    # Resolve titles to pages in the same team
    team_pages = WikiPage.objects.filter(
        team=page.team, is_deleted=False
    ).exclude(id=page.id)

    resolved = {}
    for title in linked_titles:
        match = team_pages.filter(title__iexact=title).first()
        if match:
            resolved[title] = match

    # Create new wikilink edges
    existing = set(
        GraphEdge.objects.filter(from_page=page, edge_type="wikilink")
        .values_list("to_page_id", flat=True)
    )
    for title, target in resolved.items():
        if target.id not in existing:
            GraphEdge.objects.get_or_create(
                from_page=page,
                to_page=target,
                edge_type="wikilink",
                defaults={"confidence": 1.0, "created_by": "human"},
            )

    # Delete stale wikilink edges (links removed from content)
    resolved_ids = {t.id for t in resolved.values()}
    GraphEdge.objects.filter(
        from_page=page, edge_type="wikilink"
    ).exclude(to_page_id__in=resolved_ids).delete()

    infer_ai_edges.delay(page_id)
    invalidate_team_graph_analytics_cache(page.team_id)
    logger.info(f"wire_page_graph: page {page.slug} → {len(resolved)} wikilink edges")


@shared_task
def infer_ai_edges(page_id: str):
    """
    High-fidelity AI-inferred edges using Vector Semantic Similarity.
    """
    from wiki.models import WikiPage
    from graph_engine.models import GraphEdge
    from graph_engine.analytics import invalidate_team_graph_analytics_cache
    from ingest.vectors import vector_store

    try:
        page = WikiPage.objects.get(id=page_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return

    # Use title + first chunk as query context
    query_text = f"{page.title}\n{page.content[:500]}"
    try:
        results = vector_store.search_similar_pages(page.team.id, query_text, limit=10)
    except Exception as e:
        logger.error(f"Semantic search failed for page {page.id}: {e}")
        return

    # Group by page_id and take max score
    page_scores = {}
    for res in results:
        target_page_id = res.payload.get("page_id")
        if not target_page_id or target_page_id == str(page.id):
            continue
        page_scores[target_page_id] = max(page_scores.get(target_page_id, 0), res.score)

    sorted_targets = sorted(page_scores.items(), key=lambda x: x[1], reverse=True)[:3]

    # Delete stale edges (both old ai_inferred and new semantic)
    GraphEdge.objects.filter(from_page=page, edge_type__in=["ai_inferred", "semantic"], created_by="pipeline").delete()
    
    for target_id, score in sorted_targets:
        try:
            target = WikiPage.objects.get(id=target_id)
            GraphEdge.objects.get_or_create(
                from_page=page,
                to_page=target,
                edge_type="semantic",
                defaults={"confidence": score, "created_by": "pipeline"}
            )
        except WikiPage.DoesNotExist:
            continue

    invalidate_team_graph_analytics_cache(page.team_id)
    logger.info("infer_ai_edges: page %s semantic_edges=%s", page.slug, len(sorted_targets))


@shared_task
def run_ingest_job(job_id: str, source_text: str = ""):
    """Execute full ingestion pipeline for a stored ingest job."""
    from ingest.models import IngestJob
    from ingest.pipeline import run_pipeline
    job = None
    try:
        job = IngestJob.objects.get(id=job_id)
        job.status = "running"
        job.error = ""
        job.save(update_fields=["status", "error", "updated_at"])
        run_pipeline(job, source_text=source_text or "")
        job.status = "done"
        job.save(update_fields=["status", "updated_at"])
    except Exception as e:
        logger.exception(f"Ingest job {job_id} failed: {e}")
        try:
            if job is None:
                job = IngestJob.objects.get(id=job_id)
            job.status = "failed"
            job.error = str(e)
            job.save(update_fields=["status", "error", "updated_at"])
        except Exception:
            pass


@shared_task
def run_gap_analysis(team_id: str):
    """
    Identifies 'Orphan Concepts' — titles linked via [[wikilinks]] that don't exist yet.
    """
    from wiki.models import WikiPage
    
    # 1. Find all mentions in [[wikilinks]]
    pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)
    
    pattern = re.compile(r"\[\[([^\]]+)\]\]")
    mentions = []
    for p in pages:
        mentions.extend(pattern.findall(p.content))
        
    counts = Counter(mentions)
    
    # 2. Filter for titles that don't exist as pages
    existing_titles = set(pages.values_list("title", flat=True))
    orphans = []
    for title, count in counts.items():
        if title not in existing_titles and count >= 2: # Mentioned at least twice
            orphans.append({"title": title, "mentions": count})
            
    orphans.sort(key=lambda x: x["mentions"], reverse=True)
    
    # 3. Log findings
    logger.info(f"Gap Analysis for team {team_id}: Found {len(orphans)} orphan concepts.")
    return orphans
