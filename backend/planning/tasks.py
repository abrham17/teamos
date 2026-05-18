"""
Celery tasks for planning — async reindex to keep web dynos unblocked.
"""
from __future__ import annotations

import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    max_retries=2,
)
def reindex_project_async(self, project_id: str):
    """
    Rebuild PlanChunk rows + embeddings for a project, off the web dyno.
    Replaces all synchronous reindex_project(project) calls in views.
    """
    from .models import Project
    from .reindex import reindex_project

    try:
        project = Project.objects.get(id=project_id)
    except Project.DoesNotExist:
        logger.warning("reindex_project_async: project %s not found, skipping", project_id)
        return

    try:
        count = reindex_project(project)
        logger.info("reindex_project_async: project %s reindexed %d chunks", project_id, count)
    except Exception as exc:
        logger.exception("reindex_project_async failed for project %s", project_id)
        raise
