from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from teamos_project.api_response import ok, fail
from teamos_project.entitlements import check_quota
from teamos_project.trace import get_request_trace_id
from product_analytics.services import record_first_once, record_product_event
from .models import User, Team, TeamMember, TeamInvite, TeamAuditEvent
from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer,
    TeamSerializer, TeamMemberSerializer, TeamInviteSerializer, InviteCreateSerializer,
    TeamAuditEventSerializer,
)
from .team_access import get_team_membership
from .tasks import purge_soft_deleted_team, send_team_invite_email


def require_invite_manager(team_id, user):
    try:
        membership = TeamMember.objects.get(team_id=team_id, user=user)
    except TeamMember.DoesNotExist:
        return None
    if membership.role not in ("owner", "editor"):
        return None
    return membership


def set_jwt_cookies(response, user):
    refresh = RefreshToken.for_user(user)
    
    # Use settings for cookie security if available, else defaults
    simple_jwt_settings = getattr(settings, "SIMPLE_JWT", {})
    cookie_secure = simple_jwt_settings.get("AUTH_COOKIE_SECURE", False)
    cookie_samesite = simple_jwt_settings.get("AUTH_COOKIE_SAMESITE", "Lax")
    cookie_domain = simple_jwt_settings.get("AUTH_COOKIE_DOMAIN", None)
    
    common_kwargs = {
        "httponly": True,
        "secure": cookie_secure,
        "samesite": cookie_samesite,
        "domain": cookie_domain,
    }
    
    response.set_cookie(
        "refresh_token", 
        str(refresh), 
        max_age=30 * 86400,
        **common_kwargs
    )
    response.set_cookie(
        "access_token", 
        str(refresh.access_token), 
        max_age=7 * 86400,
        **common_kwargs
    )
    return response


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        response = ok(UserSerializer(user).data, status_code=status.HTTP_201_CREATED)
        return set_jwt_cookies(response, user)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.validated_data["user"]
        response = ok(UserSerializer(user).data)
        return set_jwt_cookies(response, user)


class LogoutView(APIView):
    def post(self, request):
        response = ok({"detail": "Logged out."})
        response.delete_cookie("access_token")
        response.delete_cookie("refresh_token")
        return response


class MeView(APIView):
    def get(self, request):
        return ok(UserSerializer(request.user).data)


class ClerkProvisionView(APIView):
    """
    Ensures a first-time Clerk-authenticated user gets an initial team
    and owner membership so TeamOS modules can run immediately.
    """

    def post(self, request):
        membership = TeamMember.objects.filter(user=request.user).select_related("team").first()
        if membership:
            return ok(
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
        return ok(
            {
                "user": UserSerializer(request.user).data,
                "team": TeamSerializer(team).data,
                "role": "owner",
                "provisioned": True,
            },
            status_code=status.HTTP_201_CREATED,
        )


# ── Teams ──────────────────────────────────────────────────────────

class TeamListCreateView(APIView):
    def get(self, request):
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"TeamListCreateView.get access by user: {request.user}")
        
        memberships = TeamMember.objects.filter(user=request.user, team__is_deleted=False).select_related("team")
        teams = [m.team for m in memberships]
        return ok(TeamSerializer(teams, many=True).data)

    def post(self, request):
        name = request.data.get("name", "").strip()
        if not name:
            return fail("Name required.", status_code=400, code="team_name_required")
        base_slug = slugify(name)
        slug = base_slug
        n = 1
        while Team.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{n}"; n += 1
        team = Team.objects.create(name=name, slug=slug, created_by=request.user)
        TeamMember.objects.create(team=team, user=request.user, role="owner")
        record_first_once(
            event_name="workspace_created",
            team=team,
            user=request.user,
            properties={"source": "teams_create"},
        )
        return ok(TeamSerializer(team).data, status_code=201)


class TeamDetailView(APIView):
    def _get_team(self, request, team_id):
        m = get_team_membership(request.user, team_id)
        if not m:
            return None, None
        return m.team, m.role

    def get(self, request, team_id):
        team, role = self._get_team(request, team_id)
        if not team:
            return fail("Team not found.", status_code=404, code="team_not_found")
        data = TeamSerializer(team).data
        data["my_role"] = role
        return ok(data)

    def patch(self, request, team_id):
        team, role = self._get_team(request, team_id)
        if not team or role != "owner":
            return fail("Only owners can update team settings.", status_code=403, code="owner_required")
        team.name = request.data.get("name", team.name)
        team.save()
        return ok(TeamSerializer(team).data)

    def delete(self, request, team_id):
        team, role = self._get_team(request, team_id)
        if not team:
            return fail("Team not found.", status_code=404, code="team_not_found")
        if role != "owner":
            return fail("Only owners can delete team.", status_code=403, code="owner_required")

        confirmation_email = (request.data.get("confirmation_email") or "").strip().lower()
        if confirmation_email != request.user.email.strip().lower():
            return fail(
                "Email confirmation does not match current account.",
                status_code=400,
                code="invalid_confirmation_email",
            )

        if team.is_deleted:
            return fail("Team already scheduled for deletion.", status_code=400, code="team_already_deleted")

        purge_after_hours = int(getattr(settings, "TEAM_SOFT_DELETE_GRACE_HOURS", 24))
        with transaction.atomic():
            team.is_deleted = True
            team.deleted_at = timezone.now()
            team.purge_after = timezone.now() + timedelta(hours=purge_after_hours)
            team.save(update_fields=["is_deleted", "deleted_at", "purge_after"])
            TeamAuditEvent.objects.create(
                team=team,
                actor=request.user,
                event_type="team_soft_deleted",
                metadata={"grace_hours": purge_after_hours},
            )

        trace_id = get_request_trace_id(request)
        purge_soft_deleted_team.apply_async(args=[str(team.id), trace_id], countdown=purge_after_hours * 3600)
        return ok(
            {
                "detail": "Team scheduled for deletion.",
                "deleted_at": team.deleted_at.isoformat() if team.deleted_at else None,
                "purge_after": team.purge_after.isoformat() if team.purge_after else None,
            }
        )


class TeamMembersView(APIView):
    def get(self, request, team_id):
        if not TeamMember.objects.filter(team_id=team_id, user=request.user).exists():
            return fail("Forbidden.", status_code=403, code="forbidden")
        members = TeamMember.objects.filter(team_id=team_id).select_related("user")
        return ok(TeamMemberSerializer(members, many=True).data)

    def patch(self, request, team_id):
        """Update a member's role."""
        try:
            caller = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return fail("Forbidden.", status_code=403, code="forbidden")
        if caller.role != "owner":
            return fail("Only owners can update member roles.", status_code=403, code="owner_required")
        target_id = request.data.get("user_id")
        new_role = request.data.get("role")
        if not target_id:
            return fail("user_id is required.", status_code=400, code="user_id_required")
        if str(target_id) == str(request.user.id):
            return fail(
                "Owners cannot change their own role from this endpoint.",
                status_code=400,
                code="owner_self_role_change_forbidden",
            )
        if new_role not in ("editor", "viewer"):
            return fail(
                "Invalid role. Use transfer ownership for owner changes.",
                status_code=400,
                code="invalid_member_role",
            )
        try:
            member = TeamMember.objects.get(team_id=team_id, user_id=target_id)
            member.role = new_role
            member.save()
            return ok(TeamMemberSerializer(member).data)
        except TeamMember.DoesNotExist:
            return fail("Team member not found.", status_code=404, code="team_member_not_found")

    def delete(self, request, team_id):
        """Remove a member."""
        try:
            caller = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return fail("Forbidden.", status_code=403, code="forbidden")
        if caller.role != "owner":
            return fail("Only owners can remove members.", status_code=403, code="owner_required")
        confirmation_email = (request.data.get("confirmation_email") or "").strip().lower()
        if confirmation_email != request.user.email.strip().lower():
            return fail(
                "Email confirmation does not match current account.",
                status_code=400,
                code="invalid_confirmation_email",
            )
        target_id = request.data.get("user_id")
        if not target_id:
            return fail("user_id is required.", status_code=400, code="user_id_required")
        try:
            target_membership = TeamMember.objects.get(team_id=team_id, user_id=target_id)
        except TeamMember.DoesNotExist:
            return fail("Team member not found.", status_code=404, code="team_member_not_found")
        if target_membership.role == "owner":
            return fail(
                "Transfer ownership before removing an owner.",
                status_code=400,
                code="owner_removal_forbidden",
            )
        TeamMember.objects.filter(id=target_membership.id).delete()
        return Response(status=204)


class InviteCreateView(APIView):
    def post(self, request, team_id):
        m = require_invite_manager(team_id, request.user)
        if not m:
            return fail("Forbidden.", status_code=403, code="forbidden")
        quota = check_quota(m.team, "seat_manage")
        if not quota.allowed:
            return fail(
                "Plan seat limit reached.",
                status_code=402,
                code="plan_limit_exceeded",
                details=quota.to_details(),
            )
        s = InviteCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        role = s.validated_data["role"]
        invitee_email = s.validated_data["invitee_email"]
        if m.role == "editor" and role == "owner":
            return fail("Editors cannot invite owners.", status_code=403, code="editor_cannot_invite_owner")

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
        record_product_event(
            event_name="invite_sent",
            team=m.team,
            user=request.user,
            properties={"invite_id": str(invite.id), "role": role},
        )
        trace_id = get_request_trace_id(request)
        send_team_invite_email.delay(str(invite.id), trace_id=trace_id)
        return ok(
            TeamInviteSerializer(invite, context={"frontend_url": getattr(settings, "FRONTEND_URL", "")}).data,
            status_code=201,
        )


class InviteListView(APIView):
    def get(self, request, team_id):
        if not require_invite_manager(team_id, request.user):
            return fail("Forbidden.", status_code=403, code="forbidden")

        invites = TeamInvite.objects.filter(team_id=team_id).order_by("-expires_at")
        serializer = TeamInviteSerializer(
            invites, many=True, context={"frontend_url": getattr(settings, "FRONTEND_URL", "")}
        )
        return ok(serializer.data)


class InviteResendView(APIView):
    def post(self, request, team_id, invite_id):
        if not require_invite_manager(team_id, request.user):
            return fail("Forbidden.", status_code=403, code="forbidden")

        try:
            invite = TeamInvite.objects.get(id=invite_id, team_id=team_id)
        except TeamInvite.DoesNotExist:
            return fail("Invite not found.", status_code=404, code="invite_not_found")

        if invite.used_at:
            return fail("Invite already accepted.", status_code=400, code="invite_already_accepted")
        if invite.revoked_at:
            return fail("Invite already revoked.", status_code=400, code="invite_already_revoked")
        if invite.expires_at < timezone.now():
            return fail("Invite expired.", status_code=400, code="invite_expired")

        trace_id = get_request_trace_id(request)
        send_team_invite_email.delay(str(invite.id), trace_id=trace_id)
        return ok({"detail": "Invite resend requested."})


class InviteRevokeView(APIView):
    def post(self, request, team_id, invite_id):
        if not require_invite_manager(team_id, request.user):
            return fail("Forbidden.", status_code=403, code="forbidden")

        try:
            invite = TeamInvite.objects.get(id=invite_id, team_id=team_id)
        except TeamInvite.DoesNotExist:
            return fail("Invite not found.", status_code=404, code="invite_not_found")

        if invite.revoked_at:
            return fail("Invite already revoked.", status_code=400, code="invite_already_revoked")
        invite.revoked_at = timezone.now()
        invite.save(update_fields=["revoked_at"])
        TeamAuditEvent.objects.create(
            team=invite.team,
            actor=request.user,
            event_type="invite_revoked",
            metadata={"invite_id": str(invite.id), "invitee_email": invite.invitee_email},
        )
        return ok({"detail": "Invite revoked."})


class AcceptInviteView(APIView):
    def post(self, request):
        token = request.data.get("token")
        if not token:
            return fail("Invite token is required.", status_code=400, code="invite_token_required")

        with transaction.atomic():
            invite = TeamInvite.objects.select_for_update().filter(token=token).select_related("team").first()
            if not invite:
                return fail("Invalid invite token.", status_code=400, code="invalid_invite_token")

            if invite.revoked_at:
                return fail("Invite was revoked.", status_code=400, code="invite_revoked")
            if invite.expires_at < timezone.now():
                return fail("Invite expired.", status_code=400, code="invite_expired")
            if request.user.email.lower().strip() != invite.invitee_email.lower().strip():
                return fail(
                    "This invite is for a different email address.",
                    status_code=403,
                    code="invite_email_mismatch",
                )

            existing_membership = TeamMember.objects.filter(team=invite.team, user=request.user).first()
            if invite.used_at:
                if invite.accepted_by_id == request.user.id:
                    team_data = TeamSerializer(invite.team).data
                    team_data["invite_status"] = "already_accepted"
                    return ok(team_data, status_code=200)
                return fail("Invite already accepted by another user.", status_code=400, code="invite_already_used")

            if existing_membership and invite.accepted_by_id and invite.accepted_by_id != request.user.id:
                return fail("Invite already accepted by another user.", status_code=400, code="invite_already_used")

            if not existing_membership:
                quota = check_quota(invite.team, "seat_manage")
                if not quota.allowed:
                    return fail(
                        "Plan seat limit reached.",
                        status_code=402,
                        code="plan_limit_exceeded",
                        details=quota.to_details(),
                    )

            TeamMember.objects.get_or_create(
                team=invite.team,
                user=request.user,
                defaults={"role": invite.role},
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
            record_product_event(
                event_name="invite_accepted",
                team=invite.team,
                user=request.user,
                properties={"invite_id": str(invite.id), "role": invite.role},
            )
            team_data = TeamSerializer(invite.team).data
            team_data["invite_status"] = "accepted"
            return ok(team_data, status_code=200)


class TransferOwnershipView(APIView):
    def post(self, request, team_id):
        try:
            caller_membership = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return fail("Forbidden.", status_code=403, code="forbidden")
        if caller_membership.role != "owner":
            return fail("Only owners can transfer ownership.", status_code=403, code="owner_required")
        confirmation_email = (request.data.get("confirmation_email") or "").strip().lower()
        if confirmation_email != request.user.email.strip().lower():
            return fail(
                "Email confirmation does not match current account.",
                status_code=400,
                code="invalid_confirmation_email",
            )

        new_owner_user_id = request.data.get("new_owner_user_id")
        if not new_owner_user_id:
            return fail("new_owner_user_id is required.", status_code=400, code="new_owner_user_id_required")
        if str(new_owner_user_id) == str(request.user.id):
            return fail("You are already the owner.", status_code=400, code="already_owner")

        try:
            new_owner_membership = TeamMember.objects.get(team_id=team_id, user_id=new_owner_user_id)
        except TeamMember.DoesNotExist:
            return fail(
                "New owner must be an existing team member.",
                status_code=404,
                code="new_owner_not_member",
            )

        with transaction.atomic():
            caller_membership = TeamMember.objects.select_for_update().get(id=caller_membership.id)
            new_owner_membership = TeamMember.objects.select_for_update().get(id=new_owner_membership.id)

            caller_membership.role = "editor"
            caller_membership.save(update_fields=["role"])

            new_owner_membership.role = "owner"
            new_owner_membership.save(update_fields=["role"])

            TeamAuditEvent.objects.create(
                team=caller_membership.team,
                actor=request.user,
                event_type="ownership_transferred",
                metadata={
                    "action": "ownership_transferred",
                    "from_user_id": str(request.user.id),
                    "to_user_id": str(new_owner_user_id),
                },
            )

        return ok({"detail": "Ownership transferred successfully."})


class TeamAuditEventsView(APIView):
    def get(self, request, team_id):
        try:
            m = TeamMember.objects.get(team_id=team_id, user=request.user)
        except TeamMember.DoesNotExist:
            return fail("Forbidden.", status_code=403, code="forbidden")
        if m.role not in ("owner", "editor"):
            return fail("Owner or editor role required.", status_code=403, code="editor_or_owner_required")
        events = TeamAuditEvent.objects.filter(team_id=team_id)[:100]
        return ok(TeamAuditEventSerializer(events, many=True).data)
