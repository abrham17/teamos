from __future__ import annotations

from django.db.models import Count, Q, QuerySet

from accounts.models import User, Team

from .models import Milestone, Project, Task, ProjectMember, PlanChunk
from wiki.models import WikiPage
from wiki.views import unique_slug
from wiki.services.reindex import reindex_wiki_page
from llm_orchestrator.orchestrator import llm_json_call
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

def broadcast_project_update(project: Project, action: str):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"planner_{project.team_id}_{project.id}",
        {
            "type": "planner_message",
            "message": {
                "type": "state_change",
                "action": action
            }
        }
    )


def list_projects(team_id: str, query: str = "") -> QuerySet[Project]:
    projects = (
        Project.objects.filter(team_id=team_id)
        .annotate(task_count=Count("tasks"), milestone_count=Count("milestones"))
        .order_by("-updated_at")
    )
    if query:
        projects = projects.filter(Q(name__icontains=query) | Q(description__icontains=query))
    return projects


def get_project_or_none(team_id: str, project_id: str) -> Project | None:
    try:
        return Project.objects.get(team_id=team_id, id=project_id)
    except Project.DoesNotExist:
        return None


def create_project(*, team_id: str, user: User, payload: dict) -> Project:
    team = Team.objects.get(id=team_id)
    project = Project.objects.create(
        team=team,
        name=payload.get("name", "Untitled Project"),
        description=payload.get("description", ""),
        status=payload.get("status", "active"),
        created_by=user,
    )

    # Create a project dashboard/brief in the wiki automatically
    slug = unique_slug(team, project.name)
    wiki_page = WikiPage.objects.create(
        team=team,
        project=project,
        title=project.name,
        slug=slug,
        page_type="brief",
        content=f"# {project.name}\n\n{project.description}\n\n## Strategic Roadmap Initialized.",
        created_by=user
    )
    
    # Index the new wiki page (this also wires the graph)
    reindex_wiki_page(wiki_page)

    return project


def update_project(project: Project, payload: dict) -> Project:
    for field, value in payload.items():
        setattr(project, field, value)
    project.save(update_fields=[*payload.keys(), "updated_at"])
    return project


def delete_project(project: Project) -> None:
    project.delete()


def list_tasks(team_id: str, project_id: str) -> QuerySet[Task]:
    return Task.objects.filter(project__team_id=team_id, project_id=project_id).order_by("order_index", "created_at")


def get_task_or_none(team_id: str, project_id: str, task_id: str) -> Task | None:
    try:
        return Task.objects.get(project__team_id=team_id, project_id=project_id, id=task_id)
    except Task.DoesNotExist:
        return None


def create_task(*, project: Project, user: User, payload: dict) -> Task:
    deps = payload.pop("dependency_ids", [])
    task = Task.objects.create(project=project, created_by=user, **payload)
    if deps:
        task.dependencies.set(deps)
    broadcast_project_update(project, "task_created")
    return task


def update_task(task: Task, payload: dict) -> Task:
    deps = payload.pop("dependency_ids", None)
    for field, value in payload.items():
        setattr(task, field, value)
    task.save(update_fields=[*payload.keys(), "updated_at"])
    if deps is not None:
        task.dependencies.set(deps)
    broadcast_project_update(task.project, "task_updated")
    return task


def delete_task(task: Task) -> None:
    project = task.project
    task.delete()
    broadcast_project_update(project, "task_deleted")


def list_milestones(team_id: str, project_id: str) -> QuerySet[Milestone]:
    return Milestone.objects.filter(project__team_id=team_id, project_id=project_id).order_by(
        "order_index", "target_date", "created_at"
    )


def get_milestone_or_none(team_id: str, project_id: str, milestone_id: str) -> Milestone | None:
    try:
        return Milestone.objects.get(project__team_id=team_id, project_id=project_id, id=milestone_id)
    except Milestone.DoesNotExist:
        return None


def create_milestone(*, project: Project, user: User, payload: dict) -> Milestone:
    return Milestone.objects.create(project=project, created_by=user, **payload)


def update_milestone(milestone: Milestone, payload: dict) -> Milestone:
    for field, value in payload.items():
        setattr(milestone, field, value)
    milestone.save(update_fields=[*payload.keys(), "updated_at"])
    return milestone


def delete_milestone(milestone: Milestone) -> None:
    milestone.delete()


def add_project_member(*, project: Project, user: User, role: str) -> ProjectMember:
    member, created = ProjectMember.objects.get_or_create(
        project=project, user=user, defaults={"role": role}
    )
    if not created:
        member.role = role
        member.save()
    return member


def remove_project_member(*, project: Project, user: User) -> None:
    ProjectMember.objects.filter(project=project, user=user).delete()


def calendar_feed(team_id: str, *, from_date: str | None = None, to_date: str | None = None) -> list[dict]:
    task_qs = Task.objects.filter(project__team_id=team_id)
    milestone_qs = Milestone.objects.filter(project__team_id=team_id)

    if from_date:
        task_qs = task_qs.filter(end_date__gte=from_date)
        milestone_qs = milestone_qs.filter(target_date__gte=from_date)
    if to_date:
        task_qs = task_qs.filter(start_date__lte=to_date)
        milestone_qs = milestone_qs.filter(target_date__lte=to_date)

    events: list[dict] = []
    for task in task_qs.select_related("project").order_by("start_date", "end_date", "created_at"):
        if not task.start_date and not task.end_date:
            continue
        events.append(
            {
                "kind": "task",
                "id": str(task.id),
                "project_id": str(task.project_id),
                "project_name": task.project.name,
                "title": task.title,
                "status": task.status,
                "start_date": task.start_date.isoformat() if task.start_date else None,
                "end_date": task.end_date.isoformat() if task.end_date else None,
            }
        )

    for milestone in milestone_qs.select_related("project").order_by("target_date", "created_at"):
        if not milestone.target_date:
            continue
        events.append(
            {
                "kind": "milestone",
                "id": str(milestone.id),
                "project_id": str(milestone.project_id),
                "project_name": milestone.project.name,
                "title": milestone.title,
                "status": milestone.status,
                "start_date": milestone.target_date.isoformat(),
                "end_date": milestone.target_date.isoformat(),
            }
        )

    return events


def generate_plan_draft(
    team_id: str,
    prompt: str,
    mode: str = "create",
    project_context: dict | None = None,
) -> dict:
    from ingest.vectors import vector_store
    team = Team.objects.get(id=team_id)

    # PERFORM RAG: Search for relevant wiki pages and other projects
    search_results = vector_store.search_similar_pages(team_id, prompt, limit=5)
    context_text = "\n".join([
        f"Source: {p.payload.get('page_title') or p.payload.get('project_name') or 'Knowledge'}\nContent: {p.payload.get('content')}"
        for p in search_results
    ])

    system_prompt = (
        "You are the TeamOS Plan Architect. You have full control over the project planning infrastructure. "
        "Generate a detailed project plan or update in JSON format. "
        "The plan must include a projectName, description, tasks, milestones, and members. "
        "Tasks should have: title, description, status (todo, in-progress, completed, blocked), "
        "priority (low, medium, high), startDate (YYYY-MM-DD), and endDate (YYYY-MM-DD). "
        "Milestones should have: title, date (YYYY-MM-DD), description, and status (pending, reached, missed). "
        "Members should be a list of suggested roles: { \"userId\": \"...\", \"role\": \"...\" }. "
        "CRITICAL: When updating a project, you MUST preserve the existing 'id' for tasks/milestones you wish to keep or modify. "
        "Omit the 'id' for new items. You are expected to populate the project timeline intelligently across days/weeks. "
        "Return ONLY valid JSON."
    )

    user_content = f"Context from Team Knowledge Base:\n{context_text}\n\nMission: {prompt}"
    if mode == "manage" and project_context:
        user_content += f"\n\nExisting Project Context: {project_context}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    return llm_json_call(
        team=team,
        operation="plan_generate",
        messages=messages,
        default_on_error={"error": "Plan generation failed."}
    )
