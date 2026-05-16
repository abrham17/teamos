"""
Streaming agent executor for the planner overlay.

Runs a multi-step pipeline (draft → create project → create tasks → conflicts → risk → wiki sync)
and yields SSE events so the frontend can show real progress instead of fake thinking.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from accounts.models import Team, TeamMember, User
from chat.tools import ToolContext, execute_plan_tool, openai_plan_tool_schemas
from llm_orchestrator.orchestrator import llm_call, llm_json_call
from planning.agent_sync import (
    check_overdue_items,
    detect_date_conflicts,
    generate_plan_with_wiki_context,
    sync_project_to_wiki,
)
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

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 10
MAX_TOOLS_PER_REQUEST = 30

PLANNER_AGENT_SYSTEM = (
    "You are the TeamOS Plan Architect — a deep-reasoning agent that creates, updates, and validates project plans. "
    "You have deep access to the team's Wiki knowledge base. Use it to INFER requirements, dependencies, and risks even when not explicitly stated. "
    "Always synthesize information across multiple wiki snippets to ground your plan in the team's actual technical standards and past experiences.\n\n"
    "## Execution Protocol:\n"
    "1. When asked to CREATE a plan: use the retrieved context to INFER the project's scope, then call plan_generate_draft.\n"
    "2. When asked to MANAGE a plan: call plan_generate_draft with project_id, analyzing how new context affects existing tasks.\n"
    "3. ALWAYS run plan_detect_conflicts and plan_risk_assessment after any change.\n"
    "4. Call plan_sync_wiki to update the source of truth.\n"
    "5. Provide a summary that highlights the semantic connections you made from the Wiki.\n\n"
    "Return ONLY tool calls during execution. Finally, provide a markdown summary.\n"
)


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


def get_slim_project_context(project: Project) -> dict[str, Any]:
    """
    Returns a lightweight project context for LLM consumption.
    Limits tasks and milestones to avoid context bloat and memory pressure.
    """
    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "tasks": [
            {
                "id": str(t.id),
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "end_date": t.end_date.isoformat() if t.end_date else None,
            }
            for t in project.tasks.order_by("-updated_at")[:20]
        ],
        "milestones": [
            {
                "id": str(m.id),
                "title": m.title,
                "target_date": m.target_date.isoformat() if m.target_date else None,
            }
            for m in project.milestones.order_by("-updated_at")[:10]
        ],
    }


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


def _sse(event: str, data: dict[str, Any]) -> str:
    """Format a single SSE event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def run_planner_agent(
    *,
    team_id: str,
    prompt: str,
    mode: str = "create",
    project_id: str | None = None,
    user: User,
) -> Iterator[str]:
    """
    Streaming agent that orchestrates plan creation/update with real SSE progress.

    Yields SSE events:
      - agent_step: {name, arguments} — tool call starting
      - agent_result: {name, ok, result} — tool call completed
      - agent_status: {status} — text status update
      - agent_done: {project_id, conflicts, risk} — finished
      - agent_error: {detail} — error
    """
    team = Team.objects.get(id=team_id)

    # Build initial context
    project_context = None
    if project_id:
        project = get_project_or_none(team_id=team_id, project_id=project_id)
        if project:
            project_context = get_slim_project_context(project)

    # ── Phase 1: Generate draft ──────────────────────────────────
    yield _sse("agent_status", {"status": "Generating plan draft with wiki context..."})

    try:
        draft = generate_plan_with_wiki_context(
            team_id=team_id,
            prompt=prompt,
            mode=mode,
            project_context=project_context,
        )
    except Exception as e:
        logger.exception("Plan draft generation failed")
        yield _sse("agent_error", {"detail": f"Draft generation failed: {e}"})
        return

    if not draft or "error" in draft:
        error_msg = draft.get("error", "Unknown error") if draft else "Empty draft returned"
        yield _sse("agent_error", {"detail": error_msg})
        return

    yield _sse("agent_step", {"name": "plan_generate_draft", "arguments": json.dumps({"prompt": prompt, "mode": mode})})
    yield _sse("agent_result", {"name": "plan_generate_draft", "ok": True, "result": {"task_count": len(draft.get("tasks", [])), "milestone_count": len(draft.get("milestones", []))}})

    # ── Phase 2: Create/update project ───────────────────────────
    created_project_id = project_id

    if mode == "create":
        yield _sse("agent_status", {"status": "Creating project..."})
        try:
            project_name = draft.get("projectName", "New Project")
            project_desc = draft.get("description", "")
            project = create_project(
                team_id=team_id,
                user=user,
                payload={"name": project_name, "description": project_desc, "status": "active"},
            )
            created_project_id = str(project.id)
            yield _sse("agent_step", {"name": "plan_create_project", "arguments": json.dumps({"name": project_name})})
            yield _sse("agent_result", {"name": "plan_create_project", "ok": True, "result": {"project_id": created_project_id, "name": project_name}})
        except Exception as e:
            logger.exception("Project creation failed")
            yield _sse("agent_error", {"detail": f"Project creation failed: {e}"})
            return
    else:
        yield _sse("agent_status", {"status": "Updating existing project..."})
        yield _sse("agent_step", {"name": "plan_update_project", "arguments": json.dumps({"project_id": project_id})})
        yield _sse("agent_result", {"name": "plan_update_project", "ok": True, "result": {"project_id": project_id}})

    # ── Phase 3: Create tasks one by one ──────────────────────────
    tasks_data = draft.get("tasks", [])
    total_tasks = len(tasks_data)

    if created_project_id and tasks_data:
        project_obj = get_project_or_none(team_id=team_id, project_id=created_project_id)
        if project_obj:
            for idx, t_data in enumerate(tasks_data):
                yield _sse("agent_status", {"status": f"Creating task {idx + 1}/{total_tasks}: {t_data.get('title', 'Untitled')}"})
                try:
                    task = create_task(
                        project=project_obj,
                        user=user,
                        payload={
                            "title": t_data.get("title", "Untitled Task"),
                            "description": t_data.get("description", ""),
                            "status": t_data.get("status", "todo"),
                            "priority": t_data.get("priority", "medium"),
                            "start_date": t_data.get("startDate") or t_data.get("start_date"),
                            "end_date": t_data.get("endDate") or t_data.get("end_date"),
                            "order_index": idx,
                        },
                    )
                    yield _sse("agent_step", {"name": "plan_create_task", "arguments": json.dumps({"title": t_data.get("title", ""), "index": idx + 1, "total": total_tasks})})
                    yield _sse("agent_result", {"name": "plan_create_task", "ok": True, "result": {"task_id": str(task.id), "title": task.title}})
                except Exception as e:
                    logger.warning("Task creation failed for %s: %s", t_data.get("title"), e)
                    yield _sse("agent_step", {"name": "plan_create_task", "arguments": json.dumps({"title": t_data.get("title", ""), "index": idx + 1, "total": total_tasks})})
                    yield _sse("agent_result", {"name": "plan_create_task", "ok": False, "result": {"error": str(e)}})

    # ── Phase 4: Create milestones ────────────────────────────────
    milestones_data = draft.get("milestones", [])
    total_milestones = len(milestones_data)

    if created_project_id and milestones_data:
        project_obj = get_project_or_none(team_id=team_id, project_id=created_project_id)
        if project_obj:
            for idx, m_data in enumerate(milestones_data):
                yield _sse("agent_status", {"status": f"Creating milestone {idx + 1}/{total_milestones}: {m_data.get('title', 'Untitled')}"})
                try:
                    milestone = create_milestone(
                        project=project_obj,
                        user=user,
                        payload={
                            "title": m_data.get("title", "Untitled Milestone"),
                            "description": m_data.get("description", ""),
                            "status": "pending",
                            "target_date": m_data.get("date") or m_data.get("target_date"),
                            "order_index": idx,
                        },
                    )
                    yield _sse("agent_step", {"name": "plan_create_milestone", "arguments": json.dumps({"title": m_data.get("title", ""), "index": idx + 1, "total": total_milestones})})
                    yield _sse("agent_result", {"name": "plan_create_milestone", "ok": True, "result": {"milestone_id": str(milestone.id), "title": milestone.title}})
                except Exception as e:
                    logger.warning("Milestone creation failed for %s: %s", m_data.get("title"), e)
                    yield _sse("agent_step", {"name": "plan_create_milestone", "arguments": json.dumps({"title": m_data.get("title", ""), "index": idx + 1, "total": total_milestones})})
                    yield _sse("agent_result", {"name": "plan_create_milestone", "ok": False, "result": {"error": str(e)}})

    # ── Phase 5: Reindex project ─────────────────────────────────
    if created_project_id:
        try:
            from planning.reindex import reindex_project
            project_obj = get_project_or_none(team_id=team_id, project_id=created_project_id)
            if project_obj:
                reindex_project(project_obj)
        except Exception:
            logger.exception("Reindex failed for project %s", created_project_id)

    # ── Phase 6: Detect and Auto-Resolve Conflicts ────────────────
    yield _sse("agent_status", {"status": "Detecting scheduling conflicts..."})
    conflicts = []
    try:
        conflicts = detect_date_conflicts(team_id, project_id=created_project_id)
        yield _sse("agent_step", {"name": "plan_detect_conflicts", "arguments": json.dumps({"project_id": created_project_id})})
        yield _sse("agent_result", {"name": "plan_detect_conflicts", "ok": True, "result": {"conflict_count": len(conflicts), "conflicts": conflicts[:5]}})
        
        # Auto-corrective loop
        max_retries = 2
        retries = 0
        while conflicts and retries < max_retries:
            yield _sse("agent_status", {"status": f"Auto-resolving {len(conflicts)} conflicts (Attempt {retries + 1})..."})
            resolved_tasks = _auto_resolve_conflicts(team, created_project_id, conflicts)
            if resolved_tasks:
                # Apply updates to database
                for rt in resolved_tasks:
                    try:
                        task = get_task_or_none(team_id, created_project_id, rt["id"])
                        if task:
                            update_task(task, {
                                "start_date": rt.get("start_date"),
                                "end_date": rt.get("end_date")
                            })
                    except Exception as e:
                        logger.error(f"Failed to auto-update task {rt['id']}: {e}")
                
                # Re-check conflicts
                conflicts = detect_date_conflicts(team_id, project_id=created_project_id)
                yield _sse("agent_step", {"name": "plan_auto_resolve", "arguments": json.dumps({"resolved_count": len(resolved_tasks)})})
                yield _sse("agent_result", {"name": "plan_auto_resolve", "ok": True, "result": {"remaining_conflicts": len(conflicts)}})
            retries += 1

    except Exception as e:
        logger.exception("Conflict detection/resolution failed")
        yield _sse("agent_step", {"name": "plan_detect_conflicts", "arguments": json.dumps({"project_id": created_project_id})})
        yield _sse("agent_result", {"name": "plan_detect_conflicts", "ok": False, "result": {"error": str(e)}})

    # ── Phase 7: Risk assessment ─────────────────────────────────
    yield _sse("agent_status", {"status": "Assessing timeline risk..."})
    risk = {"score": 0, "factors": [], "suggestions": []}
    try:
        risk = _assess_plan_risk(team, draft, conflicts)
        yield _sse("agent_step", {"name": "plan_risk_assessment", "arguments": json.dumps({"project_id": created_project_id})})
        yield _sse("agent_result", {"name": "plan_risk_assessment", "ok": True, "result": risk})
    except Exception as e:
        logger.exception("Risk assessment failed")
        yield _sse("agent_step", {"name": "plan_risk_assessment", "arguments": json.dumps({"project_id": created_project_id})})
        yield _sse("agent_result", {"name": "plan_risk_assessment", "ok": False, "result": {"error": str(e)}})

    # ── Phase 8: Sync to wiki ────────────────────────────────────
    yield _sse("agent_status", {"status": "Syncing project to wiki..."})
    wiki_page_url = None
    try:
        if created_project_id:
            project_obj = get_project_or_none(team_id=team_id, project_id=created_project_id)
            if project_obj:
                page = sync_project_to_wiki(project_obj)
                if page:
                    wiki_page_url = f"/wiki?page={page.slug}"
                yield _sse("agent_step", {"name": "plan_sync_wiki", "arguments": json.dumps({"project_id": created_project_id})})
                yield _sse("agent_result", {"name": "plan_sync_wiki", "ok": True, "result": {"wiki_slug": page.slug if page else None}})
    except Exception as e:
        logger.exception("Wiki sync failed")
        yield _sse("agent_step", {"name": "plan_sync_wiki", "arguments": json.dumps({"project_id": created_project_id})})
        yield _sse("agent_result", {"name": "plan_sync_wiki", "ok": False, "result": {"error": str(e)}})

    # ── Phase 9: Check overdue ───────────────────────────────────
    overdue = []
    try:
        overdue_data = check_overdue_items(team_id)
        overdue = overdue_data.get("overdue_tasks", [])
        yield _sse("agent_step", {"name": "plan_check_overdue", "arguments": json.dumps({"team_id": team_id})})
        yield _sse("agent_result", {"name": "plan_check_overdue", "ok": True, "result": {"overdue_count": len(overdue)}})
    except Exception:
        logger.exception("Overdue check failed")

    # ── Done ──────────────────────────────────────────────────────
    yield _sse("agent_done", {
        "project_id": created_project_id,
        "project_name": draft.get("projectName", ""),
        "description": draft.get("description", ""),
        "task_count": total_tasks,
        "milestone_count": total_milestones,
        "conflict_count": len(conflicts),
        "conflicts": conflicts[:5],
        "risk": risk,
        "wiki_page_url": wiki_page_url,
        "overdue_count": len(overdue),
        "knowledge_gaps": draft.get("knowledge_gaps", []),
    })


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


def generate_risk_resolution_actions(
    team: Team,
    project_payload: dict[str, Any],
    conflicts: list[dict[str, Any]],
    risk: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Generate normalized, actionable risk-resolution operations for a project.
    """
    prompt = (
        "You are a planning remediation engine. "
        "Given project state, conflicts, and risk signals, propose concrete JSON actions that reduce risk.\n\n"
        "Allowed actions:\n"
        "- update_task_dates: {action, task_id, start_date, end_date, reason}\n"
        "- update_task_priority: {action, task_id, priority, reason}\n"
        "- add_dependency: {action, task_id, depends_on_task_id, reason}\n"
        "- update_milestone_date: {action, milestone_id, target_date, reason}\n\n"
        "Rules:\n"
        "- Return ONLY valid JSON.\n"
        "- Return an array of action objects.\n"
        "- Dates must be YYYY-MM-DD.\n"
        "- Prefer minimal, high-impact changes.\n"
    )
    user_content = (
        f"Project payload: {json.dumps(project_payload)}\n"
        f"Conflicts: {json.dumps(conflicts)}\n"
        f"Risk: {json.dumps(risk)}"
    )
    result = llm_json_call(
        team=team,
        operation="plan_risk_resolution",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_content},
        ],
        default_on_error=[],
    )
    if isinstance(result, list):
        return [a for a in result if isinstance(a, dict)]
    if isinstance(result, dict) and isinstance(result.get("actions"), list):
        return [a for a in result["actions"] if isinstance(a, dict)]
    return []

def run_planner_agent_v2(
    *,
    team_id: str,
    prompt: str,
    mode: str = "create",
    project_id: str | None = None,
    user: User,
) -> Iterator[str]:
    """
    V2 planner agent using the multi-stage reasoning pipeline.

    Runs: decompose → research → draft → critique → finalize → create entities → validate.
    Yields SSE events compatible with the frontend AIPlannerOverlay.
    """
    from planning.reasoning_pipeline import PlanningReasoningPipeline

    team = Team.objects.get(id=team_id)

    project_context = None
    if project_id:
        project = get_project_or_none(team_id=team_id, project_id=project_id)
        if project:
            project_context = get_slim_project_context(project)

    # ── Run reasoning pipeline (stages 1-5) ───────────────────────
    pipeline = PlanningReasoningPipeline(team=team, user=user)
    draft_data = None

    for event in pipeline.run(prompt, mode=mode, project_context=project_context):
        yield event
        # Capture the final reasoning_done data
        if "reasoning_done" in event:
            try:
                data_line = event.split("data: ", 1)[1].strip()
                draft_data = json.loads(data_line)
            except Exception:
                pass

    if not draft_data:
        yield _sse("agent_error", {"detail": "Reasoning pipeline did not produce a plan."})
        return

    # ── Create entities from the reasoned plan ────────────────────
    created_project_id = project_id
    valid_user_ids = _team_user_ids(team)

    if mode == "create":
        yield _sse("agent_status", {"status": "Creating project..."})
        try:
            project_obj = create_project(
                team_id=team_id,
                user=user,
                payload={
                    "name": draft_data.get("projectName", "New Project"),
                    "description": draft_data.get("description", ""),
                    "status": "active",
                },
            )
            created_project_id = str(project_obj.id)
            yield _sse("agent_step", {"name": "plan_create_project", "arguments": json.dumps({"name": project_obj.name})})
            yield _sse("agent_result", {"name": "plan_create_project", "ok": True, "result": {"project_id": created_project_id}})

            member_count = _apply_project_members(
                project=project_obj,
                members_data=draft_data.get("members", []),
                valid_user_ids=valid_user_ids,
            )
            if member_count:
                yield _sse("agent_step", {"name": "plan_assign_project_roles", "arguments": json.dumps({"project_id": created_project_id})})
                yield _sse("agent_result", {"name": "plan_assign_project_roles", "ok": True, "result": {"member_count": member_count}})
        except Exception as e:
            logger.exception("Project creation failed in v2 pipeline")
            yield _sse("agent_error", {"detail": f"Project creation failed: {e}"})
            return

    elif mode == "manage":
        if not project_id:
            yield _sse("agent_error", {"detail": "manage mode requires project_id."})
            return
        project_obj = get_project_or_none(team_id=team_id, project_id=str(project_id))
        if not project_obj:
            yield _sse("agent_error", {"detail": "Project not found."})
            return
        yield _sse("agent_status", {"status": "Updating existing project..."})
        try:
            up_payload: dict[str, Any] = {}
            pname = draft_data.get("projectName")
            if pname:
                up_payload["name"] = pname
            if "description" in draft_data:
                up_payload["description"] = draft_data.get("description", "")
            if up_payload:
                update_project(project_obj, up_payload)
            yield _sse("agent_step", {"name": "plan_update_project", "arguments": json.dumps({"project_id": str(project_id)})})
            yield _sse("agent_result", {"name": "plan_update_project", "ok": True, "result": {"project_id": str(project_id)}})

            member_count = _apply_project_members(
                project=project_obj,
                members_data=draft_data.get("members", []),
                valid_user_ids=valid_user_ids,
            )
            if member_count:
                yield _sse("agent_step", {"name": "plan_assign_project_roles", "arguments": json.dumps({"project_id": str(project_id)})})
                yield _sse("agent_result", {"name": "plan_assign_project_roles", "ok": True, "result": {"member_count": member_count}})
        except Exception as e:
            logger.exception("Project update failed in v2 pipeline")
            yield _sse("agent_error", {"detail": f"Project update failed: {e}"})
            return
    else:
        yield _sse("agent_error", {"detail": f"Unsupported mode: {mode}"})
        return

    # Create or update tasks
    tasks_data = draft_data.get("tasks", [])
    if created_project_id and tasks_data:
        project_obj = get_project_or_none(team_id=team_id, project_id=created_project_id)
        if project_obj:
            existing_tasks = list(project_obj.tasks.all())
            tasks_by_title: dict[str, Task] = {_title_key(t.title): t for t in existing_tasks}
            tasks_by_id: dict[str, Task] = {str(t.id): t for t in existing_tasks}

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
                    yield _sse("agent_result", {"name": "plan_skip_task", "ok": True, "result": {"reason": "No matching existing task and no explicit create action."}})
                    continue

                verb = "Updating" if existing_task else "Creating"
                yield _sse("agent_status", {"status": f"{verb} task {idx + 1}/{len(tasks_data)}: {title}"})
                payload = {
                    "title": title,
                    "description": t_data.get("description", ""),
                    "status": t_data.get("status", "todo"),
                    "priority": t_data.get("priority", "medium"),
                    "assignee_id": _resolve_team_user_id(t_data, valid_user_ids),
                    "start_date": t_data.get("startDate") or t_data.get("start_date"),
                    "end_date": t_data.get("endDate") or t_data.get("end_date"),
                    "order_index": t_data.get("order_index", idx),
                }
                if payload["assignee_id"] is None:
                    payload.pop("assignee_id")
                try:
                    if existing_task:
                        task = existing_task
                        update_task(task, payload)
                        yield _sse(
                            "agent_step",
                            {"name": "plan_update_task", "arguments": json.dumps({"title": task.title, "index": idx + 1, "total": len(tasks_data)})},
                        )
                        yield _sse("agent_result", {"name": "plan_update_task", "ok": True, "result": {"task_id": str(task.id), "title": task.title}})
                    else:
                        task = create_task(
                            project=project_obj,
                            user=user,
                            payload=payload,
                        )
                        existing_tasks.append(task)
                        tasks_by_id[str(task.id)] = task
                        tasks_by_title[_title_key(task.title)] = task
                        yield _sse("agent_step", {"name": "plan_create_task", "arguments": json.dumps({"title": task.title, "index": idx + 1, "total": len(tasks_data)})})
                        yield _sse("agent_result", {"name": "plan_create_task", "ok": True, "result": {"task_id": str(task.id), "title": task.title}})
                except Exception as e:
                    logger.warning("Task upsert failed: %s", e)
                    err_step = "plan_update_task" if existing_task else "plan_create_task"
                    yield _sse("agent_result", {"name": err_step, "ok": False, "result": {"error": str(e)}})

    # Create or update milestones
    milestones_data = draft_data.get("milestones", [])
    if created_project_id and milestones_data:
        project_obj = get_project_or_none(team_id=team_id, project_id=created_project_id)
        if project_obj:
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
                    yield _sse("agent_result", {"name": "plan_skip_milestone", "ok": True, "result": {"reason": "No matching existing milestone and no explicit create action."}})
                    continue

                try:
                    if existing_milestone:
                        milestone = existing_milestone
                        update_milestone(
                            milestone,
                            {
                                "title": m_title,
                                "description": m_data.get("description", ""),
                                "status": m_data.get("status", milestone.status),
                                "target_date": m_data.get("date") or m_data.get("target_date"),
                                "order_index": idx,
                            },
                        )
                        yield _sse("agent_step", {"name": "plan_update_milestone", "arguments": json.dumps({"title": milestone.title})})
                        yield _sse("agent_result", {"name": "plan_update_milestone", "ok": True, "result": {"milestone_id": str(milestone.id)}})
                    else:
                        milestone = create_milestone(
                            project=project_obj,
                            user=user,
                            payload={
                                "title": m_title,
                                "description": m_data.get("description", ""),
                                "status": "pending",
                                "target_date": m_data.get("date") or m_data.get("target_date"),
                                "order_index": idx,
                            },
                        )
                        existing_milestones.append(milestone)
                        ms_by_id[str(milestone.id)] = milestone
                        ms_by_title[_title_key(milestone.title)] = milestone
                        yield _sse("agent_step", {"name": "plan_create_milestone", "arguments": json.dumps({"title": milestone.title})})
                        yield _sse("agent_result", {"name": "plan_create_milestone", "ok": True, "result": {"milestone_id": str(milestone.id)}})
                except Exception as e:
                    logger.warning("Milestone upsert failed: %s", e)

    # ── Reindex ───────────────────────────────────────────────────
    if created_project_id:
        try:
            from planning.reindex import reindex_project
            project_obj = get_project_or_none(team_id=team_id, project_id=created_project_id)
            if project_obj:
                reindex_project(project_obj)
        except Exception:
            logger.exception("Reindex failed")

    # ── Conflict detection ────────────────────────────────────────
    yield _sse("agent_status", {"status": "Detecting conflicts..."})
    conflicts = []
    try:
        conflicts = detect_date_conflicts(team_id, project_id=created_project_id)
        yield _sse("agent_step", {"name": "plan_detect_conflicts", "arguments": "{}"})
        yield _sse("agent_result", {"name": "plan_detect_conflicts", "ok": True, "result": {"conflict_count": len(conflicts)}})
    except Exception:
        logger.exception("Conflict detection failed in v2")

    # ── Risk assessment ───────────────────────────────────────────
    yield _sse("agent_status", {"status": "Final risk assessment..."})
    risk = {"score": 0, "factors": [], "suggestions": []}
    try:
        risk = _assess_plan_risk(team, draft_data, conflicts)
        yield _sse("agent_step", {"name": "plan_risk_assessment", "arguments": "{}"})
        yield _sse("agent_result", {"name": "plan_risk_assessment", "ok": True, "result": risk})
    except Exception:
        logger.exception("Risk assessment failed in v2")

    # ── Wiki sync ─────────────────────────────────────────────────
    yield _sse("agent_status", {"status": "Syncing to wiki..."})
    wiki_page_url = None
    try:
        if created_project_id:
            project_obj = get_project_or_none(team_id=team_id, project_id=created_project_id)
            if project_obj:
                page = sync_project_to_wiki(project_obj)
                if page:
                    wiki_page_url = f"/wiki?page={page.slug}"
                yield _sse("agent_step", {"name": "plan_sync_wiki", "arguments": "{}"})
                yield _sse("agent_result", {"name": "plan_sync_wiki", "ok": True, "result": {"wiki_slug": page.slug if page else None}})
    except Exception:
        logger.exception("Wiki sync failed in v2")

    # ── Done ──────────────────────────────────────────────────────
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
        "knowledge_gaps": draft_data.get("knowledge_gaps", []),
        "reasoning_traces": draft_data.get("reasoning_traces", []),
        "critique_score": draft_data.get("critique_score", 0),
        "critique_suggestions": draft_data.get("critique_suggestions", []),
    })


def _auto_resolve_conflicts(
    team: Team,
    project_id: str,
    conflicts: list[dict[str, Any]]
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
