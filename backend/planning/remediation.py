from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from accounts.models import Team
from planning.agent_sync import detect_date_conflicts
from planning.models import Project, Task
from planning.serializers import ProjectDetailSerializer
from planning.services import (
    get_milestone_or_none,
    get_project_or_none,
    get_task_or_none,
    update_milestone,
    update_task,
)

logger = logging.getLogger(__name__)


def safe_reindex_project(project: Project) -> None:
    """Best-effort async reindex; remediation should not fail because the broker is down."""
    try:
        from planning.tasks import reindex_project_async

        reindex_project_async.delay(str(project.id))
    except Exception:
        logger.exception("Failed to queue reindex after plan remediation", extra={"project_id": str(project.id)})


def project_payload(project: Project) -> dict[str, Any]:
    data = ProjectDetailSerializer(project).data
    data["projectName"] = data.get("name") or data.get("projectName") or project.name
    return data


def deterministic_risk(project: Project, conflicts: list[dict[str, Any]]) -> dict[str, Any]:
    today = timezone.now().date()
    tasks = list(project.tasks.all())
    milestones = list(project.milestones.all())

    score = 0
    factors: list[str] = []
    suggestions: list[str] = []

    high_conflicts = [c for c in conflicts if c.get("severity") == "high"]
    if conflicts:
        score += min(45, 12 * len(conflicts) + 8 * len(high_conflicts))
        factors.append(f"{len(conflicts)} active scheduling conflict(s) detected.")
        suggestions.append("Resolve overlapping assigned work before adding more scope.")

    blocked = [t for t in tasks if t.status == "blocked"]
    if blocked:
        score += min(20, 6 * len(blocked))
        factors.append(f"{len(blocked)} blocked task(s) are still open.")
        suggestions.append("Unblock or rescope blocked tasks before the next milestone.")

    overdue = [t for t in tasks if t.end_date and t.end_date < today and t.status in ("todo", "in-progress", "blocked")]
    if overdue:
        score += min(25, 7 * len(overdue))
        factors.append(f"{len(overdue)} task(s) are overdue.")
        suggestions.append("Move overdue task dates or reduce milestone commitments.")

    undated_active = [t for t in tasks if t.status in ("todo", "in-progress", "blocked") and (not t.start_date or not t.end_date)]
    if undated_active:
        score += min(20, 4 * len(undated_active))
        factors.append(f"{len(undated_active)} active task(s) are missing start or end dates.")
        suggestions.append("Add dates for unscheduled active work so risk can be assessed accurately.")

    upcoming_milestones = [
        m for m in milestones
        if m.target_date and m.status == "pending" and today <= m.target_date <= today + timedelta(days=14)
    ]
    open_tasks = [t for t in tasks if t.status in ("todo", "in-progress", "blocked")]
    if upcoming_milestones and len(open_tasks) >= 5:
        score += 15
        factors.append("A near-term milestone has several open tasks remaining.")
        suggestions.append("Move lower-priority work out of the near-term milestone window.")

    return {
        "score": max(0, min(100, score)),
        "factors": factors,
        "suggestions": suggestions,
    }


def assess_project_risk(team: Team, project: Project, conflicts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    from planning.engine import _assess_plan_risk

    conflicts = conflicts if conflicts is not None else detect_date_conflicts(str(team.id), project_id=str(project.id))
    fallback = deterministic_risk(project, conflicts)
    try:
        llm_risk = _assess_plan_risk(team, project_payload(project), conflicts)
    except Exception:
        logger.exception("LLM risk assessment failed; using deterministic risk")
        return fallback

    score = max(int(llm_risk.get("score", 0) or 0), fallback["score"])
    factors = list(dict.fromkeys([*fallback["factors"], *[str(f) for f in llm_risk.get("factors", []) if f]]))
    suggestions = list(dict.fromkeys([*fallback["suggestions"], *[str(s) for s in llm_risk.get("suggestions", []) if s]]))
    return {"score": max(0, min(100, score)), "factors": factors, "suggestions": suggestions}


def _parse_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _conflict_task_ids(conflict: dict[str, Any]) -> list[str]:
    ids = []
    for key in ("task_1", "task_2"):
        value = conflict.get(key) or {}
        task_id = value.get("id")
        if task_id:
            ids.append(str(task_id))
    return ids


def _fallback_conflict_actions(project: Project, conflicts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    cursor = None
    for conflict in conflicts:
        if conflict.get("type") == "task_overlap":
            for task_id in _conflict_task_ids(conflict)[1:]:
                task = get_task_or_none(str(project.team_id), str(project.id), task_id)
                if not task or not task.start_date or not task.end_date:
                    continue
                duration = max(1, (task.end_date - task.start_date).days + 1)
                if cursor is None:
                    cursor = max(task.end_date, timezone.now().date())
                start = cursor + timedelta(days=1)
                end = start + timedelta(days=duration - 1)
                cursor = end
                actions.append({
                    "action": "update_task_dates",
                    "task_id": str(task.id),
                    "start_date": start.isoformat(),
                    "end_date": end.isoformat(),
                    "reason": "Move overlapping task after the conflicting work window.",
                })
        elif conflict.get("type") == "milestone_clash":
            milestone = conflict.get("milestone_2") or {}
            milestone_id = milestone.get("id")
            clash_date = _parse_date(milestone.get("date"))
            if milestone_id and clash_date:
                actions.append({
                    "action": "update_milestone_date",
                    "milestone_id": str(milestone_id),
                    "target_date": (clash_date + timedelta(days=1)).isoformat(),
                    "reason": "Move milestone off the clashing date.",
                })
    return actions


def generate_risk_actions(team: Team, project: Project, conflicts: list[dict[str, Any]], risk: dict[str, Any]) -> list[dict[str, Any]]:
    from planning.agent_executor import generate_risk_resolution_actions

    try:
        actions = generate_risk_resolution_actions(team, project_payload(project), conflicts, risk)
    except Exception:
        logger.exception("Risk action generation failed; using deterministic conflict actions")
        actions = []
    if not actions and conflicts:
        actions = _fallback_conflict_actions(project, conflicts)
    return actions


def apply_risk_actions(project: Project, actions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    applied: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    with transaction.atomic():
        for action in actions:
            action_type = action.get("action")
            if action_type == "update_task_dates":
                task = get_task_or_none(str(project.team_id), str(project.id), str(action.get("task_id") or ""))
                start = _parse_date(action.get("start_date"))
                end = _parse_date(action.get("end_date"))
                if not task:
                    skipped.append({"action": action, "reason": "task_not_found"})
                    continue
                if not start or not end:
                    skipped.append({"action": action, "reason": "missing_or_invalid_dates"})
                    continue
                if start > end:
                    skipped.append({"action": action, "reason": "start_after_end"})
                    continue
                update_task(task, {"start_date": start, "end_date": end})
                applied.append({"action": action_type, "task_id": str(task.id), "reason": action.get("reason", "")})
            elif action_type == "update_task_priority":
                task = get_task_or_none(str(project.team_id), str(project.id), str(action.get("task_id") or ""))
                priority = action.get("priority")
                if not task:
                    skipped.append({"action": action, "reason": "task_not_found"})
                    continue
                if priority not in {"low", "medium", "high"}:
                    skipped.append({"action": action, "reason": "invalid_priority"})
                    continue
                update_task(task, {"priority": priority})
                applied.append({"action": action_type, "task_id": str(task.id), "reason": action.get("reason", "")})
            elif action_type == "add_dependency":
                task = get_task_or_none(str(project.team_id), str(project.id), str(action.get("task_id") or ""))
                depends_on = get_task_or_none(str(project.team_id), str(project.id), str(action.get("depends_on_task_id") or ""))
                if not task or not depends_on:
                    skipped.append({"action": action, "reason": "dependency_task_not_found"})
                    continue
                if str(task.id) == str(depends_on.id):
                    skipped.append({"action": action, "reason": "self_dependency"})
                    continue
                task.dependencies.add(depends_on)
                applied.append({"action": action_type, "task_id": str(task.id), "reason": action.get("reason", "")})
            elif action_type == "update_milestone_date":
                milestone = get_milestone_or_none(str(project.team_id), str(project.id), str(action.get("milestone_id") or ""))
                target = _parse_date(action.get("target_date"))
                if not milestone:
                    skipped.append({"action": action, "reason": "milestone_not_found"})
                    continue
                if not target:
                    skipped.append({"action": action, "reason": "missing_or_invalid_target_date"})
                    continue
                update_milestone(milestone, {"target_date": target})
                applied.append({"action": action_type, "milestone_id": str(milestone.id), "reason": action.get("reason", "")})
            else:
                skipped.append({"action": action, "reason": "unsupported_action"})

    if applied:
        safe_reindex_project(project)
    return applied, skipped


def remediate_project(
    *,
    team: Team,
    project: Project,
    apply_conflicts: bool = True,
    apply_risk: bool = True,
) -> dict[str, Any]:
    initial_conflicts = detect_date_conflicts(str(team.id), project_id=str(project.id))
    initial_risk = assess_project_risk(team, project, initial_conflicts)
    warnings: list[dict[str, Any]] = []
    applied_actions: list[dict[str, Any]] = []

    conflict_actions = _fallback_conflict_actions(project, initial_conflicts)
    if apply_conflicts and conflict_actions:
        applied, skipped = apply_risk_actions(project, conflict_actions)
        applied_actions.extend(applied)
        warnings.extend(skipped)

    mid_conflicts = detect_date_conflicts(str(team.id), project_id=str(project.id))
    risk_after_conflicts = assess_project_risk(team, project, mid_conflicts)
    risk_actions: list[dict[str, Any]] = []
    if apply_risk:
        risk_actions = generate_risk_actions(team, project, mid_conflicts, risk_after_conflicts)
        if risk_actions:
            applied, skipped = apply_risk_actions(project, risk_actions)
            applied_actions.extend(applied)
            warnings.extend(skipped)

    remaining_conflicts = detect_date_conflicts(str(team.id), project_id=str(project.id))
    remaining_risk = assess_project_risk(team, project, remaining_conflicts)
    return {
        "status": "remediated",
        "project_id": str(project.id),
        "initial_conflict_count": len(initial_conflicts),
        "conflict_resolved_count": max(0, len(initial_conflicts) - len(remaining_conflicts)),
        "remaining_conflicts": len(remaining_conflicts),
        "conflicts": remaining_conflicts[:10],
        "initial_risk_score": initial_risk.get("score", 0),
        "remaining_risk_score": remaining_risk.get("score", 0),
        "risk": remaining_risk,
        "risk_actions_applied": len([a for a in applied_actions if a.get("action") != "update_task_dates"]),
        "skipped_count": len(warnings),
        "warnings": warnings[:20],
        "applied_actions": applied_actions,
        "proposed_actions": [*conflict_actions, *risk_actions],
    }


def remediate_project_by_id(team_id: str, project_id: str, **kwargs) -> dict[str, Any]:
    project = get_project_or_none(team_id, project_id)
    if project is None:
        return {"ok": False, "error": "project_not_found"}
    return {"ok": True, **remediate_project(team=project.team, project=project, **kwargs)}
