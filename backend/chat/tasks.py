"""
Celery tasks for the chat app.

- prune_expired_agent_memories: enforces AgentMemory.ttl_days by
  deleting records whose last update exceeds their TTL.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="chat.tasks.prune_expired_agent_memories", bind=True, max_retries=3)
def prune_expired_agent_memories(self):
    """
    Delete AgentMemory rows that have exceeded their individual TTL.

    TTL is per-record (ttl_days field). We compare against updated_at so that
    recently accessed memories are not pruned even if they are old.
    """
    try:
        from chat.models import AgentMemory

        now = timezone.now()
        total_deleted = 0

        # Fetch all memories that have a ttl_days set (non-null, non-zero)
        candidates = AgentMemory.objects.filter(ttl_days__isnull=False, ttl_days__gt=0)

        expired_ids = [
            mem.id
            for mem in candidates
            if (now - mem.updated_at) > timedelta(days=mem.ttl_days)
        ]

        if expired_ids:
            deleted_count, _ = AgentMemory.objects.filter(id__in=expired_ids).delete()
            total_deleted = deleted_count
            logger.info("Pruned %d expired AgentMemory records.", total_deleted)
        else:
            logger.debug("prune_expired_agent_memories: no expired records found.")

        return {"deleted": total_deleted}

    except Exception as exc:
        logger.exception("prune_expired_agent_memories failed")
        raise self.retry(exc=exc, countdown=60)
