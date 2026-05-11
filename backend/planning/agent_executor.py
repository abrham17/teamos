"""
Streaming agent executor for the planner overlay.

Runs a multi-step pipeline (draft → create project → create tasks → conflicts → risk → wiki sync)
and yields SSE events so the frontend can show real progress instead of fake thinking.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from accounts.models import Team, User
from chat.tools import ToolContext, execute_plan_tool, openai_plan_tool_schemas
from llm_orchestrator.orchestrator import llm_call, llm_json_call
from planning.agent_sync import (
    check_overdue_items,
    detect_date_conflicts,
    generate_plan_with_wiki_context,
    sync_project_to_wiki,
)
from planning.models import Project
from planning.services import create_milestone, create_project, create_task, get_project_or_none, update_task

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
            from planning.serializers import ProjectDetailSerializer
            project_context = ProjectDetailSerializer(project).data

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
