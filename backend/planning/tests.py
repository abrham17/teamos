from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User

from .models import Milestone, Project, Task


class PlanningApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="test-password",
        )
        self.viewer = User.objects.create_user(
            username="viewer",
            email="viewer@example.com",
            password="test-password",
        )
        self.editor = User.objects.create_user(
            username="editor",
            email="editor@example.com",
            password="test-password",
        )
        self.outsider = User.objects.create_user(
            username="outsider",
            email="outsider@example.com",
            password="test-password",
        )

        self.team = Team.objects.create(name="Plan Team", slug="plan-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")
        TeamMember.objects.create(team=self.team, user=self.viewer, role="viewer")
        TeamMember.objects.create(team=self.team, user=self.editor, role="editor")

        self.other_team = Team.objects.create(name="Other Team", slug="other-team", created_by=self.outsider)
        TeamMember.objects.create(team=self.other_team, user=self.outsider, role="owner")

        self.project = Project.objects.create(
            team=self.team,
            name="Platform migration",
            description="Migrate runtime infrastructure",
            status="active",
            created_by=self.owner,
        )
        Task.objects.create(
            project=self.project,
            title="Audit infra",
            status="in-progress",
            priority="high",
            assignee=self.owner,
            start_date=date(2026, 5, 1),
            end_date=date(2026, 5, 10),
            order_index=1,
            created_by=self.owner,
        )
        Milestone.objects.create(
            project=self.project,
            title="Migration plan approved",
            status="pending",
            target_date=date(2026, 5, 15),
            order_index=1,
            created_by=self.owner,
        )

    def test_viewer_can_list_team_projects(self):
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/planning/{self.team.id}/projects/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(len(res.data["data"]), 1)
        self.assertEqual(res.data["data"][0]["name"], "Platform migration")
        self.assertEqual(res.data["data"][0]["task_count"], 1)
        self.assertEqual(res.data["data"][0]["milestone_count"], 1)

    def test_viewer_can_get_project_detail(self):
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/planning/{self.team.id}/projects/{self.project.id}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["name"], "Platform migration")
        self.assertEqual(len(res.data["data"]["tasks"]), 1)
        self.assertEqual(len(res.data["data"]["milestones"]), 1)

    def test_non_member_cannot_access_team_projects(self):
        self.client.force_authenticate(user=self.outsider)
        url = f"/api/planning/{self.team.id}/projects/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_viewer_cannot_create_project(self):
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/planning/{self.team.id}/projects/"
        res = self.client.post(url, {"name": "New", "description": "", "status": "active"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_editor_can_create_project(self):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/planning/{self.team.id}/projects/"
        res = self.client.post(
            url,
            {"name": "Release train", "description": "Prepare release", "status": "active"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["name"], "Release train")

    def test_editor_can_patch_and_delete_project(self):
        self.client.force_authenticate(user=self.editor)
        patch_url = f"/api/planning/{self.team.id}/projects/{self.project.id}/"
        patched = self.client.patch(patch_url, {"status": "on_hold"}, format="json")
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.data["data"]["status"], "on_hold")

        deleted = self.client.delete(patch_url)
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_editor_can_manage_tasks_and_milestones(self):
        self.client.force_authenticate(user=self.editor)
        task_url = f"/api/planning/{self.team.id}/projects/{self.project.id}/tasks/"
        created_task = self.client.post(
            task_url,
            {
                "title": "Cutover",
                "description": "Schedule final cutover",
                "status": "todo",
                "priority": "high",
                "assignee_id": str(self.owner.id),
                "order_index": 2,
            },
            format="json",
        )
        self.assertEqual(created_task.status_code, status.HTTP_201_CREATED)
        task_id = created_task.data["data"]["id"]

        task_detail_url = f"/api/planning/{self.team.id}/projects/{self.project.id}/tasks/{task_id}/"
        updated_task = self.client.patch(task_detail_url, {"status": "in-progress"}, format="json")
        self.assertEqual(updated_task.status_code, status.HTTP_200_OK)
        self.assertEqual(updated_task.data["data"]["status"], "in-progress")

        milestone_url = f"/api/planning/{self.team.id}/projects/{self.project.id}/milestones/"
        created_milestone = self.client.post(
            milestone_url,
            {"title": "Deployment done", "description": "", "status": "pending", "order_index": 2},
            format="json",
        )
        self.assertEqual(created_milestone.status_code, status.HTTP_201_CREATED)
        milestone_id = created_milestone.data["data"]["id"]

        milestone_detail_url = (
            f"/api/planning/{self.team.id}/projects/{self.project.id}/milestones/{milestone_id}/"
        )
        updated_milestone = self.client.patch(milestone_detail_url, {"status": "reached"}, format="json")
        self.assertEqual(updated_milestone.status_code, status.HTTP_200_OK)
        self.assertEqual(updated_milestone.data["data"]["status"], "reached")

    def test_project_detail_not_found_for_different_team(self):
        self.client.force_authenticate(user=self.outsider)
        url = f"/api/planning/{self.other_team.id}/projects/{self.project.id}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "project_not_found")

    def test_calendar_feed_contains_task_and_milestone_events(self):
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/planning/{self.team.id}/calendar/feed/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertGreaterEqual(len(res.data["data"]), 2)
        kinds = {row["kind"] for row in res.data["data"]}
        self.assertIn("task", kinds)
        self.assertIn("milestone", kinds)
