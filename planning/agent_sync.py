"""
Bidirectional plan ↔ wiki sync driven by the agent.

When wiki pages change, the agent checks if active plans are affected.
When plans change, the agent updates associated wiki pages.
Also handles calendar conflict detection and timeline management.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any

from django.db.models import Q

from graph_engine.models import GraphEdge
from ingest.vectors import vector_store
from planning.models import Milestone, Project, Task
from llm_orchestrator.orchestrator import llm_json_call
from accounts.models import Team
from wiki.models import WikiPage

logger = logging.getLogger(__name__)


# ── Calendar Conflict Detection ──────────────────────────────────────


def detect_date_conflicts(
    team_id: str,
    *,
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    """
    Find overlapping tasks and milestone conflicts within a team or project.
    """
    task_qs = Task.objects.filter(
        project__team_id=team_id,
        start_date__isnull=False,
        end_date__isnull=False,
    ).select_related("project", "assignee")

    if project_id:
        task_qs = task_qs.filter(project_id=project_id)

    tasks = list(task_qs.order_by("start_date"))
    conflicts = []

    for i, t1 in enumerate(tasks):
        for t2 in tasks[i + 1 :]:
            # Check for date overlap
            if t1.start_date <= t2.end_date and t2.start_date <= t1.end_date:
                # Check if same assignee (real conflict) or just parallel work
                same_assignee = (
                    t1.assignee_id and t2.assignee_id and t1.assignee_id == t2.assignee_id
                )
                conflicts.append({
                    "type": "task_overlap",
                    "severity": "high" if same_assignee else "low",
                    "task_1": {
                        "id": str(t1.id),
                        "title": t1.title,
                        "project": t1.project.name,
                        "start": t1.start_date.isoformat(),
                        "end": t1.end_date.isoformat(),
                        "assignee": t1.assignee.email if t1.assignee else None,
                    },
                    "task_2": {
                        "id": str(t2.id),
                        "title": t2.title,
                        "project": t2.project.name,
                        "start": t2.start_date.isoformat(),
                        "end": t2.end_date.isoformat(),
                        "assignee": t2.assignee.email if t2.assignee else None,
                    },
                    "same_assignee": same_assignee,
                })

    # Check milestones falling on same date
    milestone_qs = Milestone.objects.filter(
        project__team_id=team_id,
        target_date__isnull=False,
    ).select_related("project")
    if project_id:
        milestone_qs = milestone_qs.filter(project_id=project_id)

    milestones = list(milestone_qs.order_by("target_date"))
    for i, m1 in enumerate(milestones):
        for m2 in milestones[i + 1 :]:
            if m1.target_date == m2.target_date and m1.project_id != m2.project_id:
                conflicts.append({
                    "type": "milestone_clash",
                    "severity": "medium",
                    "milestone_1": {
                        "id": str(m1.id),
                        "title": m1.title,
                        "project": m1.project.name,
                        "date": m1.target_date.isoformat(),
                    },
                    "milestone_2": {
                        "id": str(m2.id),
                        "title": m2.title,
                        "project": m2.project.name,
                        "date": m2.target_date.isoformat(),
                    },
                })

    return conflicts


# ── Wiki → Plan Impact Analysis ──────────────────────────────────────


def analyze_wiki_change_impact(
    page_id: str,
    team_id: str,
) -> dict[str, Any]:
    """
    When a wiki page changes, analyze impact on active plans.
    Finds plan tasks that reference this page via graph edges.
    """
    try:
        page = WikiPage.objects.get(id=page_id, team_id=team_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return {"affected_projects": [], "affected_tasks": []}

    # Find all projects whose wiki pages link to this page
    incoming_edges = GraphEdge.objects.filter(
        to_page=page,
        from_page__is_deleted=False,
    ).select_related("from_page")

    affected_projects = set()
    affected_pages = []

    for edge in incoming_edges:
        from_page = edge.from_page
        # Check if this page is linked to a project
        if hasattr(from_page, "project") and from_page.project:
            affected_projects.add(from_page.project)
            affected_pages.append({
                "page_id": str(from_page.id),
                "page_title": from_page.title,
                "project_id": str(from_page.project_id),
                "project_name": from_page.project.name,
                "edge_type": edge.edge_type,
                "reason": edge.reason,
            })

    affected_tasks = []
    for project in affected_projects:
        tasks = Task.objects.filter(project=project, status__in=["todo", "in-progress"])
        for task in tasks:
            affected_tasks.append({
                "task_id": str(task.id),
                "task_title": task.title,
                "project_id": str(project.id),
                "project_name": project.name,
                "status": task.status,
            })

    return {
        "changed_page": {"id": str(page.id), "title": page.title},
        "affected_projects": [
            {"id": str(p.id), "name": p.name, "status": p.status}
            for p in affected_projects
        ],
        "affected_pages": affected_pages,
        "affected_tasks": affected_tasks,
    }


# ── Plan → Wiki Sync ────────────────────────────────────────────────


def generate_project_timeline_markdown(project: Project) -> str:
    """Generate a markdown timeline for a project's wiki page."""
    tasks = project.tasks.order_by("start_date", "order_index", "created_at").all()
    milestones = project.milestones.order_by("target_date", "order_index").all()

    md = f"# {project.name}\n\n"
    md += f"{project.description}\n\n"
    md += f"**Status:** {project.status}\n\n"

    if milestones:
        md += "## Milestones\n\n"
        md += "| Milestone | Target Date | Status |\n"
        md += "|-----------|------------|--------|\n"
        for m in milestones:
            date_str = m.target_date.isoformat() if m.target_date else "TBD"
            md += f"| {m.title} | {date_str} | {m.status} |\n"
        md += "\n"

    if tasks:
        md += "## Tasks\n\n"
        md += "| Task | Status | Priority | Assignee | Dates |\n"
        md += "|------|--------|----------|----------|-------|\n"
        for t in tasks:
            assignee = t.assignee.email if t.assignee else "Unassigned"
            start = t.start_date.isoformat() if t.start_date else "-"
            end = t.end_date.isoformat() if t.end_date else "-"
            md += f"| {t.title} | {t.status} | {t.priority} | {assignee} | {start} → {end} |\n"
        md += "\n"

    # Progress summary
    total = tasks.count()
    completed = tasks.filter(status="completed").count()
    if total > 0:
        pct = int(completed / total * 100)
        md += f"## Progress\n\n"
        md += f"**{completed}/{total} tasks completed ({pct}%)**\n\n"

    return md


def sync_project_to_wiki(project: Project) -> WikiPage | None:
    """
    Update the project's associated wiki page with current plan data.
    Creates the page if it doesn't exist.
    """
    from wiki.services.reindex import reindex_wiki_page
    from wiki.views import unique_slug

    timeline_md = generate_project_timeline_markdown(project)

    if hasattr(project, "wiki_page") and project.wiki_page:
        page = project.wiki_page
        page.content = timeline_md
        page.save(update_fields=["content", "updated_at"])
        try:
            reindex_wiki_page(page)
        except Exception:
            logger.exception("Failed to reindex project wiki page %s", page.id)
        return page

    # Create new wiki page for project
    slug = unique_slug(project.team, project.name)
    page = WikiPage.objects.create(
        team=project.team,
        project=project,
        title=project.name,
        slug=slug,
        page_type="brief",
        content=timeline_md,
        created_by=project.created_by,
    )
    try:
        reindex_wiki_page(page)
    except Exception:
        logger.exception("Failed to reindex new project wiki page %s", page.id)
    return page


# ── Agent-Grounded Plan Generation ──────────────────────────────────


def generate_plan_with_wiki_context(
    team_id: str,
    prompt: str,
    mode: str = "create",
    project_context: dict | None = None,
) -> dict:
    """
    Enhanced plan generation that deeply uses wiki context:
    1. Vector search for related knowledge
    2. Traverse graph from top results for deeper context
    3. Identify knowledge gaps
    4. Generate wiki-grounded plan with references
    """
    from graph_engine.traversal import traverse_neighbors, knowledge_gap_analysis

    team = Team.objects.get(id=team_id)

    # Phase 1: Deep wiki context gathering with Multi-Query Expansion
    search_queries = [prompt]
    try:
        expansion_prompt = (
            f"Given the planning prompt: '{prompt}', generate 3 diverse search queries to find relevant wiki content "
            f"that captures the intent, technical context, and background. Return as a simple JSON list of strings."
        )
        expanded = llm_json_call(
            team=team,
            operation="query_expansion",
            messages=[{"role": "user", "content": expansion_prompt}],
            default_on_error=[]
        )
        if isinstance(expanded, list):
            search_queries.extend(expanded[:3])
    except Exception:
        logger.warning("Query expansion failed during planning context gathering.")

    all_results = []
    seen_ids = set()
    for q in search_queries:
        results = vector_store.search_similar_pages(team_id, q, limit=8)
        for res in results:
            if res.id not in seen_ids:
                all_results.append(res)
                seen_ids.add(res.id)
    
    # Sort and take top results
    all_results.sort(key=lambda x: x.score, reverse=True)
    search_results = all_results[:10]

    # Phase 2: Traverse graph from top results for deeper context
    graph_context = []
    seen_page_ids = set()
    for res in search_results[:5]:
        pid = res.payload.get("page_id")
        if not pid or pid in seen_page_ids:
            continue
        seen_page_ids.add(pid)

        neighbors = traverse_neighbors(
            pid, team_id, max_hops=1, include_content=True, max_results=5
        )
        for n in neighbors:
            if n["page_id"] not in seen_page_ids:
                seen_page_ids.add(n["page_id"])
                graph_context.append(
                    f"RELATED ({n.get('page_type', 'standard')}): {n['title']}\n"
                    f"{n.get('content_excerpt', '')}"
                )

    # Phase 3: Build rich context
    context_parts = []
    for res in search_results:
        source = res.payload.get("page_title") or res.payload.get("project_name") or "Knowledge"
        content = res.payload.get("content", "")
        context_parts.append(f"SOURCE: {source}\nCONTENT: {content}")

    if graph_context:
        context_parts.append("--- GRAPH-CONNECTED KNOWLEDGE ---")
        context_parts.extend(graph_context[:5])

    context_text = "\n\n".join(context_parts)

    # Phase 3.5: Build Semantic Expertise Profiles
    from accounts.models import TeamMember
    from wiki.models import WikiPage
    from django.db.models import Count

    team_members = TeamMember.objects.filter(team=team).select_related("user")
    expertise_profiles = []
    
    for tm in team_members:
        # Get pages this user has created or edited significantly
        user_pages = WikiPage.objects.filter(
            team=team, created_by=tm.user, is_deleted=False
        ).values_list("title", flat=True)[:5]
        
        expertise = list(user_pages)
        expertise_str = ", ".join(expertise) if expertise else "General"
        expertise_profiles.append(
            f"User ID: {tm.user.id} | Name: {tm.user.first_name or tm.user.email} | "
            f"Known Expertise (Wiki Authored): {expertise_str}"
        )

    expertise_context = "\n".join(expertise_profiles)

    # Phase 4: Generate plan with rich context
    system_prompt = (
        "You are the TeamOS Plan Architect with deep wiki knowledge access. "
        "Generate a detailed project plan grounded in the team's existing knowledge. "
        "IMPORTANT: Reference specific wiki pages using [[Page Title]] syntax. "
        "Generate JSON with: projectName, description, tasks, milestones, members, "
        "and a 'wiki_references' array listing which wiki pages informed each task. "
        "Tasks: title, description, status (todo/in-progress/completed/blocked), "
        "priority (low/medium/high), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), "
        "assignee_id (UUID of the best team member based on Expertise), "
        "wikiReferences (list of page titles this task relates to). "
        "Milestones: title, date (YYYY-MM-DD), description, status (pending/reached/missed). "
        "Members: list of suggested roles {userId, role}. "
        "Return ONLY valid JSON."
    )

    user_content = f"Team Knowledge Context:\n{context_text}\n\nTeam Expertise Profiles:\n{expertise_context}\n\nMission: {prompt}"
    if mode == "manage" and project_context:
        user_content += f"\n\nExisting Project: {json.dumps(project_context)}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    result = llm_json_call(
        team=team,
        operation="plan_generate",
        messages=messages,
        default_on_error={}
    )

    if not result:
        raise ValueError("Failed to generate plan.")

    # Enrich with knowledge gap info
    try:
        gaps = knowledge_gap_analysis(team_id)
        result["knowledge_gaps"] = gaps.get("orphan_concepts", [])[:5]
    except Exception:
        logger.exception("Knowledge gap analysis failed during plan generation")
        result["knowledge_gaps"] = []

    return result


# ── Overdue / Status Check ──────────────────────────────────────────


def check_overdue_items(team_id: str) -> dict[str, Any]:
    """Check for overdue tasks and missed milestones."""
    today = date.today()

    overdue_tasks = Task.objects.filter(
        project__team_id=team_id,
        end_date__lt=today,
        status__in=["todo", "in-progress"],
    ).select_related("project", "assignee")

    missed_milestones = Milestone.objects.filter(
        project__team_id=team_id,
        target_date__lt=today,
        status="pending",
    ).select_related("project")

    return {
        "overdue_tasks": [
            {
                "id": str(t.id),
                "title": t.title,
                "project": t.project.name,
                "end_date": t.end_date.isoformat(),
                "days_overdue": (today - t.end_date).days,
                "assignee": t.assignee.email if t.assignee else None,
                "status": t.status,
            }
            for t in overdue_tasks
        ],
        "missed_milestones": [
            {
                "id": str(m.id),
                "title": m.title,
                "project": m.project.name,
                "target_date": m.target_date.isoformat(),
                "days_overdue": (today - m.target_date).days,
            }
            for m in missed_milestones
        ],
    }
