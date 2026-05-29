import asyncio
import logging
import queue
import threading
import uuid

from django.http import StreamingHttpResponse
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
from .tasks import reindex_project_async
from accounts.models import User, Team

logger = logging.getLogger(__name__)

# Heroku H12: router drops connections with ~30s of inactivity. Emit SSE comments
# between planner chunks so bytes still flow during long LLM/DB work.
PLANNING_SSE_KEEPALIVE_SEC = 18.0


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
            reindex_project_async.delay(str(project.id))
        except Exception:
            logger.exception(
                "Failed to queue reindex after project create", extra={"project_id": str(project.id)}
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
            reindex_project_async.delay(str(updated.id))
        except Exception:
            logger.exception("Failed to queue reindex after project update", extra={"project_id": str(updated.id)})
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
            reindex_project_async.delay(str(project.id))
        except Exception:
            logger.exception("Failed to queue reindex after task create", extra={"project_id": str(project.id)})
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
            reindex_project_async.delay(str(updated.project_id))
        except Exception:
            logger.exception(
                "Failed to queue reindex after task update", extra={"project_id": str(updated.project_id)}
            )
        return ok(TaskSerializer(updated).data)

    def delete(self, request, team_id, project_id, task_id):
        task = get_task_or_none(team_id=str(team_id), project_id=str(project_id), task_id=str(task_id))
        if task is None:
            return fail("Task not found.", status_code=404, code="task_not_found")
        project = task.project
        delete_task(task)
        try:
            reindex_project_async.delay(str(project.id))
        except Exception:
            logger.exception("Failed to queue reindex after task delete", extra={"project_id": str(project.id)})
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
            reindex_project_async.delay(str(project.id))
        except Exception:
            logger.exception(
                "Failed to queue reindex after milestone create", extra={"project_id": str(project.id)}
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
            reindex_project_async.delay(str(updated.project_id))
        except Exception:
            logger.exception(
                "Failed to queue reindex after milestone update",
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
            reindex_project_async.delay(str(project.id))
        except Exception:
            logger.exception(
                "Failed to queue reindex after milestone delete", extra={"project_id": str(project.id)}
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
        if mode == "manage" and not project_id:
            return fail("Project is required for update mode.", status_code=400, code="project_required")

        project_context = None
        project = None
        if project_id:
            project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
            if project:
                from .services import get_plan_mutation_context

                project_context = get_plan_mutation_context(project)
            elif mode == "manage":
                return fail("Project not found.", status_code=404, code="project_not_found")

        try:
            if mode == "manage" and project:
                from accounts.models import Team
                from planning.manage_update_pipeline import ManageUpdatePipeline

                team = Team.objects.get(id=team_id)
                pipeline = ManageUpdatePipeline(team=team, user=request.user)
                result = None
                for event in pipeline.run(prompt, project_context=project_context):
                    if "reasoning_done" in event:
                        import json as _json

                        result = _json.loads(event.split("data: ", 1)[1].strip())
                draft = result or {"mutations": []}
            else:
                draft = generate_plan_draft(team_id, prompt, mode=mode, project_context=project_context)
            return ok(draft)
        except Exception as e:
            logger.exception("Plan assist failed")
            return fail(str(e), status_code=500, code="assist_failed")

class PlanningActivityView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id):
        # Fetch 12 most recently updated tasks
        tasks = (
            Task.objects.filter(project__team_id=team_id)
            .select_related("project", "created_by")
            .order_by("-updated_at")[:12]
        )
        # Fetch 5 most recently updated projects
        projects = Project.objects.filter(team_id=team_id).select_related("created_by").order_by("-updated_at")[:5]
        # Fetch 6 most recently updated milestones
        milestones = (
            Milestone.objects.filter(project__team_id=team_id)
            .select_related("project", "created_by")
            .order_by("-updated_at")[:6]
        )

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
        for m in milestones:
            activity.append(
                {
                    "id": str(m.id),
                    "project_id": str(m.project_id),
                    "project_name": m.project.name,
                    "kind": "milestone",
                    "title": m.title,
                    "status": m.status,
                    "updated_at": m.updated_at.isoformat(),
                    "user": m.created_by.email if m.created_by else "System",
                }
            )

        activity.sort(key=lambda x: x["updated_at"], reverse=True)
        return ok(activity[:25])


class PlanningAssistStreamView(APIView):
    """Streaming SSE endpoint for agent-driven plan generation and conversational QA."""

    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id):
        import json as _json

        prompt = request.data.get("prompt")
        mode = request.data.get("mode", "create")
        project_id = request.data.get("project_id")
        intent = request.data.get("intent")
        chat_history = request.data.get("history") or request.data.get("chat_history")

        if not prompt:
            return fail("Prompt is required.", status_code=400, code="prompt_required")
        if mode == "manage" and not project_id:
            return fail("Project is required for update mode.", status_code=400, code="project_required")
        if mode == "manage" and get_project_or_none(team_id=str(team_id), project_id=str(project_id)) is None:
            return fail("Project not found.", status_code=404, code="project_not_found")

        team = Team.objects.get(id=team_id)

        # 1. Intent Classification (Chat vs Plan)
        if not intent:
            from llm_orchestrator.orchestrator import llm_json_call
            classification_prompt = (
                "You are the TeamOS Assistant Intent Router. Classify the user's input prompt into one of two intents:\n"
                "1. 'plan': The user wants to generate, write, schedule, build, create, update, modify, add milestones, restructure, edit, fix, resolve, clean up, reschedule, reduce risk, unblock, mitigate, or make a project plan safer.\n"
                "2. 'chat': The user is asking for explanation only: project status, comparisons, why something is risky, what conflicts exist, team workloads, wiki page explanations, or greetings.\n\n"
                "Semantic action phrases that imply 'plan': timeline feels impossible, clean up blockers, remove schedule pressure, make the roadmap safer, resolve overlaps, fix deadline danger, unblock the project.\n"
                "Semantic explanation phrases that imply 'chat': why is this risky, what are the blockers, list conflicts, explain timeline pressure.\n\n"
                f"User Prompt: \"{prompt}\"\n\n"
                "Return JSON only: {\"intent\": \"plan\" | \"chat\"}"
            )
            try:
                res = llm_json_call(
                    team=team,
                    operation="intent_classify",
                    messages=[{"role": "system", "content": classification_prompt}],
                    default_on_error={"intent": "chat"}
                )
                intent = res.get("intent", "chat")
            except Exception:
                intent = "chat"

        def _planner_sse_sync():
            from .agent_executor import run_planner_agent_v2

            try:
                for sse_line in run_planner_agent_v2(
                    team_id=str(team_id),
                    prompt=prompt,
                    mode=mode,
                    project_id=project_id,
                    user=request.user,
                    chat_history=chat_history,
                ):
                    yield sse_line
            except Exception as e:
                logger.exception("Planner agent stream failed")
                yield f"event: agent_error\ndata: {_json.dumps({'detail': str(e)})}\n\n"

        def _chat_sse_sync():
            # Compile active projects
            active_projects = Project.objects.filter(team_id=team_id)
            projects_summary = []
            for proj in active_projects:
                projects_summary.append({
                    "id": str(proj.id),
                    "name": proj.name,
                    "description": proj.description,
                    "status": proj.status,
                    "task_count": proj.tasks.count(),
                    "milestone_count": proj.milestones.count(),
                })

            # Get active project context if project_id is present
            current_project_context = ""
            if project_id:
                try:
                    curr_project = Project.objects.get(team_id=team_id, id=project_id)
                    curr_tasks = curr_project.tasks.all().select_related("assignee")
                    curr_milestones = curr_project.milestones.all()

                    tasks_info = []
                    for t in curr_tasks:
                        tasks_info.append({
                            "title": t.title,
                            "description": t.description,
                            "status": t.status,
                            "priority": t.priority,
                            "assignee": t.assignee.display_name if t.assignee else "Unassigned",
                            "start_date": str(t.start_date) if t.start_date else None,
                            "end_date": str(t.end_date) if t.end_date else None,
                            "subtasks_count": t.subtasks.count()
                        })

                    milestones_info = []
                    for m in curr_milestones:
                        milestones_info.append({
                            "title": m.title,
                            "description": m.description,
                            "target_date": str(m.target_date) if m.target_date else None,
                            "status": m.status,
                        })

                    current_project_context = (
                        f"\n\nActive Project Details:\n"
                        f"Project Name: {curr_project.name}\n"
                        f"Description: {curr_project.description}\n"
                        f"Status: {curr_project.status}\n"
                        f"Tasks: {_json.dumps(tasks_info)}\n"
                        f"Milestones: {_json.dumps(milestones_info)}"
                    )
                    try:
                        from .agent_sync import detect_date_conflicts
                        from .remediation import assess_project_risk
                        
                        project_conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id))
                        project_risk = assess_project_risk(team, curr_project, project_conflicts)
                        current_project_context += (
                            f"\nActive Project Conflicts: {_json.dumps(project_conflicts[:10])}"
                            f"\nActive Project Risk: {_json.dumps(project_risk)}"
                        )
                    except Exception:
                        logger.exception("Failed to add project risk/conflict context to architect chat")
                except Exception:
                    pass

            # Perform RAG Wiki Search
            wiki_context = ""
            try:
                from ingest.vectors import vector_store
                search_results = vector_store.search_similar_pages(str(team_id), prompt, limit=4)
                if search_results:
                    wiki_context = "\n\nRelevant Wiki Pages:\n" + "\n".join([
                        f"Title: {p.payload.get('page_title')}\nContent: {p.payload.get('content')[:1500]}"
                        for p in search_results
                    ])
            except Exception:
                pass

            # Compile team member workloads
            member_workloads = []
            for u in User.objects.filter(project_memberships__project__team_id=team_id).distinct():
                user_tasks = Task.objects.filter(project__team_id=team_id, assignee=u)
                member_workloads.append({
                    "name": u.display_name,
                    "email": u.email,
                    "task_count": user_tasks.count(),
                    "tasks": [t.title for t in user_tasks[:5]]
                })

            # Format system context
            system_prompt = (
                "You are the TeamOS AI Planner Architect, a conversational co-pilot for project scheduling, "
                "wiki planning, team allocation, and risk management.\n\n"
                "Your objective is to answer questions thoroughly using the provided database and wiki context.\n"
                "Format your response with premium, clean Markdown (headings, bold text, lists). Be professional, concise, and helpful.\n"
                "IMPORTANT — Clarification questions:\n"
                "Only ask for clarification if there is a CRITICAL missing detail that would meaningfully change the plan's "
                "structure or quality. Do NOT repeat any question already answered in the conversation. "
                "Do NOT ask generic or canned questions. If you have enough context, proceed directly to answering or proposing.\n\n"
                "If asked about project relationships, task status, team workloads, or specific calendar events, use the context below "
                "to answer accurately. Keep schedule dates and project constraints in mind.\n\n"
                f"=== CONTEXT ===\n"
                f"Projects in Team: {_json.dumps(projects_summary)}\n"
                f"Team workloads: {_json.dumps(member_workloads)}"
                f"{current_project_context}"
                f"{wiki_context}"
            )

            # Call streaming LLM — include chat_history for multi-turn memory
            from llm_orchestrator.orchestrator import llm_call
            try:
                messages = [{"role": "system", "content": system_prompt}]
                # Inject last 12 turns of history so the model has full conversational context
                if chat_history:
                    for h in chat_history[-12:]:
                        h_role = h.get("role", "user")
                        h_content = (h.get("content") or h.get("text") or "").strip()
                        if h_role in ("user", "assistant") and h_content:
                            messages.append({"role": h_role, "content": h_content})
                messages.append({"role": "user", "content": prompt})

                response, model_used, routed_by = llm_call(
                    team=team,
                    operation="architect_chat",
                    messages=messages,
                    user=request.user,
                    stream=True
                )
                for chunk in response:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta:
                         reasoning_piece = getattr(delta, "reasoning_content", None) or (
                             delta.model_extra.get("reasoning_content") if hasattr(delta, "model_extra") and delta.model_extra else None
                         )
                         if reasoning_piece:
                             yield f"event: thinking\ndata: {_json.dumps({'content': reasoning_piece})}\n\n"
                         if delta.content:
                             yield f"event: agent_chat_chunk\ndata: {_json.dumps({'text': delta.content})}\n\n"
                yield f"event: agent_chat_done\ndata: {_json.dumps({'ok': True})}\n\n"
            except Exception as e:
                logger.exception("AI Architect chat stream failed")
                yield f"event: agent_error\ndata: {_json.dumps({'detail': str(e)})}\n\n"

        _stream_done = object()
        _heartbeat = object()

        def _queue_get_timed(q, timeout):
            try:
                return q.get(timeout=timeout)
            except queue.Empty:
                return _heartbeat

        async def async_event_stream():
            # ASGI needs a real async iterator (not sync map). Run the sync planner/chat
            # generator in a dedicated thread and multiplex timed reads so we can
            # emit SSE comment keepalives (Heroku H12 ~30s idle on the connection).
            out_q = queue.Queue()

            def producer():
                try:
                    if intent == "chat":
                        for sse_line in _chat_sse_sync():
                            out_q.put(sse_line)
                    else:
                        for sse_line in _planner_sse_sync():
                            out_q.put(sse_line)
                except Exception:
                    logger.exception("Planner SSE producer thread failed")
                finally:
                    out_q.put(_stream_done)

            threading.Thread(
                target=producer,
                name="planning-assist-sse",
                daemon=True,
            ).start()

            yield ": connected\n\n"

            while True:
                chunk = await asyncio.to_thread(
                    _queue_get_timed, out_q, PLANNING_SSE_KEEPALIVE_SEC
                )
                if chunk is _stream_done:
                    break
                if chunk is _heartbeat:
                    yield ": keepalive\n\n"
                    continue
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
        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")

        try:
            from .remediation import remediate_project

            result = remediate_project(team=project.team, project=project, apply_conflicts=True, apply_risk=False)
            return ok({
                **result,
                "status": "resolved" if result["initial_conflict_count"] else "no_conflicts",
                "resolved_count": result["conflict_resolved_count"],
                "skipped_count": result["skipped_count"],
                "skipped": result["warnings"],
                "remaining_conflicts": result["remaining_conflicts"],
            })
        except Exception as e:
            logger.exception("Conflict resolution failed")
            return fail(str(e), status_code=500, code="resolve_failed")

class PlanningRiskView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id):
        from .agent_sync import detect_date_conflicts
        from .remediation import assess_project_risk

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
            
        try:
            team = Team.objects.get(id=team_id)
            conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id))
            risk = assess_project_risk(team, project, conflicts)
            return ok(risk)
        except Exception as e:
            logger.exception("Risk assessment failed")
            return fail(str(e), status_code=500, code="risk_assessment_failed")


class PlanningRiskResolveProposalView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id):
        from .agent_sync import detect_date_conflicts
        from .remediation import assess_project_risk, generate_risk_actions

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")

        try:
            team = Team.objects.get(id=team_id)
            conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id))
            risk = assess_project_risk(team, project, conflicts)
            actions = generate_risk_actions(team, project, conflicts, risk)
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
        from .agent_sync import detect_date_conflicts
        from .remediation import apply_risk_actions, assess_project_risk

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
        try:
            applied, skipped = apply_risk_actions(project, actions)
            team = Team.objects.get(id=team_id)
            remaining_conflicts = detect_date_conflicts(str(team_id), project_id=str(project_id))
            remaining_risk = assess_project_risk(team, project, remaining_conflicts)
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


class PlanningProjectRemediateView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id):
        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if project is None:
            return fail("Project not found.", status_code=404, code="project_not_found")
        try:
            from .remediation import remediate_project

            result = remediate_project(
                team=project.team,
                project=project,
                apply_conflicts=bool(request.data.get("apply_conflicts", True)),
                apply_risk=bool(request.data.get("apply_risk", True)),
            )
            return ok(result)
        except Exception as e:
            logger.exception("Project remediation failed")
            return fail(str(e), status_code=500, code="project_remediation_failed")

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

        reindex_project_async.delay(str(project.id))
        return ok({"restored": True})


class PlanningVersionListView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id):
        from .models import PlanVersion

        versions = PlanVersion.objects.filter(
            project_id=project_id, project__team_id=team_id
        ).order_by("-created_at")[:50]
        data = [
            {
                "id": str(v.id),
                "source": v.source,
                "parent_version_id": str(v.parent_version_id) if v.parent_version_id else None,
                "prompt_hash": v.prompt_hash,
                "created_at": v.created_at.isoformat(),
                "created_by": v.created_by.email if v.created_by else None,
            }
            for v in versions
        ]
        return ok(data)


class PlanningVersionRestoreView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id, version_id):
        from .models import PlanVersion
        from .version_services import create_plan_version

        project = get_project_or_none(team_id=str(team_id), project_id=str(project_id))
        if not project:
            return fail("Project not found", status_code=404)
        try:
            version = PlanVersion.objects.get(id=version_id, project=project)
        except PlanVersion.DoesNotExist:
            return fail("Version not found", status_code=404)

        create_plan_version(project, user=request.user, source="manual", parent_version=version)
        data = version.snapshot_data
        update_project(project, {
            "name": data.get("name", project.name),
            "description": data.get("description", project.description),
            "status": data.get("status", project.status),
        })
        project.tasks.all().delete()
        project.milestones.all().delete()
        for t_data in data.get("tasks", []):
            create_task(
                project=project,
                user=request.user,
                payload={
                    "title": t_data.get("title", "Untitled Task"),
                    "description": t_data.get("description", ""),
                    "status": t_data.get("status", "todo"),
                    "priority": t_data.get("priority", "medium"),
                    "semantic_key": t_data.get("semantic_key", ""),
                    "start_date": t_data.get("start_date"),
                    "end_date": t_data.get("end_date"),
                    "order_index": t_data.get("order_index", 0),
                },
            )
        for m_data in data.get("milestones", []):
            create_milestone(
                project=project,
                user=request.user,
                payload={
                    "title": m_data.get("title", "Untitled Milestone"),
                    "description": m_data.get("description", ""),
                    "status": m_data.get("status", "pending"),
                    "semantic_key": m_data.get("semantic_key", ""),
                    "target_date": m_data.get("target_date"),
                    "order_index": m_data.get("order_index", 0),
                },
            )
        from .tasks import reindex_project_async

        reindex_project_async.delay(str(project.id))
        return ok({"restored": True, "version_id": str(version_id)})


class PlanningChangeSetListView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id):
        from .models import PlanChangeSet

        status_filter = request.query_params.get("status", "pending")
        qs = PlanChangeSet.objects.filter(project_id=project_id, project__team_id=team_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        data = [
            {
                "id": str(cs.id),
                "status": cs.status,
                "impact_summary": cs.impact_summary,
                "pending_mutations": cs.pending_mutations,
                "auto_applied": cs.auto_applied,
                "remediation_preview": cs.remediation_preview,
                "created_at": cs.created_at.isoformat(),
                "base_version_id": str(cs.base_version_id),
                "proposed_version_id": str(cs.proposed_version_id) if cs.proposed_version_id else None,
                "created_by": cs.created_by.email if cs.created_by else "System",
            }
            for cs in qs.order_by("-created_at")[:20]
        ]
        return ok(data)


class PlanningChangeSetDetailView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def get(self, request, team_id, project_id, changeset_id):
        from .models import PlanChangeSet

        try:
            cs = PlanChangeSet.objects.get(
                id=changeset_id, project_id=project_id, project__team_id=team_id
            )
        except PlanChangeSet.DoesNotExist:
            return fail("ChangeSet not found", status_code=404)
        return ok({
            "id": str(cs.id),
            "status": cs.status,
            "mutations": cs.mutations,
            "pending_mutations": cs.pending_mutations,
            "auto_applied": cs.auto_applied,
            "impact_summary": cs.impact_summary,
            "remediation_preview": cs.remediation_preview,
        })


class PlanningChangeSetApproveView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id, changeset_id):
        from .models import PlanChangeSet
        from .tasks import approve_changeset_async

        try:
            cs = PlanChangeSet.objects.get(
                id=changeset_id, project_id=project_id, project__team_id=team_id
            )
        except PlanChangeSet.DoesNotExist:
            return fail("ChangeSet not found", status_code=404)

        # Idempotent: if already approved, return success
        if cs.status == "approved":
            return ok({"approved": True, "changeset_id": str(cs.id), "already_approved": True})

        if cs.status != "pending":
            return fail(f"ChangeSet is not pending: {cs.status}", status_code=400)

        # Queue async approval
        apply_remediation = request.data.get("apply_remediation", False)
        task = approve_changeset_async.delay(str(cs.id), str(request.user.id), apply_remediation)
        
        return ok({
            "processing": True,
            "task_id": str(task.id),
            "changeset_id": str(cs.id)
        })


class PlanningChangeSetRejectView(APIView):
    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id, changeset_id):
        from .models import PlanChangeSet
        from .version_services import reject_changeset

        try:
            cs = PlanChangeSet.objects.get(
                id=changeset_id, project_id=project_id, project__team_id=team_id
            )
        except PlanChangeSet.DoesNotExist:
            return fail("ChangeSet not found", status_code=404)
        try:
            reject_changeset(cs)
            return ok({"rejected": True, "changeset_id": str(cs.id)})
        except ValueError as e:
            return fail(str(e), status_code=400)


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


class PlanningTaskDecomposeDailyView(APIView):
    """POST /api/planning/:team_id/projects/:project_id/tasks/:task_id/decompose-daily/
       Trigger a daily sequence breakdown for a multi-day task."""

    permission_classes = [IsAuthenticated, CanEditPlans]

    def post(self, request, team_id, project_id, task_id):
        from .day_decomposer import decompose_task_daily
        from .serializers import TaskSerializer

        try:
            subtasks = decompose_task_daily(
                team_id=str(team_id),
                project_id=str(project_id),
                task_id=str(task_id),
                user=request.user
            )
            return ok(TaskSerializer(subtasks, many=True).data)
        except ValueError as e:
            return fail(str(e), status_code=400, code="decomposition_failed")
        except Exception as e:
            logger.exception("Decomposition failed")
            return fail(str(e), status_code=500)
