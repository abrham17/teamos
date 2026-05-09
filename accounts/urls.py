from django.urls import path
from .views import (
    RegisterView, LoginView, LogoutView, MeView, UpdateProfileView,
    ClerkProvisionView, FinalizeOnboardingView,
    TeamListCreateView, TeamDetailView, TeamMembersView,
    InviteCreateView, InviteListView, InviteResendView, InviteRevokeView,
    AcceptInviteView, TeamAuditEventsView, TransferOwnershipView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="accounts-register"),
    path("login/", LoginView.as_view(), name="accounts-login"),
    path("logout/", LogoutView.as_view(), name="accounts-logout"),
    path("me/", MeView.as_view(), name="accounts-me"),
    path("me/profile/", UpdateProfileView.as_view(), name="accounts-update-profile"),
    path("provision/", ClerkProvisionView.as_view(), name="accounts-provision"),
    path("onboarding/finalize/", FinalizeOnboardingView.as_view(), name="accounts-onboarding-finalize"),
    path("teams/", TeamListCreateView.as_view(), name="accounts-teams"),
    path("teams/<uuid:team_id>/", TeamDetailView.as_view(), name="accounts-team-detail"),
    path("teams/<uuid:team_id>/members/", TeamMembersView.as_view(), name="accounts-team-members"),
    path("teams/<uuid:team_id>/transfer-ownership/", TransferOwnershipView.as_view(), name="accounts-team-transfer-ownership"),
    path("teams/<uuid:team_id>/invite/", InviteCreateView.as_view(), name="accounts-team-invite-create"),
    path("teams/<uuid:team_id>/invites/", InviteListView.as_view(), name="accounts-team-invites"),
    path(
        "teams/<uuid:team_id>/invites/<uuid:invite_id>/resend/",
        InviteResendView.as_view(),
        name="accounts-team-invite-resend",
    ),
    path(
        "teams/<uuid:team_id>/invites/<uuid:invite_id>/revoke/",
        InviteRevokeView.as_view(),
        name="accounts-team-invite-revoke",
    ),
    path("teams/<uuid:team_id>/audit-events/", TeamAuditEventsView.as_view(), name="accounts-team-audit-events"),
    path("teams/accept-invite/", AcceptInviteView.as_view(), name="accounts-accept-invite"),
]
