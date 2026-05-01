from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User, Team, TeamMember, TeamInvite, TeamAuditEvent
from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer,
    TeamSerializer, TeamMemberSerializer, TeamInviteSerializer, InviteCreateSerializer,
    TeamAuditEventSerializer,
)
from .team_access import get_team_membership
from .tasks import send_team_invite_email


def set_jwt_cookies(response, user):
    refresh = RefreshToken.for_user(user)
    response.set_cookie("refresh_token", str(refresh), httponly=True, samesite="Lax", max_age=30 * 86400)
    response.set_cookie("access_token", str(refresh.access_token), httponly=True, samesite="Lax", max_age=7 * 86400)
    return response


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        response = Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        return set_jwt_cookies(response, user)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.validated_data["user"]
        response = Response(UserSerializer(user).data)
        return set_jwt_cookies(response, user)


class LogoutView(APIView):
    def post(self, request):
        response = Response({"detail": "Logged out."})
        response.delete_cookie("access_token")
        response.delete_cookie("refresh_token")
        return response


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ClerkProvisionView(APIView):
    """
    Ensures a first-time Clerk-authenticated user gets an initial team
    and owner membership so TeamOS modules can run immediately.
    """

    def post(self, request):
        membership = TeamMember.objects.filter(user=request.user).select_related("team").first()
        if membership:
            return Response(
                {
                    "user": UserSerializer(request.user).data,
                    "team": TeamSerializer(membership.team).data,
                    "role": membership.role,
                    "provisioned": False,
                }
            )

        base_name = request.user.first_name.strip() or request.user.email.split("@")[0] or "Personal"
        team_name = f"{base_name}'s Team"
        base_slug = slugify(team_name) or "personal-team"
        slug = base_slug
        n = 1
        while Team.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{n}"
            n += 1

        team = Team.objects.create(name=team_name, slug=slug, created_by=request.user)
        TeamMember.objects.create(team=team, user=request.user, role="owner")
        return Response(
            {
                "user": UserSerializer(request.user).data,
                "team": TeamSerializer(team).data,
                "role": "owner",
                "provisioned": True,
            },
            status=status.HTTP_201_CREATED,
        )


# ── Teams ──────────────────────────────────────────────────────────

class TeamListCreateView(APIView):
    def get(self, request):
        memberships = TeamMember.objects.filter(user=request.user).select_related("team")
        teams = [m.team for m in memberships]
        return Response(TeamSerializer(teams, many=True).data)

    def post(self, request):
        name = request.data.get("name", "").strip()
        if not name:
            return Response({"detail": "Name required."}, status=400)
        base_slug = slugify(name)
        slug = base_slug
        n = 1
        while Team.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{n}"; n += 1
        team = Team.objects.create(name=name, slug=slug, created_by=request.user)
        TeamMember.objects.create(team=team, user=request.user, role="owner")
        return Response(TeamSerializer(team).data, status=201)


class TeamDetailView(APIView):
    def _get_team(self, request, team_id):
        m = get_team_membership(request.user, team_id)
        if not m:
            return None, None
        return m.team, m.role

    def get(self, request, team_id):
        team, role = self._get_team(request, team_id)
        if not team:
            return Response(status=404)
        data = TeamSerializer(team).data
        data["my_role"] = role
        return Response(data)

    def patch(self, request, team_id):
        team, role = self._get_team(request, team_id)
        if not team or role != "owner":
            return Response(status=403)
        team.name = request.data.get("name", team.name)
        team.save()
        return Response(TeamSerializer(team).data)


class TeamMembersView(APIView):
    def get(self, request, team_id):
        if not TeamMember.objects.filter(team_id=team_id, user=request.user).exists():
            return Response(status=403)
        members = TeamMember.objects.filter(team_id=team_id).select_related("user")
        return Response(TeamMemberSerializer(members, many=True).data)

    def patch(self, request, team_id):
        """Update a member's role."""
        try:
            caller = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return Response(status=403)
        if caller.role != "owner":
            return Response(status=403)
        target_id = request.data.get("user_id")
        new_role = request.data.get("role")
        if new_role not in ("editor", "viewer", "owner"):
            return Response({"detail": "Invalid role."}, status=400)
        try:
            member = TeamMember.objects.get(team_id=team_id, user_id=target_id)
            member.role = new_role
            member.save()
            return Response(TeamMemberSerializer(member).data)
        except TeamMember.DoesNotExist:
            return Response(status=404)

    def delete(self, request, team_id):
        """Remove a member."""
        try:
            caller = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return Response(status=403)
        if caller.role not in ("owner", "editor"):
            return Response(status=403)
        target_id = request.data.get("user_id")
        TeamMember.objects.filter(team_id=team_id, user_id=target_id).delete()
        return Response(status=204)


class InviteCreateView(APIView):
    def post(self, request, team_id):
        try:
            m = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return Response(status=403)
        if m.role not in ("owner", "editor"):
            return Response(status=403)
        s = InviteCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        role = s.validated_data["role"]
        invitee_email = s.validated_data["invitee_email"]
        if m.role == "editor" and role == "owner":
            return Response({"detail": "Editors cannot invite owners."}, status=403)

        invite = TeamInvite.objects.create(
            team_id=team_id,
            created_by=request.user,
            invitee_email=invitee_email,
            role=role,
            expires_at=timezone.now() + timedelta(days=7),
        )
        TeamAuditEvent.objects.create(
            team=invite.team,
            actor=request.user,
            event_type="invite_created",
            metadata={"invite_id": str(invite.id), "invitee_email": invitee_email, "role": role},
        )
        send_team_invite_email.delay(str(invite.id))
        return Response(
            TeamInviteSerializer(invite, context={"frontend_url": getattr(settings, "FRONTEND_URL", "")}).data,
            status=201,
        )


class InviteListView(APIView):
    def get(self, request, team_id):
        try:
            m = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return Response(status=403)
        if m.role not in ("owner", "editor"):
            return Response(status=403)

        invites = TeamInvite.objects.filter(team_id=team_id).order_by("-expires_at")
        serializer = TeamInviteSerializer(
            invites, many=True, context={"frontend_url": getattr(settings, "FRONTEND_URL", "")}
        )
        return Response(serializer.data)


class InviteResendView(APIView):
    def post(self, request, team_id, invite_id):
        try:
            m = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return Response(status=403)
        if m.role not in ("owner", "editor"):
            return Response(status=403)

        try:
            invite = TeamInvite.objects.get(id=invite_id, team_id=team_id)
        except TeamInvite.DoesNotExist:
            return Response(status=404)

        if invite.used_at:
            return Response({"detail": "Invite already accepted."}, status=400)
        if invite.revoked_at:
            return Response({"detail": "Invite already revoked."}, status=400)

        send_team_invite_email.delay(str(invite.id))
        return Response({"detail": "Invite resend requested."})


class InviteRevokeView(APIView):
    def post(self, request, team_id, invite_id):
        try:
            m = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return Response(status=403)
        if m.role not in ("owner", "editor"):
            return Response(status=403)

        try:
            invite = TeamInvite.objects.get(id=invite_id, team_id=team_id)
        except TeamInvite.DoesNotExist:
            return Response(status=404)

        if invite.revoked_at:
            return Response({"detail": "Invite already revoked."}, status=400)
        invite.revoked_at = timezone.now()
        invite.save(update_fields=["revoked_at"])
        TeamAuditEvent.objects.create(
            team=invite.team,
            actor=request.user,
            event_type="invite_revoked",
            metadata={"invite_id": str(invite.id), "invitee_email": invite.invitee_email},
        )
        return Response({"detail": "Invite revoked."})


class AcceptInviteView(APIView):
    def post(self, request):
        token = request.data.get("token")
        try:
            invite = TeamInvite.objects.get(token=token, used_at=None, revoked_at=None)
        except TeamInvite.DoesNotExist:
            return Response({"detail": "Invalid or used invite."}, status=400)
        if invite.expires_at < timezone.now():
            return Response({"detail": "Invite expired."}, status=400)
        if request.user.email.lower().strip() != invite.invitee_email.lower().strip():
            return Response({"detail": "This invite is for a different email address."}, status=403)
        TeamMember.objects.get_or_create(
            team=invite.team, user=request.user,
            defaults={"role": invite.role}
        )
        invite.used_at = timezone.now()
        invite.accepted_by = request.user
        invite.save(update_fields=["used_at", "accepted_by"])
        TeamAuditEvent.objects.create(
            team=invite.team,
            actor=request.user,
            event_type="invite_accepted",
            metadata={"invite_id": str(invite.id), "invitee_email": invite.invitee_email, "role": invite.role},
        )
        return Response(TeamSerializer(invite.team).data)


class TeamAuditEventsView(APIView):
    def get(self, request, team_id):
        try:
            m = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return Response(status=403)
        if m.role not in ("owner", "editor"):
            return Response(status=403)
        events = TeamAuditEvent.objects.filter(team_id=team_id)[:100]
        return Response(TeamAuditEventSerializer(events, many=True).data)
