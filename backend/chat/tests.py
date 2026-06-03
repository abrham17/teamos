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


class ProceduralMemoryAndClassifierTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="pm-owner",
            email="pm-owner@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="PM Team", slug="pm-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")
        
        # Clear out existing procedural memories if any
        from chat.models import ProceduralMemory
        ProceduralMemory.objects.filter(team=self.team).delete()

    def test_directives_injection_and_formatting(self):
        from chat.models import ProceduralMemory, DirectiveType
        from chat.memory.injection import get_relevant_directives, format_directives_for_prompt

        # Create sample directives
        d1 = ProceduralMemory.objects.create(
            team=self.team,
            directive="Keep plans under 5 tasks.",
            directive_type=DirectiveType.PLANNING_HEURISTIC,
            domain="engineering_sprint",
            applicable_intent_types=["plan/create"],
            confidence=0.9
        )
        d2 = ProceduralMemory.objects.create(
            team=self.team,
            directive="Use GitHub actions safely.",
            directive_type=DirectiveType.INTEGRATION_RULE,
            domain="engineering_sprint",
            applicable_intent_types=["plan/create"],
            confidence=0.85
        )
        d3 = ProceduralMemory.objects.create(
            team=self.team,
            directive="Never delete database backups.",
            directive_type=DirectiveType.FAILURE_PATTERN,
            domain="ops",
            applicable_intent_types=["plan/create"],
            confidence=0.8
        )

        # 1. Query for engineering_sprint domain
        directives = get_relevant_directives(
            team_id=str(self.team.id),
            intent_type="plan/create",
            domain="engineering_sprint"
        )
        self.assertEqual(len(directives), 2)
        self.assertIn(d1, directives)
        self.assertIn(d2, directives)
        self.assertNotIn(d3, directives)

        # Verify last_used_at updated
        d1.refresh_from_db()
        self.assertIsNotNone(d1.last_used_at)

        # 2. Format output check
        formatted = format_directives_for_prompt(directives)
        self.assertIn("Keep plans under 5 tasks.", formatted)
        self.assertIn("Use GitHub actions safely.", formatted)

    @patch("django.core.cache.cache.get")
    @patch("django.core.cache.cache.set")
    def test_hybrid_intent_classifier_caching(self, mock_set, mock_get):
        from chat.intent.schema import IntentSchema
        from chat.intent.classifier import HybridIntentClassifier
        from dataclasses import asdict

        # Mock cache hit
        cached_intent_data = {
            "intent_type": "wiki/query",
            "complexity": "low",
            "domains": ["general"],
            "required_capabilities": ["wiki_search"],
            "parallelizable": False,
            "estimated_rounds": 2,
            "requires_external": False,
            "confidence": 0.95
        }
        mock_get.return_value = cached_intent_data

        classifier = HybridIntentClassifier()
        res = classifier.classify("What is the wiki content?", self.team)
        self.assertEqual(res.intent.intent_type, "wiki/query")
        self.assertEqual(res.layer_used, 1)

    @patch("chat.intent.embedding_classifier.EmbeddingClassifier.classify")
    @patch("django.core.cache.cache.get")
    def test_hybrid_intent_classifier_embedding_fallback(self, mock_cache_get, mock_emb_classify):
        from chat.intent.schema import IntentSchema
        from chat.intent.classifier import HybridIntentClassifier
        
        mock_cache_get.return_value = None
        
        # Layer 2: Embedding Similarity hit
        matched_intent = IntentSchema(
            intent_type="plan/create",
            complexity="high",
            domains=["engineering"],
            required_capabilities=["plan_creation"],
            parallelizable=True,
            estimated_rounds=8,
            requires_external=False,
            confidence=0.88
        )
        mock_emb_classify.return_value = (matched_intent, 0.88)

        classifier = HybridIntentClassifier()
        res = classifier.classify_with_metadata("build me a sprint schedule", self.team)
        self.assertEqual(res.intent.intent_type, "plan/create")
        self.assertEqual(res.layer_used, 2)
        self.assertEqual(res.similarity_score, 0.88)

    @patch("llm_orchestrator.orchestrator.llm_json_call")
    def test_retrospective_learning_loop_success_extraction(self, mock_llm_json):
        from chat.models import AgentEpisode, ProceduralMemory, DirectiveType
        from chat.tasks import retrospective_learning_loop

        episode = AgentEpisode.objects.create(
            team=self.team,
            trigger="Create a new release checklist.",
            plan={"type": "strategic"},
            actions=[{"tool": "wiki_create_page", "ok": True}],
            outcome={"success": True},
            learnings="Successfully created release checklist page in wiki.",
            success=True,
            quality_score=0.9,
            rounds_taken=2
        )

        # Mock LLM extraction return value
        mock_llm_json.return_value = {
            "domain": "engineering_sprint",
            "patterns": [
                {
                    "type": "planning_heuristic",
                    "keyword": "release checklist",
                    "directive": "Always create a release checklist page when starting a new sprint.",
                    "applicable_intents": ["plan/create"]
                }
            ]
        }

        # Run retro loop
        res = retrospective_learning_loop(str(episode.id))
        self.assertEqual(res["status"], "success")

        # Verify ProceduralMemory generated
        mem = ProceduralMemory.objects.filter(team=self.team).first()
        self.assertIsNotNone(mem)
        self.assertEqual(mem.domain, "engineering_sprint")
        self.assertEqual(mem.directive_type, DirectiveType.PLANNING_HEURISTIC)
        self.assertIn("Always create a release checklist", mem.directive)

    def test_daily_directive_maintenance_pruning_and_decay(self):
        from datetime import timedelta
        from django.utils import timezone
        from chat.models import ProceduralMemory, DirectiveType
        from chat.tasks import daily_directive_maintenance

        now = timezone.now()

        # 1. Expired directive
        ProceduralMemory.objects.create(
            team=self.team,
            directive="Old rule.",
            directive_type=DirectiveType.VOCABULARY,
            confidence=0.9,
            expires_at=now - timedelta(days=1)
        )

        # 2. Contradicted directive (contradiction count >= 3)
        ProceduralMemory.objects.create(
            team=self.team,
            directive="Contradicted rule.",
            directive_type=DirectiveType.VOCABULARY,
            confidence=0.8,
            contradiction_count=3
        )

        # 3. Decaying directive (unused for >30 days)
        decaying = ProceduralMemory.objects.create(
            team=self.team,
            directive="Unused rule.",
            directive_type=DirectiveType.VOCABULARY,
            confidence=0.9,
            last_used_at=now - timedelta(days=31)
        )

        # Run maintenance
        res = daily_directive_maintenance()
        self.assertEqual(res["pruned"], 2)  # Expired + contradicted
        
        decaying.refresh_from_db()
        self.assertLess(decaying.confidence, 0.9)  # Confidence decayed


class MCPDictCache:
    def __init__(self):
        self.data = {}
    def get(self, key, default=None):
        return self.data.get(key, default)
    def set(self, key, value, timeout=None):
        self.data[key] = value
    def delete(self, key):
        self.data.pop(key, None)
    def clear(self):
        self.data.clear()


class MCPToolsUpgradeTests(APITestCase):
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
        self.dict_cache = MCPDictCache()
        self._patchers = [
            patch("django.core.cache.cache", self.dict_cache),
            patch("chat.mcp_client.cache", self.dict_cache),
            patch("chat.mcp.health.cache", self.dict_cache),
            patch("chat.mcp.executor.cache", self.dict_cache),
        ]
        for p in self._patchers:
            p.start()
        
        self.owner = User.objects.create_user(
            username="mcp-test-owner",
            email="mcp-test-owner@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(
            name="MCP Upgrade Team",
            slug="mcp-upgrade-team",
            created_by=self.owner,
        )
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")
        
        from chat.models import MCPServerRegistration
        self.server = MCPServerRegistration.objects.create(
            team=self.team,
            name="demo_server",
            url="http://localhost:8000/mcp",
            auth_token="demo-token",
            allowed_crew_roles=["architect", "engineer"],
            risk_level_override=None,
        )

    def tearDown(self):
        for p in self._patchers:
            p.stop()
        super().tearDown()

    @patch("chat.mcp_client.MCPClient.discover_tools")
    def test_registry_validation_and_risk_inference(self, mock_discover):
        from chat.mcp_client import MCPTool
        from chat.mcp.registry import get_mcp_registry
        
        # Mock server returning 3 tools
        mock_discover.return_value = [
            # Low risk read tool
            MCPTool(server_name="demo_server", name="read_file", description="Retrieve file contents", input_schema={"type": "object", "properties": {}}),
            # High risk delete tool
            MCPTool(server_name="demo_server", name="delete_db", description="Delete database records", input_schema={"type": "object", "properties": {}}),
            # Shadowing tool (should be rejected)
            MCPTool(server_name="demo_server", name="wiki_read_full_page", description="Read wiki page", input_schema={"type": "object", "properties": {}}),
        ]
        
        registry = get_mcp_registry()
        registry.unregister_server(str(self.server.id))
        
        registered = registry.register_server(self.server)
        
        # wiki_read_full_page shadows internal tool, so only 2 tools registered
        self.assertEqual(len(registered), 2)
        self.assertIn("mcp_demo_server_read_file", registered)
        self.assertIn("mcp_demo_server_delete_db", registered)
        
        # Test risk inference
        read_tool = registry.get_tool("mcp_demo_server_read_file")
        self.assertEqual(read_tool.risk_level, "low")
        self.assertFalse(read_tool.is_destructive)
        
        delete_tool = registry.get_tool("mcp_demo_server_delete_db")
        self.assertEqual(delete_tool.risk_level, "high")
        self.assertTrue(delete_tool.is_destructive)

    def test_circuit_breaker_states(self):
        from chat.mcp.health import is_server_available, record_failure, record_success, get_circuit_state, CircuitState
        
        server_id = str(self.server.id)
        
        # Initially closed (available)
        self.assertTrue(is_server_available(server_id))
        self.assertEqual(get_circuit_state(server_id), CircuitState.CLOSED)
        
        # 3 failures triggers OPEN state
        record_failure(server_id)
        record_failure(server_id)
        self.assertTrue(is_server_available(server_id)) # still closed/half_open threshold
        record_failure(server_id)
        
        self.assertFalse(is_server_available(server_id))
        self.assertEqual(get_circuit_state(server_id), CircuitState.OPEN)
        
        # Success resets circuit
        record_success(server_id)
        self.assertTrue(is_server_available(server_id))
        self.assertEqual(get_circuit_state(server_id), CircuitState.CLOSED)

    @patch("chat.mcp_client.MCPClient.call_tool")
    def test_executor_idempotency_and_audit_logging(self, mock_call):
        from chat.mcp.registry import get_mcp_registry, MCPToolDefinition
        from chat.mcp.executor import MCPToolExecutor
        from chat.models import MCPToolExecutionLog
        
        # Setup tool in registry
        registry = get_mcp_registry()
        registry._tools["mcp_demo_server_run_query"] = MCPToolDefinition(
            server_id=str(self.server.id),
            server_name="demo_server",
            tool_name="run_query",
            prefixed_name="mcp_demo_server_run_query",
            description="run query on db",
            parameters_schema={"properties": {}},
            is_destructive=False,
            is_external_write=False,
            risk_level="medium",
            team_id=str(self.team.id)
        )
        
        mock_call.return_value = {"ok": True, "result": "query_ran"}
        
        executor = MCPToolExecutor(team_id=str(self.team.id), session_id="test-session")
        
        # Execution 1 (Cache Miss)
        res1 = executor.execute(
            prefixed_name="mcp_demo_server_run_query",
            tool_input={"q": "select 1"},
            idempotency_key="idem-123"
        )
        self.assertTrue(res1["ok"])
        self.assertEqual(res1["result"], "query_ran")
        self.assertFalse(res1.get("idempotency_hit", False))
        
        # Execution 2 (Cache Hit)
        res2 = executor.execute(
            prefixed_name="mcp_demo_server_run_query",
            tool_input={"q": "select 1"},
            idempotency_key="idem-123"
        )
        self.assertTrue(res2["ok"])
        self.assertEqual(res2["result"], "query_ran")
        self.assertTrue(res2.get("idempotency_hit"))
        
        # Verify Audit logs
        logs = MCPToolExecutionLog.objects.filter(team=self.team, tool_name="mcp_demo_server_run_query")
        self.assertTrue(logs.exists())
        self.assertEqual(logs.count(), 1) # Only 1 actual call saved to DB since second was idempotency hit before client call

    def test_crew_role_scoping_rules(self):
        from chat.crew.tools import get_tools_for_role
        from chat.mcp.registry import get_mcp_registry, MCPToolDefinition
        
        registry = get_mcp_registry()
        registry._tools.clear()
        
        # 1. Medium risk tool, server scoped to allowed_crew_roles=["architect", "engineer"]
        registry._tools["mcp_demo_server_med_tool"] = MCPToolDefinition(
            server_id=str(self.server.id),
            server_name="demo_server",
            tool_name="med_tool",
            prefixed_name="mcp_demo_server_med_tool",
            description="medium tool description",
            parameters_schema={"properties": {}},
            is_destructive=False,
            is_external_write=False,
            risk_level="medium",
            team_id=str(self.team.id)
        )
        
        # 2. High risk tool, server scoped to allowed_crew_roles=["architect", "engineer"]
        registry._tools["mcp_demo_server_high_tool"] = MCPToolDefinition(
            server_id=str(self.server.id),
            server_name="demo_server",
            tool_name="high_tool",
            prefixed_name="mcp_demo_server_high_tool",
            description="high tool description",
            parameters_schema={"properties": {}},
            is_destructive=True,
            is_external_write=False,
            risk_level="high",
            team_id=str(self.team.id)
        )
        
        # Architect has access to both
        architect_tools = get_tools_for_role("architect", str(self.team.id), [])
        tool_names = [t["name"] for t in architect_tools]
        self.assertIn("mcp_demo_server_med_tool", tool_names)
        self.assertIn("mcp_demo_server_high_tool", tool_names)
        
        # Researcher is a read-only role, so high-risk tool is excluded
        researcher_tools = get_tools_for_role("researcher", str(self.team.id), [])
        tool_names = [t["name"] for t in researcher_tools]
        # Skip both: "researcher" is not in server.allowed_crew_roles
        self.assertNotIn("mcp_demo_server_med_tool", tool_names)
        self.assertNotIn("mcp_demo_server_high_tool", tool_names)

    def test_guardian_tier1_mcp_validation(self):
        from planning.guardian.tier1 import tier1_check
        from planning.guardian.context import GuardianContext
        from chat.mcp.registry import get_mcp_registry, MCPToolDefinition
        
        registry = get_mcp_registry()
        registry._tools["mcp_demo_server_dest_tool"] = MCPToolDefinition(
            server_id=str(self.server.id),
            server_name="demo_server",
            tool_name="dest_tool",
            prefixed_name="mcp_demo_server_dest_tool",
            description="destructive tool",
            parameters_schema={"properties": {}},
            is_destructive=True,
            is_external_write=True,
            risk_level="high",
            team_id=str(self.team.id)
        )
        
        context_no_approval = GuardianContext(
            acting_team_id=str(self.team.id),
            session_id="test",
            token_usage_this_run=0,
            team_token_budget=100000,
            team_has_integrations=True,
            external_writes_enabled=True,
            human_approved_destructive=False,
            current_round=1
        )
        
        # Without approval, destructive tool check fails
        res1 = tier1_check("mcp_demo_server_dest_tool", {}, context_no_approval)
        self.assertFalse(res1.approved)
        self.assertIn("classified as destructive", res1.reason)
        
        context_with_approval = GuardianContext(
            acting_team_id=str(self.team.id),
            session_id="test",
            token_usage_this_run=0,
            team_token_budget=100000,
            team_has_integrations=True,
            external_writes_enabled=True,
            human_approved_destructive=True,
            current_round=1
        )
        
        # With approval, passes
        res2 = tier1_check("mcp_demo_server_dest_tool", {}, context_with_approval)
        self.assertTrue(res2.approved)

