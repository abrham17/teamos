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
        # Agent memory tools
        "agent_memory_read": _agent_memory_read,
        "agent_memory_write": _agent_memory_write,
        "agent_memory_delete": _agent_memory_delete,
        # Ingest tools
        "ingest_markdown": _ingest_markdown,
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
        "wiki_search_pages", "agent_memory_read", "agent_memory_write"
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
