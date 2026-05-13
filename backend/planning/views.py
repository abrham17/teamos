import logging
import uuid
from datetime import date

from django.http import StreamingHttpResponse
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework import serializers

from accounts.permissions import CanEditPlans, IsTeamMember
from teamos_project.api_response import fail, ok

from .models import Task, Milestone, Project
from .serializers import (
    MilestoneSerializer,
    MilestoneWriteSerializer,
    ProjectDetailSerializer,
    ProjectListSerializer,
    ProjectWriteSerializer,
    TaskSerializer,
    TaskWriteSerializer,
)
from .services import (
    add_project_member,
    calendar_feed,
    create_milestone,
    create_project,
    create_task,
    delete_milestone,
    delete_project,
    delete_task,
    generate_plan_draft,
    get_milestone_or_none,
    get_project_or_none,
    get_task_or_none,
    list_milestones,
    list_projects,
    list_tasks,
    remove_project_member,
    update_milestone,
    update_project,
    update_task,
)
from .reindex import clear_project_chunks, reindex_project
from accounts.models import User, Team

logger = logging.getLogger(__name__)


class RiskActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=["update_task_dates", "update_task_priority", "add_dependency", "update_milestone_date"]
    )
    task_id = serializers.UUIDField(required=False)
    milestone_id = serializers.UUIDField(required=False)
    depends_on_task_id = serializers.UUIDField(required=False)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    target_date = serializers.DateField(required=False)
    priority = serializers.ChoiceField(choices=["low", "medium", "high"], required=False)
    reason = serializers.CharField(required=False, allow_blank=True)


class RiskApplyRequestSerializer(serializers.Serializer):
    actions = RiskActionSerializer(many=True)

def is_valid_uuid(val):
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False

class PlanningProjectListView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id):
        q = (request.query_params.get("q") or "").strip()
        projects = list_projects(team_id=str(team_id), query=q)
        return ok(ProjectListSerializer(projects, many=True).data)

    def post(self, request, team_id):
        serializer = ProjectWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        tasks_data = data.pop("tasks", [])
        milestones_data = data.pop("milestones", [])

        project = create_project(team_id=str(team_id), user=request.user, payload=data)

        # Bulk create tasks
        for idx, t_data in enumerate(tasks_data):
            create_task(
                project=project,
                user=request.user,
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

        # Bulk create milestones
        for idx, m_data in enumerate(milestones_data):
            create_milestone(
                project=project,
                user=request.user,
                payload={
                    "title": m_data.get("title", "Untitled Milestone"),
                    "description": m_data.get("description", ""),
                    "status": "pending",
                    "target_date": m_data.get("date") or m_data.get("target_date"),
                    "order_index": idx,
                },
            )

        try:
            reindex_project(project)
        except Exception:
            logger.exception(
                "Failed to reindex plan project after create", extra={"project_id": str(project.id)}
            )
        return ok(ProjectDetailSerializer(project).data, status_code=201)


class PlanningProjectDetailView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id):
        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
        return ok(ProjectDetailSerializer(project).data)

    def patch(self, request, team_id, project_id):
        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
        
        serializer = ProjectWriteSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        tasks_data = data.pop("tasks", None)
        milestones_data = data.pop("milestones", None)
        members_data = data.pop("members", None)

        updated = update_project(project, data)

        # Bulk update tasks if provided
        if tasks_data is not None:
            # Simple strategy for now: match by ID if present, else create
            for idx, t_data in enumerate(tasks_data):
                t_id = t_data.get("id")
                payload = {
                    "title": t_data.get("title", "Untitled Task"),
                    "description": t_data.get("description", ""),
                    "status": t_data.get("status", "todo"),
                    "priority": t_data.get("priority", "medium"),
                    "assignee_id": t_data.get("assignee_id") or t_data.get("assigneeId"),
                    "start_date": t_data.get("startDate") or t_data.get("start_date"),
                    "end_date": t_data.get("endDate") or t_data.get("end_date"),
                    "order_index": idx,
                }
                if t_id and is_valid_uuid(t_id):
                    try:
                        task = Task.objects.get(id=t_id, project=project)
                        update_task(task, payload)
                    except (Task.DoesNotExist, ValueError):
                        create_task(project=project, user=request.user, payload=payload)
                else:
                    create_task(project=project, user=request.user, payload=payload)

        # Bulk update milestones if provided
        if milestones_data is not None:
            for idx, m_data in enumerate(milestones_data):
                m_id = m_data.get("id")
                payload = {
                    "title": m_data.get("title", "Untitled Milestone"),
                    "description": m_data.get("description", ""),
                    "status": m_data.get("status") or "pending",
                    "target_date": m_data.get("date") or m_data.get("target_date"),
                    "order_index": idx,
                }
                if m_id and is_valid_uuid(m_id):
                    try:
                        milestone = Milestone.objects.get(id=m_id, project=project)
                        update_milestone(milestone, payload)
                    except (Milestone.DoesNotExist, ValueError):
                        create_milestone(project=project, user=request.user, payload=payload)
                else:
                    create_milestone(project=project, user=request.user, payload=payload)

        # Bulk update members if provided
        if members_data is not None:
            for m_data in members_data:
                u_id = m_data.get("user_id") or m_data.get("userId")
                role = m_data.get("role", "Contributor")
                remove = m_data.get("remove", False)
                
                if u_id:
                    try:
                        user = User.objects.get(id=u_id)
                        if remove:
                            remove_project_member(project=project, user=user)
                        else:
                            add_project_member(project=project, user=user, role=role)
                    except User.DoesNotExist:
                        pass

        try:
            reindex_project(updated)
        except Exception:
            logger.exception("Failed to reindex plan project after update", extra={"project_id": str(updated.id)})
        return ok(ProjectDetailSerializer(updated).data)

    def delete(self, request, team_id, project_id):
        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
        try:
            clear_project_chunks(project)
        except Exception:
            logger.exception("Failed to clear plan index before project delete", extra={"project_id": str(project.id)})
        delete_project(project)
        return ok(status_code=204)


class PlanningTaskListView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id):
        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
        tasks = list_tasks(team_id=str(team_id), project_id=str(project_id))
        return ok(TaskSerializer(tasks, many=True).data)

    def post(self, request, team_id, project_id):
        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
        serializer = TaskWriteSerializer(data=request.data, context={"team_id": str(team_id)})
        serializer.is_valid(raise_exception=True)
        task = create_task(project=project, user=request.user, payload=serializer.validated_data)
        try:
            reindex_project(project)
        except Exception:
            logger.exception("Failed to reindex plan project after task create", extra={"project_id": str(project.id)})
        return ok(TaskSerializer(task).data, status_code=201)


class PlanningTaskDetailView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def patch(self, request, team_id, project_id, task_id):
        task = get_task_or_none(team_id=str(team_id), project_id=str(project_id), task_id=str(task_id))
        if task is None:
            return fail("Task not found.", status_code=404, code="task_not_found")
        serializer = TaskWriteSerializer(task, data=request.data, partial=True, context={"team_id": str(team_id)})
        serializer.is_valid(raise_exception=True)
        updated = update_task(task, serializer.validated_data)
        try:
            reindex_project(updated.project)
        except Exception:
            logger.exception(
                "Failed to reindex plan project after task update", extra={"project_id": str(updated.project_id)}
            )
        return ok(TaskSerializer(updated).data)

    def delete(self, request, team_id, project_id, task_id):
        task = get_task_or_none(team_id=str(team_id), project_id=str(project_id), task_id=str(task_id))
        if task is None:
            return fail("Task not found.", status_code=404, code="task_not_found")
        project = task.project
        delete_task(task)
        try:
            reindex_project(project)
        except Exception:
            logger.exception("Failed to reindex plan project after task delete", extra={"project_id": str(project.id)})
        return ok(status_code=204)


class PlanningMilestoneListView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id):
        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
        milestones = list_milestones(team_id=str(team_id), project_id=str(project_id))
        return ok(MilestoneSerializer(milestones, many=True).data)

    def post(self, request, team_id, project_id):
        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
        serializer = MilestoneWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        milestone = create_milestone(project=project, user=request.user, payload=serializer.validated_data)
        try:
            reindex_project(project)
        except Exception:
            logger.exception(
                "Failed to reindex plan project after milestone create", extra={"project_id": str(project.id)}
            )
        return ok(MilestoneSerializer(milestone).data, status_code=201)


class PlanningMilestoneDetailView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def patch(self, request, team_id, project_id, milestone_id):
        milestone = get_milestone_or_none(
            team_id=str(team_id), project_id=str(project_id), milestone_id=str(milestone_id)
        )
        if milestone is None:
            return fail("Milestone not found.", status_code=404, code="milestone_not_found")
        serializer = MilestoneWriteSerializer(milestone, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_milestone(milestone, serializer.validated_data)
        try:
            reindex_project(updated.project)
        except Exception:
            logger.exception(
                "Failed to reindex plan project after milestone update",
                extra={"project_id": str(updated.project_id)},
            )
        return ok(MilestoneSerializer(updated).data)

    def delete(self, request, team_id, project_id, milestone_id):
        milestone = get_milestone_or_none(
            team_id=str(team_id), project_id=str(project_id), milestone_id=str(milestone_id)
        )
        if milestone is None:
            return fail("Milestone not found.", status_code=404, code="milestone_not_found")
        project = milestone.project
        delete_milestone(milestone)
        try:
            reindex_project(project)
        except Exception:
            logger.exception(
                "Failed to reindex plan project after milestone delete", extra={"project_id": str(project.id)}
            )
        return ok(status_code=204)


class PlanningCalendarFeedView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id):
        from_date = (request.query_params.get("from") or "").strip() or None
        to_date = (request.query_params.get("to") or "").strip() or None
        events = calendar_feed(str(team_id), from_date=from_date, to_date=to_date)
        return ok(events)


class PlanningAssistView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id):
        prompt = request.data.get("prompt")
        mode = request.data.get("mode", "create")
        project_id = request.data.get("project_id")

        if not prompt:
            return fail("Prompt is required.", status_code=400, code="prompt_required")

        project_context = None
        if project_id:
            project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
            if project:
                from .serializers import ProjectDetailSerializer
                project_context = ProjectDetailSerializer(project).data

        try:
            draft = generate_plan_draft(team_id, prompt, mode=mode, project_context=project_context)
            return ok(draft)
        except Exception as e:
            logger.exception("Plan assist failed")
            return fail(str(e), status_code=500, code="assist_failed")

class PlanningActivityView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id):
        # Fetch 15 most recently updated tasks
        tasks = (
            Task.objects.filter(project__team_id=team_id)
            .select_related("project")
            .order_by("-updated_at")[:15]
        )
        # Fetch 5 most recently updated projects
        projects = Project.objects.filter(team_id=team_id).order_by("-updated_at")[:5]

        activity = []
        for p in projects:
            activity.append(
                {
                    "id": str(p.id),
                    "kind": "project",
                    "title": p.name,
                    "status": p.status,
                    "updated_at": p.updated_at.isoformat(),
                    "user": p.created_by.email if p.created_by else "System",
                }
            )
        for t in tasks:
            activity.append(
                {
                    "id": str(t.id),
                    "project_id": str(t.project_id),
                    "project_name": t.project.name,
                    "kind": "task",
                    "title": t.title,
                    "status": t.status,
                    "updated_at": t.updated_at.isoformat(),
                    "user": t.created_by.email if t.created_by else "System",
                }
            )

        activity.sort(key=lambda x: x["updated_at"], reverse=True)
        return ok(activity[:20])


class PlanningAssistStreamView(APIView):
    """Streaming SSE endpoint for agent-driven plan generation."""

    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id):
        import json as _json

        prompt = request.data.get("prompt")
        mode = request.data.get("mode", "create")
        project_id = request.data.get("project_id")

        if not prompt:
            return fail("Prompt is required.", status_code=400, code="prompt_required")

        def event_stream():
            from .agent_executor import run_planner_agent_v2

            try:
                for sse_line in run_planner_agent_v2(
                    team_id=str(team_id),
                    prompt=prompt,
                    mode=mode,
                    project_id=project_id,
                    user=request.user,
                ):
                    yield sse_line
            except Exception as e:
                logger.exception("Planner agent stream failed")
                yield f"event: agent_error\ndata: {_json.dumps({'detail': str(e)})}\n\n"

        async def async_event_stream():
            for chunk in event_stream():
                yield chunk

        response = StreamingHttpResponse(async_event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response

class PlanningConflictView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id=None):
        from .agent_sync import detect_date_conflicts
        try:
            conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id) if project_id else None)
            return ok(conflicts)
        except Exception as e:
            logger.exception("Conflict detection failed")
            return fail(str(e), status_code=500)

class PlanningConflictResolveView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id):
        from .agent_sync import detect_date_conflicts
        from .agent_executor import _auto_resolve_conflicts
        from .services import update_task, get_task_or_none

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")

        try:
            team = Team.objects.get(id=team_id)
            conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id))
            
            if not conflicts:
                return ok({"status": "no_conflicts", "resolved_count": 0})

            resolved_tasks = _auto_resolve_conflicts(team, str(project_id), conflicts)
            skipped: list[dict] = []
            updated_count = 0
            if resolved_tasks:
                with transaction.atomic():
                    for rt in resolved_tasks:
                        task_id = rt.get("id")
                        start = rt.get("start_date")
                        end = rt.get("end_date")
                        if not task_id:
                            skipped.append({"item": rt, "reason": "missing_task_id"})
                            continue
                        task = get_task_or_none(str(team_id), str(project_id), task_id)
                        if not task:
                            skipped.append({"item": rt, "reason": "task_not_found"})
                            continue
                        if not start or not end:
                            skipped.append({"item": rt, "reason": "missing_dates"})
                            continue
                        try:
                            start_date = date.fromisoformat(str(start))
                            end_date = date.fromisoformat(str(end))
                        except ValueError:
                            skipped.append({"item": rt, "reason": "invalid_date_format"})
                            continue
                        if start_date > end_date:
                            skipped.append({"item": rt, "reason": "start_after_end"})
                            continue
                        update_task(task, {
                            "start_date": start_date,
                            "end_date": end_date,
                        })
                        updated_count += 1
            
            reindex_project(project)
            
            return ok({
                "status": "resolved",
                "resolved_count": updated_count,
                "skipped_count": len(skipped),
                "skipped": skipped[:20],
                "remaining_conflicts": len(detect_date_conflicts(str(team_id), project_id=str(project_id)))
            })
        except Exception as e:
            logger.exception("Conflict resolution failed")
            return fail(str(e), status_code=500, code="resolve_failed")

class PlanningRiskView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id):
        from .agent_executor import _assess_plan_risk
        from .agent_sync import detect_date_conflicts

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
            
        try:
            team = Team.objects.get(id=team_id)
            draft = ProjectDetailSerializer(project).data
            conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id))
            risk = _assess_plan_risk(team, draft, conflicts)
            return ok(risk)
        except Exception as e:
            logger.exception("Risk assessment failed")
            return fail(str(e), status_code=500, code="risk_assessment_failed")


class PlanningRiskResolveProposalView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id):
        from .agent_executor import _assess_plan_risk, generate_risk_resolution_actions
        from .agent_sync import detect_date_conflicts

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")

        try:
            team = Team.objects.get(id=team_id)
            project_payload = ProjectDetailSerializer(project).data
            conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id))
            risk = _assess_plan_risk(team, project_payload, conflicts)
            actions = generate_risk_resolution_actions(team, project_payload, conflicts, risk)
            return ok(
                {
                    "status": "proposed",
                    "risk": risk,
                    "proposed_count": len(actions),
                    "actions": actions,
                }
            )
        except Exception as e:
            logger.exception("Risk proposal generation failed")
            return fail(str(e), status_code=500, code="risk_resolution_proposal_failed")


class PlanningRiskResolveApplyView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id):
        from .agent_executor import _assess_plan_risk
        from .agent_sync import detect_date_conflicts

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")

        s = RiskApplyRequestSerializer(data=request.data)
        if not s.is_valid():
            return fail(
                "Invalid risk resolution actions.",
                status_code=400,
                code="invalid_resolver_output",
                details=s.errors,
            )

        actions = s.validated_data["actions"]
        applied: list[dict] = []
        skipped: list[dict] = []
        try:
            with transaction.atomic():
                for action in actions:
                    action_type = action["action"]
                    if action_type == "update_task_dates":
                        task = get_task_or_none(str(team_id), str(project_id), str(action.get("task_id")))
                        if not task:
                            skipped.append({"action": action, "reason": "task_not_found"})
                            continue
                        start_date = action.get("start_date")
                        end_date = action.get("end_date")
                        if not start_date or not end_date:
                            skipped.append({"action": action, "reason": "missing_dates"})
                            continue
                        if start_date > end_date:
                            skipped.append({"action": action, "reason": "start_after_end"})
                            continue
                        update_task(task, {"start_date": start_date, "end_date": end_date})
                        applied.append({"action": action_type, "task_id": str(task.id)})
                    elif action_type == "update_task_priority":
                        task = get_task_or_none(str(team_id), str(project_id), str(action.get("task_id")))
                        if not task:
                            skipped.append({"action": action, "reason": "task_not_found"})
                            continue
                        update_task(task, {"priority": action.get("priority")})
                        applied.append({"action": action_type, "task_id": str(task.id)})
                    elif action_type == "add_dependency":
                        task = get_task_or_none(str(team_id), str(project_id), str(action.get("task_id")))
                        depends_on = get_task_or_none(
                            str(team_id), str(project_id), str(action.get("depends_on_task_id"))
                        )
                        if not task or not depends_on:
                            skipped.append({"action": action, "reason": "dependency_task_not_found"})
                            continue
                        if str(task.id) == str(depends_on.id):
                            skipped.append({"action": action, "reason": "self_dependency"})
                            continue
                        task.dependencies.add(depends_on)
                        applied.append({"action": action_type, "task_id": str(task.id)})
                    elif action_type == "update_milestone_date":
                        milestone_id = action.get("milestone_id")
                        milestone = get_milestone_or_none(
                            team_id=str(team_id),
                            project_id=str(project_id),
                            milestone_id=str(milestone_id),
                        )
                        if not milestone:
                            skipped.append({"action": action, "reason": "milestone_not_found"})
                            continue
                        update_milestone(milestone, {"target_date": action.get("target_date")})
                        applied.append({"action": action_type, "milestone_id": str(milestone.id)})

            reindex_project(project)
            team = Team.objects.get(id=team_id)
            project_payload = ProjectDetailSerializer(project).data
            remaining_conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id))
            remaining_risk = _assess_plan_risk(team, project_payload, remaining_conflicts)
            return ok(
                {
                    "status": "applied",
                    "applied_count": len(applied),
                    "skipped_count": len(skipped),
                    "warnings": skipped[:20],
                    "remaining_risk_score": remaining_risk.get("score", 50),
                    "remaining_conflicts": len(remaining_conflicts),
                }
            )
        except Exception as e:
            logger.exception("Risk resolution apply failed")
            return fail(str(e), status_code=500, code="risk_resolution_apply_failed")

class PlanningOverdueView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id):
        from .agent_sync import check_overdue_items
        try:
            overdue = check_overdue_items(str(team_id))
            return ok(overdue)
        except Exception as e:
            logger.exception("Overdue check failed")
            return fail(str(e), status_code=500)

class PlanningSnapshotListView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id):
        from .models import PlanSnapshot
        snapshots = PlanSnapshot.objects.filter(project_id=project_id, project__team_id=team_id)
        data = [
            {
                "id": str(s.id),
                "snapshot_type": s.snapshot_type,
                "created_at": s.created_at.isoformat(),
                "created_by": s.created_by.email if s.created_by else "System",
            } for s in snapshots
        ]
        return ok(data)

    def post(self, request, team_id, project_id):
        from .models import PlanSnapshot
        from .services import get_project_or_none
        from .serializers import ProjectDetailSerializer

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if not project:
            return fail("Project not found", status_code=404)

        data = ProjectDetailSerializer(project).data
        snapshot_type = request.data.get("snapshot_type", "manual")
        snapshot = PlanSnapshot.objects.create(
            project=project,
            snapshot_type=snapshot_type,
            data=data,
            created_by=request.user
        )
        return ok({"id": str(snapshot.id), "created_at": snapshot.created_at.isoformat()})

class PlanningSnapshotRestoreView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id, snapshot_id):
        from .models import PlanSnapshot
        from .services import get_project_or_none, update_project, create_task, create_milestone
        from .reindex import reindex_project

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if not project:
            return fail("Project not found", status_code=404)
        
        try:
            snapshot = PlanSnapshot.objects.get(id=snapshot_id, project=project)
        except PlanSnapshot.DoesNotExist:
            return fail("Snapshot not found", status_code=404)

        # Create a backup snapshot of current state before wiping
        from .serializers import ProjectDetailSerializer
        current_data = ProjectDetailSerializer(project).data
        PlanSnapshot.objects.create(
            project=project,
            snapshot_type="auto",
            data=current_data,
            created_by=request.user
        )

        # Basic restore: replace tasks/milestones
        # In a real deep implementation we'd gracefully diff, but for now wipe and restore
        project.tasks.all().delete()
        project.milestones.all().delete()

        data = snapshot.data
        update_project(project, {"name": data.get("name"), "description": data.get("description"), "status": data.get("status")})

        for t_data in data.get("tasks", []):
            create_task(
                project=project,
                user=request.user,
                payload={
                    "title": t_data.get("title", "Untitled Task"),
                    "description": t_data.get("description", ""),
                    "status": t_data.get("status", "todo"),
                    "priority": t_data.get("priority", "medium"),
                    "start_date": t_data.get("start_date"),
                    "end_date": t_data.get("end_date"),
                    "order_index": t_data.get("order_index", 0),
                }
            )

        for m_data in data.get("milestones", []):
            create_milestone(
                project=project,
                user=request.user,
                payload={
                    "title": m_data.get("title", "Untitled Milestone"),
                    "description": m_data.get("description", ""),
                    "status": m_data.get("status", "pending"),
                    "target_date": m_data.get("target_date"),
                    "order_index": m_data.get("order_index", 0),
                }
            )

        reindex_project(project)
        return ok({"restored": True})


class NotificationListView(APIView):
    """GET /api/planning/:team_id/notifications/ — list user notifications
       PATCH /api/planning/:team_id/notifications/ — mark notifications as read"""

    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        from .models import Notification

        unread_only = request.query_params.get("unread_only", "").lower() == "true"
        qs = Notification.objects.filter(user=request.user, team_id=team_id)
        if unread_only:
            qs = qs.filter(is_read=False)
        qs = qs[:50]

        from .serializers import NotificationSerializer
        return ok(NotificationSerializer(qs, many=True).data)

    def patch(self, request, team_id):
        from .models import Notification

        ids = request.data.get("ids", [])
        if not ids:
            return fail("ids required.", status_code=400, code="ids_required")

        Notification.objects.filter(
            id__in=ids, user=request.user, team_id=team_id
        ).update(is_read=True)
        return ok({"marked_read": len(ids)})


class TaskCommentListView(APIView):
    """GET  /api/planning/:team_id/projects/:project_id/tasks/:task_id/comments/
       POST /api/planning/:team_id/projects/:project_id/tasks/:task_id/comments/"""

    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id, project_id, task_id):
        from .models import TaskComment

        qs = TaskComment.objects.filter(task_id=task_id).select_related("author")
        from .serializers import TaskCommentSerializer
        return ok(TaskCommentSerializer(qs, many=True).data)

    def post(self, request, team_id, project_id, task_id):
        from .models import TaskComment, Task

        try:
            task = Task.objects.get(id=task_id, project_id=project_id, project__team_id=team_id)
        except Task.DoesNotExist:
            return fail("Task not found.", status_code=404, code="task_not_found")

        from .serializers import TaskCommentWriteSerializer
        ser = TaskCommentWriteSerializer(data=request.data)
        if not ser.is_valid():
            return fail(str(ser.errors), status_code=400, code="invalid_data")

        comment = TaskComment.objects.create(
            task=task,
            author=request.user,
            content=ser.validated_data["content"],
        )
        from .serializers import TaskCommentSerializer
        return ok(TaskCommentSerializer(comment).data, status_code=201)
