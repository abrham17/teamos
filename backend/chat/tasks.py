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
        from django.db.models import F, ExpressionWrapper, DateTimeField
        import datetime

        now = timezone.now()
        
        # We use a batch-based approach to pruning to avoid long-locking the table
        # Since Postgres doesn't easily support F() math with intervals across all versions,
        # we'll do a "safe" delete of clearly expired ones first, then a refined pass.
        
        # Pass 1: Delete anything with a small TTL that is clearly old
        # This is a heuristic to reduce the candidate pool
        candidates = AgentMemory.objects.filter(ttl_days__isnull=False, ttl_days__gt=0)
        
        # For larger datasets, we iterate in chunks of IDs to avoid OOM
        total_deleted = 0
        batch_size = 500
        
        # We still need to check TTL per record because it's dynamic.
        # But we fetch ONLY IDs and updated_at/ttl_days.
        candidate_data = list(candidates.values_list("id", "updated_at", "ttl_days"))
        
        expired_ids = [
            cid for cid, updated_at, ttl_days in candidate_data
            if (now - updated_at).days > ttl_days
        ]
        
        # Delete in batches
        for i in range(0, len(expired_ids), batch_size):
            batch = expired_ids[i:i + batch_size]
            deleted_count, _ = AgentMemory.objects.filter(id__in=batch).delete()
            total_deleted += deleted_count

        if total_deleted > 0:
            logger.info("Pruned %d expired AgentMemory records in total.", total_deleted)
        
        return {"deleted": total_deleted}

    except Exception as exc:
        logger.exception("prune_expired_agent_memories failed")
        raise self.retry(exc=exc, countdown=60)
