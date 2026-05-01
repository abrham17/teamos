from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User
from export_app.models import ExportEvent
from wiki.models import WikiPage


class ExportApiTests(APITestCase):
    def setUp(self):
        self.member = User.objects.create_user(
            username="export-member",
            email="export-member@example.com",
            password="test-password",
        )
        self.outsider = User.objects.create_user(
            username="export-outsider",
            email="export-outsider@example.com",
            password="test-password",
        )
        self.viewer = User.objects.create_user(
            username="export-viewer",
            email="export-viewer@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Export Team", slug="export-team", created_by=self.member)
        TeamMember.objects.create(team=self.team, user=self.member, role="editor")
        TeamMember.objects.create(team=self.team, user=self.viewer, role="viewer")
        self.page = WikiPage.objects.create(
            team=self.team,
            title="Runbook",
            slug="runbook",
            content="Incident runbook content",
            created_by=self.member,
        )

    def test_member_can_export_single_page(self):
        self.client.force_authenticate(user=self.member)
        url = f"/api/export/{self.team.id}/page/{self.page.slug}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("text/markdown", res["Content-Type"])
        self.assertIn("attachment;", res["Content-Disposition"])
        self.assertEqual(ExportEvent.objects.filter(team=self.team).count(), 1)

    def test_outsider_cannot_export(self):
        self.client.force_authenticate(user=self.outsider)
        url = f"/api/export/{self.team.id}/wiki/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "forbidden")

    def test_viewer_cannot_export_due_to_role_policy(self):
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/export/{self.team.id}/wiki/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "export_role_forbidden")

    def test_free_plan_blocks_export_when_limit_reached(self):
        self.team.plan = "free"
        self.team.save(update_fields=["plan"])
        ExportEvent.objects.create(team=self.team, user=self.member, export_type="wiki_zip")
        ExportEvent.objects.create(team=self.team, user=self.member, export_type="page_markdown")
        ExportEvent.objects.create(team=self.team, user=self.member, export_type="page_markdown")

        self.client.force_authenticate(user=self.member)
        url = f"/api/export/{self.team.id}/wiki/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "plan_limit_exceeded")
