from types import SimpleNamespace
from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User
from chat.models import ChatMessage, ChatSession, ChatTokenUsage
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
