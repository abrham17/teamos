from django.urls import path

from .views import CohortWeeklyView, TeamFunnelWeeklyView, UpgradeClickedEventView, TeamQuantitativeStatsView

urlpatterns = [
    path("<uuid:team_id>/stats/", TeamQuantitativeStatsView.as_view(), name="product-analytics-team-stats"),
    path("<uuid:team_id>/funnel/weekly/", TeamFunnelWeeklyView.as_view(), name="product-analytics-team-funnel-weekly"),
    path("<uuid:team_id>/events/upgrade-clicked/", UpgradeClickedEventView.as_view(), name="product-analytics-upgrade-clicked"),
    path("cohorts/weekly/", CohortWeeklyView.as_view(), name="product-analytics-cohort-weekly"),
]
