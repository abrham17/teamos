from django.urls import path
from .views import (
    AdminDashboardStatsView,
    AdminTeamUsageListView,
    AdminTeamDetailView,
    AdminTrendView,
    AdminTopSpendersView,
    AdminTrialsView,
    AdminTrialExtendView,
    AdminTrialExpireView,
    AdminForecastView,
    AdminOperationsView,
    AdminHealthView,
    AdminAlertsView,
    AdminDelinquentView,
)

urlpatterns = [
    path("stats", AdminDashboardStatsView.as_view(), name="admin_dashboard_stats"),
    path("overview/trend", AdminTrendView.as_view(), name="admin_trend"),
    path("teams-usage", AdminTeamUsageListView.as_view(), name="admin_team_usage_list"),
    path("teams/<uuid:team_id>", AdminTeamDetailView.as_view(), name="admin_team_detail"),
    path("users/top-spenders", AdminTopSpendersView.as_view(), name="admin_top_spenders"),
    path("trials", AdminTrialsView.as_view(), name="admin_trials"),
    path("trials/<uuid:team_id>/extend", AdminTrialExtendView.as_view(), name="admin_trial_extend"),
    path("trials/<uuid:team_id>/expire", AdminTrialExpireView.as_view(), name="admin_trial_expire"),
    path("forecast", AdminForecastView.as_view(), name="admin_forecast"),
    path("operations", AdminOperationsView.as_view(), name="admin_operations"),
    path("health", AdminHealthView.as_view(), name="admin_health"),
    path("alerts", AdminAlertsView.as_view(), name="admin_alerts"),
    path("subscriptions/delinquent", AdminDelinquentView.as_view(), name="admin_delinquent"),
]
