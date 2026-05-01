from django.urls import path
from .views import (
    GraphView,
    GraphNodeView,
    GraphHubsView,
    GraphOrphansView,
    GraphAnalyticsView,
    GraphEdgeCreateView,
)

urlpatterns = [
    path("<uuid:team_id>/", GraphView.as_view()),
    path("<uuid:team_id>/nodes/<uuid:page_id>/", GraphNodeView.as_view()),
    path("<uuid:team_id>/hubs/", GraphHubsView.as_view()),
    path("<uuid:team_id>/orphans/", GraphOrphansView.as_view()),
    path("<uuid:team_id>/analytics/", GraphAnalyticsView.as_view()),
    path("<uuid:team_id>/edges/", GraphEdgeCreateView.as_view()),
]
