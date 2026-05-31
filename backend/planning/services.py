from __future__ import annotations

import logging

from django.db.models import Count, Q, QuerySet

from accounts.models import User, Team

from django.utils import timezone

from .models import Milestone, PlanChangeSet, PlanEvent, Project, Task, ProjectMember, PlanChunk
from .semantic_utils import compute_semantic_key, entity_text_for_embedding
from wiki.models import WikiPage
from wiki.views import unique_slug
from wiki.services.reindex import reindex_wiki_page
from llm_orchestrator.orchestrator import llm_json_call
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

def broadcast_project_update(project: Project, action: str):
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f"planner_{project.team_id}_{project.id}",
            {
                "type": "planner_message",
                "message": {
                    "type": "state_change",
                    "action": action,
                },
            },
        )
    except Exception:
        logger.debug("Planner broadcast skipped (channels unavailable)", exc_info=True)


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
    except (Project.DoesNotExist, ValueError):
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
    
    # Index the new wiki page when embeddings are available. Project creation
    # should still succeed in local/dev environments without LLM credentials.
    try:
        reindex_wiki_page(wiki_page)
    except Exception:
        logger.exception("Failed to reindex wiki page after planning project creation")

    # Discover and link semantically relevant existing Wiki pages and documents
    try:
        from ingest.vectors import vector_store

        query_text = f"Project: {project.name}\n\nDescription: {project.description}"
        similar_points = vector_store.search_similar_pages(team_id=team_id, query_text=query_text, limit=10)

        matching_page_ids = []
        for pt in similar_points:
            payload = getattr(pt, "payload", {})
            if payload.get("source_type") == "wiki":
                pid = payload.get("page_id")
                # Do not link the newly created brief wiki page itself
                if pid and pid != str(wiki_page.id) and pid not in matching_page_ids:
                    matching_page_ids.append(pid)
                    if len(matching_page_ids) >= 5:
                        break

        if matching_page_ids:
            related_pages = WikiPage.objects.filter(id__in=matching_page_ids, is_deleted=False)
            project.related_wiki_pages.add(*related_pages)
            logger.info("Automatically linked %d related wiki documents to project %s", len(related_pages), project.id)
    except Exception:
        logger.exception("Failed to auto-integrate semantically related Wiki pages on project creation")

    return project


UPDATABLE_PROJECT_FIELDS = {"name", "description", "status"}


def update_project(project: Project, payload: dict) -> Project:
    sanitized_fields = {k: v for k, v in payload.items() if k in UPDATABLE_PROJECT_FIELDS}
    for field, value in sanitized_fields.items():
        setattr(project, field, value)
    project.save(update_fields=[*sanitized_fields.keys(), "updated_at"])
    return project


def delete_project(project: Project) -> None:
    project.delete()


def list_tasks(team_id: str, project_id: str) -> QuerySet[Task]:
    return Task.objects.filter(project__team_id=team_id, project_id=project_id).order_by("order_index", "created_at")


def get_task_or_none(team_id: str, project_id: str, task_id: str) -> Task | None:
    try:
        return Task.objects.get(project__team_id=team_id, project_id=project_id, id=task_id)
    except (Task.DoesNotExist, ValueError):
        return None


def record_plan_event(
    *,
    project: Project,
    entity_type: str,
    entity_id,
    event_type: str,
    payload: dict,
    changeset: PlanChangeSet | None = None,
    actor: User | None = None,
) -> PlanEvent:
    return PlanEvent.objects.create(
        project=project,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        payload=payload,
        changeset=changeset,
        actor=actor,
    )


def lock_fields_on_human_edit(entity: Task | Milestone, field_names: list[str]) -> None:
    locks = dict(entity.human_locked_fields or {})
    now = timezone.now().isoformat()
    for name in field_names:
        locks[name] = now
    entity.human_locked_fields = locks
    entity.save(update_fields=["human_locked_fields", "updated_at"])


def get_plan_mutation_context(project: Project) -> dict:
    """Structured project context for manage-mode delta planning with context budgeting."""
    tasks = []
    
    # ── Context Budgeting (Phase 3) ──
    # If a project has many tasks, keep descriptions concise to stay under 15k tokens
    all_project_tasks = list(project.tasks.prefetch_related("dependencies").order_by("order_index", "created_at"))
    compress_descriptions = len(all_project_tasks) > 30

    for t in all_project_tasks:
        desc = t.description or ""
        if compress_descriptions and len(desc) > 120:
            desc = desc[:117] + "..."

        tasks.append(
            {
                "id": str(t.id),
                "semantic_key": t.semantic_key,
                "title": t.title,
                "description": desc,
                "status": t.status,
                "priority": t.priority,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "end_date": t.end_date.isoformat() if t.end_date else None,
                "parent_task_id": str(t.parent_task_id) if t.parent_task_id else None,
                "assignee_id": str(t.assignee_id) if t.assignee_id else None,
                "dependency_ids": [str(d.id) for d in t.dependencies.all()],
                "human_locked_fields": list((t.human_locked_fields or {}).keys()),
                "order_index": t.order_index,
            }
        )
    milestones = [
        {
            "id": str(m.id),
            "semantic_key": m.semantic_key,
            "title": m.title,
            "description": m.description[:120] if m.description and compress_descriptions else m.description,
            "target_date": m.target_date.isoformat() if m.target_date else None,
            "status": m.status,
            "human_locked_fields": list((m.human_locked_fields or {}).keys()),
            "order_index": m.order_index,
        }
        for m in project.milestones.order_by("order_index", "target_date", "created_at")
    ]
    capability_index = {t["id"]: t["title"][:80] for t in tasks}
    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "tasks": tasks,
        "milestones": milestones,
        "capability_index": capability_index,
        "task_count": len(tasks),
        "milestone_count": len(milestones),
    }


def _sanitize_dependency_ids(deps: Any) -> list[str]:
    """Ensure deps is a flat list of valid UUID strings."""
    if not deps:
        return []
    import uuid
    dep_list = []
    if isinstance(deps, (list, tuple, set)):
        dep_list = list(deps)
    elif isinstance(deps, str):
        if "," in deps:
            dep_list = [item.strip() for item in deps.split(",")]
        else:
            dep_list = [deps.strip()]
    else:
        dep_list = [deps]
        
    valid_deps = []
    for d in dep_list:
        if not d and d != 0:
            continue
        try:
            val = str(d).strip()
            uuid.UUID(val)
            valid_deps.append(val)
        except (ValueError, TypeError):
            pass
    return valid_deps


def create_task(*, project: Project, user: User, payload: dict) -> Task:
    deps = payload.pop("dependency_ids", None) or payload.pop("depends_on", None)
    if not payload.get("semantic_key"):
        payload["semantic_key"] = compute_semantic_key(title=payload.get("title", "Untitled Task"))
    task = Task.objects.create(project=project, created_by=user, **payload)
    if deps:
        valid_deps = _sanitize_dependency_ids(deps)
        if valid_deps:
            task.dependencies.set(valid_deps)
    _maybe_set_task_embedding(task)
    broadcast_project_update(project, "task_created")
    return task


def _maybe_set_task_embedding(task: Task) -> None:
    text = entity_text_for_embedding(task.title, task.description)
    if not text:
        return
    try:
        from ingest.vectors import vector_store

        emb = vector_store._get_embedding(text)
        if emb:
            task.title_embedding = emb
            task.save(update_fields=["title_embedding"])
    except Exception:
        logger.exception("Failed to set task embedding for %s", task.id)


def patch_task(
    task: Task,
    fields: dict,
    *,
    actor: User | None = None,
    respect_locks: bool = True,
    source: str = "agent",
) -> Task:
    """Update only provided fields; respect human locks when requested."""
    payload = dict(fields)
    payload.pop("dependency_ids", None)
    locks = task.human_locked_fields or {}
    if respect_locks:
        payload = {k: v for k, v in payload.items() if k not in locks}
    if not payload:
        return task
    deps = fields.get("dependency_ids")
    for field, value in payload.items():
        setattr(task, field, value)
    task.save(update_fields=[*payload.keys(), "updated_at"])
    if deps is not None:
        valid_deps = _sanitize_dependency_ids(deps)
        task.dependencies.set(valid_deps)
    broadcast_project_update(task.project, "task_updated")
    return task


def update_task(task: Task, payload: dict) -> Task:
    """Full update used by human REST API — locks touched operational fields."""
    deps = payload.pop("dependency_ids", None)
    human_fields = [k for k in ("status", "priority", "assignee_id", "start_date", "end_date") if k in payload]
    if human_fields:
        lock_fields_on_human_edit(task, human_fields)
    for field, value in payload.items():
        setattr(task, field, value)
    task.save(update_fields=[*payload.keys(), "updated_at"])
    if deps is not None:
        valid_deps = _sanitize_dependency_ids(deps)
        task.dependencies.set(valid_deps)
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
    except (Milestone.DoesNotExist, ValueError):
        return None


def create_milestone(*, project: Project, user: User, payload: dict) -> Milestone:
    if not payload.get("semantic_key"):
        payload["semantic_key"] = compute_semantic_key(title=payload.get("title", "Untitled"))
    return Milestone.objects.create(project=project, created_by=user, **payload)


def patch_milestone(
    milestone: Milestone,
    fields: dict,
    *,
    actor: User | None = None,
    respect_locks: bool = True,
) -> Milestone:
    payload = dict(fields)
    locks = milestone.human_locked_fields or {}
    if respect_locks:
        payload = {k: v for k, v in payload.items() if k not in locks}
    if not payload:
        return milestone
    for field, value in payload.items():
        setattr(milestone, field, value)
    milestone.save(update_fields=[*payload.keys(), "updated_at"])
    return milestone


def update_milestone(milestone: Milestone, payload: dict) -> Milestone:
    human_fields = [k for k in ("status", "target_date", "title") if k in payload]
    if human_fields:
        lock_fields_on_human_edit(milestone, human_fields)
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
    for task in task_qs.select_related("project", "assignee").order_by("start_date", "end_date", "created_at"):
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
                "description": task.description,
                "priority": task.priority,
                "assignee_email": task.assignee.email if task.assignee else None,
                "parent_task_id": str(task.parent_task_id) if task.parent_task_id else None,
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
                "description": milestone.description,
                "priority": "high",
                "assignee_email": None,
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
        "priority (low, medium, high), assignee_id when a team member is appropriate, startDate (YYYY-MM-DD), and endDate (YYYY-MM-DD). "
        "Milestones should have: title, date (YYYY-MM-DD), description, and status (pending, reached, missed). "
        "Members should be a list of suggested roles: { \"userId\": \"...\", \"role\": \"...\" }. "
        "CRITICAL: Create mode must build the full execution plan: tasks, timeline dates, board-ready statuses, calendar-ready dates, and role assignments. "
        "CRITICAL: Manage mode must update ONLY the existing project supplied in context. Do not invent or describe a new project. "
        "When updating a project, preserve the existing 'id' for tasks/milestones you wish to keep or modify. "
        "Only add new tasks/milestones when explicitly requested, omit the 'id', and set action to 'create'. "
        "You are expected to populate the project timeline intelligently across days/weeks. "
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
