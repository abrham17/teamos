from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User
from chat.models import ChatMessage, ChatSession, ChatTokenUsage
from chat.views import _build_ask_system_prompt, _retrieve_wiki_citations
from planning.models import Milestone, Project, Task
from wiki.models import WikiPage


class ChatApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="chat-user",
            email="chat-user@example.com",
            password="test-password",
        )
        self.other = User.objects.create_user(
            username="chat-other",
            email="chat-other@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Chat Team", slug="chat-team", created_by=self.user)
        TeamMember.objects.create(team=self.team, user=self.user, role="viewer")

    def test_create_and_list_sessions(self):
        self.client.force_authenticate(user=self.user)
        list_url = f"/api/chat/{self.team.id}/sessions/"
        create = self.client.post(list_url, {"title": "Sprint planning"}, format="json")
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertTrue(create.data["success"])
        self.assertEqual(create.data["data"]["title"], "Sprint planning")

        listing = self.client.get(list_url)
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertTrue(listing.data["success"])
        self.assertEqual(len(listing.data["data"]), 1)

    def test_query_requires_message(self):
        self.client.force_authenticate(user=self.user)
        session = ChatSession.objects.create(team=self.team, created_by=self.user, title="Q&A")
        url = f"/api/chat/{self.team.id}/sessions/{session.id}/query/"
        res = self.client.post(url, {"message": "   "}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "message_required")

    def test_cannot_access_another_users_session(self):
        TeamMember.objects.create(team=self.team, user=self.other, role="viewer")
        self.client.force_authenticate(user=self.other)
        session = ChatSession.objects.create(team=self.team, created_by=self.user, title="Private")
        url = f"/api/chat/{self.team.id}/sessions/{session.id}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "chat_session_not_found")

    @patch("chat.views.vector_store.search_similar_pages")
    def test_query_stream_emits_and_persists_citation_payload(self, mocked_search):
        self.client.force_authenticate(user=self.user)
        session = ChatSession.objects.create(team=self.team, created_by=self.user, title="Citations")
        page = WikiPage.objects.create(
            team=self.team,
            title="Auth System",
            slug="auth-system",
            content="JWT token flow and security requirements.",
            created_by=self.user,
        )

        mocked_search.return_value = [
            SimpleNamespace(
                payload={
                    "page_id": str(page.id),
                    "page_title": page.title,
                    "content": "JWT token flow details",
                    "chunk_id": "chunk-123",
                    "heading": "JWT Tokens",
                },
                score=0.93,
            )
        ]
        with patch("chat.views.vector_store.openai", new=SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(
                    create=lambda **kwargs: [
                        SimpleNamespace(
                            choices=[SimpleNamespace(delta=SimpleNamespace(content="Grounded answer"))]
                        )
                    ]
                )
            )
        )):

            url = f"/api/chat/{self.team.id}/sessions/{session.id}/query/"
            response = self.client.post(url, {"message": "How auth works?"}, format="json")
            self.assertEqual(response.status_code, status.HTTP_200_OK)

            stream_body = b"".join(response.streaming_content).decode("utf-8")
            self.assertIn("event: citations", stream_body)
            self.assertIn('"page_slug": "auth-system"', stream_body)
            self.assertIn('"chunk_id": "chunk-123"', stream_body)
            self.assertIn('"anchor_hint": "JWT Tokens"', stream_body)

            assistant = ChatMessage.objects.filter(session=session, role="assistant").order_by("-created_at").first()
            self.assertIsNotNone(assistant)
            self.assertEqual(assistant.metadata.get("mode"), "ask")
            self.assertEqual(len(assistant.citations), 1)
            self.assertEqual(assistant.citations[0]["page_slug"], "auth-system")
            self.assertEqual(assistant.citations[0]["chunk_id"], "chunk-123")
            self.assertEqual(assistant.citations[0]["anchor_hint"], "JWT Tokens")
            usage = ChatTokenUsage.objects.filter(team=self.team, session=session).first()
            self.assertIsNotNone(usage)
            self.assertGreater(usage.total_tokens, 0)

    def test_query_blocks_when_token_limit_reached(self):
        self.team.plan = "free"
        self.team.save(update_fields=["plan"])
        session = ChatSession.objects.create(team=self.team, created_by=self.user, title="Limit")
        ChatTokenUsage.objects.create(
            team=self.team,
            user=self.user,
            session=session,
            prompt_tokens=3000,
            completion_tokens=2000,
            total_tokens=5000,
        )
        self.client.force_authenticate(user=self.user)
        url = f"/api/chat/{self.team.id}/sessions/{session.id}/query/"
        res = self.client.post(url, {"message": "Can I still ask?"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "plan_limit_exceeded")

    def test_tts_requires_text(self):
        self.client.force_authenticate(user=self.user)
        url = f"/api/chat/{self.team.id}/tts/"
        res = self.client.post(url, {"text": "   "}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "text_required")

    def test_tts_unconfigured_without_openai_key(self):
        self.client.force_authenticate(user=self.user)
        url = f"/api/chat/{self.team.id}/tts/"
        with override_settings(OPENAI_API_KEY=""):
            res = self.client.post(url, {"text": "Hello"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "tts_unconfigured")

    @patch("chat.views.OpenAI")
    @override_settings(OPENAI_API_KEY="sk-test")
    def test_tts_returns_mp3(self, mock_openai_cls):
        mock_binary = MagicMock()
        mock_binary.read.return_value = b"\xff\xfb\x90\x00"  # minimal mp3-ish bytes
        mock_client = MagicMock()
        mock_client.audio.speech.create.return_value = mock_binary
        mock_openai_cls.return_value = mock_client

        self.client.force_authenticate(user=self.user)
        url = f"/api/chat/{self.team.id}/tts/"
        res = self.client.post(url, {"text": "Say this", "voice": "alloy"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "audio/mpeg")
        self.assertEqual(res.content, b"\xff\xfb\x90\x00")
        mock_client.audio.speech.create.assert_called_once()
        call_kw = mock_client.audio.speech.create.call_args.kwargs
        self.assertEqual(call_kw["voice"], "alloy")
        self.assertEqual(call_kw["input"], "Say this")

    def test_capabilities_viewer(self):
        self.client.force_authenticate(user=self.user)
        url = f"/api/chat/{self.team.id}/capabilities/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertFalse(res.data["data"]["can_edit_wiki"])
        self.assertFalse(res.data["data"]["can_edit_plans"])
        self.assertFalse(res.data["data"]["can_ingest"])

    def test_query_invalid_mode(self):
        self.client.force_authenticate(user=self.user)
        session = ChatSession.objects.create(team=self.team, created_by=self.user, title="M")
        url = f"/api/chat/{self.team.id}/sessions/{session.id}/query/"
        res = self.client.post(url, {"message": "hello", "mode": "invalid"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["error"]["code"], "invalid_mode")

    def test_agent_mode_forbidden_for_viewer(self):
        self.client.force_authenticate(user=self.user)
        session = ChatSession.objects.create(team=self.team, created_by=self.user, title="A")
        url = f"/api/chat/{self.team.id}/sessions/{session.id}/query/"
        res = self.client.post(url, {"message": "Create a page", "mode": "agent"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data["error"]["code"], "agent_forbidden")

    def test_plan_mode_forbidden_for_viewer(self):
        self.client.force_authenticate(user=self.user)
        session = ChatSession.objects.create(team=self.team, created_by=self.user, title="P")
        url = f"/api/chat/{self.team.id}/sessions/{session.id}/query/"
        res = self.client.post(url, {"message": "Update roadmap", "mode": "plan"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data["error"]["code"], "plan_forbidden")


class WikiCitationAssemblyTests(APITestCase):
    """RAG context assembly limits (settings-driven)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="rag-user",
            email="rag-user@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="RAG Team", slug="rag-team", created_by=self.user)

    @patch("chat.views.vector_store.search_similar_pages")
    def test_retrieve_passes_result_limit_to_vector_store(self, mock_search):
        mock_search.return_value = []
        with override_settings(CHAT_RAG_RESULT_LIMIT=7, CHAT_RAG_MAX_CONTEXT_CHARS=5000):
            _retrieve_wiki_citations("team-1", "hello")
        mock_search.assert_called_once_with("team-1", "hello", limit=7)

    @patch("chat.views.vector_store.search_similar_pages")
    def test_retrieve_includes_plan_citation_shape(self, mock_search):
        mock_search.return_value = [
            SimpleNamespace(
                payload={
                    "source_type": "plan",
                    "project_id": "proj-1",
                    "project_name": "Platform Upgrade",
                    "source_kind": "task",
                    "source_ref_id": "task-1",
                    "title": "Task: Upgrade API",
                    "content": "Upgrade API gateway and deploy in phases.",
                    "chunk_id": "plan-chunk-1",
                },
                score=0.91,
            )
        ]
        citations, context = _retrieve_wiki_citations("team-1", "what next")
        self.assertEqual(len(citations), 1)
        self.assertEqual(citations[0]["source"], "plan")
        self.assertEqual(citations[0]["project_name"], "Platform Upgrade")
        self.assertEqual(citations[0]["source_kind"], "task")
        self.assertIn("Platform Upgrade", context)

    @patch("chat.views.vector_store.search_similar_pages")
    def test_retrieve_truncates_context_under_char_cap(self, mock_search):
        big = "w" * 400
        mock_search.return_value = [
            SimpleNamespace(
                payload={
                    "page_id": "p1",
                    "page_title": "A",
                    "content": big,
                },
                score=0.95,
            ),
            SimpleNamespace(
                payload={
                    "page_id": "p2",
                    "page_title": "B",
                    "content": big,
                },
                score=0.85,
            ),
            SimpleNamespace(
                payload={
                    "page_id": "p3",
                    "page_title": "C",
                    "content": big,
                },
                score=0.75,
            ),
        ]
        with override_settings(CHAT_RAG_MAX_CONTEXT_CHARS=350, CHAT_RAG_RESULT_LIMIT=10):
            citations, ctx = _retrieve_wiki_citations("team-1", "q")
        self.assertLessEqual(len(ctx), 350)
        self.assertGreater(len(citations), 0)

    @patch("chat.views.vector_store.search_similar_pages")
    def test_retrieve_empty_search(self, mock_search):
        mock_search.return_value = []
        citations, ctx = _retrieve_wiki_citations("team-1", "q")
        self.assertEqual(citations, [])
        self.assertEqual(ctx, "")

    @patch("chat.views.vector_store.search_similar_pages")
    def test_retrieve_search_failure_returns_empty(self, mock_search):
        mock_search.side_effect = RuntimeError("qdrant down")
        citations, ctx = _retrieve_wiki_citations("team-1", "q")
        self.assertEqual(citations, [])
        self.assertEqual(ctx, "")

    def test_build_ask_prompt_empty_context_is_general_mode(self):
        p = _build_ask_system_prompt("")
        self.assertIn("No relevant team knowledge was found", p)
        self.assertNotIn("Answer based ONLY and EXCLUSIVELY on the provided team knowledge context", p)

    def test_build_ask_prompt_with_context_is_rag_mode(self):
        p = _build_ask_system_prompt("SOURCE: Foo\nCONTENT: bar")
        self.assertIn("Answer based exclusively on the provided team knowledge context", p)
        self.assertIn("Foo", p)

    @patch("chat.views.vector_store.search_similar_pages")
    def test_catalog_intent_injects_wiki_overview(self, mock_search):
        mock_search.return_value = []
        WikiPage.objects.create(
            team=self.team,
            title="Plant Diversity",
            slug="plant-diversity",
            content="## Plants\n\nMany types.",
            page_type="standard",
            created_by=self.user,
        )
        _citations, ctx = _retrieve_wiki_citations(
            str(self.team.id),
            "What do we have in our wiki?",
            team_obj=self.team,
        )
        self.assertIn("TEAM WIKI CATALOG", ctx)
        self.assertIn("Plant Diversity", ctx)


class ChatToolTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="tool-user",
            email="tool-user@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Tool Team", slug="tool-team", created_by=self.user)
        self.member = TeamMember.objects.create(team=self.team, user=self.user, role="editor")

    def test_wiki_search_tool_returns_pages(self):
        from chat.tools import ToolContext, execute_tool

        WikiPage.objects.create(
            team=self.team,
            title="Alpha Protocol",
            slug="alpha-protocol",
            content="secret handshake",
            created_by=self.user,
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        out = execute_tool(
            'wiki_search_pages',
            '{"query": "Alpha", "limit": 5, "mode": "keyword"}',
            ctx,
        )
        self.assertTrue(out.get("ok"))
        self.assertGreaterEqual(out.get("count", 0), 1)
        self.assertIn("score", out["pages"][0])
        self.assertIn("snippet", out["pages"][0])
        self.assertEqual(out["pages"][0]["match"], "keyword")

    def test_wiki_search_hybrid_mode(self):
        from chat.tools import ToolContext, execute_tool

        WikiPage.objects.create(
            team=self.team,
            title="Incident Runbook",
            slug="incident-runbook",
            content="on-call escalation steps",
            created_by=self.user,
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        out = execute_tool(
            "wiki_search_pages",
            '{"query": "runbook", "limit": 5, "mode": "hybrid"}',
            ctx,
        )
        self.assertTrue(out.get("ok"))
        self.assertGreaterEqual(out.get("count", 0), 1)

    def test_wiki_update_append_content(self):
        from chat.tools import ToolContext, execute_tool

        WikiPage.objects.create(
            team=self.team,
            title="Append Me",
            slug="append-me",
            content="Line one.",
            created_by=self.user,
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        with patch("wiki.services.reindex.reindex_wiki_page", return_value=1):
            out = execute_tool(
                "wiki_update_page",
                '{"slug": "append-me", "content": "Line two.", "content_mode": "append"}',
                ctx,
            )
        self.assertTrue(out.get("ok"))
        page = WikiPage.objects.get(slug="append-me", team=self.team)
        self.assertIn("Line one.", page.content)
        self.assertIn("Line two.", page.content)

    def test_wiki_update_resolve_by_query(self):
        from chat.tools import ToolContext, execute_tool

        WikiPage.objects.create(
            team=self.team,
            title="Unique Zebra Doc",
            slug="unique-zebra-doc",
            content="zebra stripes protocol",
            created_by=self.user,
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        with patch("wiki.services.reindex.reindex_wiki_page", return_value=1):
            out = execute_tool(
                "wiki_update_page",
                '{"query": "zebra stripes", "content": "updated body"}',
                ctx,
            )
        self.assertTrue(out.get("ok"))
        page = WikiPage.objects.get(slug="unique-zebra-doc", team=self.team)
        self.assertEqual(page.content, "updated body")

    def test_wiki_list_pages_tool(self):
        from chat.tools import ToolContext, execute_tool

        WikiPage.objects.create(
            team=self.team,
            title="Beta Notes",
            slug="beta-notes",
            content="content",
            created_by=self.user,
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        out = execute_tool("wiki_list_pages", '{"limit": 10}', ctx)
        self.assertTrue(out.get("ok"))
        self.assertGreaterEqual(out.get("total", 0), 1)

    def test_wiki_search_resolve_ambiguous(self):
        from chat.wiki_search import resolve_wiki_page

        WikiPage.objects.create(
            team=self.team,
            title="Policy Alpha",
            slug="policy-alpha",
            content="shared topic alpha",
            created_by=self.user,
        )
        WikiPage.objects.create(
            team=self.team,
            title="Policy Beta",
            slug="policy-beta",
            content="shared topic beta",
            created_by=self.user,
        )
        page, candidates, err = resolve_wiki_page(str(self.team.id), "shared topic")
        self.assertIsNone(page)
        self.assertEqual(err, "wiki_resolve_ambiguous")
        self.assertGreaterEqual(len(candidates), 2)

    def test_wiki_team_overview_tool(self):
        from chat.tools import ToolContext, execute_tool

        WikiPage.objects.create(
            team=self.team,
            title="Overview Page",
            slug="overview-page",
            content="Body",
            created_by=self.user,
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        out = execute_tool("wiki_team_overview", "{}", ctx)
        self.assertTrue(out.get("ok"))
        self.assertIn("TEAM WIKI CATALOG", out.get("overview", ""))

    def test_plan_search_keyword_finds_task(self):
        from chat.tools import ToolContext, execute_tool

        project = Project.objects.create(
            team=self.team, name="Launch", description="Q2 launch", created_by=self.user
        )
        Task.objects.create(
            project=project,
            title="Daily standup notes",
            description="sync blockers",
            created_by=self.user,
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        out = execute_tool(
            "plan_search",
            '{"query": "standup", "mode": "keyword", "source_kinds": ["task"]}',
            ctx,
        )
        self.assertTrue(out.get("ok"))
        self.assertGreaterEqual(out.get("count", 0), 1)
        hit = out["results"][0]
        self.assertEqual(hit["source_kind"], "task")
        self.assertIn("standup", hit["title"].lower())

    def test_plan_read_entity_project(self):
        from chat.tools import ToolContext, execute_tool

        project = Project.objects.create(
            team=self.team, name="Roadmap", description="Annual", created_by=self.user
        )
        Task.objects.create(
            project=project, title="Milestone prep", created_by=self.user
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        out = execute_tool(
            "plan_read_entity",
            f'{{"source_kind": "project", "project_id": "{project.id}"}}',
            ctx,
        )
        self.assertTrue(out.get("ok"))
        self.assertEqual(out["project"]["name"], "Roadmap")
        self.assertEqual(len(out["tasks"]), 1)

    def test_plan_create_milestone_with_project_query(self):
        from chat.tools import ToolContext, execute_tool

        project = Project.objects.create(
            team=self.team, name="Q2 Launch", created_by=self.user
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        with patch("planning.reindex.reindex_project", return_value=1):
            out = execute_tool(
                "plan_create_milestone",
                '{"project_query": "Q2 Launch", "title": "Go live"}',
                ctx,
            )
        self.assertTrue(out.get("ok"), out)
        self.assertTrue(
            Milestone.objects.filter(project=project, title="Go live").exists()
        )

    def test_plan_update_task_achieved_via_query(self):
        from chat.tools import ToolContext, execute_tool

        project = Project.objects.create(team=self.team, name="Ops", created_by=self.user)
        task = Task.objects.create(
            project=project,
            title="Deploy API",
            status="in-progress",
            created_by=self.user,
        )
        ctx = ToolContext(user=self.user, team_id=str(self.team.id), membership=self.member)
        with patch("planning.reindex.reindex_project", return_value=1):
            out = execute_tool(
                "plan_update_task",
                '{"task_query": "Deploy API", "status": "achieved"}',
                ctx,
            )
        self.assertTrue(out.get("ok"), out)
        task.refresh_from_db()
        self.assertEqual(task.status, "completed")

    def test_plan_search_by_date_in_query(self):
        from chat.plan_search import search_planning
        from datetime import date

        project = Project.objects.create(
            team=self.team, name="Sprint", created_by=self.user
        )
        d = date(2026, 5, 20)
        Task.objects.create(
            project=project,
            title="Deploy",
            start_date=d,
            end_date=d,
            created_by=self.user,
        )
        hits = search_planning(
            str(self.team.id),
            "2026-05-20",
            mode="keyword",
            source_kinds=["task"],
        )
        self.assertGreaterEqual(len(hits), 1)
        self.assertEqual(hits[0]["source_kind"], "task")
