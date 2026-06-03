"""
Wiki agent tool implementations (server-side). Invoked only from chat agent mode for editor+ members.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from urllib.parse import urlparse
from typing import Any

from django.core.cache import cache
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
import requests

from accounts.models import TeamMember, User
from graph_engine.analytics import invalidate_team_graph_analytics_cache
from graph_engine.models import GraphEdge
from planning.models import Milestone, Project, Task
from planning.reindex import reindex_project
from teamos_project.entitlements import check_quota
from wiki.models import WikiPage
from wiki.serializers import WikiPageCreateSerializer
from wiki.views import unique_slug

logger = logging.getLogger(__name__)

CHAT_TOOL_CACHE_PREFIX = "chat_tool:idemp:"


def _check_tool_idempotency(team_id: str, tool_name: str, idempotency_key: str) -> bool:
    """Returns True if this key has already been processed (duplicate)."""
    if not idempotency_key:
        return False
    cache_key = f"{CHAT_TOOL_CACHE_PREFIX}{team_id}:{tool_name}:{idempotency_key}"
    from django.core.cache import cache
    if not cache.add(cache_key, "1", timeout=300):
        return True
    return False


@dataclass
class ToolContext:
    user: User
    team_id: str
    membership: TeamMember
    session_id: str | None = None


def openai_tool_schemas(
    whitelist: list[str] | None = None,
    *,
    team_id: str | None = None,
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    """
    OpenAI-compatible `tools` list for chat.completions.
    If whitelist is provided, only tools in the whitelist are returned.
    """
    all_tools = [
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": (
                    "Search the public web for current, external, or source-backed information. "
                    "Use for recent facts, technical standards, market research, laws, and third-party sources."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query to send to the web provider.",
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Max search results to return (default 5, max 10).",
                            "default": 5,
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "web_read_page",
                "description": (
                    "Fetch and extract the readable text from a single public URL for deeper reading."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "Public URL to extract.",
                        },
                    },
                    "required": ["url"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "research_save_to_wiki",
                "description": (
                    "Persist curated research findings into the team's wiki through the existing ingest pipeline."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Title for the saved research note."},
                        "markdown": {
                            "type": "string",
                            "description": "Markdown body to ingest as a wiki page.",
                        },
                        "source_urls": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "URLs referenced by the research summary.",
                        },
                        "auto_approve": {
                            "type": "boolean",
                            "default": True,
                            "description": "Whether the resulting ingest job should auto-approve.",
                        },
                    },
                    "required": ["markdown"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "wiki_list_pages",
                "description": (
                    "List wiki pages for the team with title, slug, page_type, and summary. "
                    "Use for overview questions: what is in the wiki, knowledge base inventory, all pages."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Max pages to return (default 50, max 150)",
                            "default": 50,
                        },
                        "page_type": {
                            "type": "string",
                            "description": "Optional filter: standard, decision, meeting, brief, incident, sop",
                        },
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "wiki_team_overview",
                "description": (
                    "Get a structured overview of the team's entire wiki/knowledge base: page counts, "
                    "types, titles, summaries, ingest sources, and graph stats. Use before answering "
                    "'what do we have in the wiki' or 'explain our knowledge base'."
                ),
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "wiki_search_pages",
                "description": (
                    "Search wiki pages (hybrid semantic + keyword). Returns slug, score, and snippet. "
                    "Use before updates; prefer wiki_read_full_page before editing content."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search string or topic description"},
                        "limit": {"type": "integer", "description": "Max results", "default": 15},
                        "mode": {
                            "type": "string",
                            "enum": ["hybrid", "semantic", "keyword"],
                            "description": "hybrid (default), semantic only, or keyword substring only",
                            "default": "hybrid",
                        },
                        "expand_queries": {
                            "type": "boolean",
                            "description": "LLM query expansion + HyDE for deeper semantic recall (slower)",
                            "default": False,
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "wiki_create_page",
                "description": "Create a new wiki page with markdown content.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "content": {"type": "string", "description": "Markdown body"},
                        "page_type": {
                            "type": "string",
                            "description": "One of: standard, decision, meeting, brief, incident, sop",
                            "default": "standard",
                        },
                        "idempotency_key": {
                            "type": "string",
                            "description": "Optional key to avoid duplicate creates on retries",
                        },
                    },
                    "required": ["title", "content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "wiki_update_page",
                "description": (
                    "Update a wiki page by page_id, slug, or resolve query. "
                    "Call wiki_read_full_page before replace edits. content_mode: replace (default), append, prepend."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slug": {"type": "string"},
                        "page_id": {"type": "string"},
                        "query": {
                            "type": "string",
                            "description": "Natural-language page finder when slug/page_id unknown",
                        },
                        "title": {"type": "string"},
                        "content": {"type": "string"},
                        "content_mode": {
                            "type": "string",
                            "enum": ["replace", "append", "prepend"],
                            "description": "How to apply content when provided",
                            "default": "replace",
                        },
                        "page_type": {"type": "string"},
                        "expected_updated_at": {
                            "type": "string",
                            "description": "ISO timestamp from wiki_read_full_page; rejects stale concurrent edits",
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "wiki_delete_page",
                "description": "Mark a wiki page as deleted (soft delete) by slug or page_id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slug": {"type": "string"},
                        "page_id": {"type": "string"},
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "graph_add_edge",
                "description": "Add a directed edge between two wiki pages (same team).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "from_page_id": {"type": "string"},
                        "to_page_id": {"type": "string"},
                        "edge_type": {
                            "type": "string",
                            "description": "manual | wikilink | ai_inferred | citation | semantic",
                            "default": "manual",
                        },
                    },
                    "required": ["from_page_id", "to_page_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "graph_remove_edge",
                "description": "Remove a directed edge between two wiki pages to resolve stale or incorrect contradictions/relations.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "from_page_id": {"type": "string"},
                        "to_page_id": {"type": "string"},
                        "edge_type": {
                            "type": "string",
                            "description": "Optional edge type. If omitted, all edges between the two pages are removed.",
                        },
                    },
                    "required": ["from_page_id", "to_page_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "ingest_markdown",
                "description": "Queue full ingest pipeline for markdown (governance, chunks, vectors, graph).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "markdown": {"type": "string"},
                        "auto_approve": {"type": "boolean", "default": True},
                    },
                    "required": ["markdown"],
                },
            },
        },
    ] + openai_plan_tool_schemas() + openai_agent_tool_schemas()

    # Phase 2: Dynamically load and merge MCP tools if team_id is provided
    mcp_tools = []
    if team_id:
        try:
            from chat.mcp_client import get_mcp_client
            mcp_client = get_mcp_client(team_id)
            mcp_tools = mcp_client.get_openai_schemas()
            all_tools.extend(mcp_tools)
        except Exception:
            logger.exception("Failed to fetch MCP tool schemas for team %s", team_id)

    # Dynamic OAuth Integration tools
    if user_id:
        try:
            from integrations.tool_registry import get_user_tools
            ext_tools = get_user_tools(user_id)
            all_tools.extend(ext_tools)
        except Exception:
            logger.exception("Failed to fetch external integration tools for user %s", user_id)

    if whitelist is not None:
        whitelist_set = set(whitelist)
        # Keep whitelisted static tools + all MCP tools + all external OAuth tools
        return [
            t for t in all_tools 
            if t["function"]["name"] in whitelist_set or t["function"]["name"].startswith("mcp_") or t["function"]["name"].startswith("ext_")
        ]
    return all_tools


_PLAN_PROJECT_LOCATOR = {
    "project_id": {"type": "string", "description": "Project UUID if known"},
    "project_query": {
        "type": "string",
        "description": "Natural language project reference (name, topic), e.g. 'Q2 launch'",
    },
}
_PLAN_TASK_LOCATOR = {
    "task_id": {"type": "string", "description": "Task UUID if known"},
    "task_query": {
        "type": "string",
        "description": "Natural language task reference, e.g. 'deploy', 'standup', 'what I finished'",
    },
}
_PLAN_MILESTONE_LOCATOR = {
    "milestone_id": {"type": "string", "description": "Milestone UUID if known"},
    "milestone_query": {
        "type": "string",
        "description": "Natural language milestone reference, e.g. 'beta launch', 'go live'",
    },
}
_PLAN_MUTATE_NOTE = (
    "Use *_query when the user speaks casually (no UUID). "
    "Status: 'achieved'/'done' → completed for tasks; 'achieved'/'done' → reached for milestones. "
    "For vague requests, first resolve semantically with project_query/task_query/milestone_query."
)

_PLAN_IDEM_KEY = {
    "idempotency_key": {
        "type": "string",
        "description": "Optional key to avoid duplicate mutations on retries.",
    },
}

_PLAN_RISK_ACTION_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["update_task_dates", "update_task_priority", "add_dependency", "update_milestone_date"],
            },
            "task_id": {"type": "string"},
            "milestone_id": {"type": "string"},
            "depends_on_task_id": {"type": "string"},
            "start_date": {"type": "string", "description": "YYYY-MM-DD"},
            "end_date": {"type": "string", "description": "YYYY-MM-DD"},
            "target_date": {"type": "string", "description": "YYYY-MM-DD"},
            "priority": {"type": "string", "enum": ["low", "medium", "high"]},
            "reason": {"type": "string"},
        },
        "required": ["action"],
    },
}


def openai_plan_tool_schemas() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "plan_list_projects",
                "description": "List projects for this team (name/description substring only).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 20},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_search",
                "description": (
                    "Hybrid semantic search across projects, tasks, milestones, and project members. "
                    "Finds day-to-day work by dates, assignee, status, and natural-language intent. "
                    "Use plan_read_entity for full details on a hit."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to find (topic, person, date YYYY-MM-DD, status, etc.)",
                        },
                        "limit": {"type": "integer", "default": 20},
                        "mode": {
                            "type": "string",
                            "enum": ["hybrid", "semantic", "keyword"],
                            "default": "hybrid",
                        },
                        "expand_queries": {
                            "type": "boolean",
                            "description": "LLM query expansion for deeper semantic recall",
                            "default": False,
                        },
                        "project_id": {
                            "type": "string",
                            "description": "Limit search to one project",
                        },
                        "source_kinds": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": ["project", "task", "milestone", "member"],
                            },
                            "description": "Filter result types",
                        },
                        "assignee_id": {
                            "type": "string",
                            "description": "Filter tasks by assignee user id",
                        },
                        "date_from": {
                            "type": "string",
                            "description": "Tasks/milestones on or after YYYY-MM-DD",
                        },
                        "date_to": {
                            "type": "string",
                            "description": "Tasks/milestones on or before YYYY-MM-DD",
                        },
                        "status": {
                            "type": "string",
                            "description": "Filter tasks (todo, in-progress, ...) or milestones (pending, reached, ...)",
                        },
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_read_entity",
                "description": (
                    "Read full project, task, or milestone after plan_search. "
                    "Pass source_kind + ids from search results."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source_kind": {
                            "type": "string",
                            "enum": ["project", "task", "milestone"],
                        },
                        "project_id": {"type": "string"},
                        "source_ref_id": {
                            "type": "string",
                            "description": "task or milestone id; omit for project-only read",
                        },
                    },
                    "required": ["source_kind", "project_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_create_project",
                "description": "Create a planning project.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {"type": "string", "enum": ["active", "on_hold", "completed", "archived"]},
                        **_PLAN_IDEM_KEY,
                    },
                    "required": ["name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_generate_draft",
                "description": (
                    "Generate and ATOMICALLY create/update a complete project plan from a mission prompt. "
                    "This tool searches the wiki, synthesizes domain expertise, generates tasks and milestones, "
                    "performs conflict checking and risk assessments, and creates all DB entities in one call. "
                    "It returns the finalized project_id. Do NOT call plan_create_project or plan_create_task manually after this."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string", "description": "The mission or objective for the project."},
                        "mode": {"type": "string", "enum": ["create", "manage"], "default": "create"},
                        **_PLAN_PROJECT_LOCATOR,
                        **_PLAN_IDEM_KEY,
                    },
                    "required": ["prompt"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_decompose_task_daily",
                "description": (
                    "Decompose a large multi-day task into sequential, day-by-day sub-tasks on the calendar. "
                    "This creates individual day-by-day sub-tasks in the database linked to the parent task."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string", "description": "The UUID of the project containing the task."},
                        "task_id": {"type": "string", "description": "The UUID of the task to decompose daily."},
                        **_PLAN_IDEM_KEY,
                    },
                    "required": ["project_id", "task_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_update_project",
                "description": "Update a project by id or natural-language project_query. " + _PLAN_MUTATE_NOTE,
                "parameters": {
                    "type": "object",
                    "properties": {
                        **_PLAN_PROJECT_LOCATOR,
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {"type": "string"},
                        **_PLAN_IDEM_KEY,
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_create_task",
                "description": (
                    "Create a task in a project (project_id or project_query). " + _PLAN_MUTATE_NOTE
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        **_PLAN_PROJECT_LOCATOR,
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {"type": "string"},
                        "priority": {"type": "string"},
                        "assignee_id": {"type": "string"},
                        "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "dependency_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of task IDs this task depends on",
                        },
                        **_PLAN_IDEM_KEY,
                    },
                    "required": ["title"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_update_task",
                "description": (
                    "Update a task by task_id or task_query (e.g. user says they finished/achieved work). "
                    + _PLAN_MUTATE_NOTE
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        **_PLAN_TASK_LOCATOR,
                        **_PLAN_PROJECT_LOCATOR,
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {
                            "type": "string",
                            "description": "todo | in-progress | completed | blocked; aliases: done, achieved",
                        },
                        "priority": {"type": "string"},
                        "assignee_id": {"type": "string"},
                        "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "dependency_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        **_PLAN_IDEM_KEY,
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_create_milestone",
                "description": (
                    "Create a milestone in a project (project_id or project_query). " + _PLAN_MUTATE_NOTE
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        **_PLAN_PROJECT_LOCATOR,
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {"type": "string"},
                        "target_date": {"type": "string", "description": "YYYY-MM-DD"},
                        **_PLAN_IDEM_KEY,
                    },
                    "required": ["title"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_update_milestone",
                "description": "Update a milestone by id or milestone_query. " + _PLAN_MUTATE_NOTE,
                "parameters": {
                    "type": "object",
                    "properties": {
                        **_PLAN_MILESTONE_LOCATOR,
                        **_PLAN_PROJECT_LOCATOR,
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {
                            "type": "string",
                            "description": "pending | reached | missed; aliases: done, achieved",
                        },
                        "target_date": {"type": "string", "description": "YYYY-MM-DD"},
                        **_PLAN_IDEM_KEY,
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_delete_task",
                "description": "Delete a task by task_id or task_query. " + _PLAN_MUTATE_NOTE,
                "parameters": {
                    "type": "object",
                    "properties": {**_PLAN_TASK_LOCATOR, **_PLAN_PROJECT_LOCATOR, **_PLAN_IDEM_KEY},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_delete_project",
                "description": "Delete a project by project_id or project_query. " + _PLAN_MUTATE_NOTE,
                "parameters": {
                    "type": "object",
                    "properties": {**_PLAN_PROJECT_LOCATOR, **_PLAN_IDEM_KEY},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_detect_conflicts",
                "description": (
                    "Detect scheduling conflicts for the team or one project (id or project_query). "
                    "Use for semantic requests about overlaps, blockers, timeline pressure, overloaded assignees, "
                    "deadline danger, schedule cleanup, or roadmap safety."
                ),
                "parameters": {
                    "type": "object",
                    "properties": dict(_PLAN_PROJECT_LOCATOR),
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_sync_wiki",
                "description": "Sync a project to its wiki page (project_id or project_query).",
                "parameters": {
                    "type": "object",
                    "properties": {**_PLAN_PROJECT_LOCATOR, **_PLAN_IDEM_KEY},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_risk_assessment",
                "description": (
                    "Assess timeline risk for a project (project_id or project_query). "
                    "Use for semantic requests like 'is this risky', 'make the roadmap safer', "
                    "'deadline danger', 'timeline feels impossible', 'pressure', or 'mitigation'."
                ),
                "parameters": {
                    "type": "object",
                    "properties": dict(_PLAN_PROJECT_LOCATOR),
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_resolve_conflicts",
                "description": (
                    "Apply AI schedule fixes for project conflicts (project_id or project_query). "
                    "Use only when the user asks to fix/resolve/clean up/reschedule/unblock timeline conflicts."
                ),
                "parameters": {
                    "type": "object",
                    "properties": dict(_PLAN_PROJECT_LOCATOR),
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_generate_risk_resolution",
                "description": (
                    "Generate concrete risk mitigation actions for a project without applying them. "
                    "Use for explanation/proposal requests about safer roadmap, mitigation, pressure, or risk cleanup."
                ),
                "parameters": {
                    "type": "object",
                    "properties": dict(_PLAN_PROJECT_LOCATOR),
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_apply_risk_resolution",
                "description": "Apply previously proposed risk mitigation actions to a project. Use only after user asks to apply/fix.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        **_PLAN_PROJECT_LOCATOR,
                        "actions": _PLAN_RISK_ACTION_SCHEMA,
                        **_PLAN_IDEM_KEY,
                    },
                    "required": ["actions"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_resolve_risk",
                "description": (
                    "One-shot project remediation: resolve active conflicts first, then apply risk mitigations, then reassess. "
                    "Use for action requests like 'clean it up', 'make this safer', 'reduce risk', 'remove blockers', "
                    "'fix timeline pressure', or 'resolve deadline danger'."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {**_PLAN_PROJECT_LOCATOR, **_PLAN_IDEM_KEY},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_check_overdue",
                "description": "Check for overdue tasks and missed milestones in the team's projects.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                },
            },
        },
    ]


def openai_agent_tool_schemas() -> list[dict[str, Any]]:
    """Advanced agent tools for graph traversal, memory, calendar, and deep wiki access."""
    return [
        {
            "type": "function",
            "function": {
                "name": "wiki_read_full_page",
                "description": "Read the complete content of a wiki page by slug or page_id. Use when you need full details, not just search snippets.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slug": {"type": "string"},
                        "page_id": {"type": "string"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "graph_traverse_neighbors",
                "description": "Traverse the knowledge graph from a page to find connected pages within N hops. Can filter by relation type.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "page_id": {"type": "string"},
                        "max_hops": {"type": "integer", "default": 2},
                        "relation_filter": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Filter by relation types: depends_on, contradicts, extends, implements, supersedes, parent_child, prerequisite, references, wikilink, semantic",
                        },
                        "include_content": {"type": "boolean", "default": False},
                    },
                    "required": ["page_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "graph_add_typed_relation",
                "description": "Add a typed semantic relation between two wiki pages with a reason.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "from_page_id": {"type": "string"},
                        "to_page_id": {"type": "string"},
                        "relation_type": {
                            "type": "string",
                            "enum": ["depends_on", "contradicts", "extends", "implements", "supersedes", "parent_child", "prerequisite", "references"],
                        },
                        "reason": {"type": "string", "description": "Brief explanation of why this relation exists"},
                    },
                    "required": ["from_page_id", "to_page_id", "relation_type", "reason"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "graph_explain_connection",
                "description": "Find and explain the shortest path between two wiki pages in the knowledge graph.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "page_a_id": {"type": "string", "description": "ID of the first page"},
                        "page_b_id": {"type": "string", "description": "ID of the second page"},
                    },
                    "required": ["page_a_id", "page_b_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "graph_find_contradictions",
                "description": "Find all contradiction edges in the team's knowledge graph, optionally for a specific page.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "page_id": {"type": "string", "description": "Optional: only contradictions involving this page"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "knowledge_gap_analysis",
                "description": "Identify knowledge gaps: wikilinks to non-existent pages, topics mentioned but not documented, shallow hub pages.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "calendar_detect_conflicts",
                "description": "Find overlapping tasks and milestone conflicts in the team's planning calendar.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string", "description": "Optional: scope to a specific project"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "calendar_check_overdue",
                "description": "Check for overdue tasks and missed milestones.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "agent_memory_read",
                "description": "Read from your persistent memory. Use to recall priorities, blockers, decisions, or context stored in previous conversations.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string", "description": "Memory key to read"},
                        "category": {"type": "string", "description": "Filter by category: priorities, blockers, gaps, decisions, contradictions, context"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "agent_memory_write",
                "description": "Store information in your persistent memory for future conversations. Use to remember priorities, decisions, or important context.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string"},
                        "value": {"type": "object"},
                        "category": {"type": "string", "enum": ["priorities", "blockers", "gaps", "decisions", "contradictions", "context"]},
                        "summary": {"type": "string", "description": "Human-readable summary"},
                    },
                    "required": ["key", "value", "summary"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "agent_memory_delete",
                "description": "Delete a stale or incorrect memory entry by key. Use when a stored fact is no longer true or relevant.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string", "description": "The memory key to delete"},
                    },
                    "required": ["key"],
                },
            },
        },
    ]


def _parse_args(arguments: str) -> dict[str, Any]:
    if not arguments or not str(arguments).strip():
        return {}
    try:
        return json.loads(arguments)
    except json.JSONDecodeError as e:
        raise ValueError(f"invalid_tool_arguments: {e}") from e


# ── Tool Registry (Phase 4.1: O(1) lookup replaces if/elif chain) ────
_TOOL_REGISTRY: dict[str, Any] = {}


def _register_tools():
    """Populate the tool registry on first use."""
    global _TOOL_REGISTRY
    if _TOOL_REGISTRY:
        return

    _TOOL_REGISTRY.update({
        # Research tools
        "web_search": _web_search,
        "web_read_page": _web_read_page,
        "research_save_to_wiki": _research_save_to_wiki,
        # Wiki tools
        "wiki_list_pages": _wiki_list_pages,
        "wiki_team_overview": _wiki_team_overview,
        "wiki_search_pages": _wiki_search_pages,
        "wiki_create_page": _wiki_create_page,
        "wiki_update_page": _wiki_update_page,
        "wiki_delete_page": _wiki_delete_page,
        "wiki_read_full_page": _wiki_read_full_page,
        # Graph tools
        "graph_add_edge": _graph_add_edge,
        "graph_remove_edge": _graph_remove_edge,
        "graph_add_typed_relation": _graph_add_typed_relation,
        "graph_traverse_neighbors": _graph_traverse_neighbors,
        "graph_find_contradictions": _graph_find_contradictions,
        "graph_explain_connection": _graph_explain_connection,
        "knowledge_gap_analysis": _knowledge_gap_analysis,
        # Calendar tools
        "calendar_detect_conflicts": _calendar_detect_conflicts,
        "calendar_check_overdue": _calendar_check_overdue,
        # Agent memory tools
        "agent_memory_read": _agent_memory_read,
        "agent_memory_write": _agent_memory_write,
        "agent_memory_delete": _agent_memory_delete,
        # Ingest tools
        "ingest_markdown": _ingest_markdown,
        # Planning tools
        "plan_generate_draft": _plan_generate_draft,
        "plan_list_projects": _plan_list_projects,
        "plan_search": _plan_search,
        "plan_read_entity": _plan_read_entity,
        "plan_create_project": _plan_create_project,
        "plan_update_project": _plan_update_project,
        "plan_create_task": _plan_create_task,
        "plan_update_task": _plan_update_task,
        "plan_create_milestone": _plan_create_milestone,
        "plan_update_milestone": _plan_update_milestone,
        "plan_delete_task": _plan_delete_task,
        "plan_delete_project": _plan_delete_project,
        "plan_detect_conflicts": _plan_detect_conflicts,
        "plan_sync_wiki": _plan_sync_wiki,
        "plan_risk_assessment": _plan_risk_assessment,
        "plan_resolve_conflicts": _plan_resolve_conflicts,
        "plan_generate_risk_resolution": _plan_generate_risk_resolution,
        "plan_apply_risk_resolution": _plan_apply_risk_resolution,
        "plan_resolve_risk": _plan_resolve_risk,
        "plan_check_overdue": _plan_check_overdue,
        "plan_decompose_task_daily": _plan_decompose_task_daily,
    })


def execute_tool(name: str, arguments: str, ctx: ToolContext) -> dict[str, Any]:
    """
    Run a single tool. Returns a JSON-serializable dict for the model (and tracing):
    {"ok": bool, "error"?: str, ...payload }

    Uses O(1) registry lookup instead of if/elif chain (Phase 4.1).
    Routes mcp_* prefixed tools to external MCP servers (Phase 2).
    """
    # Route ext_* prefixed tools to external integration platform
    if name.startswith("ext_"):
        # Guardian tier-1 pre-check for external writes
        try:
            from planning.guardian.context import GuardianContext
            from planning.guardian.tier1 import tier1_check
            from accounts.models import Team
            team_obj = Team.objects.filter(id=ctx.team_id).first()
            external_writes = getattr(team_obj, "external_writes_enabled", False) if team_obj else False
            g_ctx = GuardianContext(
                acting_team_id=str(ctx.team_id),
                session_id=str(ctx.session_id or ""),
                token_usage_this_run=0,
                team_token_budget=999999,
                team_has_integrations=True,
                external_writes_enabled=external_writes,
                human_approved_destructive=False,
                current_round=0,
            )
            g_result = tier1_check(name, {}, g_ctx)
            if not g_result.approved:
                human_name = (
                    name.replace("ext_", "")
                    .replace("_", " ")
                    .title()
                )
                return {
                    "ok": False,
                    "guardian_blocked": True,
                    "tier": g_result.tier,
                    "action": name,
                    "human_action": human_name,
                    "reason": g_result.reason or "This action is blocked by team policy.",
                    "tier_label": (
                        "Tier 1: Rule-based block — a policy rule prevents this action."
                        if g_result.tier == 1
                        else "Tier 2: LLM-reviewed — this action was judged outside the scope of your request."
                    ),
                    "settings_path": "Integrations → External Writes" if "write" in name or "send" in name else None,
                    "error": f"Guardian blocked: {name} — {g_result.reason}",
                }
        except Exception:
            pass  # Non-blocking — if guardian check fails, proceed normally

        try:
            from integrations.tool_executor import execute_external_tool
            args = _parse_args(arguments)
            result = execute_external_tool(str(ctx.user.id), name, args)
            if result is not None:
                return result
        except Exception as e:
            logger.exception("External tool execution failed for %s", name)
            return {"ok": False, "error": f"External tool error: {e}", "tool": name}

    # Phase 2: Route MCP tool calls to external servers (using upgraded Executor)
    if name.startswith("mcp_"):
        try:
            from chat.mcp.executor import MCPToolExecutor
            session_id = str(ctx.session_id) if ctx.session_id else ""
            executor = MCPToolExecutor(team_id=str(ctx.team_id), session_id=session_id)
            args = _parse_args(arguments)
            idem_key = args.get("idempotency_key")
            result = executor.execute(name, args, idempotency_key=idem_key)
            if result is not None:
                return result
        except Exception as e:
            logger.exception("MCP tool routing failed for %s", name)
            return {"ok": False, "error": f"MCP routing error: {e}", "tool": name}

    # Phase 4.1: Registry-based dispatch
    _register_tools()
    handler = _TOOL_REGISTRY.get(name)
    if handler is None:
        return {"ok": False, "error": f"unknown_tool:{name}"}

    args = _parse_args(arguments)
    try:
        return handler(ctx, args)
    except Exception as e:
        logger.exception("Tool %s failed", name)
        return {"ok": False, "error": str(e), "tool": name}


def execute_plan_tool(name: str, arguments: str, ctx: ToolContext) -> dict[str, Any]:
    """Legacy plan tool dispatcher — now delegates to the unified registry."""
    return execute_tool(name, arguments, ctx)


def _wiki_list_pages(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    limit = min(int(args.get("limit") or 50), 150)
    page_type = (args.get("page_type") or "").strip()
    qs = WikiPage.objects.filter(team_id=ctx.team_id, is_deleted=False).order_by("-updated_at")
    if page_type:
        qs = qs.filter(page_type=page_type)
    total = qs.count()
    rows = []
    for p in qs[:limit]:
        fm = p.frontmatter if isinstance(p.frontmatter, dict) else {}
        rows.append({
            "id": str(p.id),
            "title": p.title,
            "slug": p.slug,
            "page_type": p.page_type,
            "summary": fm.get("ingest_summary") or p.summary,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })
    return {"ok": True, "pages": rows, "count": len(rows), "total": total}


def _wiki_team_overview(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.wiki_context import build_team_wiki_overview

    overview = build_team_wiki_overview(ctx.team_id)
    total = WikiPage.objects.filter(team_id=ctx.team_id, is_deleted=False).count()
    return {"ok": True, "overview": overview, "page_count": total}


def _wiki_search_pages(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.wiki_search import search_wiki_pages

    q = (args.get("query") or "").strip()
    if not q:
        return {"ok": False, "error": "query_required"}
    limit = min(int(args.get("limit") or 15), 30)
    mode = (args.get("mode") or "hybrid").strip().lower()
    expand = bool(args.get("expand_queries"))
    team = ctx.membership.team if expand else None
    rows = search_wiki_pages(
        ctx.team_id,
        q,
        limit=limit,
        mode=mode,
        expand_queries=expand,
        team=team,
    )
    return {"ok": True, "pages": rows, "count": len(rows), "mode": mode}


def _wiki_create_page(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    team = ctx.membership.team
    idem = (args.get("idempotency_key") or "").strip()
    if idem:
        cache_key = f"{CHAT_TOOL_CACHE_PREFIX}{ctx.team_id}:wiki_create:{idem}"
        if not cache.add(cache_key, "1", timeout=300):
            return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no new page created."}

    quota = check_quota(team, "wiki_page_create")
    if not quota.allowed:
        return {"ok": False, "error": "plan_limit_exceeded", "details": quota.to_details()}

    payload = {
        "title": args.get("title"),
        "content": args.get("content") or "",
        "page_type": args.get("page_type") or "standard",
        "frontmatter": args.get("frontmatter") if isinstance(args.get("frontmatter"), dict) else {},
        "source_url": args.get("source_url") or "",
    }
    ser = WikiPageCreateSerializer(data=payload)
    if not ser.is_valid():
        return {"ok": False, "error": "validation_error", "details": ser.errors}

    slug = unique_slug(team, ser.validated_data["title"])
    page = WikiPage.objects.create(
        team=team,
        slug=slug,
        created_by=ctx.user,
        **ser.validated_data,
    )
    try:
        from wiki.services.reindex import reindex_wiki_page

        reindex_wiki_page(page, queue_graph=True)
    except Exception as e:
        logger.exception("reindex after wiki_create_page")
        return {"ok": False, "error": f"reindex_failed:{e}", "page_id": str(page.id), "slug": page.slug}

    return {
        "ok": True,
        "page_id": str(page.id),
        "slug": page.slug,
        "title": page.title,
    }


def _wiki_update_page(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.wiki_search import resolve_wiki_page

    slug = (args.get("slug") or "").strip()
    page_id = (args.get("page_id") or "").strip()
    resolve_q = (args.get("query") or "").strip()
    previous_slug = None
    resolve_candidates: list[dict[str, Any]] = []

    try:
        if page_id:
            page = WikiPage.objects.get(id=page_id, team_id=ctx.team_id, is_deleted=False)
        elif slug:
            page = WikiPage.objects.get(team_id=ctx.team_id, slug=slug, is_deleted=False)
        elif resolve_q:
            page, resolve_candidates, resolve_err = resolve_wiki_page(
                ctx.team_id,
                resolve_q,
                team=ctx.membership.team,
            )
            if resolve_err:
                out: dict[str, Any] = {"ok": False, "error": resolve_err}
                if resolve_candidates:
                    out["candidates"] = resolve_candidates
                return out
        else:
            return {"ok": False, "error": "slug_page_id_or_query_required"}
    except WikiPage.DoesNotExist:
        return {"ok": False, "error": "wiki_page_not_found"}

    expected = (args.get("expected_updated_at") or "").strip()
    if expected and page.updated_at:
        from django.utils import timezone
        from django.utils.dateparse import parse_datetime

        expected_dt = parse_datetime(expected.replace("Z", "+00:00"))
        if expected_dt:
            if timezone.is_naive(expected_dt):
                expected_dt = timezone.make_aware(expected_dt)
            current = page.updated_at
            if timezone.is_naive(current):
                current = timezone.make_aware(current)
            if current > expected_dt:
                return {
                    "ok": False,
                    "error": "wiki_version_conflict",
                    "expected_updated_at": expected,
                    "current_updated_at": page.updated_at.isoformat(),
                    "page_id": str(page.id),
                    "slug": page.slug,
                }

    if "title" in args and args["title"] is not None:
        new_title = str(args["title"]).strip()
        if new_title and new_title != page.title:
            previous_slug = page.slug
            page.title = new_title
            page.slug = unique_slug(page.team, new_title, exclude_id=page.id)
    if "content" in args and args["content"] is not None:
        new_content = str(args["content"])
        mode = (args.get("content_mode") or "replace").strip().lower()
        if mode == "append":
            base = (page.content or "").rstrip()
            page.content = f"{base}\n\n{new_content}" if base else new_content
        elif mode == "prepend":
            base = (page.content or "").lstrip()
            page.content = f"{new_content}\n\n{base}" if base else new_content
        else:
            page.content = new_content
    if "page_type" in args and args["page_type"]:
        page.page_type = str(args["page_type"])
    if "frontmatter" in args and isinstance(args["frontmatter"], dict):
        page.frontmatter = args["frontmatter"]
    page.save()

    chunks_reindexed = 0
    reindex_ok = True
    try:
        from wiki.services.reindex import reindex_wiki_page

        chunks_reindexed = reindex_wiki_page(page, queue_graph=True)
    except Exception as e:
        logger.exception("reindex after wiki_update_page")
        reindex_ok = False
        return {
            "ok": False,
            "error": f"reindex_failed:{e}",
            "page_id": str(page.id),
            "slug": page.slug,
            "title": page.title,
            "saved": True,
            "reindex_ok": False,
        }

    result: dict[str, Any] = {
        "ok": True,
        "page_id": str(page.id),
        "slug": page.slug,
        "title": page.title,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
        "reindex_ok": reindex_ok,
        "chunks_reindexed": chunks_reindexed,
    }
    if previous_slug:
        result["previous_slug"] = previous_slug
    if resolve_candidates:
        result["resolved_from_query"] = True
    return result


def _wiki_delete_page(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Mark a wiki page as deleted (soft delete)."""
    slug = (args.get("slug") or "").strip()
    page_id = (args.get("page_id") or "").strip()
    try:
        if page_id:
            page = WikiPage.objects.get(id=page_id, team_id=ctx.team_id, is_deleted=False)
        elif slug:
            page = WikiPage.objects.get(team_id=ctx.team_id, slug=slug, is_deleted=False)
        else:
            return {"ok": False, "error": "slug_or_page_id_required"}

        page.is_deleted = True
        page.save()
        return {"ok": True, "page_id": str(page.id), "slug": page.slug, "title": page.title}
    except WikiPage.DoesNotExist:
        return {"ok": False, "error": "wiki_page_not_found"}


ALLOWED_EDGE_TYPES = frozenset(
    {"wikilink", "ai_inferred", "manual", "citation", "semantic"},
)


def _graph_add_edge(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from_id = args.get("from_page_id")
    to_id = args.get("to_page_id")
    edge_type = (args.get("edge_type") or "manual").strip()
    if edge_type not in ALLOWED_EDGE_TYPES:
        edge_type = "manual"
    try:
        fp = WikiPage.objects.get(id=from_id, team_id=ctx.team_id, is_deleted=False)
        tp = WikiPage.objects.get(id=to_id, team_id=ctx.team_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return {"ok": False, "error": "graph_edge_page_not_found"}

    edge, created = GraphEdge.objects.get_or_create(
        from_page=fp,
        to_page=tp,
        edge_type=edge_type,
        defaults={"confidence": 1.0, "created_by": "user"},
    )
    invalidate_team_graph_analytics_cache(ctx.team_id)
    return {"ok": True, "edge_id": str(edge.id), "created": created}


def _graph_remove_edge(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from_id = args.get("from_page_id")
    to_id = args.get("to_page_id")
    edge_type = args.get("edge_type")

    edges = GraphEdge.objects.filter(
        from_page__id=from_id,
        to_page__id=to_id,
        from_page__team_id=ctx.team_id
    )
    if edge_type:
        edges = edges.filter(edge_type=edge_type)
        
    deleted, _ = edges.delete()
    if deleted > 0:
        invalidate_team_graph_analytics_cache(ctx.team_id)
        
    return {"ok": True, "deleted_count": deleted}


def _research_default_quota_for_team(team) -> int:
    plan = getattr(getattr(team, "subscription", None), "plan_key", None) or getattr(team, "plan", "free")
    quotas = getattr(settings, "RESEARCH_MONTHLY_QUOTAS", {})
    try:
        return int(quotas.get(plan, quotas.get("free", 0)) or 0)
    except (TypeError, ValueError):
        return 0


def _research_state(team) -> dict[str, Any]:
    from research.models import TeamResearchQuota

    quota = TeamResearchQuota.objects.filter(team=team).first()
    if quota is None:
        limit = _research_default_quota_for_team(team)
        return {"limit": limit, "current": 0, "remaining": max(0, limit), "reason": None}

    state = quota.to_state()
    return {
        "limit": state.limit,
        "current": state.current,
        "remaining": state.remaining,
        "reason": state.reason,
    }


def _research_blocked_url(url: str) -> str | None:
    parsed = urlparse(url or "")
    host = (parsed.hostname or "").lower()
    raw = (url or "").lower()
    blocklist = getattr(settings, "RESEARCH_DOMAIN_BLOCKLIST", [])
    for entry in blocklist:
        needle = (entry or "").strip().lower()
        if not needle:
            continue
        if needle in raw:
            return needle
        if host == needle or host.endswith(f".{needle}"):
            return needle
    return None


def _research_log(
    *,
    team,
    user,
    action: str,
    raw_query: str = "",
    optimized_search_query: str = "",
    urls_accessed: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        from research.models import ResearchLog

        ResearchLog.objects.create(
            team=team,
            initiated_by=user,
            action=action,
            raw_query=(raw_query or "")[:5000],
            optimized_search_query=(optimized_search_query or "")[:512],
            urls_accessed=list(urls_accessed or []),
            metadata=metadata or {},
        )
    except Exception:
        logger.exception("Failed to record research log")


def _research_provider_call(path: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    api_key = getattr(settings, "TAVILY_API_KEY", "").strip()
    if not api_key:
        return {"ok": False, "error": "research_unconfigured"}

    body = {**payload, "api_key": api_key}
    resp = requests.post(f"https://api.tavily.com/{path.lstrip('/')}", json=body, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        return {"ok": False, "error": "invalid_provider_response"}
    return data


def _research_filter_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    max_chars = int(getattr(settings, "RESEARCH_MAX_CONTENT_CHARS", 60000) or 60000)
    filtered: list[dict[str, Any]] = []
    for item in results or []:
        if not isinstance(item, dict):
            continue
        url = (item.get("url") or item.get("source") or "").strip()
        if not url:
            continue
        if _research_blocked_url(url):
            continue
        content = (item.get("content") or item.get("raw_content") or item.get("text") or "").strip()
        if len(content) > max_chars:
            content = content[:max_chars]
        filtered.append(
            {
                "title": (item.get("title") or item.get("name") or url).strip(),
                "url": url,
                "score": float(item.get("score") or item.get("relevance_score") or 0.0),
                "content": content,
            }
        )
    filtered.sort(key=lambda r: r["score"], reverse=True)
    return filtered


def _research_url_payload(url: str, title: str, content: str, score: float | None = None) -> dict[str, Any]:
    return {
        "source": "web",
        "title": title or url,
        "url": url,
        "snippet": content[:280] if content else "",
        "confidence": score,
    }


def _web_search(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    team = ctx.membership.team
    query = (args.get("query") or "").strip()
    if not query:
        return {"ok": False, "error": "query_required"}

    quota = check_quota(team, "research_search")
    if not quota.allowed:
        return {"ok": False, "error": "plan_limit_exceeded", "details": quota.to_details()}

    ok, quota_row, state = (False, None, None)
    try:
        from research.models import TeamResearchQuota

        ok, quota_row, state = TeamResearchQuota.consume_search(team)
        if not ok:
            return {"ok": False, "error": "plan_limit_exceeded", "details": {
                "limit": state.limit,
                "current": state.current,
                "remaining": state.remaining,
                "reason": "research_limit_reached",
            }}
    except Exception as exc:
        logger.exception("Failed to consume research quota")
        return {"ok": False, "error": str(exc)}

    try:
        raw = _research_provider_call(
            "search",
            {
                "query": query,
                "max_results": min(max(int(args.get("max_results") or 5), 1), 10),
                "include_raw_content": True,
                "search_depth": "advanced",
            },
            timeout=20.0,
        )
    except requests.RequestException as exc:
        logger.exception("Tavily web_search failed")
        return {"ok": False, "error": f"provider_error:{exc}", "query": query}
    except Exception as exc:
        logger.exception("Unexpected web_search failure")
        return {"ok": False, "error": str(exc), "query": query}

    results = _research_filter_results(raw.get("results") or [])
    urls = [row["url"] for row in results]
    _research_log(
        team=team,
        user=ctx.user,
        action="search",
        raw_query=query,
        optimized_search_query=query[:512],
        urls_accessed=urls,
        metadata={
            "result_count": len(results),
            "quota_current": state.current if state else None,
            "quota_remaining": state.remaining if state else None,
        },
    )
    return {
        "ok": True,
        "query": query,
        "results": results,
        "count": len(results),
        "quota": {
            "limit": state.limit if state else quota_row.effective_limit() if quota_row else quota.limit,
            "current": state.current if state else quota.current,
            "remaining": state.remaining if state else max(0, quota.limit - quota.current),
        },
    }


def _web_read_page(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    url = (args.get("url") or "").strip()
    if not url:
        return {"ok": False, "error": "url_required"}

    blocked = _research_blocked_url(url)
    if blocked:
        return {"ok": False, "error": "blocked_domain", "blocked": blocked, "url": url}

    try:
        raw = _research_provider_call(
            "extract",
            {
                "urls": [url],
                "include_raw_content": True,
            },
            timeout=25.0,
        )
    except requests.RequestException as exc:
        logger.exception("Tavily web_read_page failed")
        return {"ok": False, "error": f"provider_error:{exc}", "url": url}
    except Exception as exc:
        logger.exception("Unexpected web_read_page failure")
        return {"ok": False, "error": str(exc), "url": url}

    items = raw.get("results") or raw.get("data") or raw.get("pages") or []
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        items = []

    max_chars = int(getattr(settings, "RESEARCH_MAX_CONTENT_CHARS", 60000) or 60000)
    extracted = ""
    title = url
    for item in items:
        if not isinstance(item, dict):
            continue
        candidate_url = (item.get("url") or item.get("source") or url).strip()
        if _research_blocked_url(candidate_url):
            continue
        content = (item.get("content") or item.get("raw_content") or item.get("text") or "").strip()
        if content:
            extracted = content[:max_chars]
            title = (item.get("title") or item.get("name") or title).strip()
            break

    if not extracted:
        extracted = str(raw.get("content") or raw.get("raw_content") or "").strip()[:max_chars]

    _research_log(
        team=ctx.membership.team,
        user=ctx.user,
        action="read",
        raw_query=url,
        optimized_search_query=url[:512],
        urls_accessed=[url],
        metadata={"content_chars": len(extracted)},
    )

    return {
        "ok": True,
        "url": url,
        "title": title,
        "content": extracted,
        "content_chars": len(extracted),
        "snippet": extracted[:280],
    }


def _research_save_to_wiki(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    team = ctx.membership.team
    markdown = (args.get("markdown") or "").strip()
    if not markdown:
        return {"ok": False, "error": "markdown_required"}

    title = (args.get("title") or "").strip()
    source_urls = [str(url).strip() for url in (args.get("source_urls") or []) if str(url).strip()]
    auto_approve = bool(args.get("auto_approve", True))

    if title and not markdown.lstrip().startswith("#"):
        markdown = f"# {title}\n\n{markdown}"

    quota = check_quota(team, "ingest_job_create")
    if not quota.allowed:
        return {"ok": False, "error": "plan_limit_exceeded", "details": quota.to_details()}

    from ingest.models import IngestJob
    from ingest.tasks import run_ingest_job

    job = IngestJob.objects.create(
        team=team,
        created_by=ctx.user,
        source_type="markdown",
        source_filename=(title or "research-findings").strip()[:120] + ".md",
        status="pending",
        ingest_stage="queued",
        ingest_stage_detail="Queued from research mode",
        auto_approve=auto_approve,
        source_metadata={
            "research_mode": True,
            "research_title": title,
            "research_source_urls": source_urls,
            "research_saved_by": str(ctx.user.id) if ctx.user else None,
        },
        raw_data=markdown,
    )
    try:
        run_ingest_job.delay(str(job.id), markdown, trace_id=None)
    except Exception as exc:
        logger.exception("Queue research ingest from chat agent")
        return {"ok": False, "error": str(exc), "job_id": str(job.id)}

    _research_log(
        team=team,
        user=ctx.user,
        action="save",
        raw_query=title or markdown[:512],
        optimized_search_query=title[:512] if title else markdown[:512],
        urls_accessed=source_urls,
        metadata={"job_id": str(job.id), "auto_approve": auto_approve},
    )

    return {
        "ok": True,
        "job_id": str(job.id),
        "status": "queued",
        "title": title or "Research findings",
        "source_urls": source_urls,
    }


def _ingest_markdown(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    text = (args.get("markdown") or "").strip()
    if not text:
        return {"ok": False, "error": "markdown_required"}

    team = ctx.membership.team
    quota = check_quota(team, "ingest_job_create")
    if not quota.allowed:
        return {"ok": False, "error": "plan_limit_exceeded", "details": quota.to_details()}

    from ingest.models import IngestJob
    from ingest.tasks import run_ingest_job

    job = IngestJob.objects.create(
        team=team,
        created_by=ctx.user,
        source_type="markdown",
        source_filename="chat-agent.md",
        status="pending",
        ingest_stage="queued",
        ingest_stage_detail="Queued from chat agent",
        auto_approve=bool(args.get("auto_approve", True)),
    )
    try:
        run_ingest_job.delay(str(job.id), text, trace_id=None)
    except Exception as e:
        logger.exception("Queue ingest from chat agent")
        return {"ok": False, "error": str(e), "job_id": str(job.id)}

    return {"ok": True, "job_id": str(job.id), "status": "queued"}


def _plan_list_projects(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    query = (args.get("query") or "").strip()
    limit = min(int(args.get("limit") or 20), 50)
    projects = Project.objects.filter(team_id=ctx.team_id).order_by("-updated_at")
    if query:
        projects = projects.filter(Q(name__icontains=query) | Q(description__icontains=query))
    rows = [
        {"id": str(p.id), "name": p.name, "description": p.description, "status": p.status}
        for p in projects[:limit]
    ]
    return {"ok": True, "projects": rows, "count": len(rows)}


def _plan_search(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_search import search_planning

    q = (args.get("query") or "").strip()
    if not q:
        return {"ok": False, "error": "query_required"}
    limit = min(int(args.get("limit") or 20), 40)
    mode = (args.get("mode") or "hybrid").strip().lower()
    expand = bool(args.get("expand_queries"))
    kinds = args.get("source_kinds")
    if kinds is not None and not isinstance(kinds, list):
        kinds = None

    results = search_planning(
        ctx.team_id,
        q,
        limit=limit,
        mode=mode,
        expand_queries=expand,
        team=ctx.membership.team if expand else None,
        source_kinds=kinds,
        project_id=(args.get("project_id") or "").strip() or None,
        assignee_id=(args.get("assignee_id") or "").strip() or None,
        date_from=(args.get("date_from") or "").strip() or None,
        date_to=(args.get("date_to") or "").strip() or None,
        status=(args.get("status") or "").strip() or None,
    )
    return {"ok": True, "results": results, "count": len(results), "mode": mode}


def _plan_read_entity(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.services import get_project_or_none

    kind = (args.get("source_kind") or "").strip().lower()
    project_id = (args.get("project_id") or "").strip()
    ref_id = (args.get("source_ref_id") or "").strip()

    if kind not in ("project", "task", "milestone"):
        return {"ok": False, "error": "invalid_source_kind"}
    if not project_id:
        return {"ok": False, "error": "project_id_required"}

    project = get_project_or_none(ctx.team_id, project_id)
    if not project:
        return {"ok": False, "error": "project_not_found"}

    if kind == "project":
        members = [
            {
                "user_id": str(m.user_id),
                "email": m.user.email,
                "role": m.role,
            }
            for m in project.members.select_related("user").all()
        ]
        tasks = [
            {
                "id": str(t.id),
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "assignee_email": t.assignee.email if t.assignee else None,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "end_date": t.end_date.isoformat() if t.end_date else None,
                "description": t.description,
            }
            for t in project.tasks.select_related("assignee").order_by("order_index", "created_at")
        ]
        milestones = [
            {
                "id": str(m.id),
                "title": m.title,
                "status": m.status,
                "target_date": m.target_date.isoformat() if m.target_date else None,
                "description": m.description,
            }
            for m in project.milestones.order_by("order_index", "target_date", "created_at")
        ]
        return {
            "ok": True,
            "source_kind": "project",
            "project": {
                "id": str(project.id),
                "name": project.name,
                "description": project.description,
                "status": project.status,
                "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            },
            "members": members,
            "tasks": tasks,
            "milestones": milestones,
        }

    if not ref_id:
        return {"ok": False, "error": "source_ref_id_required"}

    if kind == "task":
        try:
            task = Task.objects.select_related("assignee", "project").get(
                id=ref_id, project_id=project_id, project__team_id=ctx.team_id
            )
        except Task.DoesNotExist:
            return {"ok": False, "error": "task_not_found"}
        dep_ids = [str(d.id) for d in task.dependencies.all()]
        subtasks = [
            {"id": str(s.id), "title": s.title, "status": s.status}
            for s in task.subtasks.all().order_by("order_index")
        ]
        return {
            "ok": True,
            "source_kind": "task",
            "task": {
                "id": str(task.id),
                "project_id": str(task.project_id),
                "project_name": task.project.name,
                "title": task.title,
                "description": task.description,
                "status": task.status,
                "priority": task.priority,
                "assignee_id": str(task.assignee_id) if task.assignee_id else None,
                "assignee_email": task.assignee.email if task.assignee else None,
                "start_date": task.start_date.isoformat() if task.start_date else None,
                "end_date": task.end_date.isoformat() if task.end_date else None,
                "dependency_ids": dep_ids,
                "subtasks": subtasks,
                "updated_at": task.updated_at.isoformat() if task.updated_at else None,
            },
        }

    try:
        milestone = Milestone.objects.select_related("project").get(
            id=ref_id, project_id=project_id, project__team_id=ctx.team_id
        )
    except Milestone.DoesNotExist:
        return {"ok": False, "error": "milestone_not_found"}
    return {
        "ok": True,
        "source_kind": "milestone",
        "milestone": {
            "id": str(milestone.id),
            "project_id": str(milestone.project_id),
            "project_name": milestone.project.name,
            "title": milestone.title,
            "description": milestone.description,
            "status": milestone.status,
            "target_date": milestone.target_date.isoformat() if milestone.target_date else None,
            "updated_at": milestone.updated_at.isoformat() if milestone.updated_at else None,
        },
    }


def _plan_create_project(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.services import create_project as srv_create_project

    if _check_tool_idempotency(ctx.team_id, "plan_create_project", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no new project created."}

    name = (args.get("name") or "").strip()
    if not name:
        return {"ok": False, "error": "name_required"}
    
    project = srv_create_project(
        team_id=ctx.team_id,
        user=ctx.user,
        payload={
            "name": name,
            "description": (args.get("description") or "").strip(),
            "status": args.get("status") or "active",
        }
    )
    reindex_project(project)
    return {"ok": True, "project_id": str(project.id), "name": project.name, "status": project.status}


def _plan_update_project(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_project
    from planning.services import update_project as srv_update_project

    if _check_tool_idempotency(ctx.team_id, "plan_update_project", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no update applied."}

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp

    payload = {}
    if "name" in args:
        payload["name"] = args["name"]
    if "description" in args:
        payload["description"] = args["description"]
    if "status" in args:
        payload["status"] = args["status"]

    updated = srv_update_project(project, payload)
    reindex_project(updated)
    return {
        "ok": True,
        "project_id": str(updated.id),
        "name": updated.name,
        "status": updated.status,
        "resolved_from_query": bool((args.get("project_query") or "").strip()),
    }


def _resolve_assignee(team_id: str, assignee_id: Any) -> User | None:
    if not assignee_id:
        return None
    try:
        membership = TeamMember.objects.select_related("user").get(team_id=team_id, user_id=assignee_id)
    except TeamMember.DoesNotExist:
        return None
    return membership.user


def _plan_create_task(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import normalize_task_status, require_project
    from planning.services import create_task as srv_create_task

    if _check_tool_idempotency(ctx.team_id, "plan_create_task", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no new task created."}

    title = (args.get("title") or "").strip()
    if not title:
        return {"ok": False, "error": "title_required"}

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp

    assignee = _resolve_assignee(ctx.team_id, args.get("assignee_id"))
    if not assignee:
        assignee = ctx.user

    status = normalize_task_status(args.get("status")) or "todo"
    payload = {
        "title": title,
        "description": (args.get("description") or "").strip(),
        "status": status,
        "priority": args.get("priority") or "medium",
        "assignee": assignee,
        "start_date": args.get("start_date") or None,
        "end_date": args.get("end_date") or None,
        "dependency_ids": args.get("dependency_ids") or [],
    }

    task = srv_create_task(project=project, user=ctx.user, payload=payload)
    reindex_project(project)
    return {
        "ok": True,
        "task_id": str(task.id),
        "project_id": str(project.id),
        "title": task.title,
        "resolved_from_query": bool((args.get("project_query") or "").strip()),
    }


def _plan_update_task(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import apply_task_payload, require_task
    from planning.services import update_task as srv_update_task

    if _check_tool_idempotency(ctx.team_id, "plan_update_task", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no update applied."}

    task, err_resp = require_task(ctx, args)
    if err_resp:
        return err_resp

    payload: dict[str, Any] = {}
    apply_task_payload(args, payload)

    if "assignee_id" in args:
        assignee = _resolve_assignee(ctx.team_id, args["assignee_id"])
        if not assignee:
            assignee = ctx.user
        payload["assignee"] = assignee

    updated = srv_update_task(task, payload)
    reindex_project(updated.project)
    return {
        "ok": True,
        "task_id": str(updated.id),
        "project_id": str(updated.project_id),
        "title": updated.title,
        "status": updated.status,
        "resolved_from_query": bool((args.get("task_query") or "").strip()),
    }


def _plan_create_milestone(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import normalize_milestone_status, require_project
    from planning.services import create_milestone as srv_create_milestone

    if _check_tool_idempotency(ctx.team_id, "plan_create_milestone", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no new milestone created."}

    title = (args.get("title") or "").strip()
    if not title:
        return {"ok": False, "error": "title_required"}

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp

    status = normalize_milestone_status(args.get("status")) or "pending"
    milestone = srv_create_milestone(
        project=project,
        user=ctx.user,
        payload={
            "title": title,
            "description": (args.get("description") or "").strip(),
            "status": status,
            "target_date": args.get("target_date") or None,
        },
    )
    reindex_project(project)
    return {
        "ok": True,
        "milestone_id": str(milestone.id),
        "project_id": str(project.id),
        "title": milestone.title,
        "resolved_from_query": bool((args.get("project_query") or "").strip()),
    }


def _plan_update_milestone(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import apply_milestone_payload, require_milestone
    from planning.services import update_milestone as srv_update_milestone

    if _check_tool_idempotency(ctx.team_id, "plan_update_milestone", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no update applied."}

    milestone, err_resp = require_milestone(ctx, args)
    if err_resp:
        return err_resp

    payload: dict[str, Any] = {}
    apply_milestone_payload(args, payload)

    updated = srv_update_milestone(milestone, payload)
    reindex_project(updated.project)
    return {
        "ok": True,
        "milestone_id": str(updated.id),
        "project_id": str(updated.project_id),
        "title": updated.title,
        "status": updated.status,
        "resolved_from_query": bool((args.get("milestone_query") or "").strip()),
    }


def _plan_delete_task(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_task
    from planning.services import delete_task as srv_delete_task

    if _check_tool_idempotency(ctx.team_id, "plan_delete_task", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no delete applied."}

    task, err_resp = require_task(ctx, args)
    if err_resp:
        return err_resp
    project = task.project
    task_id = str(task.id)
    srv_delete_task(task)
    reindex_project(project)
    return {
        "ok": True,
        "task_id": task_id,
        "resolved_from_query": bool((args.get("task_query") or "").strip()),
    }


def _plan_decompose_task_daily(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.day_decomposer import decompose_task_daily
    from planning.serializers import TaskSerializer

    if _check_tool_idempotency(ctx.team_id, "plan_decompose_task_daily", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no new decomposition."}

    project_id = args.get("project_id")
    task_id = args.get("task_id")

    if not project_id or not task_id:
        return {"ok": False, "error": "project_id and task_id are required."}

    try:
        subtasks = decompose_task_daily(
            team_id=ctx.team_id,
            project_id=project_id,
            task_id=task_id,
            user=ctx.user
        )
        return {
            "ok": True,
            "subtasks": TaskSerializer(subtasks, many=True).data,
            "count": len(subtasks)
        }
    except Exception as e:
        logger.exception("plan_decompose_task_daily tool failed")
        return {"ok": False, "error": str(e)}


def _plan_delete_project(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_project
    from planning.services import delete_project as srv_delete_project

    if _check_tool_idempotency(ctx.team_id, "plan_delete_project", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; no delete applied."}

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp
    project_id = str(project.id)
    srv_delete_project(project)
    return {
        "ok": True,
        "project_id": project_id,
        "resolved_from_query": bool((args.get("project_query") or "").strip()),
    }


def _plan_generate_draft(ctx: ToolContext, args: dict) -> dict:
    """
    Generate and ATOMICALLY create/update a complete project plan from a mission prompt.

    Uses the unified PlanningEngine:
      1. Research      — searches wiki (multi-query expansion + HyDE + hybrid + graph)
      2. Synthesize    — LLM derives domain context from wiki results + prompt
      3. Decompose     — domain-specific sub-goals
      4. Draft         — wiki-grounded, domain-expert plan
      5. Critique      — domain-aware self-evaluation
      6. Finalize      — dependency inference + scheduling
      7. DB Mutation   — atomic project, task, milestone creation/updates
      8. Validation    — conflicts, risk assessment, wiki sync

    Returns the created project details. No more N+1 tool calls.
    """
    if _check_tool_idempotency(ctx.team_id, "plan_generate_draft", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; draft generation skipped."}

    from chat.plan_resolve import require_project
    from planning.engine import PlanningEngine
    from planning.services import get_plan_mutation_context
    from accounts.models import Team
    import json as _json

    prompt = (args.get("prompt") or "").strip()
    if not prompt:
        return {"ok": False, "error": "prompt_required"}

    mode = (args.get("mode") or "create").strip().lower()

    project_context = None
    project_id = (args.get("project_id") or "").strip() or None

    if mode == "manage" or project_id or (args.get("project_query") or "").strip():
        project, err_resp = require_project(ctx, args)
        if err_resp:
            return err_resp
        project_context = get_plan_mutation_context(project)
        project_id = str(project.id)
        mode = "manage"

    try:
        team = Team.objects.get(id=ctx.team_id)
        engine = PlanningEngine(team=team, user=ctx.user)

        final_result = None
        for event in engine.run(prompt, mode=mode, project_id=project_id, project_context=project_context):
            # Capture the final agent_done payload
            if event.startswith("event: agent_done"):
                try:
                    data_line = event.split("data: ", 1)[1].strip()
                    final_result = _json.loads(data_line)
                except Exception:
                    pass

        if not final_result:
            return {"ok": False, "error": "Planning engine did not produce a complete plan."}

        return {
            "ok": True,
            "project_id": final_result.get("project_id"),
            "project_name": final_result.get("project_name"),
            "description": final_result.get("description"),
            "task_count": final_result.get("task_count", 0),
            "milestone_count": final_result.get("milestone_count", 0),
            "conflict_count": final_result.get("conflict_count", 0),
            "changeset_id": final_result.get("changeset_id"),
            "changeset_status": final_result.get("changeset_status"),
            "pending_mutation_count": final_result.get("pending_mutation_count", 0),
            "domain": final_result.get("domain", "general"),
            "sub_domain": final_result.get("sub_domain", "software"),
            "critique_score": final_result.get("critique_score", 0),
            "wiki_page_url": final_result.get("wiki_page_url"),
            "message": (
                f"Plan update for '{final_result.get('project_name')}' — "
                f"changeset {final_result.get('changeset_status', 'applied')}."
            ),
        }
    except Exception as e:
        logger.exception("plan_generate_draft tool failed")
        return {"ok": False, "error": str(e)}



def _plan_detect_conflicts(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_project
    from planning.agent_sync import detect_date_conflicts

    project_id = (args.get("project_id") or "").strip() or None
    if (args.get("project_query") or "").strip():
        project, err_resp = require_project(ctx, args)
        if err_resp:
            return err_resp
        project_id = str(project.id)
    try:
        conflicts = detect_date_conflicts(ctx.team_id, project_id=project_id)
        return {"ok": True, "conflict_count": len(conflicts), "conflicts": conflicts[:10]}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _plan_sync_wiki(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_project
    from planning.agent_sync import sync_project_to_wiki

    if _check_tool_idempotency(ctx.team_id, "plan_sync_wiki", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; wiki sync skipped."}

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp
    try:
        page = sync_project_to_wiki(project)
        return {
            "ok": True,
            "wiki_slug": page.slug if page else None,
            "project_id": str(project.id),
            "resolved_from_query": bool((args.get("project_query") or "").strip()),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _plan_risk_assessment(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_project
    from accounts.models import Team
    from planning.remediation import assess_project_risk

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp
    project_id = str(project.id)
    try:
        team = Team.objects.get(id=ctx.team_id)
        conflicts = []
        try:
            from planning.agent_sync import detect_date_conflicts
            conflicts = detect_date_conflicts(ctx.team_id, project_id=project_id)
        except Exception:
            pass
        risk = assess_project_risk(team, project, conflicts)
        return {"ok": True, "risk": risk}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _plan_resolve_conflicts(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_project
    from planning.remediation import remediate_project

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp
    try:
        result = remediate_project(team=project.team, project=project, apply_conflicts=True, apply_risk=False)
        return {
            "ok": True,
            "resolved_from_query": bool((args.get("project_query") or "").strip()),
            **result,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _plan_generate_risk_resolution(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_project
    from planning.agent_sync import detect_date_conflicts
    from planning.remediation import assess_project_risk, generate_risk_actions

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp
    try:
        conflicts = detect_date_conflicts(ctx.team_id, project_id=str(project.id))
        risk = assess_project_risk(project.team, project, conflicts)
        actions = generate_risk_actions(project.team, project, conflicts, risk)
        return {
            "ok": True,
            "project_id": str(project.id),
            "risk": risk,
            "conflict_count": len(conflicts),
            "proposed_count": len(actions),
            "actions": actions,
            "resolved_from_query": bool((args.get("project_query") or "").strip()),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _plan_apply_risk_resolution(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_project
    from planning.agent_sync import detect_date_conflicts
    from planning.remediation import apply_risk_actions, assess_project_risk

    if _check_tool_idempotency(ctx.team_id, "plan_apply_risk_resolution", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; risk actions skipped."}

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp
    actions = args.get("actions")
    if not isinstance(actions, list):
        return {"ok": False, "error": "actions_required"}
    try:
        applied, skipped = apply_risk_actions(project, [a for a in actions if isinstance(a, dict)])
        conflicts = detect_date_conflicts(ctx.team_id, project_id=str(project.id))
        risk = assess_project_risk(project.team, project, conflicts)
        return {
            "ok": True,
            "project_id": str(project.id),
            "applied_count": len(applied),
            "skipped_count": len(skipped),
            "warnings": skipped[:20],
            "applied_actions": applied,
            "remaining_conflicts": len(conflicts),
            "remaining_risk_score": risk.get("score", 0),
            "risk": risk,
            "resolved_from_query": bool((args.get("project_query") or "").strip()),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _plan_resolve_risk(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from chat.plan_resolve import require_project
    from planning.remediation import remediate_project

    if _check_tool_idempotency(ctx.team_id, "plan_resolve_risk", args.get("idempotency_key") or ""):
        return {"ok": True, "deduplicated": True, "message": "Idempotent replay; risk resolution skipped."}

    project, err_resp = require_project(ctx, args)
    if err_resp:
        return err_resp
    try:
        result = remediate_project(team=project.team, project=project, apply_conflicts=True, apply_risk=True)
        return {
            "ok": True,
            "resolved_from_query": bool((args.get("project_query") or "").strip()),
            **result,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _plan_check_overdue(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.agent_sync import check_overdue_items

    try:
        result = check_overdue_items(ctx.team_id)
        return {
            "ok": True,
            "overdue_task_count": len(result.get("overdue_tasks", [])),
            "missed_milestone_count": len(result.get("missed_milestones", [])),
            "overdue_tasks": result.get("overdue_tasks", [])[:5],
            "missed_milestones": result.get("missed_milestones", [])[:5],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── New Agent Tools Implementation ──────────────────────────────────


def _wiki_read_full_page(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Read the complete content of a wiki page."""
    slug = (args.get("slug") or "").strip()
    page_id = (args.get("page_id") or "").strip()
    try:
        if page_id:
            page = WikiPage.objects.get(id=page_id, team_id=ctx.team_id, is_deleted=False)
        elif slug:
            page = WikiPage.objects.get(team_id=ctx.team_id, slug=slug, is_deleted=False)
        else:
            return {"ok": False, "error": "slug_or_page_id_required"}
    except WikiPage.DoesNotExist:
        return {"ok": False, "error": "wiki_page_not_found"}

    # Include source citations if available
    citations = []
    try:
        from ingest.models import WikiSourceCitation
        for cit in WikiSourceCitation.objects.filter(wiki_page=page).select_related("raw_source")[:10]:
            citations.append({
                "source_type": cit.raw_source.source_type,
                "source_filename": cit.raw_source.original_filename,
                "source_url": cit.raw_source.source_url,
                "section": cit.wiki_section,
                "source_page": cit.source_page_number,
                "source_timestamp": cit.source_timestamp,
            })
    except Exception:
        pass

    return {
        "ok": True,
        "page_id": str(page.id),
        "title": page.title,
        "slug": page.slug,
        "page_type": page.page_type,
        "content": page.content,
        "frontmatter": page.frontmatter,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
        "source_citations": citations,
    }


def _graph_traverse_neighbors(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Traverse graph to find connected pages."""
    from graph_engine.traversal import traverse_neighbors

    page_id = (args.get("page_id") or "").strip()
    if not page_id:
        return {"ok": False, "error": "page_id_required"}

    results = traverse_neighbors(
        page_id=page_id,
        team_id=ctx.team_id,
        max_hops=min(int(args.get("max_hops") or 2), 3),
        relation_filter=args.get("relation_filter"),
        include_content=bool(args.get("include_content")),
    )
    return {"ok": True, "neighbors": results, "count": len(results)}


def _graph_add_typed_relation(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Add a typed semantic relation between two wiki pages."""
    from_id = args.get("from_page_id")
    to_id = args.get("to_page_id")
    relation_type = (args.get("relation_type") or "").strip()
    reason = (args.get("reason") or "").strip()

    if relation_type not in GraphEdge.TYPED_RELATION_TYPES:
        return {"ok": False, "error": f"invalid_relation_type: {relation_type}"}

    try:
        fp = WikiPage.objects.get(id=from_id, team_id=ctx.team_id, is_deleted=False)
        tp = WikiPage.objects.get(id=to_id, team_id=ctx.team_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return {"ok": False, "error": "page_not_found"}

    edge, created = GraphEdge.objects.update_or_create(
        from_page=fp,
        to_page=tp,
        edge_type=relation_type,
        defaults={"confidence": 1.0, "reason": reason, "created_by": "agent"},
    )
    invalidate_team_graph_analytics_cache(ctx.team_id)
    return {"ok": True, "edge_id": str(edge.id), "created": created, "relation_type": relation_type}


def _graph_find_contradictions(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Find contradictions in the knowledge graph."""
    from graph_engine.traversal import find_contradictions

    page_id = (args.get("page_id") or "").strip() or None
    results = find_contradictions(ctx.team_id, page_id=page_id)
    return {"ok": True, "contradictions": results, "count": len(results)}


def _graph_explain_connection(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Explain the connection between two pages in the knowledge graph."""
    from graph_engine.reasoner import explain_connection

    page_a = (args.get("page_a_id") or "").strip()
    page_b = (args.get("page_b_id") or "").strip()
    if not page_a or not page_b:
        return {"ok": False, "error": "Both page_a_id and page_b_id are required"}

    explanation = explain_connection(ctx.team_id, page_a, page_b)
    return {"ok": True, "explanation": explanation}


def _knowledge_gap_analysis(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Identify knowledge gaps in the wiki."""
    from graph_engine.traversal import knowledge_gap_analysis

    results = knowledge_gap_analysis(ctx.team_id)
    return {"ok": True, **results}


def _calendar_detect_conflicts(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Detect calendar conflicts."""
    from planning.agent_sync import detect_date_conflicts

    project_id = (args.get("project_id") or "").strip() or None
    conflicts = detect_date_conflicts(ctx.team_id, project_id=project_id)
    return {"ok": True, "conflicts": conflicts, "count": len(conflicts)}


def _calendar_check_overdue(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Check for overdue items."""
    from planning.agent_sync import check_overdue_items

    results = check_overdue_items(ctx.team_id)
    return {
        "ok": True,
        "overdue_tasks": results["overdue_tasks"],
        "missed_milestones": results["missed_milestones"],
        "total_overdue": len(results["overdue_tasks"]) + len(results["missed_milestones"]),
    }


def _agent_memory_read(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Read from persistent memory."""
    from chat.agent_memory_service import get_memory, list_memories

    key = (args.get("key") or "").strip()
    category = (args.get("category") or "").strip()

    if key:
        value = get_memory(ctx.team_id, key)
        if value is None:
            return {"ok": True, "found": False, "message": f"No memory entry for key '{key}'"}
        return {"ok": True, "found": True, "key": key, "value": value}

    memories = list_memories(ctx.team_id, category=category or None)
    return {"ok": True, "memories": memories, "count": len(memories)}


def _agent_memory_write(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Write to persistent memory."""
    from chat.agent_memory_service import set_memory

    key = (args.get("key") or "").strip()
    if not key:
        return {"ok": False, "error": "key_required"}

    value = args.get("value", {})
    category = args.get("category", "context")
    summary = (args.get("summary") or "").strip()

    set_memory(ctx.team_id, key, value, category=category, summary=summary)
    return {"ok": True, "key": key, "stored": True}


def _agent_memory_delete(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Delete a stale or incorrect persistent memory entry."""
    from chat.agent_memory_service import delete_memory

    key = (args.get("key") or "").strip()
    if not key:
        return {"ok": False, "error": "key_required"}

    deleted = delete_memory(ctx.team_id, key)
    return {"ok": True, "key": key, "deleted": deleted}


def select_relevant_tools(query: str, tools: list[dict[str, Any]], max_tools: int = 15) -> list[dict[str, Any]]:
    """Score and select the most relevant tools for the user query (Phase 4.2).

    Uses fast keyword matching against tool name, description, and arguments
    to score relevance. Always keeps basic/essential tools.
    """
    if not tools or len(tools) <= max_tools:
        return tools

    query_words = set(query.lower().split())
    scored_tools = []

    # Essential tools that should always be present if available
    essential_names = {
        "wiki_search_pages", "plan_search", "agent_memory_read", "agent_memory_write"
    }

    for tool in tools:
        fn = tool.get("function", {})
        name = fn.get("name", "").lower()
        desc = fn.get("description", "").lower()

        # Base score
        score = 0
        if fn.get("name") in essential_names:
            score += 100  # Ensure essential tools stay

        # Matching score
        for word in query_words:
            if word in name:
                score += 15
            if word in desc:
                score += 5

        # Check property names
        props = fn.get("parameters", {}).get("properties", {})
        for prop_name in props:
            if prop_name.lower() in query_words:
                score += 3

        scored_tools.append((score, tool))

    # Sort descending by score
    scored_tools.sort(key=lambda x: x[0], reverse=True)
    return [t for _, t in scored_tools[:max_tools]]
