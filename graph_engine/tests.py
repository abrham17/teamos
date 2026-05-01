from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User
from graph_engine.models import GraphEdge
from wiki.models import WikiPage


class GraphAnalyticsModeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="graph-user",
            email="graph-user@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Graph Team", slug="graph-team", created_by=self.user)
        TeamMember.objects.create(team=self.team, user=self.user, role="editor")

        self.page_a = WikiPage.objects.create(
            team=self.team, title="A", slug="a", content="A", created_by=self.user
        )
        self.page_b = WikiPage.objects.create(
            team=self.team, title="B", slug="b", content="B", created_by=self.user
        )
        self.page_c = WikiPage.objects.create(
            team=self.team, title="C", slug="c", content="C", created_by=self.user
        )
        GraphEdge.objects.create(
            from_page=self.page_a, to_page=self.page_b, edge_type="semantic", confidence=0.40, created_by="pipeline"
        )
        GraphEdge.objects.create(
            from_page=self.page_b, to_page=self.page_c, edge_type="wikilink", confidence=1.0, created_by="human"
        )

    def test_graph_analytics_mode_in_response(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get(f"/api/graph/{self.team.id}/analytics/?mode=advanced")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["analytics_mode"], "advanced")
        self.assertIn("available_modes", res.data["data"])

    def test_advanced_mode_filters_low_confidence_semantic_edges(self):
        self.client.force_authenticate(user=self.user)
        simple = self.client.get(f"/api/graph/{self.team.id}/analytics/?mode=simple")
        advanced = self.client.get(f"/api/graph/{self.team.id}/analytics/?mode=advanced")
        self.assertEqual(simple.status_code, status.HTTP_200_OK)
        self.assertEqual(advanced.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(simple.data["data"]["edge_count"], advanced.data["data"]["edge_count"])
