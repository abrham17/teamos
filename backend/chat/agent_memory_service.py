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
    """
    memories = AgentMemory.objects.filter(team_id=team_id).order_by("-updated_at")[:10]
    if not memories:
        return ""

    lines = ["--- AGENT PERSISTENT MEMORY ---"]
    for m in memories:
        summary = m.summary or json.dumps(m.value)[:200]
        lines.append(f"[{m.category}] {m.key}: {summary}")
    lines.append("--- END MEMORY ---")
    return "\n".join(lines)
