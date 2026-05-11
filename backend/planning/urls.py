from django.urls import path

from .views import (
    PlanningCalendarFeedView,
    PlanningMilestoneDetailView,
    PlanningMilestoneListView,
    PlanningProjectDetailView,
    PlanningProjectListView,
    PlanningTaskDetailView,
    PlanningTaskListView,
    PlanningAssistView,
    PlanningAssistStreamView,
    PlanningActivityView,
    PlanningConflictView,
    PlanningRiskView,
    PlanningOverdueView,
    PlanningSnapshotListView,
    PlanningSnapshotRestoreView,
)

urlpatterns = [
    path("<uuid:team_id>/projects/", PlanningProjectListView.as_view()),
    path("<uuid:team_id>/projects/<uuid:project_id>/", PlanningProjectDetailView.as_view()),
    path("<uuid:team_id>/projects/<uuid:project_id>/tasks/", PlanningTaskListView.as_view()),
    path(
        "<uuid:team_id>/projects/<uuid:project_id>/tasks/<uuid:task_id>/",
        PlanningTaskDetailView.as_view(),
    ),
    path(
        "<uuid:team_id>/projects/<uuid:project_id>/milestones/", PlanningMilestoneListView.as_view()
    ),
    path(
        "<uuid:team_id>/projects/<uuid:project_id>/milestones/<uuid:milestone_id>/",
        PlanningMilestoneDetailView.as_view(),
    ),
    path("<uuid:team_id>/calendar/feed/", PlanningCalendarFeedView.as_view()),
    path("<uuid:team_id>/assist/", PlanningAssistView.as_view()),
    path("<uuid:team_id>/assist/stream/", PlanningAssistStreamView.as_view()),
    path("<uuid:team_id>/activity/", PlanningActivityView.as_view()),
    path("<uuid:team_id>/conflicts/", PlanningConflictView.as_view()),
    path("<uuid:team_id>/projects/<uuid:project_id>/conflicts/", PlanningConflictView.as_view()),
    path("<uuid:team_id>/projects/<uuid:project_id>/risk/", PlanningRiskView.as_view()),
    path("<uuid:team_id>/projects/<uuid:project_id>/snapshots/", PlanningSnapshotListView.as_view()),
    path("<uuid:team_id>/projects/<uuid:project_id>/snapshots/<uuid:snapshot_id>/restore/", PlanningSnapshotRestoreView.as_view()),
    path("<uuid:team_id>/overdue/", PlanningOverdueView.as_view()),
]
