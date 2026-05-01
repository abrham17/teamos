from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.models import TeamMember
from teamos_project.api_response import fail, ok

from .services import record_product_event, weekly_cohort_summary, weekly_funnel_counts


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
