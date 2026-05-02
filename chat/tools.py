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
        if name == "graph_add_edge":
            return _graph_add_edge(ctx, args)
        if name == "ingest_markdown":
            return _ingest_markdown(ctx, args)
        return {"ok": False, "error": f"unknown_tool:{name}"}
    except Exception as e:
        logger.exception("Tool %s failed", name)
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
