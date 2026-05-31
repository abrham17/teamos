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


class MCPServerRegistrationTests(APITestCase):
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
        self.owner = User.objects.create_user(
            username="mcp-owner",
            email="mcp-owner@example.com",
            password="test-password",
        )
        self.editor = User.objects.create_user(
            username="mcp-editor",
            email="mcp-editor@example.com",
            password="test-password",
        )
        self.viewer = User.objects.create_user(
            username="mcp-viewer",
            email="mcp-viewer@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="MCP Team", slug="mcp-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")
        TeamMember.objects.create(team=self.team, user=self.editor, role="editor")
        TeamMember.objects.create(team=self.team, user=self.viewer, role="viewer")
        
        from chat.mcp_client import _mcp_clients
        _mcp_clients.clear()

        # Mock Django cache to avoid redis dependency in tests
        self._cache_patcher = patch("django.core.cache.cache")
        self.mock_cache = self._cache_patcher.start()
        self.mock_cache.get.return_value = None

    def tearDown(self):
        self._cache_patcher.stop()
        super().tearDown()

    def test_owner_can_crud_mcp_registration(self):
        import json
        self.client.force_authenticate(user=self.owner)
        
        # 1. Create registration
        res = self.client.post(
            f"/api/chat/{self.team.id}/mcp-servers/",
            data={
                "name": "GitHub ",
                "url": "http://localhost:9090/github",
                "auth_token": "ghp_secure_token",
            },
            secure=True
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        data = res.data["data"]
        self.assertEqual(data["name"], "github")  # lowercased and trimmed
        self.assertEqual(data["url"], "http://localhost:9090/github")
        self.assertTrue(data["has_token"])
        
        # Verify db holds encrypted token
        from chat.models import MCPServerRegistration
        reg = MCPServerRegistration.objects.get(id=data["id"])
        self.assertTrue(reg.auth_token.startswith("enc::"))
        self.assertEqual(reg.decrypted_token, "ghp_secure_token")

        # 2. Get registrations
        res = self.client.get(f"/api/chat/{self.team.id}/mcp-servers/", secure=True)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["data"]), 1)
        self.assertEqual(res.data["data"][0]["name"], "github")
        self.assertNotIn("ghp_secure_token", json.dumps(res.data))

        # 3. Patch registration
        res = self.client.patch(
            f"/api/chat/{self.team.id}/mcp-servers/{reg.id}/",
            data={"enabled": False, "url": "http://localhost:9090/github-new"},
            secure=True
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["data"]["enabled"])
        self.assertEqual(res.data["data"]["url"], "http://localhost:9090/github-new")

        # 4. Delete registration
        res = self.client.delete(f"/api/chat/{self.team.id}/mcp-servers/{reg.id}/", secure=True)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(MCPServerRegistration.objects.filter(id=reg.id).count(), 0)

    def test_editor_and_viewer_cannot_crud_mcp_registration(self):
        from chat.models import MCPServerRegistration
        reg = MCPServerRegistration.objects.create(
            team=self.team,
            name="slack",
            url="http://localhost:9090/slack",
            auth_token="xoxb-token"
        )
        
        for user in [self.editor, self.viewer]:
            self.client.force_authenticate(user=user)
            
            # View
            res = self.client.get(f"/api/chat/{self.team.id}/mcp-servers/", secure=True)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
            
            # Create
            res = self.client.post(
                f"/api/chat/{self.team.id}/mcp-servers/",
                data={"name": "trello", "url": "http://localhost:9090/trello"},
                secure=True
            )
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
            
            # Patch
            res = self.client.patch(
                f"/api/chat/{self.team.id}/mcp-servers/{reg.id}/",
                data={"enabled": False},
                secure=True
            )
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
            
            # Delete
            res = self.client.delete(f"/api/chat/{self.team.id}/mcp-servers/{reg.id}/", secure=True)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @patch("chat.mcp_client.MCPClient.discover_tools")
    def test_sync_registration_endpoints(self, mock_discover):
        from chat.mcp_client import MCPTool
        from chat.models import MCPServerRegistration
        mock_discover.return_value = [
            MCPTool(server_name="github", name="search_code", description="Search code", input_schema={})
        ]
        
        reg = MCPServerRegistration.objects.create(
            team=self.team,
            name="github",
            url="http://localhost:9090/github",
            auth_token="ghp_token"
        )
        
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(f"/api/chat/{self.team.id}/mcp-servers/{reg.id}/sync/", secure=True)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["status"], "connected")
        self.assertEqual(res.data["data"]["tools"], ["search_code"])
        
        reg.refresh_from_db()
        self.assertEqual(reg.capabilities, ["search_code"])


class DictCache:
    def __init__(self):
        self.data = {}
    def get(self, key, default=None):
        return self.data.get(key, default)
    def set(self, key, value, timeout=None):
        self.data[key] = value
    def clear(self):
        self.data.clear()


class ChatTTSTests(APITestCase):
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
        self.dict_cache = DictCache()
        self._cache_patcher = patch("django.core.cache.cache", self.dict_cache)
        self._cache_patcher.start()
        
        self.owner = User.objects.create_user(
            username="tts-owner",
            email="tts-owner@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="TTS Team", slug="tts-team", created_by=self.owner, plan="free")
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")
        TeamSubscription.objects.create(team=self.team, plan_key="free", status="active")

    def tearDown(self):
        self._cache_patcher.stop()
        super().tearDown()

    @patch("chat.views.OpenAI")
    def test_tts_rate_limit_and_quota_consumption(self, mock_openai_class):
        # Mock OpenAI audio speech response
        mock_client = Mock()
        mock_binary = Mock()
        mock_binary.read.return_value = b"fake-audio-bytes"
        mock_client.audio.speech.create.return_value = mock_binary
        mock_openai_class.return_value = mock_client

        self.client.force_authenticate(user=self.owner)

        # 1. Successful request under quota & rate limit
        with patch.object(settings, "OPENAI_API_KEY", "test-key"):
            res = self.client.post(
                f"/api/chat/{self.team.id}/tts/",
                {"text": "Hello World", "voice": "alloy"},
                format="json",
                secure=True
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.content, b"fake-audio-bytes")

        # 2. Exceed quota limit (10,000 for free tier) by accumulating requests
        with patch.object(settings, "OPENAI_API_KEY", "test-key"):
            # First request: 4000 chars
            res1 = self.client.post(
                f"/api/chat/{self.team.id}/tts/",
                {"text": "A" * 4000, "voice": "alloy"},
                format="json",
                secure=True
            )
            self.assertEqual(res1.status_code, status.HTTP_200_OK)

            # Second request: 4000 chars (total 8000)
            res2 = self.client.post(
                f"/api/chat/{self.team.id}/tts/",
                {"text": "A" * 4000, "voice": "alloy"},
                format="json",
                secure=True
            )
            self.assertEqual(res2.status_code, status.HTTP_200_OK)

            # Third request: 4000 chars (total 12000) -> should fail 403
            res3 = self.client.post(
                f"/api/chat/{self.team.id}/tts/",
                {"text": "A" * 4000, "voice": "alloy"},
                format="json",
                secure=True
            )
            self.assertEqual(res3.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(res3.data["error"]["code"], "quota_exceeded")

        # 3. Hit rate limit (trigger 31 times to exceed 30 limit)
        from django.core.cache import cache
        cache.clear()
        
        with patch.object(settings, "OPENAI_API_KEY", "test-key"):
            for _ in range(30):
                res = self.client.post(
                    f"/api/chat/{self.team.id}/tts/",
                    {"text": "Hello", "voice": "alloy"},
                    format="json",
                    secure=True
                )
                self.assertEqual(res.status_code, status.HTTP_200_OK)
            
            # 31st request should trigger 429
            res = self.client.post(
                f"/api/chat/{self.team.id}/tts/",
                {"text": "Hello", "voice": "alloy"},
                format="json",
                secure=True
            )
            self.assertEqual(res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)



