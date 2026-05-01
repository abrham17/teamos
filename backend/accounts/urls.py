from django.urls import path
from .views import (
    RegisterView, LoginView, LogoutView, MeView,
    ClerkProvisionView,
    TeamListCreateView, TeamDetailView, TeamMembersView,
    InviteCreateView, InviteListView, InviteResendView, InviteRevokeView,
    AcceptInviteView, TeamAuditEventsView,
)

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path("logout/", LogoutView.as_view()),
    path("me/", MeView.as_view()),
    path("provision/", ClerkProvisionView.as_view()),
    path("teams/", TeamListCreateView.as_view()),
    path("teams/<uuid:team_id>/", TeamDetailView.as_view()),
    path("teams/<uuid:team_id>/members/", TeamMembersView.as_view()),
    path("teams/<uuid:team_id>/invite/", InviteCreateView.as_view()),
    path("teams/<uuid:team_id>/invites/", InviteListView.as_view()),
    path("teams/<uuid:team_id>/invites/<uuid:invite_id>/resend/", InviteResendView.as_view()),
    path("teams/<uuid:team_id>/invites/<uuid:invite_id>/revoke/", InviteRevokeView.as_view()),
    path("teams/<uuid:team_id>/audit-events/", TeamAuditEventsView.as_view()),
    path("teams/accept-invite/", AcceptInviteView.as_view()),
]
