"""Autonomous scheduled agent tasks."""

import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone

from accounts.models import Team
from planning.models import Task, Milestone
from wiki.models import WikiPage
from chat.models import AgentEpisode
from llm_orchestrator.orchestrator import llm_call

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def daily_team_health_check(self, team_id: str):
    """Daily: checks overdue items, stale wiki, approaching milestones, conflicts."""
    try:
        team = Team.objects.get(id=team_id)
    except Team.DoesNotExist:
        return

    today = timezone.now().date()
    week_from_now = today + timedelta(days=7)

    overdue = list(Task.objects.filter(
        project__team_id=team_id, end_date__lt=today,
        status__in=["todo", "in-progress"],
    ).select_related("project")[:20])

    approaching = list(Milestone.objects.filter(
        project__team_id=team_id, target_date__range=[today, week_from_now],
        status="pending",
    ).select_related("project")[:10])

    stale_pages = list(WikiPage.objects.filter(
        team_id=team_id, is_deleted=False,
        updated_at__lt=timezone.now() - timedelta(days=90),
    )[:10])

    from planning.agent_sync import detect_date_conflicts
    conflicts = detect_date_conflicts(team_id)

    health = {
        "team_id": team_id,
        "checked_at": str(timezone.now()),
        "overdue_count": len(overdue),
        "approaching_milestones": len(approaching),
        "stale_pages": len(stale_pages),
        "conflicts": len(conflicts),
        "has_critical": len(overdue) > 5 or len(conflicts) > 0,
    }

    AgentEpisode.objects.create(
        team=team, trigger="daily_health_check",
        plan={"type": "scheduled"},
        actions=[{"tool": "health_check"}],
        outcome=health,
        success=not health["has_critical"],
        tags=["health_check", "scheduled"],
    )

    logger.info("Health check team %s: %d overdue, %d conflicts, %d stale",
                 team_id, len(overdue), len(conflicts), len(stale_pages))
    return health


@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def on_wiki_page_updated(self, page_id: str):
    """After wiki page save: enrich graph edges, check plan references."""
    try:
        page = WikiPage.objects.get(id=page_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return

    from graph_engine.enricher import enrich_on_page_save
    enrich_on_page_save(page)

    affected = Task.objects.filter(
        project__team_id=page.team_id,
        description__contains=f"[[{page.title}]]",
        status__in=["todo", "in-progress"],
    )
    for task in affected:
        task.frontmatter = task.frontmatter or {}
        task.frontmatter.setdefault("wiki_updates", []).append({
            "page": page.title, "updated_at": str(page.updated_at),
        })
        task.save(update_fields=["frontmatter"])

    if affected.exists():
        logger.info("Wiki '%s' updated — %d tasks affected", page.title, affected.count())


@shared_task(bind=True, max_retries=1, default_retry_delay=600)
def weekly_retrospective(self, team_id: str):
    """Weekly: generate team performance summary."""
    try:
        team = Team.objects.get(id=team_id)
    except Team.DoesNotExist:
        return

    one_week_ago = timezone.now() - timedelta(days=7)
    completed = Task.objects.filter(
        project__team_id=team_id, status="completed",
        updated_at__gte=one_week_ago,
    ).select_related("project")

    if not completed.exists():
        return

    task_list = "\n".join(
        f"- [{t.project.name}] {t.title} ({t.priority})"
        for t in completed[:20]
    )

    prompt = f"""Weekly retrospective for team "{team.name}".

Completed tasks ({completed.count()}):
{task_list}

Generate: 1) Key accomplishments 2) Patterns observed 3) Recommendations for next week.
Output in markdown."""

    resp, _, _ = llm_call(
        team=team, operation="weekly_retrospective",
        messages=[{"role": "user", "content": prompt}],
    )
    summary = resp.choices[0].message.content if resp else ""

    slug = f"retro-{timezone.now().strftime('%Y-w%W')}"
    WikiPage.objects.update_or_create(
        team=team, slug=slug,
        defaults={
            "title": f"Weekly Retro — W{timezone.now().strftime('%W')}",
            "content": summary,
            "page_type": "retrospective",
            "frontmatter": {"auto_generated": True},
        }
    )
    logger.info("Retrospective generated for team %s", team_id)
    return summary


@shared_task(bind=True, max_retries=1)
def daily_health_check_all_teams(self):
    """Celery beat wrapper: run health check for all teams."""
    from accounts.models import Team
    for team in Team.objects.all():
        daily_team_health_check.delay(str(team.id))


@shared_task(bind=True, max_retries=1)
def weekly_retrospective_all_teams(self):
    """Celery beat wrapper: run retrospective for all teams."""
    from accounts.models import Team
    for team in Team.objects.all():
        weekly_retrospective.delay(str(team.id))
