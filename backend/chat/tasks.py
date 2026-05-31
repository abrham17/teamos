"""
Celery tasks for the chat app.

- prune_expired_agent_memories: enforces AgentMemory.ttl_days by
  deleting records whose last update exceeds their TTL.
"""
from __future__ import annotations

import logging

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


@shared_task(name="chat.tasks.retrospective_learning_loop", bind=True, max_retries=2)
def retrospective_learning_loop(self, episode_id: str):
    """
    Episode Retrospective Critique:
    Analyzes failed or complex agent tool calls/outcomes, extracts actionable
    operational lessons, updates behavioral guidelines, and writes them back.
    """
    try:
        import json
        from chat.models import AgentEpisode
        from llm_orchestrator.orchestrator import llm_json_call
        from django.core.cache import cache

        episode = AgentEpisode.objects.get(id=episode_id)
        
        actions_str = json.dumps(episode.actions)
        had_tool_failure = "ok\": false" in actions_str.lower() or "error" in actions_str.lower()
        
        if episode.success and not had_tool_failure:
            episode.learnings = f"Successfully addressed: '{episode.trigger[:100]}'."
            episode.save()
            return {"status": "skipped_no_errors"}

        # Perform retrospective critique via LLM
        system = (
            "You are the senior TeamOS Site Reliability & Performance Auditor.\n"
            "Analyze this historical agent episode, locate where tools erred, what constraints were missed, and compile an engineering post-mortem.\n\n"
            f"User Trigger: {episode.trigger}\n"
            f"Actions Executed: {actions_str}\n"
            f"Outcome Reported: {json.dumps(episode.outcome)}\n\n"
            "Return JSON:\n"
            "  root_cause: string (why did the tool or loop fail?)\n"
            "  guideline_update: string (one generic, actionable rule to avoid this in the future, e.g. 'When running doc searches, verify the API key is present before listing files')\n"
            "  severity: string\n"
        )

        result = llm_json_call(
            team=episode.team,
            operation="retrospective_critique",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": "Analyze the execution trace and provide dynamic instruction corrections."},
            ],
            default_on_error={
                "root_cause": "Unknown execution error",
                "guideline_update": "Verify arguments before executing tool.",
                "severity": "medium",
            },
        )

        root_cause = result.get("root_cause", "")
        guideline = result.get("guideline_update", "")

        learnings_text = f"Root Cause: {root_cause}\nRecommended Correction: {guideline}"
        episode.learnings = learnings_text
        episode.save()

        # Update the team's global dynamic behavioral directives cache
        team_key = f"behavior_directives:{str(episode.team.id)}"
        directives = cache.get(team_key, [])
        if len(directives) >= 20:
            directives.pop(0)  # LRU size limit
        directives.append(guideline)
        cache.set(team_key, directives, timeout=86400 * 7)  # Store for 7 days

        logger.info("Successfully updated retrospective learnings for episode %s.", episode_id)
        return {"status": "success", "guideline": guideline}

    except Exception as exc:
        logger.exception("retrospective_learning_loop failed")
        raise self.retry(exc=exc, countdown=30)

