"""
Ingestion Celery tasks — Phase 2 implements full pipeline.
Phase 1: only wire_page_graph is needed (called after page save).
"""
import re
import logging
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

    logger.info(f"wire_page_graph: page {page.slug} → {len(resolved)} wikilink edges")


@shared_task
def run_ingest_job(job_id: str):
    """Full ingestion pipeline — implemented in Phase 2."""
    from ingest.models import IngestJob
    from ingest.pipeline import run_pipeline
    try:
        job = IngestJob.objects.get(id=job_id)
        run_pipeline(job)
    except Exception as e:
        logger.exception(f"Ingest job {job_id} failed: {e}")
        try:
            job.status = "failed"
            job.error = str(e)
            job.save()
        except Exception:
            pass
