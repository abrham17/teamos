from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.models import TeamMember
from teamos_project.api_response import fail, ok

from .services import record_product_event, weekly_cohort_summary, weekly_funnel_counts
from wiki.models import WikiPage
from planning.models import Project
from ingest.models import IngestJob


import datetime
from django.db.models import Sum
from chat.models import ChatTokenUsage

class TeamQuantitativeStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, team_id):
        membership = TeamMember.objects.filter(team_id=team_id, user=request.user).select_related("team").first()
        if not membership:
            return fail("Forbidden.", status_code=403, code="forbidden")

        team = membership.team
        docs_processed = IngestJob.objects.filter(team=team, status="done").count()
        wiki_created = WikiPage.objects.filter(team=team, is_deleted=False).count()
        projects_count = Project.objects.filter(team=team).count()

        # Token usage aggregation for last 14 days
        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=13)

        token_qs = (
            ChatTokenUsage.objects.filter(team=team, created_at__date__gte=start_date)
            .values("created_at__date")
            .annotate(total=Sum("total_tokens"))
            .order_by("created_at__date")
        )

        token_map = {item["created_at__date"]: item["total"] for item in token_qs}

        daily_token_usage = []
        for i in range(14):
            day = start_date + datetime.timedelta(days=i)
            daily_token_usage.append({
                "date": day.isoformat(),
                "label": str(day.day),
                "tokens": token_map.get(day, 0)
            })

        return ok(
            {
                "documents_processed": docs_processed,
                "wiki_created": wiki_created,
                "projects_count": projects_count,
                "daily_token_usage": daily_token_usage,
            }
        )


class TeamFunnelWeeklyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, team_id):
        membership = TeamMember.objects.filter(team_id=team_id, user=request.user).select_related("team").first()
        if not membership:
            return fail("Forbidden.", status_code=403, code="forbidden")
        return ok(
            {
                "team_id": str(membership.team_id),
                "team_plan": membership.team.plan,
                "funnel": weekly_funnel_counts(membership.team),
            }
        )


class UpgradeClickedEventView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, team_id):
        membership = TeamMember.objects.filter(team_id=team_id, user=request.user).select_related("team").first()
        if not membership:
            return fail("Forbidden.", status_code=403, code="forbidden")
        surface = (request.data.get("surface") or "unknown").strip()
        record_product_event(
            event_name="upgrade_clicked",
            team=membership.team,
            user=request.user,
            properties={"surface": surface},
        )
        return ok({"recorded": True}, status_code=201)


class CohortWeeklyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return fail("Admin access required.", status_code=403, code="admin_required")

        start_date_raw = request.query_params.get("start_date")
        end_date_raw = request.query_params.get("end_date")
        window_raw = request.query_params.get("conversion_window_days")

        start_date = parse_date(start_date_raw) if start_date_raw else None
        end_date = parse_date(end_date_raw) if end_date_raw else None
        if start_date_raw and start_date is None:
            return fail("Invalid start_date. Use YYYY-MM-DD.", status_code=400, code="invalid_query_param")
        if end_date_raw and end_date is None:
            return fail("Invalid end_date. Use YYYY-MM-DD.", status_code=400, code="invalid_query_param")
        if start_date and end_date and start_date > end_date:
            return fail("start_date cannot be after end_date.", status_code=400, code="invalid_query_param")

        conversion_window_days = 28
        if window_raw:
            try:
                conversion_window_days = int(window_raw)
            except ValueError:
                return fail("conversion_window_days must be an integer.", status_code=400, code="invalid_query_param")
            if conversion_window_days < 1 or conversion_window_days > 180:
                return fail(
                    "conversion_window_days must be between 1 and 180.",
                    status_code=400,
                    code="invalid_query_param",
                )

        cohorts = weekly_cohort_summary(
            start_date=start_date,
            end_date=end_date,
            conversion_window_days=conversion_window_days,
        )
        return ok(
            {
                "cohorts": cohorts,
                "filters": {
                    "start_date": start_date.isoformat() if start_date else None,
                    "end_date": end_date.isoformat() if end_date else None,
                    "conversion_window_days": conversion_window_days,
                },
            }
        )
