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
    PlanningActivityView,
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
    path("<uuid:team_id>/activity/", PlanningActivityView.as_view()),
]
