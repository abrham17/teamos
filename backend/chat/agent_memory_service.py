"""
Persistent agent memory service.

Allows the agent to store and retrieve information across chat sessions,
maintaining awareness of team priorities, known blockers, knowledge gaps, etc.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from chat.models import AgentMemory

logger = logging.getLogger(__name__)


def get_memory(team_id: str, key: str) -> dict | None:
    """Retrieve a memory entry by key."""
    try:
        entry = AgentMemory.objects.get(team_id=team_id, key=key)
        return entry.value
    except AgentMemory.DoesNotExist:
        return None


def set_memory(
    team_id: str,
    key: str,
    value: dict,
    *,
    category: str = "context",
    summary: str = "",
) -> AgentMemory:
    """Store or update a memory entry."""
    entry, created = AgentMemory.objects.update_or_create(
        team_id=team_id,
        key=key,
        defaults={
            "value": value,
            "category": category,
            "summary": summary,
        },
    )
    return entry


def delete_memory(team_id: str, key: str) -> bool:
    """Delete a memory entry."""
    deleted, _ = AgentMemory.objects.filter(team_id=team_id, key=key).delete()
    return deleted > 0


def list_memories(team_id: str, category: str | None = None) -> list[dict[str, Any]]:
    """List all memory entries for a team, optionally filtered by category."""
    qs = AgentMemory.objects.filter(team_id=team_id)
    if category:
        qs = qs.filter(category=category)
    return [
        {
            "key": m.key,
            "category": m.category,
            "summary": m.summary,
            "value": m.value,
            "updated_at": m.updated_at.isoformat(),
        }
        for m in qs
    ]


def get_agent_context_block(team_id: str) -> str:
    """
    Build a context block from all agent memories for injection into
    the agent system prompt. Gives the agent persistent awareness.
    
    Optimized to minimize heap usage by limiting fields and using efficient filtering.
    """
    from django.utils import timezone
    from django.db.models import F

    now = timezone.now()
    
    # Initial broad filter to avoid loading ancient records unnecessarily
    # We assume memories older than 90 days are not needed if not refreshed
    cutoff = now - timezone.timedelta(days=90)
    
    # Only pull fields we actually need for the summary block
    memories = AgentMemory.objects.filter(
        team_id=team_id,
        updated_at__gt=cutoff
    ).only("category", "key", "summary", "value", "updated_at", "ttl_days").order_by("-updated_at")
    
    valid_memories = []
    category_counts = {}
    
    for m in memories:
        # Check TTL (Python side because per-record ttl_days math is tricky across DB backends)
        # But we're only iterating over light objects now due to .only()
        if m.ttl_days and (now - m.updated_at).days > m.ttl_days:
            continue
            
        # Limit to top 5 per category
        category_counts[m.category] = category_counts.get(m.category, 0) + 1
        if category_counts[m.category] > 5:
            continue
            
        valid_memories.append(m)
        if len(valid_memories) > 30: # Hard cap on total memories in context
            break

    if not valid_memories:
        return ""

    lines = ["--- AGENT PERSISTENT MEMORY ---"]
    for m in valid_memories:
        summary = m.summary or json.dumps(m.value)[:200]
        lines.append(f"[{m.category}] {m.key}: {summary}")
    lines.append("--- END MEMORY ---")
    return "\n".join(lines)
