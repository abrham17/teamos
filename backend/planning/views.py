import logging
import uuid

from django.http import StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import CanEditPlans
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
from accounts.models import User

logger = logging.getLogger(__name__)

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
            from .agent_executor import run_planner_agent

            try:
                for sse_line in run_planner_agent(
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

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
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

class PlanningRiskView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id):
        from .agent_executor import _assess_plan_risk
        from .agent_sync import detect_date_conflicts
        from accounts.models import Team

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404)
            
        try:
            team = Team.objects.get(id=team_id)
            draft = ProjectDetailSerializer(project).data
            conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id))
            risk = _assess_plan_risk(team, draft, conflicts)
            return ok(risk)
        except Exception as e:
            logger.exception("Risk assessment failed")
            return fail(str(e), status_code=500)

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
