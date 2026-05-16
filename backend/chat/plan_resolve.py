"""
Shared project / task / milestone resolution for planner mutation tools.
"""

from __future__ import annotations

from typing import Any

from planning.models import Milestone, Project, Task
from planning.services import get_project_or_none

from chat.plan_search import (
    normalize_milestone_status,
    normalize_task_status,
    resolve_plan_milestone,
    resolve_plan_project,
    resolve_plan_task,
)


def resolve_error(error: str, candidates: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"ok": False, "error": error}
    if candidates:
        out["candidates"] = candidates
    return out


def require_project(ctx, args: dict[str, Any]) -> tuple[Project | None, dict[str, Any] | None]:
    """Resolve project from project_id or project_query (natural language)."""
    project_id = (args.get("project_id") or "").strip()
    project_query = (args.get("project_query") or "").strip()

    if project_id:
        project = get_project_or_none(ctx.team_id, project_id)
        if not project:
            return None, resolve_error("project_not_found")
        return project, None

    if project_query:
        project, candidates, err = resolve_plan_project(
            ctx.team_id, project_query, team=ctx.membership.team
        )
        if err:
            return None, resolve_error(err, candidates)
        return project, None

    return None, resolve_error("project_id_or_query_required")


def require_task(ctx, args: dict[str, Any]) -> tuple[Task | None, dict[str, Any] | None]:
    """Resolve task from task_id or task_query; optional project scope via project_id/project_query."""
    task_id = (args.get("task_id") or "").strip()
    task_query = (args.get("task_query") or "").strip()

    scope_project_id = (args.get("project_id") or "").strip() or None
    if not scope_project_id and (args.get("project_query") or "").strip():
        project, err_resp = require_project(ctx, args)
        if err_resp:
            return None, err_resp
        scope_project_id = str(project.id)

    if task_id:
        try:
            task = Task.objects.select_related("project").get(
                id=task_id, project__team_id=ctx.team_id
            )
        except Task.DoesNotExist:
            return None, resolve_error("task_not_found")
        if scope_project_id and str(task.project_id) != scope_project_id:
            return None, resolve_error("task_not_in_project")
        return task, None

    if task_query:
        task, candidates, err = resolve_plan_task(
            ctx.team_id,
            task_query,
            project_id=scope_project_id,
            team=ctx.membership.team,
        )
        if err:
            return None, resolve_error(err, candidates)
        return task, None

    return None, resolve_error("task_id_or_query_required")


def require_milestone(ctx, args: dict[str, Any]) -> tuple[Milestone | None, dict[str, Any] | None]:
    """Resolve milestone from milestone_id or milestone_query; optional project scope."""
    milestone_id = (args.get("milestone_id") or "").strip()
    milestone_query = (args.get("milestone_query") or "").strip()

    scope_project_id = (args.get("project_id") or "").strip() or None
    if not scope_project_id and (args.get("project_query") or "").strip():
        project, err_resp = require_project(ctx, args)
        if err_resp:
            return None, err_resp
        scope_project_id = str(project.id)

    if milestone_id:
        try:
            milestone = Milestone.objects.select_related("project").get(
                id=milestone_id, project__team_id=ctx.team_id
            )
        except Milestone.DoesNotExist:
            return None, resolve_error("milestone_not_found")
        if scope_project_id and str(milestone.project_id) != scope_project_id:
            return None, resolve_error("milestone_not_in_project")
        return milestone, None

    if milestone_query:
        milestone, candidates, err = resolve_plan_milestone(
            ctx.team_id,
            milestone_query,
            project_id=scope_project_id,
            team=ctx.membership.team,
        )
        if err:
            return None, resolve_error(err, candidates)
        return milestone, None

    return None, resolve_error("milestone_id_or_query_required")


def apply_task_payload(args: dict[str, Any], payload: dict[str, Any]) -> None:
    """Copy update fields from tool args; normalize status from plain English."""
    for field in ["title", "description", "priority", "start_date", "end_date", "dependency_ids"]:
        if field in args:
            payload[field] = args[field]
    if "status" in args and args["status"] is not None:
        normalized = normalize_task_status(args["status"])
        if normalized:
            payload["status"] = normalized


def apply_milestone_payload(args: dict[str, Any], payload: dict[str, Any]) -> None:
    for field in ["title", "description", "target_date"]:
        if field in args:
            payload[field] = args[field]
    if "status" in args and args["status"] is not None:
        normalized = normalize_milestone_status(args["status"])
        if normalized:
            payload["status"] = normalized
