from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User
from wiki.models import WikiPage


class WikiApiTests(APITestCase):
    def setUp(self):
        self.editor = User.objects.create_user(
            username="wiki-editor",
            email="wiki-editor@example.com",
            password="test-password",
        )
        self.viewer = User.objects.create_user(
            username="wiki-viewer",
            email="wiki-viewer@example.com",
            password="test-password",
        )
        self.outsider = User.objects.create_user(
            username="wiki-outsider",
            email="wiki-outsider@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Wiki Team", slug="wiki-team", created_by=self.editor)
        TeamMember.objects.create(team=self.team, user=self.editor, role="editor")
        TeamMember.objects.create(team=self.team, user=self.viewer, role="viewer")

    def test_editor_can_create_page(self):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/wiki/{self.team.id}/pages/"
        res = self.client.post(
            url,
            {"title": "Engineering Overview", "content": "System architecture notes"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["title"], "Engineering Overview")
        self.assertTrue(WikiPage.objects.filter(team=self.team, slug="engineering-overview").exists())

    def test_frontmatter_roundtrip_on_create_and_update(self):
        self.client.force_authenticate(user=self.editor)
        create_url = f"/api/wiki/{self.team.id}/pages/"
        create_res = self.client.post(
            create_url,
            {
                "title": "Metadata Page",
                "content": "Metadata content",
                "frontmatter": {"status": "draft", "priority": "High"},
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_res.data["data"]["frontmatter"]["status"], "draft")

        slug = create_res.data["data"]["slug"]
        update_url = f"/api/wiki/{self.team.id}/pages/{slug}/"
        update_res = self.client.put(
            update_url,
            {
                "title": "Metadata Page",
                "content": "Updated metadata content",
                "frontmatter": {"status": "stable", "priority": "Medium", "tags": "ops,docs"},
            },
            format="json",
        )
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)
        self.assertEqual(update_res.data["data"]["frontmatter"]["status"], "stable")
        self.assertEqual(update_res.data["data"]["frontmatter"]["priority"], "Medium")

    def test_viewer_cannot_create_page(self):
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/wiki/{self.team.id}/pages/"
        res = self.client.post(url, {"title": "Nope", "content": "not allowed"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_free_plan_blocks_page_creation_when_limit_reached(self):
        self.team.plan = "free"
        self.team.save(update_fields=["plan"])
        WikiPage.objects.create(
            team=self.team,
            title="Existing A",
            slug="existing-a",
            content="A",
            created_by=self.editor,
        )
        WikiPage.objects.create(
            team=self.team,
            title="Existing B",
            slug="existing-b",
            content="B",
            created_by=self.editor,
        )
        self.client.force_authenticate(user=self.editor)
        url = f"/api/wiki/{self.team.id}/pages/"
        res = self.client.post(
            url,
            {"title": "Over Limit", "content": "Blocked"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "plan_limit_exceeded")

    def test_member_can_get_page_detail(self):
        page = WikiPage.objects.create(
            team=self.team,
            title="Roadmap",
            slug="roadmap",
            content="Q3 priorities",
            created_by=self.editor,
        )
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/wiki/{self.team.id}/pages/{page.slug}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["slug"], "roadmap")

    def test_non_member_cannot_list_pages(self):
        self.client.force_authenticate(user=self.outsider)
        url = f"/api/wiki/{self.team.id}/pages/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
