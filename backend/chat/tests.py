from __future__ import annotations

from unittest.mock import Mock, patch

from django.conf import settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User
from billing.models import TeamSubscription
from research.models import ResearchLog, TeamResearchQuota

from chat.tools import ToolContext, _research_save_to_wiki, _web_read_page, _web_search


class ResearchModeTests(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._cache_close_patcher = patch("django.core.cache.caches.close_all", lambda: None)
        cls._cache_close_patcher.start()

    @classmethod
    def tearDownClass(cls):
        cls._cache_close_patcher.stop()
        super().tearDownClass()

    def setUp(self):
        self._setting_patchers = [
            patch.object(settings, "TAVILY_API_KEY", "test-key"),
            patch.object(settings, "RESEARCH_DOMAIN_BLOCKLIST", ["blocked.example"]),
            patch.object(settings, "RESEARCH_MAX_CONTENT_CHARS", 20),
            patch.object(settings, "RESEARCH_MONTHLY_QUOTAS", {"free": 0, "team": 2, "pro": 5, "enterprise": 10}),
        ]
        for patcher in self._setting_patchers:
            patcher.start()
        self.owner = User.objects.create_user(
            username="research-owner",
            email="research-owner@example.com",
            password="test-password",
        )
        self.editor = User.objects.create_user(
            username="research-editor",
            email="research-editor@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Research Team", slug="research-team", created_by=self.owner, plan="team")
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")
        TeamMember.objects.create(team=self.team, user=self.editor, role="editor")
        TeamSubscription.objects.create(team=self.team, plan_key="team", status="active")
        self.context = ToolContext(
            user=self.editor,
            team_id=str(self.team.id),
            membership=TeamMember.objects.get(team=self.team, user=self.editor),
        )

    def tearDown(self):
        for patcher in reversed(self._setting_patchers):
            patcher.stop()
        super().tearDown()

    def test_capabilities_endpoint_exposes_research_state(self):
        self.client.force_authenticate(user=self.editor)
        res = self.client.get(f"/api/chat/{self.team.id}/capabilities/", follow=True)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        data = res.data["data"]
        self.assertTrue(data["research_mode_available"])
        self.assertTrue(data["research_save_available"])
        self.assertEqual(data["research_quota"]["limit"], 2)
        self.assertEqual(data["research_quota"]["remaining"], 2)

    @patch("chat.tools.requests.post")
    def test_web_search_filters_blocked_urls_and_consumes_quota(self, mock_post):
        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "results": [
                {
                    "title": "Allowed Source",
                    "url": "https://example.com/allowed",
                    "score": 0.99,
                    "content": "This is a long allowed result content that will be truncated.",
                },
                {
                    "title": "Blocked Source",
                    "url": "https://blocked.example/path",
                    "score": 0.95,
                    "content": "Should not be returned.",
                },
            ]
        }
        mock_post.return_value = mock_response

        result = _web_search(self.context, {"query": "research topic", "max_results": 5})

        self.assertTrue(result["ok"])
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["results"][0]["url"], "https://example.com/allowed")
        self.assertLessEqual(len(result["results"][0]["content"]), 20)

        quota = TeamResearchQuota.get_state(self.team)
        self.assertEqual(quota.current, 1)
        self.assertEqual(quota.remaining, 1)
        self.assertEqual(ResearchLog.objects.filter(team=self.team, action="search").count(), 1)

    @patch("chat.tools.requests.post")
    def test_web_read_page_blocks_domains_and_truncates_content(self, mock_post):
        blocked = _web_read_page(self.context, {"url": "https://blocked.example/article"})
        self.assertFalse(blocked["ok"])
        self.assertEqual(blocked["error"], "blocked_domain")

        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "results": [
                {
                    "title": "Allowed Article",
                    "url": "https://example.com/article",
                    "content": "x" * 100,
                }
            ]
        }
        mock_post.return_value = mock_response

        result = _web_read_page(self.context, {"url": "https://example.com/article"})

        self.assertTrue(result["ok"])
        self.assertEqual(result["content_chars"], 20)
        self.assertEqual(len(result["content"]), 20)
        self.assertEqual(ResearchLog.objects.filter(team=self.team, action="read").count(), 1)

    @patch("ingest.tasks.run_ingest_job.delay")
    def test_research_save_to_wiki_queues_ingest_and_logs(self, mock_delay):
        result = _research_save_to_wiki(
            self.context,
            {
                "title": "Research Summary",
                "markdown": "Important findings from research.",
                "source_urls": ["https://example.com/allowed"],
            },
        )

        self.assertTrue(result["ok"])
        self.assertIn("job_id", result)
        mock_delay.assert_called_once()
        self.assertEqual(ResearchLog.objects.filter(team=self.team, action="save").count(), 1)

    def test_capabilities_disable_research_when_unconfigured(self):
        with patch.object(settings, "TAVILY_API_KEY", ""):
            self.client.force_authenticate(user=self.editor)
            res = self.client.get(f"/api/chat/{self.team.id}/capabilities/", follow=True)

            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertFalse(res.data["data"]["research_mode_available"])
            self.assertEqual(res.data["data"]["research_quota"]["reason"], "research_unconfigured")
