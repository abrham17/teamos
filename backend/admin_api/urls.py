from django.urls import path
from .views import AdminDashboardStatsView, AdminTeamUsageListView, AdminTeamDetailView

urlpatterns = [
    path("stats/", AdminDashboardStatsView.as_view(), name="admin_dashboard_stats"),
    path("teams-usage/", AdminTeamUsageListView.as_view(), name="admin_team_usage_list"),
    path("teams/<uuid:team_id>/", AdminTeamDetailView.as_view(), name="admin_team_detail"),
]
