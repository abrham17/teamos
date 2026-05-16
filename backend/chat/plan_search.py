"""
Hybrid semantic + keyword search across planning entities (projects, tasks, milestones, members).
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any

from django.db.models import Q

from ingest.vectors import vector_store
from planning.models import Milestone, Project, ProjectMember, Task

from chat.wiki_search import _truncate_snippet, expand_search_queries

logger = logging.getLogger(__name__)

_KEYWORD_SCORE = 0.55
_SEMANTIC_WEIGHT = 1.0
_BOTH_BOOST = 0.12
_VALID_KINDS = frozenset({"project", "task", "milestone", "member"})


def _hit_key(project_id: str, source_kind: str, source_ref_id: str | None) -> str:
    return f"{project_id}:{source_kind}:{source_ref_id or ''}"


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    s = str(value).strip()[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _kind_allowed(source_kind: str, kinds: frozenset[str] | None) -> bool:
    if kinds is None:
        return True
    if source_kind == "member":
        return "member" in kinds or "project" in kinds
    return source_kind in kinds


def _keyword_hits(
    team_id: str,
    query: str,
    limit: int,
    *,
    kinds: frozenset[str] | None = None,
    project_id: str | None = None,
    assignee_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
) -> dict[str, dict[str, Any]]:
    q = (query or "").strip()
    if not q:
        return {}

    hits: dict[str, dict[str, Any]] = {}
    projects = Project.objects.filter(team_id=team_id)
    if project_id:
        projects = projects.filter(id=project_id)

    def add_hit(
        *,
        project: Project,
        source_kind: str,
        source_ref_id: str | None,
        title: str,
        snippet: str,
        extra: dict[str, Any] | None = None,
    ) -> None:
        if not _kind_allowed(source_kind, kinds):
            return
        key = _hit_key(str(project.id), source_kind, source_ref_id)
        row = {
            "project_id": str(project.id),
            "project_name": project.name,
            "source_kind": source_kind,
            "source_ref_id": source_ref_id,
            "title": title,
            "score": _KEYWORD_SCORE,
            "snippet": _truncate_snippet(snippet),
            "match": "keyword",
        }
        if extra:
            row.update(extra)
        if key not in hits:
            hits[key] = row

    if kinds is None or "project" in kinds:
        for p in projects.filter(Q(name__icontains=q) | Q(description__icontains=q))[:limit]:
            add_hit(
                project=p,
                source_kind="project",
                source_ref_id=None,
                title=p.name,
                snippet=p.description or p.name,
                extra={"project_status": p.status},
            )

    if kinds is None or "member" in kinds:
        members = ProjectMember.objects.filter(project__team_id=team_id).select_related(
            "project", "user"
        )
        if project_id:
            members = members.filter(project_id=project_id)
        for m in members.filter(
            Q(role__icontains=q)
            | Q(user__email__icontains=q)
            | Q(user__username__icontains=q)
            | Q(project__name__icontains=q)
        )[:limit]:
            add_hit(
                project=m.project,
                source_kind="member",
                source_ref_id=str(m.id),
                title=f"{m.user.email} ({m.role})",
                snippet=f"Member on {m.project.name}: {m.role}",
                extra={
                    "assignee_id": str(m.user_id),
                    "assignee_email": m.user.email,
                    "member_role": m.role,
                },
            )

    tasks = Task.objects.filter(project__team_id=team_id).select_related("project", "assignee")
    if project_id:
        tasks = tasks.filter(project_id=project_id)
    if assignee_id:
        tasks = tasks.filter(assignee_id=assignee_id)
    if status:
        tasks = tasks.filter(status=status)
    if date_from:
        tasks = tasks.filter(Q(end_date__gte=date_from) | Q(start_date__gte=date_from))
    if date_to:
        tasks = tasks.filter(Q(start_date__lte=date_to) | Q(end_date__lte=date_to))

    if kinds is None or "task" in kinds:
        for t in tasks.filter(
            Q(title__icontains=q)
            | Q(description__icontains=q)
            | Q(status__icontains=q)
            | Q(priority__icontains=q)
        )[:limit]:
            assignee = t.assignee.email if t.assignee else "Unassigned"
            snippet = (
                f"{t.title} | {t.status} | {assignee} | "
                f"{t.start_date or '?'} → {t.end_date or '?'}"
            )
            add_hit(
                project=t.project,
                source_kind="task",
                source_ref_id=str(t.id),
                title=t.title,
                snippet=snippet,
                extra={
                    "task_status": t.status,
                    "task_priority": t.priority,
                    "start_date": t.start_date.isoformat() if t.start_date else None,
                    "end_date": t.end_date.isoformat() if t.end_date else None,
                    "assignee_id": str(t.assignee_id) if t.assignee_id else None,
                    "assignee_email": assignee if t.assignee else None,
                },
            )

    milestones = Milestone.objects.filter(project__team_id=team_id).select_related("project")
    if project_id:
        milestones = milestones.filter(project_id=project_id)
    if status:
        milestones = milestones.filter(status=status)
    if date_from:
        milestones = milestones.filter(
            Q(target_date__gte=date_from) | Q(target_date__isnull=True)
        )
    if date_to:
        milestones = milestones.filter(
            Q(target_date__lte=date_to) | Q(target_date__isnull=True)
        )

    if kinds is None or "milestone" in kinds:
        for m in milestones.filter(
            Q(title__icontains=q) | Q(description__icontains=q) | Q(status__icontains=q)
        )[:limit]:
            add_hit(
                project=m.project,
                source_kind="milestone",
                source_ref_id=str(m.id),
                title=m.title,
                snippet=f"{m.title} | {m.status} | target {m.target_date or 'TBD'}",
                extra={
                    "milestone_status": m.status,
                    "target_date": m.target_date.isoformat() if m.target_date else None,
                },
            )

    # Match ISO dates in query against task/milestone schedules
    date_match = re.search(r"\d{4}-\d{2}-\d{2}", q)
    if date_match and (kinds is None or "task" in kinds):
        try:
            d = date.fromisoformat(date_match.group(0))
            for t in tasks.filter(
                Q(start_date=d) | Q(end_date=d) | Q(start_date__lte=d, end_date__gte=d)
            )[:limit]:
                assignee = t.assignee.email if t.assignee else "Unassigned"
                add_hit(
                    project=t.project,
                    source_kind="task",
                    source_ref_id=str(t.id),
                    title=t.title,
                    snippet=f"Scheduled on {d}: {t.title} ({assignee})",
                    extra={
                        "task_status": t.status,
                        "start_date": t.start_date.isoformat() if t.start_date else None,
                        "end_date": t.end_date.isoformat() if t.end_date else None,
                        "matched_date": d.isoformat(),
                    },
                )
        except ValueError:
            pass

    return hits


def _semantic_hits(
    team_id: str,
    query: str,
    limit: int,
    *,
    kinds: frozenset[str] | None = None,
    project_id: str | None = None,
    team=None,
    expand: bool = False,
) -> dict[str, dict[str, Any]]:
    queries = expand_search_queries(query, team) if expand and team else [query]
    per_entity: dict[str, dict[str, Any]] = {}
    chunk_limit = max(limit * 4, 20)

    for q in queries:
        if not (q or "").strip():
            continue
        try:
            results = vector_store.search_similar_pages(team_id, q, limit=chunk_limit)
        except Exception:
            logger.exception("semantic plan search failed team_id=%s", team_id)
            continue

        for res in results:
            payload = res.payload or {}
            if payload.get("source_type") != "plan":
                continue
            pid = payload.get("project_id")
            if not pid:
                continue
            if project_id and pid != project_id:
                continue

            source_kind = payload.get("source_kind") or "project"
            ref_id = payload.get("source_ref_id")
            if not _kind_allowed(source_kind, kinds):
                continue

            key = _hit_key(pid, source_kind, ref_id)
            score = float(getattr(res, "score", 0) or 0) * _SEMANTIC_WEIGHT
            snippet = _truncate_snippet(payload.get("content") or "")
            title = payload.get("title") or payload.get("project_name") or "Plan item"

            existing = per_entity.get(key)
            if existing is None or score > existing["score"]:
                per_entity[key] = {
                    "project_id": pid,
                    "project_name": payload.get("project_name") or "",
                    "source_kind": source_kind,
                    "source_ref_id": ref_id,
                    "title": title.replace("Task: ", "").replace("Milestone: ", ""),
                    "score": score,
                    "snippet": snippet,
                    "match": "semantic",
                }

    if not per_entity:
        return {}

    project_names = {
        str(p.id): p.name
        for p in Project.objects.filter(
            id__in={h["project_id"] for h in per_entity.values()}, team_id=team_id
        )
    }
    for hit in per_entity.values():
        hit["project_name"] = project_names.get(hit["project_id"], hit.get("project_name") or "")

    return per_entity


def search_planning(
    team_id: str,
    query: str,
    *,
    limit: int = 20,
    mode: str = "hybrid",
    expand_queries: bool = False,
    team=None,
    source_kinds: list[str] | None = None,
    project_id: str | None = None,
    assignee_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = None,
) -> list[dict[str, Any]]:
    """
    Search projects, tasks, milestones, and members.
    Returns ranked hits with project_id, source_kind, source_ref_id, score, snippet, match.
    """
    q = (query or "").strip()
    if not q:
        return []

    limit = min(max(int(limit or 20), 1), 40)
    mode = (mode or "hybrid").lower()
    if mode not in ("hybrid", "semantic", "keyword"):
        mode = "hybrid"

    kinds: frozenset[str] | None = None
    if source_kinds:
        kinds = frozenset(k for k in source_kinds if k in _VALID_KINDS)
        if not kinds:
            kinds = None

    d_from = _parse_date(date_from)
    d_to = _parse_date(date_to)
    merged: dict[str, dict[str, Any]] = {}

    if mode in ("hybrid", "keyword"):
        for key, hit in _keyword_hits(
            team_id,
            q,
            limit,
            kinds=kinds,
            project_id=project_id,
            assignee_id=assignee_id,
            date_from=d_from,
            date_to=d_to,
            status=(status or "").strip() or None,
        ).items():
            merged[key] = hit

    if mode in ("hybrid", "semantic"):
        for key, hit in _semantic_hits(
            team_id,
            q,
            limit,
            kinds=kinds,
            project_id=project_id,
            team=team if expand_queries else None,
            expand=expand_queries,
        ).items():
            if key in merged:
                row = merged[key]
                row["score"] = max(row["score"], hit["score"]) + _BOTH_BOOST
                row["snippet"] = hit["snippet"] or row["snippet"]
                row["match"] = "both"
            else:
                merged[key] = hit

    rows = sorted(merged.values(), key=lambda r: (-r["score"], r.get("project_name", ""), r["title"]))
    out: list[dict[str, Any]] = []
    for r in rows[:limit]:
        out.append(
            {
                "project_id": r["project_id"],
                "project_name": r["project_name"],
                "source_kind": r["source_kind"],
                "source_ref_id": r.get("source_ref_id"),
                "title": r["title"],
                "score": round(float(r["score"]), 4),
                "snippet": r["snippet"],
                "match": r["match"],
                **{k: v for k, v in r.items() if k.startswith(("task_", "milestone_", "assignee_", "member_", "target_", "start_", "end_", "matched_", "project_status"))},
            }
        )
    return out


_RESOLVE_MIN_SCORE = 0.35
_RESOLVE_MIN_GAP = 0.08


def _pick_best(
    candidates: list[dict[str, Any]],
    *,
    kind: str | None = None,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]], str | None]:
    filtered = [c for c in candidates if c.get("source_kind") == kind] if kind else candidates
    if not filtered:
        return None, candidates, "plan_entity_not_found"
    top = filtered[0]
    second = filtered[1]["score"] if len(filtered) > 1 else 0.0
    if top["score"] < _RESOLVE_MIN_SCORE:
        return None, filtered, "plan_resolve_low_confidence"
    if len(filtered) > 1 and (top["score"] - second) < _RESOLVE_MIN_GAP:
        return None, filtered, "plan_resolve_ambiguous"
    return top, filtered, None


def resolve_plan_project(
    team_id: str,
    query: str,
    *,
    team=None,
    limit: int = 5,
) -> tuple[Project | None, list[dict[str, Any]], str | None]:
    """Resolve a project from natural language (name, description, topic)."""
    candidates = search_planning(
        team_id,
        query,
        limit=limit,
        mode="hybrid",
        source_kinds=["project"],
    )
    hit, shown, err = _pick_best(candidates, kind="project")
    if err:
        return None, shown, err
    try:
        project = Project.objects.get(id=hit["project_id"], team_id=team_id)
    except Project.DoesNotExist:
        return None, shown, "project_not_found"
    return project, shown, None


def resolve_plan_task(
    team_id: str,
    query: str,
    *,
    project_id: str | None = None,
    team=None,
    limit: int = 5,
) -> tuple[Task | None, list[dict[str, Any]], str | None]:
    """Resolve a task from natural language; optional project_id scopes disambiguation."""
    candidates = search_planning(
        team_id,
        query,
        limit=limit,
        mode="hybrid",
        source_kinds=["task"],
        project_id=project_id,
    )
    task_hits = [c for c in candidates if c.get("source_kind") == "task" and c.get("source_ref_id")]
    hit, shown, err = _pick_best(task_hits)
    if err:
        return None, shown or candidates, err
    try:
        task = Task.objects.select_related("project").get(
            id=hit["source_ref_id"],
            project__team_id=team_id,
        )
        if project_id and str(task.project_id) != project_id:
            return None, shown, "task_not_in_project"
    except Task.DoesNotExist:
        return None, shown, "task_not_found"
    return task, shown, None


def resolve_plan_milestone(
    team_id: str,
    query: str,
    *,
    project_id: str | None = None,
    team=None,
    limit: int = 5,
) -> tuple[Milestone | None, list[dict[str, Any]], str | None]:
    """Resolve a milestone from natural language."""
    candidates = search_planning(
        team_id,
        query,
        limit=limit,
        mode="hybrid",
        source_kinds=["milestone"],
        project_id=project_id,
    )
    ms_hits = [c for c in candidates if c.get("source_kind") == "milestone" and c.get("source_ref_id")]
    hit, shown, err = _pick_best(ms_hits)
    if err:
        return None, shown or candidates, err
    try:
        milestone = Milestone.objects.select_related("project").get(
            id=hit["source_ref_id"],
            project__team_id=team_id,
        )
        if project_id and str(milestone.project_id) != project_id:
            return None, shown, "milestone_not_in_project"
    except Milestone.DoesNotExist:
        return None, shown, "milestone_not_found"
    return milestone, shown, None


# Plain-language status → canonical task/milestone status
TASK_STATUS_ALIASES: dict[str, str] = {
    "done": "completed",
    "complete": "completed",
    "completed": "completed",
    "achieved": "completed",
    "finished": "completed",
    "shipped": "completed",
    "todo": "todo",
    "to-do": "todo",
    "pending": "todo",
    "in progress": "in-progress",
    "in-progress": "in-progress",
    "in_progress": "in-progress",
    "working": "in-progress",
    "started": "in-progress",
    "blocked": "blocked",
    "stuck": "blocked",
}

MILESTONE_STATUS_ALIASES: dict[str, str] = {
    "done": "reached",
    "complete": "reached",
    "completed": "reached",
    "achieved": "reached",
    "reached": "reached",
    "hit": "reached",
    "pending": "pending",
    "missed": "missed",
    "late": "missed",
}


def normalize_task_status(value: str | None) -> str | None:
    if value is None:
        return None
    key = str(value).strip().lower()
    return TASK_STATUS_ALIASES.get(key, str(value).strip())


def normalize_milestone_status(value: str | None) -> str | None:
    if value is None:
        return None
    key = str(value).strip().lower()
    return MILESTONE_STATUS_ALIASES.get(key, str(value).strip())
