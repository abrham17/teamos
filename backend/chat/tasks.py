"""
Celery tasks for the chat app.

- prune_expired_agent_memories: enforces AgentMemory.ttl_days by
  deleting records whose last update exceeds their TTL.
"""
from __future__ import annotations

import json
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
    Enhanced Retrospective Learning Loop:
    Analyzes agent episodes, infers domains, extracts success/failure patterns,
    and updates ProceduralMemory objects to dynamically adjust guidelines.
    """
    try:
        import json
        from django.utils import timezone
        from chat.models import AgentEpisode, ProceduralMemory, DirectiveType
        from chat.memory.domain_inferencer import infer_domain
        
        episode = AgentEpisode.objects.get(id=episode_id)
        team_id = str(episode.team.id)

        # 1. Infer Domain
        if not episode.inferred_domain:
            episode.inferred_domain = infer_domain(episode)
            episode.save()

        # 2. Extract Patterns
        actions_str = json.dumps(episode.actions)
        had_tool_failure = "ok\": false" in actions_str.lower() or "error" in actions_str.lower()
        
        # Determine success/failure classification
        is_success = episode.success and not had_tool_failure
        
        if is_success and episode.quality_score >= 0.8:
            extract_success_patterns(episode, team_id)
        else:
            extract_failure_patterns(episode, team_id)

        # Update existing directives (reinforce/contradict check if applicable)
        update_existing_directives(episode, team_id)

        # Clear working memory/scratchpad
        try:
            from chat.working_memory import WorkingMemory
            WorkingMemory(team_id=team_id).clear()
        except Exception:
            pass

        logger.info("Successfully updated retrospective learnings for episode %s.", episode_id)
        return {"status": "success", "domain": episode.inferred_domain}

    except Exception as exc:
        logger.exception("retrospective_learning_loop failed")
        raise self.retry(exc=exc, countdown=30)


SUCCESS_ANALYSIS_PROMPT = """
Analyze this successful agent interaction to extract reusable patterns, workflow preferences, communication preferences, or vocabulary.

## User Request
{user_message}

## Inferred Domain
{domain}

## Agent Actions Taken
{agent_actions}

## Final Outcome
{final_output}

## Quality Score
{quality_score}

Output JSON (no markdown formatting, just raw JSON):
{{
  "domain": "{domain}",
  "patterns": [
    {{
      "type": "planning_heuristic",
      "keyword": "sprint retro",
      "directive": "Always create a sprint retrospective task at the end of each sprint plan.",
      "applicable_intents": ["plan/create"]
    }}
  ]
}}
"""

FAILURE_ANALYSIS_PROMPT = """
Analyze this failed or complex agent interaction to extract failure patterns, risk factors, or integration rules to avoid repeating the mistake.

## User Request
{user_message}

## Inferred Domain
{domain}

## Agent Actions Taken
{agent_actions}

## Failure Point
{failure_point}

## Error Trace
{error_trace}

Output JSON (no markdown formatting, just raw JSON):
{{
  "domain": "{domain}",
  "patterns": [
    {{
      "type": "failure_pattern",
      "keyword": "github key",
      "directive": "Verify the GitHub token is configured prior to creating repository issues.",
      "applicable_intents": []
    }}
  ]
}}
"""

def extract_success_patterns(episode, team_id: str):
    """LLM analysis to extract successful strategies."""
    from llm_orchestrator.orchestrator import llm_json_call
    from chat.models import ProceduralMemory, DirectiveType
    
    prompt = SUCCESS_ANALYSIS_PROMPT.format(
        user_message=episode.trigger,
        agent_actions=json.dumps(episode.actions),
        final_output=episode.learnings,
        quality_score=episode.quality_score,
        domain=episode.inferred_domain or "research_and_analysis"
    )
    
    try:
        extracted = llm_json_call(
            team=episode.team,
            operation="success_analysis",
            messages=[{"role": "user", "content": prompt}],
            default_on_error={"domain": episode.inferred_domain or "research_and_analysis", "patterns": []}
        )
        
        for pattern in extracted.get("patterns", []):
            existing = ProceduralMemory.objects.filter(
                team_id=team_id,
                domain=extracted.get("domain", episode.inferred_domain),
                directive_type=pattern.get("type", DirectiveType.SUCCESS_PATTERN)
            ).filter(
                directive__icontains=pattern.get("keyword", "___unknown___")
            ).first()
            
            if existing:
                existing.reinforcement_count += 1
                from django.utils import timezone
                existing.confidence = min(1.0, existing.confidence + 0.05)
                existing.last_reinforced_at = timezone.now()
                if str(episode.id) not in (existing.source_episode_ids or []):
                    existing.source_episode_ids.append(str(episode.id))
                existing.save()
            else:
                ProceduralMemory.objects.create(
                    team_id=team_id,
                    directive=pattern["directive"],
                    directive_type=pattern.get("type", DirectiveType.SUCCESS_PATTERN),
                    domain=extracted.get("domain", episode.inferred_domain),
                    applicable_intent_types=pattern.get("applicable_intents", []),
                    confidence=0.65,
                    reinforcement_count=1,
                    source_episode_ids=[str(episode.id)],
                    extraction_method="success_analysis"
                )
    except Exception:
        logger.exception("Failed to extract success patterns")


def extract_failure_patterns(episode, team_id: str):
    """LLM analysis to extract failure guidelines."""
    from llm_orchestrator.orchestrator import llm_json_call
    from chat.models import ProceduralMemory, DirectiveType
    
    prompt = FAILURE_ANALYSIS_PROMPT.format(
        user_message=episode.trigger,
        agent_actions=json.dumps(episode.actions),
        failure_point=episode.failure_point or "execution_failed",
        error_trace=episode.error_trace or "unknown error",
        domain=episode.inferred_domain or "research_and_analysis"
    )
    
    try:
        extracted = llm_json_call(
            team=episode.team,
            operation="failure_analysis",
            messages=[{"role": "user", "content": prompt}],
            default_on_error={"domain": episode.inferred_domain or "research_and_analysis", "patterns": []}
        )
        
        for pattern in extracted.get("patterns", []):
            ProceduralMemory.objects.create(
                team_id=team_id,
                directive=pattern["directive"],
                directive_type=DirectiveType.FAILURE_PATTERN,
                domain=extracted.get("domain", episode.inferred_domain),
                applicable_intent_types=pattern.get("applicable_intents", []),
                confidence=0.8,
                reinforcement_count=1,
                source_episode_ids=[str(episode.id)],
                extraction_method="retrospective"
            )
    except Exception:
        logger.exception("Failed to extract failure patterns")


def update_existing_directives(episode, team_id: str):
    """Simple check to update confidence or contradict list if errors persist."""
    from chat.models import ProceduralMemory
    actions_str = json.dumps(episode.actions).lower()
    
    # Heuristic: if episode succeeded, reinforce used directives. If failed, flag contradictions.
    directives = ProceduralMemory.objects.filter(team_id=team_id)
    for d in directives:
        keyword = d.directive[:15].lower()
        if keyword in actions_str:
            if episode.success:
                d.reinforcement_count += 1
                d.confidence = min(1.0, d.confidence + 0.02)
            else:
                d.contradiction_count += 1
                d.confidence = max(0.0, d.confidence - 0.10)
            d.save()


@shared_task(name="chat.tasks.daily_directive_maintenance", bind=True)
def daily_directive_maintenance(self):
    """Runs nightly. Prunes low-quality directives and decays unused ones."""
    try:
        from datetime import timedelta
        from django.utils import timezone
        from django.db import models
        from chat.models import ProceduralMemory

        now = timezone.now()
        
        # 1. Prune: delete expired, highly contradicted, or very low confidence directives
        pruned_count, _ = ProceduralMemory.objects.filter(
            models.Q(expires_at__lt=now) |
            models.Q(contradiction_count__gte=3) |
            models.Q(confidence__lt=0.3)
        ).delete()
        
        # 2. Decay: reduce confidence of unused directives (no use in 30 days)
        thirty_days_ago = now - timedelta(days=30)
        decayed_count = ProceduralMemory.objects.filter(
            last_used_at__lt=thirty_days_ago,
            confidence__gt=0.4
        ).update(confidence=models.F("confidence") * 0.95)
        
        # 3. Promote: upgrade highly reinforced temporary directives to permanent
        promoted_count = ProceduralMemory.objects.filter(
            reinforcement_count__gte=5,
            confidence__gte=0.9,
            expires_at__isnull=False
        ).update(expires_at=None)

        logger.info(
            "Daily Directive Maintenance: pruned %d, decayed %d, promoted %d.",
            pruned_count, decayed_count, promoted_count
        )
        return {
            "pruned": pruned_count,
            "decayed": decayed_count,
            "promoted": promoted_count
        }
    except Exception as exc:
        logger.exception("daily_directive_maintenance failed")
        raise self.retry(exc=exc, countdown=60)



@shared_task(name="chat.tasks.check_all_mcp_servers")
def check_all_mcp_servers():
    """
    Background health probe for all enabled MCP servers.
    Runs every 5 minutes (configured in CELERY_BEAT_SCHEDULE).
    Updates Redis circuit-breaker state so agents never block on dead servers.
    """
    try:
        from chat.models import MCPServerRegistration
        from chat.mcp.health import check_server_health

        servers = MCPServerRegistration.objects.filter(enabled=True)
        results = {"healthy": 0, "unhealthy": 0}

        for server in servers:
            try:
                healthy = check_server_health(server)
                if healthy:
                    results["healthy"] += 1
                else:
                    results["unhealthy"] += 1
            except Exception:
                logger.exception("Health check error for MCP server '%s'", server.name)
                results["unhealthy"] += 1

        logger.info(
            "MCP health check complete: %d healthy, %d unhealthy",
            results["healthy"], results["unhealthy"],
        )
        return results
    except Exception as exc:
        logger.exception("check_all_mcp_servers task failed")
        return {"error": str(exc)}
