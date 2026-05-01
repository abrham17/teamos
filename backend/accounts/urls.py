from django.urls import path
from .views import (
    RegisterView, LoginView, LogoutView, MeView,
    TeamListCreateView, TeamDetailView, TeamMembersView,
    InviteCreateView, AcceptInviteView,
)

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("me/", MeView.as_view()),
    path("teams/", TeamListCreateView.as_view()),
    path("teams/<uuid:team_id>/", TeamDetailView.as_view()),
    path("teams/<uuid:team_id>/members/", TeamMembersView.as_view()),
    path("teams/<uuid:team_id>/invite/", InviteCreateView.as_view()),
    path("teams/accept-invite/", AcceptInviteView.as_view()),
]
