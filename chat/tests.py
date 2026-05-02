from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User
from chat.models import ChatMessage, ChatSession, ChatTokenUsage
from chat.views import _build_ask_system_prompt, _retrieve_wiki_citations
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


class WikiCitationAssemblyTests(APITestCase):
    """RAG context assembly limits (settings-driven)."""

    @patch("chat.views.vector_store.search_similar_pages")
    def test_retrieve_passes_result_limit_to_vector_store(self, mock_search):
        mock_search.return_value = []
        with override_settings(CHAT_RAG_RESULT_LIMIT=7, CHAT_RAG_MAX_CONTEXT_CHARS=5000):
            _retrieve_wiki_citations("team-1", "hello")
        mock_search.assert_called_once_with("team-1", "hello", limit=7)

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
        self.assertIn("No wiki excerpts", p)
        self.assertNotIn("Answer based ONLY on the provided Wiki context", p)

    def test_build_ask_prompt_with_context_is_rag_mode(self):
        p = _build_ask_system_prompt("SOURCE: Foo\nCONTENT: bar")
        self.assertIn("Answer based ONLY on the provided Wiki context", p)
        self.assertIn("Foo", p)


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
        out = execute_tool("wiki_search_pages", '{"query": "Alpha", "limit": 5}', ctx)
        self.assertTrue(out.get("ok"))
        self.assertGreaterEqual(out.get("count", 0), 1)
