from datetime import timedelta
from unittest.mock import patch

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamInvite, TeamMember, User
from accounts.tasks import send_team_invite_email


class AcceptInviteFlowTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="test-password",
        )
        self.invitee = User.objects.create_user(
            username="invitee",
            email="invitee@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Core Team", slug="core-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")

    def _create_invite(self):
        return TeamInvite.objects.create(
            team=self.team,
            created_by=self.owner,
            invitee_email=self.invitee.email,
            role="editor",
            expires_at=timezone.now() + timedelta(days=7),
        )

    def test_accept_invite_is_idempotent_for_same_user(self):
        invite = self._create_invite()
        self.client.force_authenticate(user=self.invitee)
        url = reverse("accounts-accept-invite")

        first = self.client.post(url, {"token": str(invite.token)}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["data"]["invite_status"], "accepted")

        second = self.client.post(url, {"token": str(invite.token)}, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["data"]["invite_status"], "already_accepted")

        self.assertEqual(TeamMember.objects.filter(team=self.team, user=self.invitee).count(), 1)

    def test_accept_invite_rejects_different_email(self):
        invite = self._create_invite()
        other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="test-password",
        )
        self.client.force_authenticate(user=other_user)
        url = reverse("accounts-accept-invite")

        res = self.client.post(url, {"token": str(invite.token)}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("different email address", res.data["error"]["message"])

    def test_accept_invite_blocks_when_seat_limit_reached(self):
        self.team.plan = "free"
        self.team.save(update_fields=["plan"])
        user_a = User.objects.create_user(username="seat-a", email="seat-a@example.com", password="test-password")
        user_b = User.objects.create_user(username="seat-b", email="seat-b@example.com", password="test-password")
        TeamMember.objects.create(team=self.team, user=user_a, role="viewer")
        TeamMember.objects.create(team=self.team, user=user_b, role="viewer")
        invite = self._create_invite()

        self.client.force_authenticate(user=self.invitee)
        url = reverse("accounts-accept-invite")
        res = self.client.post(url, {"token": str(invite.token)}, format="json")

        self.assertEqual(res.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "plan_limit_exceeded")


class TeamMemberManagementTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner2",
            email="owner2@example.com",
            password="test-password",
        )
        self.member = User.objects.create_user(
            username="member2",
            email="member2@example.com",
            password="test-password",
        )
        self.other = User.objects.create_user(
            username="other2",
            email="other2@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Mgmt Team", slug="mgmt-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")
        TeamMember.objects.create(team=self.team, user=self.member, role="editor")
        TeamMember.objects.create(team=self.team, user=self.other, role="viewer")

    def test_only_owner_can_remove_member(self):
        url = reverse("accounts-team-members", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.member)
        denied = self.client.delete(
            url,
            {"user_id": str(self.other.id), "confirmation_email": self.member.email},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.owner)
        ok = self.client.delete(
            url,
            {"user_id": str(self.other.id), "confirmation_email": self.owner.email},
            format="json",
        )
        self.assertEqual(ok.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TeamMember.objects.filter(team=self.team, user=self.other).exists())

    def test_owner_cannot_remove_owner_without_transfer(self):
        url = reverse("accounts-team-members", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.owner)
        denied = self.client.delete(
            url,
            {"user_id": str(self.owner.id), "confirmation_email": self.owner.email},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Transfer ownership", denied.data["error"]["message"])

    def test_owner_can_transfer_ownership(self):
        url = reverse("accounts-team-transfer-ownership", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(
            url,
            {"new_owner_user_id": str(self.member.id), "confirmation_email": self.owner.email},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.owner.refresh_from_db()
        owner_membership = TeamMember.objects.get(team=self.team, user=self.owner)
        new_owner_membership = TeamMember.objects.get(team=self.team, user=self.member)
        self.assertEqual(owner_membership.role, "editor")
        self.assertEqual(new_owner_membership.role, "owner")

    def test_owner_can_promote_viewer_to_editor(self):
        url = reverse("accounts-team-members", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch(
            url,
            {"user_id": str(self.other.id), "role": "editor"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.other.refresh_from_db()
        self.assertEqual(TeamMember.objects.get(team=self.team, user=self.other).role, "editor")

    def test_owner_can_demote_editor_to_viewer(self):
        url = reverse("accounts-team-members", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch(
            url,
            {"user_id": str(self.member.id), "role": "viewer"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.member.refresh_from_db()
        self.assertEqual(TeamMember.objects.get(team=self.team, user=self.member).role, "viewer")

    def test_remove_requires_matching_confirmation_email(self):
        url = reverse("accounts-team-members", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.owner)
        res = self.client.delete(
            url,
            {"user_id": str(self.other.id), "confirmation_email": "wrong@example.com"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Email confirmation", res.data["error"]["message"])

    def test_transfer_requires_matching_confirmation_email(self):
        url = reverse("accounts-team-transfer-ownership", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(
            url,
            {"new_owner_user_id": str(self.member.id), "confirmation_email": "wrong@example.com"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Email confirmation", res.data["error"]["message"])

    def test_owner_cannot_change_own_role_via_member_patch(self):
        url = reverse("accounts-team-members", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch(
            url,
            {"user_id": str(self.owner.id), "role": "viewer"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot change their own role", res.data["error"]["message"])

    def test_member_patch_cannot_assign_owner_role(self):
        url = reverse("accounts-team-members", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.owner)
        res = self.client.patch(
            url,
            {"user_id": str(self.member.id), "role": "owner"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("transfer ownership", res.data["error"]["message"].lower())

    @patch("accounts.views.purge_soft_deleted_team.apply_async")
    def test_owner_can_soft_delete_team(self, mocked_apply_async):
        url = reverse("accounts-team-detail", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.owner)
        res = self.client.delete(url, {"confirmation_email": self.owner.email}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.team.refresh_from_db()
        self.assertTrue(self.team.is_deleted)
        self.assertIsNotNone(self.team.deleted_at)
        self.assertIsNotNone(self.team.purge_after)
        mocked_apply_async.assert_called_once()

    def test_team_delete_requires_owner(self):
        url = reverse("accounts-team-detail", kwargs={"team_id": self.team.id})
        self.client.force_authenticate(user=self.member)
        res = self.client.delete(url, {"confirmation_email": self.member.email}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class AccountTaskReliabilityTests(APITestCase):
    def test_invite_email_task_has_retry_policy(self):
        self.assertTrue(send_team_invite_email.autoretry_for)
        self.assertEqual(send_team_invite_email.max_retries, 3)
        self.assertTrue(send_team_invite_email.retry_backoff)
        self.assertTrue(send_team_invite_email.retry_jitter)


class InviteTaskDispatchTraceTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="trace-owner",
            email="trace-owner@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Trace Team", slug="trace-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")

    @patch("accounts.views.send_team_invite_email.delay")
    def test_invite_create_propagates_request_trace_id(self, mocked_delay):
        self.client.force_authenticate(user=self.owner)
        url = reverse("accounts-team-invite-create", kwargs={"team_id": self.team.id})
        trace_id = "trace-invite-create-001"
        res = self.client.post(
            url,
            {"invitee_email": "new@example.com", "role": "viewer"},
            format="json",
            HTTP_X_REQUEST_ID=trace_id,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        mocked_delay.assert_called_once()
        self.assertEqual(mocked_delay.call_args.kwargs["trace_id"], trace_id)

    @patch("accounts.views.send_team_invite_email.delay")
    def test_invite_resend_propagates_request_trace_id(self, mocked_delay):
        invite = TeamInvite.objects.create(
            team=self.team,
            created_by=self.owner,
            invitee_email="new2@example.com",
            role="editor",
            expires_at=timezone.now() + timedelta(days=7),
        )
        self.client.force_authenticate(user=self.owner)
        url = reverse(
            "accounts-team-invite-resend",
            kwargs={"team_id": self.team.id, "invite_id": invite.id},
        )
        trace_id = "trace-invite-resend-001"
        res = self.client.post(url, {}, format="json", HTTP_X_REQUEST_ID=trace_id)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mocked_delay.assert_called_once()
        self.assertEqual(mocked_delay.call_args.kwargs["trace_id"], trace_id)


class SeatEntitlementTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="seat-owner",
            email="seat-owner@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Seat Team", slug="seat-team", created_by=self.owner, plan="free")
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")

    def test_invite_create_blocks_when_seat_limit_reached(self):
        user_a = User.objects.create_user(username="seat-a2", email="seat-a2@example.com", password="test-password")
        user_b = User.objects.create_user(username="seat-b2", email="seat-b2@example.com", password="test-password")
        TeamMember.objects.create(team=self.team, user=user_a, role="viewer")
        TeamMember.objects.create(team=self.team, user=user_b, role="viewer")

        self.client.force_authenticate(user=self.owner)
        url = reverse("accounts-team-invite-create", kwargs={"team_id": self.team.id})
        res = self.client.post(
            url,
            {"invitee_email": "blocked@example.com", "role": "viewer"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "plan_limit_exceeded")
