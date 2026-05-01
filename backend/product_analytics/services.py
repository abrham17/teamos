from datetime import date, timedelta

from django.db.models import Count
from django.db.models.functions import TruncWeek

from accounts.models import Team
from .models import ProductEvent


def record_product_event(
    *,
    event_name: str,
    team=None,
    user=None,
    team_id: str | None = None,
    user_id: str | None = None,
    properties: dict | None = None,
) -> ProductEvent:
    create_kwargs = {
        "event_name": event_name,
        "properties": properties or {},
    }
    if team is not None:
        create_kwargs["team"] = team
    elif team_id is not None:
        create_kwargs["team_id"] = team_id

    if user is not None:
        create_kwargs["user"] = user
    elif user_id is not None:
        create_kwargs["user_id"] = user_id

    return ProductEvent.objects.create(**create_kwargs)


def record_first_once(*, event_name: str, team, user=None, properties: dict | None = None) -> ProductEvent | None:
    if ProductEvent.objects.filter(team=team, event_name=event_name).exists():
        return None
    return record_product_event(event_name=event_name, team=team, user=user, properties=properties)


def weekly_funnel_counts(team) -> list[dict]:
    rows = (
        ProductEvent.objects.filter(team=team)
        .annotate(week=TruncWeek("occurred_at"))
        .values("week", "event_name")
        .annotate(count=Count("id"))
        .order_by("week", "event_name")
    )
    return [
        {
            "week_start": row["week"].isoformat() if row["week"] else None,
            "event_name": row["event_name"],
            "count": row["count"],
        }
        for row in rows
    ]


def weekly_cohort_summary(
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    conversion_window_days: int = 28,
) -> list[dict]:
    teams_qs = Team.objects.all()
    if start_date is not None:
        teams_qs = teams_qs.filter(created_at__date__gte=start_date)
    if end_date is not None:
        teams_qs = teams_qs.filter(created_at__date__lte=end_date)

    cohort_rows = (
        teams_qs.annotate(cohort_week=TruncWeek("created_at"))
        .values("cohort_week")
        .annotate(teams_created=Count("id"))
        .order_by("cohort_week")
    )
    milestones = [
        "first_page_created",
        "first_ingest_completed",
        "first_chat_answer_received",
        "invite_accepted",
        "subscription_started",
    ]
    results: list[dict] = []
    for row in cohort_rows:
        week = row["cohort_week"]
        teams = teams_qs.filter(
            created_at__date__gte=week.date(),
            created_at__date__lt=(week + timedelta(days=7)).date(),
        )
        team_ids = list(teams.values_list("id", flat=True))
        conversion_deadline = week + timedelta(days=7 + conversion_window_days)
        summary = {
            "cohort_week_start": week.isoformat() if week else None,
            "teams_created": row["teams_created"],
            "conversion_window_days": conversion_window_days,
        }
        for event_name in milestones:
            summary[event_name] = (
                ProductEvent.objects.filter(
                    team_id__in=team_ids,
                    event_name=event_name,
                    occurred_at__lt=conversion_deadline,
                )
                .values("team_id")
                .distinct()
                .count()
            )
        results.append(summary)
    return results
