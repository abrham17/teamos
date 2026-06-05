"""Autonomous scheduled agent tasks."""

import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone

from accounts.models import Team
from wiki.models import WikiPage
from chat.models import AgentEpisode

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def daily_team_health_check(self, team_id: str):
    """Daily: checks stale wiki pages and logs a health episode."""
    try:
        team = Team.objects.get(id=team_id)
    except Team.DoesNotExist:
        return

    stale_pages = WikiPage.objects.filter(
        team_id=team_id,
        is_deleted=False,
        updated_at__lt=timezone.now() - timedelta(days=90),
    ).count()

    health = {
        "team_id": team_id,
        "checked_at": str(timezone.now()),
        "stale_pages": stale_pages,
        "has_critical": stale_pages > 10,
    }
    AgentEpisode.objects.create(
        team=team, trigger="daily_health_check",
        plan={"type": "scheduled"},
        actions=[{"tool": "health_check"}],
        outcome=health,
        success=not health["has_critical"],
        tags=["health_check", "scheduled"],
    )
    return health


@shared_task(bind=True, max_retries=1)
def daily_health_check_all_teams(self):
    team_ids = Team.objects.values_list("id", flat=True).iterator(chunk_size=50)
    for team_id in team_ids:
        daily_team_health_check.apply_async(
            args=[str(team_id)],
            countdown=1,
        )
