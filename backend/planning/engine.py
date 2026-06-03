"""
Unified Planning Engine.

Combines the multi-stage reasoning pipeline (reasoning_pipeline.py)
with atomic database entity creation, conflict auto-resolution, risk
assessment, and wiki synchronization.

Can be run synchronously (consuming the generator) or streamed via SSE.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from accounts.models import Team, TeamMember, User
from planning.models import Project, Task, Milestone
from planning.services import (
    create_milestone,
    create_project,
    create_task,
    get_project_or_none,
    add_project_member,
    remove_project_member,
    update_milestone,
    update_project,
    update_task,
)
from planning.agent_sync import (
    check_overdue_items,
    detect_date_conflicts,
    sync_project_to_wiki,
)
from llm_orchestrator.orchestrator import llm_json_call

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict[str, Any]) -> str:
    """Format a single SSE event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _item_id(data: dict[str, Any]) -> str | None:
    value = data.get("id") or data.get("task_id") or data.get("taskId") or data.get("milestone_id") or data.get("milestoneId")
    return str(value) if value else None


def _title_key(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _should_create_in_manage(data: dict[str, Any], has_existing_items: bool) -> bool:
    if not has_existing_items:
        return True
    action = str(data.get("action") or data.get("operation") or "").strip().lower()
    return action in {"create", "add", "new"} or data.get("is_new") is True or data.get("isNew") is True


def _team_user_ids(team: Team) -> set[str]:
    return {
        str(user_id)
        for user_id in TeamMember.objects.filter(team=team).values_list("user_id", flat=True)
    }


def _resolve_team_user_id(data: dict[str, Any], valid_user_ids: set[str]) -> str | None:
    value = data.get("assignee_id") or data.get("assigneeId") or data.get("user_id") or data.get("userId")
    if value and str(value) in valid_user_ids:
        return str(value)
    return None


def _sanitize_date(date_str: str | None, fallback: str | None = None) -> str | None:
    """Reject dates before 2026-05-01; return fallback or today's date if invalid/stale."""
    from django.utils import timezone
    today_str = timezone.now().strftime("%Y-%m-%d")
    if not date_str:
        return fallback or today_str
    try:
        from datetime import date as _date
        parsed = _date.fromisoformat(str(date_str)[:10])
        cutoff = _date(2026, 5, 1)
        if parsed < cutoff:
            logger.warning("Rejected stale date %s (before cutoff)", date_str)
            # Try to map the year to 2026
            try:
                mapped = parsed.replace(year=2026)
                if mapped >= cutoff:
                    return str(mapped)
            except ValueError:
                pass
            return fallback or today_str
        return str(parsed)
    except (ValueError, TypeError):
        logger.warning("Unparseable date %s", date_str)
        return fallback or today_str


def _is_valid_uuid(val: Any) -> bool:
    if not val:
        return False
    import uuid
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False


def _apply_project_members(
    *,
    project: Project,
    members_data: list[dict[str, Any]],
    valid_user_ids: set[str],
) -> int:
    changed = 0
    for member_data in members_data:
        if not isinstance(member_data, dict):
            continue
        user_id = _resolve_team_user_id(member_data, valid_user_ids)
        if not user_id:
            continue
        try:
            member_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            continue

        if member_data.get("remove") is True:
            remove_project_member(project=project, user=member_user)
            changed += 1
            continue

        role = member_data.get("role") or member_data.get("project_role") or member_data.get("projectRole") or "Contributor"
        add_project_member(project=project, user=member_user, role=str(role)[:100])
        changed += 1
    return changed


def _assess_plan_risk(
    team: Team,
    draft: dict[str, Any],
    conflicts: list[dict[str, Any]],
) -> dict[str, Any]:
    """Use LLM to assess timeline risk for the plan."""
    tasks_summary = []
    for t in draft.get("tasks", [])[:10]:
        tasks_summary.append({
            "title": t.get("title"),
            "priority": t.get("priority"),
            "start": t.get("startDate") or t.get("start_date"),
            "end": t.get("endDate") or t.get("end_date"),
        })

    prompt = (
        f"Assess the timeline risk for this project plan:\n"
        f"Project: {draft.get('projectName', 'Untitled')}\n"
        f"Tasks: {json.dumps(tasks_summary)}\n"
        f"Conflicts detected: {len(conflicts)}\n"
        f"Total tasks: {len(draft.get('tasks', []))}\n"
        f"Total milestones: {len(draft.get('milestones', []))}\n\n"
        f"Return JSON with: score (0-100, higher=riskier), factors (list of risk factor strings), "
        f"suggestions (list of mitigation suggestions). Return ONLY valid JSON."
    )

    result = llm_json_call(
        team=team,
        operation="plan_risk_assessment",
        messages=[
            {"role": "system", "content": "You are a project risk analyst. Assess timeline feasibility and return structured JSON."},
            {"role": "user", "content": prompt},
        ],
        default_on_error={"score": 50, "factors": ["Assessment failed"], "suggestions": ["Review manually"]},
    )

    score = result.get("score", 50)
    try:
        normalized_score = max(0, min(100, int(score)))
    except (TypeError, ValueError):
        normalized_score = 50
    factors = result.get("factors", [])
    suggestions = result.get("suggestions", [])
    if not isinstance(factors, list):
        factors = []
    if not isinstance(suggestions, list):
        suggestions = []

    return {
        "score": normalized_score,
        "factors": [str(f) for f in factors],
        "suggestions": [str(s) for s in suggestions],
    }


def _auto_resolve_conflicts(
    team: Team,
    project_id: str,
    conflicts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Use LLM to suggest new dates for conflicting tasks to resolve them."""
    prompt = (
        f"You are an AI Project Manager. The current project schedule has {len(conflicts)} conflicts.\n"
        f"Conflicts: {json.dumps(conflicts)}\n\n"
        f"Resolve these by shifting the start_date and end_date of the overlapping tasks so they no longer overlap. "
        f"Return a JSON array of task objects that need to be updated. "
        f"Each object must have 'id' (the UUID of the task), 'start_date' (YYYY-MM-DD), and 'end_date' (YYYY-MM-DD). "
        f"Return ONLY the JSON array."
    )

    result = llm_json_call(
        team=team,
        operation="plan_auto_resolve",
        messages=[
            {"role": "system", "content": "You are a master scheduler. Fix conflicts and return JSON array."},
            {"role": "user", "content": prompt},
        ],
        default_on_error=[],
    )

    if isinstance(result, list):
        return result
    elif isinstance(result, dict) and "tasks" in result:
        return result["tasks"]
    return []


class PlanningEngine:
    """
    Core engine that unifies planning reasoning and atomic DB mutations.
    """

    def __init__(self, team: Team, user: User):
        self.team = team
        self.user = user
        self.team_id = str(team.id)

    def run(
        self,
        prompt: str,
        mode: str = "create",
        project_id: str | None = None,
        project_context: dict | None = None,
        chat_history: list[dict] | None = None,
    ) -> Iterator[str]:
        """
        Runs the full 6-stage reasoning pipeline, then performs DB operations,
        conflict resolution, risk assessment, and wiki sync.

        Yields SSE-compatible string lines.
        """
        if mode == "manage":
            yield from self._run_manage(prompt, project_id=project_id, project_context=project_context, chat_history=chat_history)
            return

        from planning.reasoning_pipeline import PlanningReasoningPipeline
        from django.db import transaction

        pipeline = PlanningReasoningPipeline(team=self.team, user=self.user)
        draft_data = None

        # ── Step 1: Run Multi-stage reasoning pipeline ────────────────
        has_asked_user = False
        for event in pipeline.run(prompt, mode=mode, project_context=project_context, chat_history=chat_history):
            yield event
            if "ask_user" in event:
                has_asked_user = True
            if "reasoning_done" in event:
                try:
                    data_line = event.split("data: ", 1)[1].strip()
                    draft_data = json.loads(data_line)
                except Exception:
                    pass

        if has_asked_user:
            return

        if not draft_data:
            yield _sse("agent_error", {"detail": "Reasoning pipeline did not produce a valid plan."})
            return

        # ── Step 2: Create/Update Project & Tasks & Milestones ────────
        created_project_id = project_id
        valid_user_ids = _team_user_ids(self.team)
        tasks_data = draft_data.get("tasks", [])
        milestones_data = draft_data.get("milestones", [])

        # Run project creation in an atomic transaction to ensure integrity
        # (yield SSE events outside the transaction to avoid phantom progress on rollback)
        try:
            if mode == "create":
                yield _sse("agent_status", {"status": "Creating project..."})
                with transaction.atomic():
                    project_obj = create_project(
                        team_id=self.team_id,
                        user=self.user,
                        payload={
                            "name": draft_data.get("projectName", "New Project"),
                            "description": draft_data.get("description", ""),
                            "status": "active",
                        },
                    )
                    created_project_id = str(project_obj.id)
                    member_count = _apply_project_members(
                        project=project_obj,
                        members_data=draft_data.get("members", []),
                        valid_user_ids=valid_user_ids,
                    )
                yield _sse("agent_step", {"name": "plan_create_project", "arguments": json.dumps({"name": project_obj.name})})
                yield _sse("agent_result", {"name": "plan_create_project", "ok": True, "result": {"project_id": created_project_id}})
                if member_count:
                    yield _sse("agent_step", {"name": "plan_assign_project_roles", "arguments": json.dumps({"project_id": created_project_id})})
                    yield _sse("agent_result", {"name": "plan_assign_project_roles", "ok": True, "result": {"member_count": member_count}})

            else:
                yield _sse("agent_error", {"detail": f"Unsupported mode: {mode}"})
                return

            # Create or update tasks (two-pass: create all first, then resolve dependencies)
            if tasks_data:
                existing_tasks = list(project_obj.tasks.all())
                tasks_by_title: dict[str, Task] = {_title_key(t.title): t for t in existing_tasks}
                tasks_by_id: dict[str, Task] = {str(t.id): t for t in existing_tasks}

                # Track deferred dependencies: task_index -> list of upstream indices
                deferred_deps: dict[int, list[int]] = {}
                # Map original task index -> created Task object
                index_to_task: dict[int, Task] = {}

                # Pass 1: Create/update all tasks without dependencies
                for idx, t_data in enumerate(tasks_data):
                    title = t_data.get("title", "Untitled Task")
                    existing_task = None
                    if mode == "manage":
                        existing_task = tasks_by_id.get(_item_id(t_data) or "") or tasks_by_title.get(_title_key(title))
                    will_create = mode == "create" or (
                        existing_task is None and _should_create_in_manage(t_data, bool(existing_tasks))
                    )
                    if mode == "manage" and existing_task is None and not will_create:
                        yield _sse("agent_step", {"name": "plan_skip_task", "arguments": json.dumps({"title": title})})
                        yield _sse("agent_result", {"name": "plan_skip_task", "ok": True, "result": {"reason": "No matching existing task."}})
                        continue

                    verb = "Updating" if existing_task else "Creating"
                    yield _sse("agent_status", {"status": f"{verb} task {idx + 1}/{len(tasks_data)}: {title}"})
                    payload = {
                        "title": title,
                        "description": t_data.get("description", ""),
                        "status": t_data.get("status", "todo"),
                        "priority": t_data.get("priority", "medium"),
                        "assignee_id": _resolve_team_user_id(t_data, valid_user_ids),
                        "start_date": _sanitize_date(t_data.get("startDate") or t_data.get("start_date")),
                        "end_date": _sanitize_date(t_data.get("endDate") or t_data.get("end_date")),
                        "order_index": t_data.get("order_index", idx),
                    }
                    if payload["assignee_id"] is None:
                        payload.pop("assignee_id")

                    # Collect inferred/actual deps for deferred resolution (Pass 2)
                    raw_dep_ids = t_data.get("dependency_ids") or t_data.get("_inferred_deps")
                    if raw_dep_ids:
                        deferred_deps[idx] = raw_dep_ids

                    if existing_task:
                        task = existing_task
                        update_task(task, payload)
                        index_to_task[idx] = task
                        yield _sse("agent_step", {"name": "plan_update_task", "arguments": json.dumps({"title": task.title, "index": idx + 1, "total": len(tasks_data)})})
                        yield _sse("agent_result", {"name": "plan_update_task", "ok": True, "result": {"task_id": str(task.id), "title": task.title}})
                    else:
                        task = create_task(project=project_obj, user=self.user, payload=payload)
                        existing_tasks.append(task)
                        tasks_by_id[str(task.id)] = task
                        tasks_by_title[_title_key(task.title)] = task
                        index_to_task[idx] = task
                        yield _sse("agent_step", {"name": "plan_create_task", "arguments": json.dumps({"title": task.title, "index": idx + 1, "total": len(tasks_data)})})
                        yield _sse("agent_result", {"name": "plan_create_task", "ok": True, "result": {"task_id": str(task.id), "title": task.title}})

                # Pass 2: Resolve deferred dependencies using index_to_task map or direct UUIDs
                for task_idx, raw_dep_ids in deferred_deps.items():
                    task = index_to_task.get(task_idx)
                    if not task:
                        continue
                    resolved_uuids = []
                    dep_list = []
                    if isinstance(raw_dep_ids, (list, tuple, set)):
                        dep_list = list(raw_dep_ids)
                    elif isinstance(raw_dep_ids, str):
                        if "," in raw_dep_ids:
                            dep_list = [item.strip() for item in raw_dep_ids.split(",")]
                        else:
                            dep_list = [raw_dep_ids.strip()]
                    elif raw_dep_ids is not None:
                        dep_list = [raw_dep_ids]

                    for d in dep_list:
                        if not d and d != 0:
                            continue
                        d_str = str(d).strip()
                        if d_str.lstrip("-").isdigit():
                            up_idx = int(d_str)
                            upstream_task = index_to_task.get(up_idx)
                            if upstream_task and str(upstream_task.id) != str(task.id):
                                resolved_uuids.append(str(upstream_task.id))
                        else:
                            if _is_valid_uuid(d_str):
                                resolved_uuids.append(str(d_str))
                    if resolved_uuids:
                        try:
                            task.dependencies.set(resolved_uuids)
                        except Exception:
                            logger.warning("Failed to set dependencies for task %s", task.id)

            # Create or update milestones
            if milestones_data:
                existing_milestones = list(project_obj.milestones.all())
                ms_by_title: dict[str, Milestone] = {_title_key(m.title): m for m in existing_milestones}
                ms_by_id: dict[str, Milestone] = {str(m.id): m for m in existing_milestones}

                for idx, m_data in enumerate(milestones_data):
                    m_title = m_data.get("title", "Untitled")
                    existing_milestone = None
                    if mode == "manage":
                        existing_milestone = ms_by_id.get(_item_id(m_data) or "") or ms_by_title.get(_title_key(m_title))
                    will_create = mode == "create" or (
                        existing_milestone is None and _should_create_in_manage(m_data, bool(existing_milestones))
                    )
                    if mode == "manage" and existing_milestone is None and not will_create:
                        yield _sse("agent_step", {"name": "plan_skip_milestone", "arguments": json.dumps({"title": m_title})})
                        yield _sse("agent_result", {"name": "plan_skip_milestone", "ok": True, "result": {"reason": "No matching existing milestone."}})
                        continue

                    if existing_milestone:
                        milestone = existing_milestone
                        update_milestone(
                            milestone,
                            {
                                "title": m_title,
                                "description": m_data.get("description", ""),
                                "status": m_data.get("status", milestone.status),
                                "target_date": _sanitize_date(m_data.get("date") or m_data.get("target_date")),
                                "order_index": idx,
                            },
                        )
                        yield _sse("agent_step", {"name": "plan_update_milestone", "arguments": json.dumps({"title": milestone.title})})
                        yield _sse("agent_result", {"name": "plan_update_milestone", "ok": True, "result": {"milestone_id": str(milestone.id)}})
                    else:
                        milestone = create_milestone(
                            project=project_obj,
                            user=self.user,
                            payload={
                                "title": m_title,
                                "description": m_data.get("description", ""),
                                "status": "pending",
                                "target_date": _sanitize_date(m_data.get("date") or m_data.get("target_date")),
                                "order_index": idx,
                            },
                        )
                        existing_milestones.append(milestone)
                        ms_by_id[str(milestone.id)] = milestone
                        ms_by_title[_title_key(milestone.title)] = milestone
                        yield _sse("agent_step", {"name": "plan_create_milestone", "arguments": json.dumps({"title": milestone.title})})
                        yield _sse("agent_result", {"name": "plan_create_milestone", "ok": True, "result": {"milestone_id": str(milestone.id)}})

        except Exception as e:
            logger.exception("Database mutations failed in pipeline")
            yield _sse("agent_error", {"detail": f"Database creation failed: {e}"})
            return

        # ── Step 3: Conflict detection & Auto-resolution ──────────────
        yield _sse("agent_status", {"status": "Detecting scheduling conflicts..."})
        conflicts = []
        try:
            from planning.remediation import remediate_project

            conflicts = detect_date_conflicts(self.team_id, project_id=created_project_id)
            yield _sse("agent_step", {"name": "plan_detect_conflicts", "arguments": "{}"})
            yield _sse("agent_result", {"name": "plan_detect_conflicts", "ok": True, "result": {"conflict_count": len(conflicts), "conflicts": conflicts[:5]}})

            if conflicts and created_project_id:
                yield _sse("agent_status", {"status": f"Auto-resolving {len(conflicts)} conflicts..."})
                project_for_remediation = get_project_or_none(team_id=self.team_id, project_id=created_project_id)
                if project_for_remediation:
                    remediation = remediate_project(
                        team=self.team,
                        project=project_for_remediation,
                        apply_conflicts=True,
                        apply_risk=False,
                    )
                    conflicts = detect_date_conflicts(self.team_id, project_id=created_project_id)
                    yield _sse("agent_step", {"name": "plan_auto_resolve", "arguments": json.dumps({"resolved_count": remediation.get("conflict_resolved_count", 0)})})
                    yield _sse("agent_result", {"name": "plan_auto_resolve", "ok": True, "result": remediation})
        except Exception as e:
            logger.exception("Conflict resolution failed")

        # ── Step 5: Risk Assessment ───────────────────────────────────
        yield _sse("agent_status", {"status": "Assessing timeline risk..."})
        risk = {"score": 0, "factors": [], "suggestions": []}
        try:
            from planning.remediation import assess_project_risk

            project_for_risk = get_project_or_none(team_id=self.team_id, project_id=created_project_id) if created_project_id else None
            risk = assess_project_risk(self.team, project_for_risk, conflicts) if project_for_risk else _assess_plan_risk(self.team, draft_data, conflicts)
            yield _sse("agent_step", {"name": "plan_risk_assessment", "arguments": "{}"})
            yield _sse("agent_result", {"name": "plan_risk_assessment", "ok": True, "result": risk})
        except Exception:
            logger.exception("Risk assessment failed")

        # ── Step 6: Wiki sync ─────────────────────────────────────────
        yield _sse("agent_status", {"status": "Syncing project details to Wiki..."})
        wiki_page_url = None
        try:
            if created_project_id:
                project_obj = get_project_or_none(team_id=self.team_id, project_id=created_project_id)
                if project_obj:
                    page = sync_project_to_wiki(project_obj)
                    if page:
                        wiki_page_url = f"/wiki?page={page.slug}"
                    yield _sse("agent_step", {"name": "plan_sync_wiki", "arguments": "{}"})
                    yield _sse("agent_result", {"name": "plan_sync_wiki", "ok": True, "result": {"wiki_slug": page.slug if page else None}})
        except Exception:
            logger.exception("Wiki sync failed")

        # ── Step 7: Check Overdue ─────────────────────────────────────
        overdue_count = 0
        try:
            overdue_data = check_overdue_items(self.team_id)
            overdue_count = len(overdue_data.get("overdue_tasks", []))
        except Exception:
            logger.exception("Overdue check failed")

        # ── Step 8: Final complete response (before slow reindex) ─────
        yield _sse("agent_done", {
            "project_id": created_project_id,
            "project_name": draft_data.get("projectName", ""),
            "description": draft_data.get("description", ""),
            "task_count": len(tasks_data),
            "milestone_count": len(milestones_data),
            "conflict_count": len(conflicts),
            "conflicts": conflicts[:5],
            "risk": risk,
            "wiki_page_url": wiki_page_url,
            "overdue_count": overdue_count,
            "knowledge_gaps": draft_data.get("knowledge_gaps", []),
            "reasoning_traces": draft_data.get("reasoning_traces", []),
            "critique_score": draft_data.get("critique_score", 0),
            "critique_suggestions": draft_data.get("critique_suggestions", []),
            "domain": draft_data.get("domain", "general"),
            "sub_domain": draft_data.get("sub_domain", "software"),
        })

        # ── Step 9: Reindex (deferred — embeddings can take 30s+) ─────
        if created_project_id:
            yield _sse("agent_status", {"status": "Updating search index..."})
            try:
                from planning.reindex import reindex_project

                project_obj = get_project_or_none(team_id=self.team_id, project_id=created_project_id)
                if project_obj:
                    reindex_project(project_obj)
                yield _sse("agent_step", {"name": "plan_reindex", "arguments": "{}"})
                yield _sse("agent_result", {"name": "plan_reindex", "ok": True, "result": {"project_id": created_project_id}})
            except Exception:
                logger.exception("Reindex failed")
                yield _sse("agent_result", {"name": "plan_reindex", "ok": False, "result": {"error": "reindex_failed"}})

    def _run_manage(
        self,
        prompt: str,
        *,
        project_id: str | None,
        project_context: dict | None,
        chat_history: list[dict] | None = None,
    ) -> Iterator[str]:
        from django.db import transaction
        from planning.manage_update_pipeline import ManageUpdatePipeline
        from planning.mutations import split_mutations_by_policy, validate_mutations
        from planning.plan_apply import apply_plan_mutations
        from planning.reconciliation import enrich_mutations_with_resolution
        from planning.services import get_plan_mutation_context
        from planning.version_services import create_changeset, create_plan_version

        if not project_id:
            yield _sse("agent_error", {"detail": "manage mode requires project_id."})
            return

        project_obj = get_project_or_none(team_id=self.team_id, project_id=str(project_id))
        if not project_obj:
            yield _sse("agent_error", {"detail": "Project not found."})
            return

        ctx = project_context or get_plan_mutation_context(project_obj)
        auto_apply_safe = getattr(self.team, "plan_auto_apply_safe", True)

        base_version = create_plan_version(project_obj, user=self.user, source="auto", prompt=prompt)
        yield _sse("agent_step", {"name": "plan_version_created", "arguments": json.dumps({"version_id": str(base_version.id)})})
        yield _sse("agent_result", {"name": "plan_version_created", "ok": True, "result": {"version_id": str(base_version.id)}})

        draft_data = None
        pipeline = ManageUpdatePipeline(team=self.team, user=self.user)
        has_asked_user = False
        for event in pipeline.run(prompt, project_context=ctx, chat_history=chat_history):
            yield event
            if "ask_user" in event:
                has_asked_user = True
            if "reasoning_done" in event:
                try:
                    data_line = event.split("data: ", 1)[1].strip()
                    draft_data = json.loads(data_line)
                except Exception:
                    pass

        if has_asked_user:
            return

        if not draft_data:
            yield _sse("agent_error", {"detail": "Manage pipeline did not produce mutations."})
            return

        raw_mutations = draft_data.get("mutations", [])
        mutations = enrich_mutations_with_resolution(project_obj, raw_mutations)
        validation = validate_mutations(project_obj, mutations)
        if not validation.ok:
            yield _sse("agent_error", {"detail": "Mutation validation failed.", "errors": validation.errors})
            return

        auto_ops, pending_ops = split_mutations_by_policy(
            project_obj, mutations, auto_apply_safe=auto_apply_safe
        )

        applied_result: dict[str, Any] = {"applied": [], "skipped": []}
        try:
            with transaction.atomic():
                if auto_ops:
                    applied_result = apply_plan_mutations(
                        project_obj,
                        auto_ops,
                        actor=self.user,
                        auto_apply_safe=True,
                    )
                    yield _sse("agent_step", {"name": "plan_mutations_auto_applied", "arguments": "{}"})
                    yield _sse(
                        "agent_result",
                        {
                            "name": "plan_mutations_auto_applied",
                            "ok": True,
                            "result": applied_result,
                        },
                    )
        except Exception as e:
            logger.exception("Manage-mode auto-apply failed")
            yield _sse("agent_error", {"detail": f"Auto-apply failed: {e}"})
            return

        remediation_preview: dict[str, Any] = {}
        conflicts: list[dict[str, Any]] = []
        try:
            from planning.remediation import remediate_project

            conflicts = detect_date_conflicts(self.team_id, project_id=str(project_obj.id))
            remediation_preview = remediate_project(
                team=self.team,
                project=project_obj,
                apply_conflicts=False,
                apply_risk=False,
            )
        except Exception:
            logger.exception("Remediation preview failed")

        changeset = create_changeset(
            project_obj,
            base_version=base_version,
            mutations=mutations,
            impact_summary=validation.impact_summary,
            auto_applied=applied_result.get("applied", []),
            pending_mutations=pending_ops,
            user=self.user,
            remediation_preview=remediation_preview,
        )

        if pending_ops:
            yield _sse(
                "plan_changeset_ready",
                {
                    "changeset_id": str(changeset.id),
                    "status": changeset.status,
                    "pending_count": len(pending_ops),
                    "impact_summary": validation.impact_summary,
                    "conflicts_preview": conflicts[:5],
                },
            )
            for op in pending_ops[:20]:
                yield _sse("plan_mutation_pending", {"mutation": op})
        else:
            yield _sse("plan_mutation_applied", {"changeset_id": str(changeset.id), "status": "approved"})

        created_project_id = str(project_obj.id)
        yield from self._post_process_manage(
            project_id=created_project_id,
            draft_data=draft_data,
            conflicts=conflicts,
            changeset=changeset,
            reindex_ok=not pending_ops,
        )

    def _post_process_manage(
        self,
        *,
        project_id: str,
        draft_data: dict[str, Any],
        conflicts: list[dict[str, Any]],
        changeset,
        reindex_ok: bool,
    ) -> Iterator[str]:
        risk = {"score": 0, "factors": [], "suggestions": []}
        try:
            from planning.remediation import assess_project_risk

            project_for_risk = get_project_or_none(team_id=self.team_id, project_id=project_id)
            risk = assess_project_risk(self.team, project_for_risk, conflicts) if project_for_risk else _assess_plan_risk(self.team, draft_data, conflicts)
            yield _sse("agent_step", {"name": "plan_risk_assessment", "arguments": "{}"})
            yield _sse("agent_result", {"name": "plan_risk_assessment", "ok": True, "result": risk})
        except Exception:
            logger.exception("Risk assessment failed")

        wiki_page_url = None
        try:
            project_obj = get_project_or_none(team_id=self.team_id, project_id=project_id)
            if project_obj:
                page = sync_project_to_wiki(project_obj)
                if page:
                    wiki_page_url = f"/wiki?page={page.slug}"
        except Exception:
            logger.exception("Wiki sync failed")

        yield _sse("agent_done", {
            "project_id": project_id,
            "project_name": draft_data.get("projectName", ""),
            "mode": "manage",
            "changeset_id": str(changeset.id),
            "changeset_status": changeset.status,
            "pending_mutation_count": len(changeset.pending_mutations or []),
            "conflict_count": len(conflicts),
            "risk": risk,
            "wiki_page_url": wiki_page_url,
        })

        if reindex_ok:
            yield _sse("agent_status", {"status": "Updating search index..."})
            try:
                from planning.reindex import reindex_project

                project_obj = get_project_or_none(team_id=self.team_id, project_id=project_id)
                if project_obj:
                    reindex_project(project_obj)
                yield _sse("agent_result", {"name": "plan_reindex", "ok": True, "result": {"project_id": project_id}})
            except Exception:
                logger.exception("Reindex failed")
                yield _sse("agent_result", {"name": "plan_reindex", "ok": False, "result": {"error": "reindex_failed"}})

def run_db_mutation_stage_langgraph(
    plan: dict,
    team_id: str,
    session_id: str,
    user: User,
    thread_id: str = None
) -> dict:
    from django.db import transaction
    from planning.services import create_project, create_task, create_milestone
    from accounts.models import Team

    team = Team.objects.get(id=team_id)
    valid_user_ids = _team_user_ids(team)
    
    with transaction.atomic():
        project_obj = create_project(
            team_id=team_id,
            user=user,
            payload={
                "name": plan.get("projectName", "New Project"),
                "description": plan.get("description", ""),
                "status": "active",
            },
        )
        if thread_id:
            project_obj.langgraph_thread_id = thread_id
            project_obj.save(update_fields=["langgraph_thread_id"])
            
        _apply_project_members(
            project=project_obj,
            members_data=plan.get("members", []),
            valid_user_ids=valid_user_ids,
        )
        
        index_to_task = {}
        deferred_deps = {}
        
        for idx, t_data in enumerate(plan.get("tasks", [])):
            payload = {
                "title": t_data.get("title", "Untitled Task"),
                "description": t_data.get("description", ""),
                "status": t_data.get("status", "todo"),
                "priority": t_data.get("priority", "medium"),
                "assignee_id": _resolve_team_user_id(t_data, valid_user_ids),
                "start_date": _sanitize_date(t_data.get("startDate") or t_data.get("start_date")),
                "end_date": _sanitize_date(t_data.get("endDate") or t_data.get("end_date")),
                "order_index": t_data.get("order_index", idx),
            }
            if not payload["assignee_id"]:
                payload.pop("assignee_id")
                
            task = create_task(project=project_obj, user=user, payload=payload)
            index_to_task[idx] = task
            
            raw_dep_ids = t_data.get("dependency_ids") or t_data.get("_inferred_deps")
            if raw_dep_ids:
                deferred_deps[idx] = raw_dep_ids
                
        for task_idx, raw_dep_ids in deferred_deps.items():
            task = index_to_task.get(task_idx)
            if not task:
                continue
            resolved_uuids = []
            dep_list = raw_dep_ids if isinstance(raw_dep_ids, list) else [raw_dep_ids]
            for d in dep_list:
                d_str = str(d).strip()
                if d_str.lstrip("-").isdigit():
                    up_idx = int(d_str)
                    upstream_task = index_to_task.get(up_idx)
                    if upstream_task and str(upstream_task.id) != str(task.id):
                        resolved_uuids.append(str(upstream_task.id))
            if resolved_uuids:
                task.dependencies.set(resolved_uuids)

        for idx, m_data in enumerate(plan.get("milestones", [])):
            payload = {
                "title": m_data.get("title", "Untitled"),
                "description": m_data.get("description", ""),
                "target_date": _sanitize_date(m_data.get("date") or m_data.get("target_date")),
                "order_index": idx,
            }
            create_milestone(project=project_obj, user=user, payload=payload)

    return {"project_id": str(project_obj.id)}
