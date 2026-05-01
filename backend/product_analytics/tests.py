from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch
from django.utils import timezone
from datetime import timedelta

from accounts.models import Team, TeamMember, User
from accounts.models import TeamInvite
from product_analytics.models import ProductEvent
from product_analytics.services import record_product_event


class ProductAnalyticsApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="analytics-user",
            email="analytics-user@example.com",
            password="test-password",
        )
        self.other = User.objects.create_user(
            username="analytics-other",
            email="analytics-other@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Analytics Team", slug="analytics-team", created_by=self.user)
        TeamMember.objects.create(team=self.team, user=self.user, role="owner")

    def test_member_can_fetch_weekly_funnel(self):
        record_product_event(event_name="workspace_created", team=self.team, user=self.user)
        record_product_event(event_name="invite_sent", team=self.team, user=self.user)
        self.client.force_authenticate(user=self.user)
        res = self.client.get(f"/api/analytics/{self.team.id}/funnel/weekly/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["team_plan"], "free")
        event_names = {row["event_name"] for row in res.data["data"]["funnel"]}
        self.assertIn("workspace_created", event_names)
        self.assertIn("invite_sent", event_names)

    def test_non_member_cannot_fetch_weekly_funnel(self):
        self.client.force_authenticate(user=self.other)
        res = self.client.get(f"/api/analytics/{self.team.id}/funnel/weekly/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(res.data["success"])

    def test_member_can_record_upgrade_clicked_event(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.post(
            f"/api/analytics/{self.team.id}/events/upgrade-clicked/",
            {"surface": "settings_team_profile"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ProductEvent.objects.filter(team=self.team, event_name="upgrade_clicked").exists())

    def test_staff_can_fetch_weekly_cohorts(self):
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        record_product_event(event_name="workspace_created", team=self.team, user=self.user)
        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/analytics/cohorts/weekly/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertIn("cohorts", res.data["data"])

    def test_staff_can_fetch_weekly_cohorts_with_filters(self):
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        self.client.force_authenticate(user=self.user)
        res = self.client.get(
            "/api/analytics/cohorts/weekly/?start_date=2026-01-01&end_date=2026-12-31&conversion_window_days=14"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["filters"]["start_date"], "2026-01-01")
        self.assertEqual(res.data["data"]["filters"]["end_date"], "2026-12-31")
        self.assertEqual(res.data["data"]["filters"]["conversion_window_days"], 14)

    def test_cohorts_reject_invalid_filter_values(self):
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        self.client.force_authenticate(user=self.user)

        bad_date = self.client.get("/api/analytics/cohorts/weekly/?start_date=bad-date")
        self.assertEqual(bad_date.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_date.data["error"]["code"], "invalid_query_param")

        bad_window = self.client.get("/api/analytics/cohorts/weekly/?conversion_window_days=0")
        self.assertEqual(bad_window.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_window.data["error"]["code"], "invalid_query_param")

    def test_cohort_conversion_window_limits_counts(self):
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        self.client.force_authenticate(user=self.user)

        Team.objects.filter(id=self.team.id).update(created_at=timezone.now() - timedelta(days=35))
        self.team.refresh_from_db()
        event = ProductEvent.objects.create(
            event_name="first_page_created",
            team=self.team,
            user=self.user,
        )
        ProductEvent.objects.filter(id=event.id).update(occurred_at=timezone.now())

        short_window = self.client.get("/api/analytics/cohorts/weekly/?conversion_window_days=7")
        long_window = self.client.get("/api/analytics/cohorts/weekly/?conversion_window_days=60")
        self.assertEqual(short_window.status_code, status.HTTP_200_OK)
        self.assertEqual(long_window.status_code, status.HTTP_200_OK)

        short_count = 0
        for row in short_window.data["data"]["cohorts"]:
            if row["teams_created"] > 0:
                short_count = row["first_page_created"]
                break

        long_count = 0
        for row in long_window.data["data"]["cohorts"]:
            if row["teams_created"] > 0:
                long_count = row["first_page_created"]
                break

        self.assertEqual(short_count, 0)
        self.assertEqual(long_count, 1)


class ProductAnalyticsInstrumentationTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="instrument-owner",
            email="instrument-owner@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Inst Team", slug="inst-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")

    def test_workspace_created_event_recorded(self):
        user = User.objects.create_user(
            username="create-team-user",
            email="create-team-user@example.com",
            password="test-password",
        )
        self.client.force_authenticate(user=user)
        res = self.client.post("/api/auth/teams/", {"name": "New Team"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        team_id = res.data["data"]["id"]
        self.assertTrue(ProductEvent.objects.filter(event_name="workspace_created", team_id=team_id).exists())

    def test_invite_sent_and_accepted_events_recorded(self):
        invitee = User.objects.create_user(
            username="instrument-invitee",
            email="instrument-invitee@example.com",
            password="test-password",
        )
        self.client.force_authenticate(user=self.owner)
        with patch("accounts.views.send_team_invite_email.delay"):
            create_invite = self.client.post(
                f"/api/auth/teams/{self.team.id}/invite/",
                {"invitee_email": invitee.email, "role": "viewer"},
                format="json",
            )
        self.assertEqual(create_invite.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ProductEvent.objects.filter(team=self.team, event_name="invite_sent").exists())

        invite = TeamInvite.objects.filter(team=self.team, invitee_email=invitee.email).latest("expires_at")
        self.client.force_authenticate(user=invitee)
        accept = self.client.post("/api/auth/teams/accept-invite/", {"token": str(invite.token)}, format="json")
        self.assertEqual(accept.status_code, status.HTTP_200_OK)
        self.assertTrue(ProductEvent.objects.filter(team=self.team, event_name="invite_accepted").exists())
