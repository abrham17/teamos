"""
Wiki agent tool implementations (server-side). Invoked only from chat agent mode for editor+ members.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from django.core.cache import cache
from django.db.models import Q

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


@dataclass
class ToolContext:
    user: User
    team_id: str
    membership: TeamMember


def openai_tool_schemas() -> list[dict[str, Any]]:
    """OpenAI-compatible `tools` list for chat.completions."""
    return [
        {
            "type": "function",
            "function": {
                "name": "wiki_search_pages",
                "description": "Search wiki pages by title or content substring. Use before updates to find slugs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search string"},
                        "limit": {"type": "integer", "description": "Max results", "default": 15},
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
                "description": "Update an existing wiki page by slug or page_id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slug": {"type": "string"},
                        "page_id": {"type": "string"},
                        "title": {"type": "string"},
                        "content": {"type": "string"},
                        "page_type": {"type": "string"},
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


def openai_plan_tool_schemas() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "plan_list_projects",
                "description": "List projects for this team.",
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
                "name": "plan_create_project",
                "description": "Create a planning project.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {"type": "string", "enum": ["active", "on_hold", "completed", "archived"]},
                    },
                    "required": ["name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_generate_draft",
                "description": "Use the Plan Architect to generate a detailed project draft (tasks, milestones, roles) based on a mission prompt and wiki context.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string", "description": "The mission or objective for the project."},
                        "mode": {"type": "string", "enum": ["create", "manage"], "default": "create"},
                        "project_id": {"type": "string", "description": "ID of existing project if updating."},
                    },
                    "required": ["prompt"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_update_project",
                "description": "Update a planning project by id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {"type": "string"},
                    },
                    "required": ["project_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_create_task",
                "description": "Create a task inside a project.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"},
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
                    },
                    "required": ["project_id", "title"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_update_task",
                "description": "Update a task by id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": {"type": "string"},
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
                    },
                    "required": ["task_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_create_milestone",
                "description": "Create a milestone inside a project.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {"type": "string"},
                        "target_date": {"type": "string", "description": "YYYY-MM-DD"},
                    },
                    "required": ["project_id", "title"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_update_milestone",
                "description": "Update a milestone by id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "milestone_id": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {"type": "string"},
                        "target_date": {"type": "string", "description": "YYYY-MM-DD"},
                    },
                    "required": ["milestone_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_delete_task",
                "description": "Delete a task by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": {"type": "string"},
                    },
                    "required": ["task_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "plan_delete_project",
                "description": "Delete a project by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"},
                    },
                    "required": ["project_id"],
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
    ]


def _parse_args(arguments: str) -> dict[str, Any]:
    if not arguments or not str(arguments).strip():
        return {}
    try:
        return json.loads(arguments)
    except json.JSONDecodeError as e:
        raise ValueError(f"invalid_tool_arguments: {e}") from e


def execute_tool(name: str, arguments: str, ctx: ToolContext) -> dict[str, Any]:
    """
    Run a single tool. Returns a JSON-serializable dict for the model (and tracing):
    {"ok": bool, "error"?: str, ...payload }
    """
    args = _parse_args(arguments)
    try:
        if name == "wiki_search_pages":
            return _wiki_search_pages(ctx, args)
        if name == "wiki_create_page":
            return _wiki_create_page(ctx, args)
        if name == "wiki_update_page":
            return _wiki_update_page(ctx, args)
        if name == "wiki_read_full_page":
            return _wiki_read_full_page(ctx, args)
        if name == "graph_add_edge":
            return _graph_add_edge(ctx, args)
        if name == "graph_add_typed_relation":
            return _graph_add_typed_relation(ctx, args)
        if name == "graph_traverse_neighbors":
            return _graph_traverse_neighbors(ctx, args)
        if name == "graph_find_contradictions":
            return _graph_find_contradictions(ctx, args)
        if name == "knowledge_gap_analysis":
            return _knowledge_gap_analysis(ctx, args)
        if name == "calendar_detect_conflicts":
            return _calendar_detect_conflicts(ctx, args)
        if name == "calendar_check_overdue":
            return _calendar_check_overdue(ctx, args)
        if name == "agent_memory_read":
            return _agent_memory_read(ctx, args)
        if name == "agent_memory_write":
            return _agent_memory_write(ctx, args)
        if name == "ingest_markdown":
            return _ingest_markdown(ctx, args)
        if name == "plan_generate_draft":
            return _plan_generate_draft(ctx, args)
        if name.startswith("plan_"):
            return execute_plan_tool(name, arguments, ctx)
        return {"ok": False, "error": f"unknown_tool:{name}"}
    except Exception as e:
        logger.exception("Tool %s failed", name)
        return {"ok": False, "error": str(e), "tool": name}


def execute_plan_tool(name: str, arguments: str, ctx: ToolContext) -> dict[str, Any]:
    args = _parse_args(arguments)
    try:
        if name == "plan_list_projects":
            return _plan_list_projects(ctx, args)
        if name == "plan_create_project":
            return _plan_create_project(ctx, args)
        if name == "plan_update_project":
            return _plan_update_project(ctx, args)
        if name == "plan_create_task":
            return _plan_create_task(ctx, args)
        if name == "plan_update_task":
            return _plan_update_task(ctx, args)
        if name == "plan_create_milestone":
            return _plan_create_milestone(ctx, args)
        if name == "plan_update_milestone":
            return _plan_update_milestone(ctx, args)
        if name == "plan_delete_task":
            return _plan_delete_task(ctx, args)
        if name == "plan_delete_project":
            return _plan_delete_project(ctx, args)
        return {"ok": False, "error": f"unknown_tool:{name}"}
    except Exception as e:
        logger.exception("Plan tool %s failed", name)
        return {"ok": False, "error": str(e), "tool": name}


def _wiki_search_pages(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    q = (args.get("query") or "").strip()
    if not q:
        return {"ok": False, "error": "query_required"}
    limit = min(int(args.get("limit") or 15), 30)
    qs = WikiPage.objects.filter(team_id=ctx.team_id, is_deleted=False).filter(
        Q(title__icontains=q) | Q(content__icontains=q)
    )[:limit]
    rows = [
        {
            "id": str(p.id),
            "title": p.title,
            "slug": p.slug,
            "page_type": p.page_type,
        }
        for p in qs
    ]
    return {"ok": True, "pages": rows, "count": len(rows)}


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

    if "title" in args and args["title"] is not None:
        new_title = str(args["title"]).strip()
        if new_title and new_title != page.title:
            page.title = new_title
            page.slug = unique_slug(page.team, new_title, exclude_id=page.id)
    if "content" in args and args["content"] is not None:
        page.content = str(args["content"])
    if "page_type" in args and args["page_type"]:
        page.page_type = str(args["page_type"])
    if "frontmatter" in args and isinstance(args["frontmatter"], dict):
        page.frontmatter = args["frontmatter"]
    page.save()

    try:
        from wiki.services.reindex import reindex_wiki_page

        reindex_wiki_page(page, queue_graph=True)
    except Exception as e:
        logger.exception("reindex after wiki_update_page")
        return {"ok": False, "error": f"reindex_failed:{e}", "page_id": str(page.id), "slug": page.slug}

    return {"ok": True, "page_id": str(page.id), "slug": page.slug, "title": page.title}


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


def _plan_create_project(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.services import create_project as srv_create_project

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
    from planning.services import get_project_or_none, update_project as srv_update_project

    project_id = (args.get("project_id") or "").strip()
    if not project_id:
        return {"ok": False, "error": "project_id_required"}
    
    project = get_project_or_none(ctx.team_id, project_id)
    if not project:
        return {"ok": False, "error": "project_not_found"}

    payload = {}
    if "name" in args: payload["name"] = args["name"]
    if "description" in args: payload["description"] = args["description"]
    if "status" in args: payload["status"] = args["status"]
    
    updated = srv_update_project(project, payload)
    reindex_project(updated)
    return {"ok": True, "project_id": str(updated.id), "name": updated.name, "status": updated.status}


def _resolve_assignee(team_id: str, assignee_id: Any) -> User | None:
    if not assignee_id:
        return None
    try:
        membership = TeamMember.objects.select_related("user").get(team_id=team_id, user_id=assignee_id)
    except TeamMember.DoesNotExist:
        return None
    return membership.user


def _plan_create_task(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.services import get_project_or_none, create_task as srv_create_task

    project_id = (args.get("project_id") or "").strip()
    title = (args.get("title") or "").strip()
    if not project_id or not title:
        return {"ok": False, "error": "project_id_and_title_required"}
    
    project = get_project_or_none(ctx.team_id, project_id)
    if not project:
        return {"ok": False, "error": "project_not_found"}

    assignee = _resolve_assignee(ctx.team_id, args.get("assignee_id"))
    
    payload = {
        "title": title,
        "description": (args.get("description") or "").strip(),
        "status": args.get("status") or "todo",
        "priority": args.get("priority") or "medium",
        "assignee": assignee,
        "start_date": args.get("start_date") or None,
        "end_date": args.get("end_date") or None,
        "dependency_ids": args.get("dependency_ids") or [],
    }
    
    task = srv_create_task(project=project, user=ctx.user, payload=payload)
    reindex_project(project)
    return {"ok": True, "task_id": str(task.id), "project_id": str(project.id), "title": task.title}


def _plan_update_task(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.services import get_task_or_none, update_task as srv_update_task

    task_id = (args.get("task_id") or "").strip()
    if not task_id:
        return {"ok": False, "error": "task_id_required"}
    
    # We need project_id for get_task_or_none, or we can use Task.objects.get directly if we have team_id
    try:
        task = Task.objects.select_related("project").get(id=task_id, project__team_id=ctx.team_id)
    except Task.DoesNotExist:
        return {"ok": False, "error": "task_not_found"}

    payload = {}
    for field in ["title", "description", "status", "priority", "start_date", "end_date", "dependency_ids"]:
        if field in args:
            payload[field] = args[field]
    
    if "assignee_id" in args:
        payload["assignee"] = _resolve_assignee(ctx.team_id, args["assignee_id"])

    updated = srv_update_task(task, payload)
    reindex_project(updated.project)
    return {"ok": True, "task_id": str(updated.id), "title": updated.title, "status": updated.status}


def _plan_create_milestone(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.services import get_project_or_none, create_milestone as srv_create_milestone

    project_id = (args.get("project_id") or "").strip()
    title = (args.get("title") or "").strip()
    if not project_id or not title:
        return {"ok": False, "error": "project_id_and_title_required"}
    
    project = get_project_or_none(ctx.team_id, project_id)
    if not project:
        return {"ok": False, "error": "project_not_found"}

    milestone = srv_create_milestone(
        project=project,
        user=ctx.user,
        payload={
            "title": title,
            "description": (args.get("description") or "").strip(),
            "status": args.get("status") or "pending",
            "target_date": args.get("target_date") or None,
        }
    )
    reindex_project(project)
    return {"ok": True, "milestone_id": str(milestone.id), "project_id": str(project.id), "title": milestone.title}


def _plan_update_milestone(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.services import update_milestone as srv_update_milestone

    milestone_id = (args.get("milestone_id") or "").strip()
    if not milestone_id:
        return {"ok": False, "error": "milestone_id_required"}
    
    try:
        milestone = Milestone.objects.select_related("project").get(id=milestone_id, project__team_id=ctx.team_id)
    except Milestone.DoesNotExist:
        return {"ok": False, "error": "milestone_not_found"}

    payload = {}
    for field in ["title", "description", "status", "target_date"]:
        if field in args:
            payload[field] = args[field]
    
    updated = srv_update_milestone(milestone, payload)
    reindex_project(updated.project)
    return {"ok": True, "milestone_id": str(updated.id), "title": updated.title, "status": updated.status}


def _plan_delete_task(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.services import delete_task as srv_delete_task
    task_id = args.get("task_id")
    try:
        task = Task.objects.select_related("project").get(id=task_id, project__team_id=ctx.team_id)
        project = task.project
        srv_delete_task(task)
        reindex_project(project)
        return {"ok": True, "task_id": task_id}
    except Task.DoesNotExist:
        return {"ok": False, "error": "task_not_found"}


def _plan_delete_project(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from planning.services import get_project_or_none, delete_project as srv_delete_project
    project_id = args.get("project_id")
    project = get_project_or_none(ctx.team_id, project_id)
    if project:
        srv_delete_project(project)
        return {"ok": True, "project_id": project_id}
    return {"ok": False, "error": "project_not_found"}
def _plan_generate_draft(ctx: ToolContext, args: dict) -> dict:
    from planning.agent_sync import generate_plan_with_wiki_context
    from planning.services import get_project_or_none
    from planning.serializers import ProjectDetailSerializer

    prompt = args.get("prompt")
    mode = args.get("mode", "create")
    project_id = args.get("project_id")

    project_context = None
    if project_id:
        project = get_project_or_none(team_id=ctx.team_id, project_id=project_id)
        if project:
            project_context = ProjectDetailSerializer(project).data

    try:
        draft = generate_plan_with_wiki_context(
            team_id=ctx.team_id,
            prompt=prompt,
            mode=mode,
            project_context=project_context
        )
        return {"ok": True, "draft": draft}
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

