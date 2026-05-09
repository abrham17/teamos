"""
Build and maintain PlanChunk rows + Qdrant vectors for planning entities.
"""

from __future__ import annotations

from typing import Iterable

from ingest.vectors import vector_store
from planning.models import Milestone, PlanChunk, Project, Task
from wiki.services.reindex import reindex_wiki_page


def _chunk_lines(project: Project) -> Iterable[dict]:
    yield {
        "source_kind": "project",
        "source_ref_id": None,
        "title": project.name,
        "content": f"Project: {project.name}\nStatus: {project.status}\nDescription: {project.description or 'No description.'}",
    }

    for task in project.tasks.order_by("order_index", "created_at").all():
        assignee = task.assignee.email if task.assignee else "Unassigned"
        yield {
            "source_kind": "task",
            "source_ref_id": str(task.id),
            "title": f"Task: {task.title}",
            "content": (
                f"Task: {task.title}\nStatus: {task.status}\nPriority: {task.priority}\n"
                f"Assignee: {assignee}\nStart: {task.start_date or '-'}\nEnd: {task.end_date or '-'}\n"
                f"Description: {task.description or 'No description.'}"
            ),
        }

    for milestone in project.milestones.order_by("order_index", "target_date", "created_at").all():
        yield {
            "source_kind": "milestone",
            "source_ref_id": str(milestone.id),
            "title": f"Milestone: {milestone.title}",
            "content": (
                f"Milestone: {milestone.title}\nStatus: {milestone.status}\n"
                f"Target date: {milestone.target_date or '-'}\nDescription: {milestone.description or 'No description.'}"
            ),
        }


def clear_project_chunks(project: Project) -> None:
    existing = list(PlanChunk.objects.filter(project=project))
    point_ids = [str(chunk.id) for chunk in existing]
    if point_ids:
        vector_store.delete_points(str(project.team_id), point_ids)
    if existing:
        PlanChunk.objects.filter(project=project).delete()


def reindex_project(project: Project) -> int:
    clear_project_chunks(project)

    created_chunks: list[PlanChunk] = []
    point_payloads = []

    for idx, payload in enumerate(_chunk_lines(project)):
        content = payload["content"]
        chunk = PlanChunk.objects.create(
            project=project,
            chunk_index=idx,
            source_kind=payload["source_kind"],
            source_ref_id=payload["source_ref_id"] or None,
            title=payload["title"],
            content=content,
            content_hash=PlanChunk.hash_content(content),
        )
        created_chunks.append(chunk)
        point_payloads.append(
            {
                "id": str(chunk.id),
                "content": chunk.content,
                "index": chunk.chunk_index,
                "project_name": project.name,
                "source_kind": chunk.source_kind,
                "source_ref_id": str(chunk.source_ref_id) if chunk.source_ref_id else None,
                "title": chunk.title,
            }
        )

    if point_payloads:
        vector_store.upsert_plan_chunks(str(project.team_id), str(project.id), point_payloads)

    # Sync with associated WikiPage if exists
    if hasattr(project, "wiki_page") and project.wiki_page:
        page = project.wiki_page
        
        # Build a markdown dashboard for the wiki page
        tasks = project.tasks.all()
        milestones = project.milestones.all()
        
        md = f"# {project.name}\n\n{project.description}\n\n"
        md += "## Strategic Roadmap\n\n"
        
        if milestones:
            md += "### Checkpoints\n"
            for m in milestones:
                md += f"- **{m.title}**: {m.status} ({m.target_date or 'TBD'})\n"
            md += "\n"
            
        if tasks:
            md += "### Objectives\n"
            for t in tasks:
                md += f"- **{t.title}**: {t.status} - {t.priority} priority\n"
                
        page.content = md
        page.save(update_fields=["content", "updated_at"])
        reindex_wiki_page(page)

    return len(created_chunks)


def reindex_project_from_task(task: Task) -> int:
    return reindex_project(task.project)


def reindex_project_from_milestone(milestone: Milestone) -> int:
    return reindex_project(milestone.project)
