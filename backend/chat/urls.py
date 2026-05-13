from django.urls import path
from .views import (
    ChatCapabilitiesView,
    ChatSessionListView,
    ChatSessionDetailView,
    ChatQueryStreamView,
    ChatTTSView,
    AdminUsageStatsView,
    ProactiveAlertsView,
)

urlpatterns = [
    path("<uuid:team_id>/capabilities/", ChatCapabilitiesView.as_view()),
    path("<uuid:team_id>/tts/", ChatTTSView.as_view()),
    path("<uuid:team_id>/sessions/", ChatSessionListView.as_view()),
    path("<uuid:team_id>/sessions/<uuid:session_id>/", ChatSessionDetailView.as_view()),
    path("<uuid:team_id>/sessions/<uuid:session_id>/query/", ChatQueryStreamView.as_view()),
    path("<uuid:team_id>/usage-stats/", AdminUsageStatsView.as_view()),
    path("<uuid:team_id>/alerts/", ProactiveAlertsView.as_view()),
]
