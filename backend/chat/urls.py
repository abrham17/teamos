from django.urls import path
from .views import (
    ChatCapabilitiesView,
    ChatSessionListView,
    ChatSessionDetailView,
    ChatQueryStreamView,
    ChatTTSView,
    AdminUsageStatsView,
    MCPServerRegistrationListView,
    MCPServerRegistrationDetailView,
    MCPServerRegistrationSyncView,
)

urlpatterns = [
    path("<uuid:team_id>/capabilities/", ChatCapabilitiesView.as_view()),
    path("<uuid:team_id>/tts/", ChatTTSView.as_view()),
    path("<uuid:team_id>/sessions/", ChatSessionListView.as_view()),
    path("<uuid:team_id>/sessions/<uuid:session_id>/", ChatSessionDetailView.as_view()),
    path("<uuid:team_id>/sessions/<uuid:session_id>/query/", ChatQueryStreamView.as_view()),
    path("<uuid:team_id>/usage-stats/", AdminUsageStatsView.as_view()),
    
    # MCP server registration endpoints
    path("<uuid:team_id>/mcp-servers/", MCPServerRegistrationListView.as_view()),
    path("<uuid:team_id>/mcp-servers/<uuid:server_id>/", MCPServerRegistrationDetailView.as_view()),
    path("<uuid:team_id>/mcp-servers/<uuid:server_id>/sync/", MCPServerRegistrationSyncView.as_view()),
]
