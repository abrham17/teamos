from datetime import date
from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User

from .models import Milestone, Project, ProjectMember, Task


class FakePlannerPipeline:
    def __init__(self, payload):
        self.payload = payload

    def run(self, prompt, mode="create", project_context=None):
        import json

        yield f"event: reasoning_done\ndata: {json.dumps(self.payload)}\n\n"


class FakeManagePipeline:
    def __init__(self, payload):
        self.payload = payload

    def run(self, prompt, project_context=None):
        import json

        yield f"event: reasoning_done\ndata: {json.dumps(self.payload)}\n\n"


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

    @patch("planning.views.reindex_project")
    @patch("planning.agent_executor._auto_resolve_conflicts")
    @patch("planning.agent_sync.detect_date_conflicts")
    def test_conflict_resolver_updates_task_dates(self, mock_detect_conflicts, mock_auto_resolve, _mock_reindex):
        self.client.force_authenticate(user=self.editor)
        task = self.project.tasks.first()
        self.assertIsNotNone(task)

        mock_detect_conflicts.side_effect = [
            [{"type": "task_overlap", "task_1": {"id": str(task.id)}, "task_2": {"id": str(task.id)}}],
            [],
        ]
        mock_auto_resolve.return_value = [
            {"id": str(task.id), "start_date": "2026-06-01", "end_date": "2026-06-05"}
        ]

        url = f"/api/planning/{self.team.id}/projects/{self.project.id}/conflicts/resolve/"
        res = self.client.post(url, {}, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["status"], "resolved")
        self.assertEqual(res.data["data"]["resolved_count"], 1)
        self.assertEqual(res.data["data"]["remaining_conflicts"], 0)

        task.refresh_from_db()
        self.assertEqual(task.start_date.isoformat(), "2026-06-01")
        self.assertEqual(task.end_date.isoformat(), "2026-06-05")

    @patch("planning.views.reindex_project")
    @patch("planning.agent_executor._auto_resolve_conflicts")
    @patch("planning.agent_sync.detect_date_conflicts")
    def test_conflict_resolver_skips_invalid_updates(self, mock_detect_conflicts, mock_auto_resolve, _mock_reindex):
        self.client.force_authenticate(user=self.editor)
        task = self.project.tasks.first()
        self.assertIsNotNone(task)
        mock_detect_conflicts.side_effect = [
            [{"type": "task_overlap", "task_1": {"id": str(task.id)}, "task_2": {"id": str(task.id)}}],
            [{"type": "task_overlap"}],
        ]
        mock_auto_resolve.return_value = [
            {"id": str(task.id), "start_date": "2026-06-07", "end_date": "2026-06-01"},
            {"id": "not-a-real-task", "start_date": "2026-06-01", "end_date": "2026-06-02"},
        ]

        url = f"/api/planning/{self.team.id}/projects/{self.project.id}/conflicts/resolve/"
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["resolved_count"], 0)
        self.assertEqual(res.data["data"]["skipped_count"], 2)

    @patch("planning.agent_executor.llm_json_call")
    def test_risk_endpoint_normalizes_score_and_lists(self, mock_llm):
        self.client.force_authenticate(user=self.editor)
        mock_llm.return_value = {"score": 999, "factors": "not-list", "suggestions": None}
        url = f"/api/planning/{self.team.id}/projects/{self.project.id}/risk/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["score"], 100)
        self.assertEqual(res.data["data"]["factors"], [])
        self.assertEqual(res.data["data"]["suggestions"], [])

    @patch("planning.agent_executor.generate_risk_resolution_actions")
    @patch("planning.agent_executor._assess_plan_risk")
    @patch("planning.agent_sync.detect_date_conflicts")
    def test_risk_resolution_proposal_returns_actions(
        self, mock_detect_conflicts, mock_assess, mock_generate_actions
    ):
        self.client.force_authenticate(user=self.editor)
        mock_detect_conflicts.return_value = [{"type": "task_overlap"}]
        mock_assess.return_value = {"score": 70, "factors": ["risk"], "suggestions": ["mitigate"]}
        task = self.project.tasks.first()
        mock_generate_actions.return_value = [
            {
                "action": "update_task_dates",
                "task_id": str(task.id),
                "start_date": "2026-06-01",
                "end_date": "2026-06-05",
                "reason": "reduce overlap",
            }
        ]
        url = f"/api/planning/{self.team.id}/projects/{self.project.id}/risk/resolve/proposal/"
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["status"], "proposed")
        self.assertEqual(res.data["data"]["proposed_count"], 1)

    @patch("planning.agent_executor._assess_plan_risk")
    @patch("planning.agent_sync.detect_date_conflicts")
    @patch("planning.views.reindex_project")
    def test_risk_resolution_apply_updates_project_and_reports_skips(
        self, _mock_reindex, mock_detect_conflicts, mock_assess
    ):
        self.client.force_authenticate(user=self.editor)
        task = self.project.tasks.first()
        milestone = self.project.milestones.first()
        mock_detect_conflicts.return_value = []
        mock_assess.return_value = {"score": 20, "factors": [], "suggestions": []}
        url = f"/api/planning/{self.team.id}/projects/{self.project.id}/risk/resolve/apply/"
        payload = {
            "actions": [
                {
                    "action": "update_task_dates",
                    "task_id": str(task.id),
                    "start_date": "2026-06-02",
                    "end_date": "2026-06-12",
                },
                {
                    "action": "update_milestone_date",
                    "milestone_id": str(milestone.id),
                    "target_date": "2026-06-20",
                },
                {
                    "action": "update_task_priority",
                    "task_id": "00000000-0000-0000-0000-000000000000",
                    "priority": "high",
                },
            ]
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["status"], "applied")
        self.assertEqual(res.data["data"]["applied_count"], 2)
        self.assertEqual(res.data["data"]["skipped_count"], 1)
        task.refresh_from_db()
        milestone.refresh_from_db()
        self.assertEqual(task.start_date.isoformat(), "2026-06-02")
        self.assertEqual(task.end_date.isoformat(), "2026-06-12")
        self.assertEqual(milestone.target_date.isoformat(), "2026-06-20")

    @patch("planning.agent_executor.sync_project_to_wiki", return_value=None)
    @patch("planning.agent_executor._assess_plan_risk", return_value={"score": 10, "factors": [], "suggestions": []})
    @patch("planning.agent_executor.detect_date_conflicts", return_value=[])
    @patch("planning.reindex.reindex_project")
    @patch("planning.services.reindex_wiki_page")
    def test_ai_architect_create_assigns_tasks_and_project_roles(
        self, _mock_wiki_reindex, _mock_plan_reindex, _mock_conflicts, _mock_risk, _mock_sync
    ):
        from planning.agent_executor import run_planner_agent_v2

        payload = {
            "projectName": "Launch readiness",
            "description": "Prepare launch using [[Launch SOP]].",
            "tasks": [
                {
                    "title": "Day 1 checklist",
                    "description": "Run [[Launch SOP]] checks.",
                    "status": "todo",
                    "priority": "high",
                    "assignee_id": str(self.editor.id),
                    "startDate": "2026-06-01",
                    "endDate": "2026-06-01",
                }
            ],
            "milestones": [
                {"title": "Launch go/no-go", "date": "2026-06-02", "description": "", "status": "pending"}
            ],
            "members": [{"userId": str(self.editor.id), "role": "Launch Owner"}],
        }

        with patch("planning.reasoning_pipeline.PlanningReasoningPipeline", return_value=FakePlannerPipeline(payload)):
            list(run_planner_agent_v2(team_id=str(self.team.id), prompt="Plan launch", user=self.editor))

        project = Project.objects.get(team=self.team, name="Launch readiness")
        task = project.tasks.get(title="Day 1 checklist")
        self.assertEqual(task.assignee_id, self.editor.id)
        self.assertEqual(task.start_date.isoformat(), "2026-06-01")
        self.assertEqual(project.milestones.count(), 1)
        self.assertTrue(
            ProjectMember.objects.filter(project=project, user=self.editor, role="Launch Owner").exists()
        )

    @patch("planning.reindex.reindex_project")
    @patch("planning.remediation.assess_project_risk", return_value={"score": 10, "factors": [], "suggestions": []})
    @patch("planning.remediation.remediate_project", return_value={})
    @patch("planning.engine.detect_date_conflicts", return_value=[])
    @patch("planning.engine.sync_project_to_wiki", return_value=None)
    def test_ai_architect_manage_updates_existing_items_without_duplicate_project_or_tasks(
        self, _mock_sync, _mock_conflicts, _mock_remediate, _mock_risk, _mock_plan_reindex
    ):
        from planning.agent_executor import run_planner_agent_v2

        task = self.project.tasks.first()
        milestone = self.project.milestones.first()
        payload = {
            "projectName": self.project.name,
            "description": "Updated scope grounded in [[Platform Runbook]].",
            "tasks": [
                {
                    "id": str(task.id),
                    "title": "Audit infrastructure",
                    "description": "Refine audit with [[Platform Runbook]].",
                    "status": "in-progress",
                    "priority": "high",
                    "assignee_id": str(self.editor.id),
                    "startDate": "2026-05-02",
                    "endDate": "2026-05-12",
                },
                {
                    "title": "Unrequested duplicate-looking task",
                    "description": "The model should not create this in manage mode without action=create.",
                    "status": "todo",
                    "priority": "medium",
                    "startDate": "2026-05-13",
                    "endDate": "2026-05-14",
                },
            ],
            "milestones": [
                {
                    "id": str(milestone.id),
                    "title": "Migration plan approved",
                    "date": "2026-05-20",
                    "description": "Approval moved after scope review.",
                    "status": "pending",
                },
                {"title": "Unrequested extra milestone", "date": "2026-05-25", "description": "", "status": "pending"},
            ],
            "members": [{"userId": str(self.editor.id), "role": "Reviewer"}],
        }

        manage_payload = {
            "mode": "manage",
            "mutations": [
                {
                    "op": "update",
                    "entity_type": "task",
                    "id": str(task.id),
                    "fields": {"description": "Refine audit with [[Platform Runbook]]."},
                },
                {
                    "op": "update",
                    "entity_type": "milestone",
                    "id": str(milestone.id),
                    "fields": {"description": "Approval moved after scope review."},
                },
            ],
            "impact_summary": {},
            "projectName": self.project.name,
        }

        with patch("planning.manage_update_pipeline.ManageUpdatePipeline", return_value=FakeManagePipeline(manage_payload)):
            list(
                run_planner_agent_v2(
                    team_id=str(self.team.id),
                    prompt="Update the migration plan",
                    mode="manage",
                    project_id=str(self.project.id),
                    user=self.editor,
                )
            )

        self.assertEqual(Project.objects.filter(team=self.team).count(), 1)
        self.assertEqual(self.project.tasks.count(), 1)
        self.assertEqual(self.project.milestones.count(), 1)
        task.refresh_from_db()
        milestone.refresh_from_db()
        self.assertIn("Platform Runbook", task.description)
        milestone.refresh_from_db()
        self.assertIn("scope review", milestone.description)


class SafePlanUpdateTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="planner",
            email="planner@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Safe Team", slug="safe-team", created_by=self.user)
        TeamMember.objects.create(team=self.team, user=self.user, role="owner")
        self.project = Project.objects.create(
            team=self.team,
            name="Crypto Exchange",
            description="Exchange build",
            created_by=self.user,
        )
        self.task = Task.objects.create(
            project=self.project,
            title="Build wallet service",
            description="Wallet MVP",
            semantic_key="wallet_svc",
            status="todo",
            priority="high",
            created_by=self.user,
        )
        self.task.human_locked_fields = {"priority": "2026-05-01T00:00:00"}
        self.task.save(update_fields=["human_locked_fields"])

    def test_semantic_key_resolution(self):
        from planning.reconciliation import resolve_task

        match = resolve_task(
            self.project,
            {"semantic_key": "wallet_svc", "fields": {"title": "Implement custody wallet infrastructure"}},
        )
        self.assertEqual(match.entity.id, self.task.id)
        self.assertEqual(match.method, "semantic_key")

    def test_validate_dependency_cycle(self):
        from planning.mutations import validate_mutations

        t2 = Task.objects.create(
            project=self.project,
            title="KYC",
            semantic_key="kyc",
            created_by=self.user,
        )
        self.task.dependencies.add(t2)
        result = validate_mutations(
            self.project,
            [{"op": "set_dependencies", "task_id": str(t2.id), "depends_on": [str(self.task.id)]}],
        )
        self.assertFalse(result.ok)
        self.assertTrue(any("cycle" in e.lower() for e in result.errors))

    @patch("planning.services.broadcast_project_update")
    def test_patch_respects_human_lock(self, _mock_broadcast):
        from planning.services import patch_task

        patch_task(self.task, {"priority": "low", "description": "Updated desc"}, respect_locks=True)
        self.task.refresh_from_db()
        self.assertEqual(self.task.priority, "high")
        self.assertEqual(self.task.description, "Updated desc")

    def test_delete_mutation_requires_approval(self):
        from planning.field_policy import mutation_requires_approval

        self.assertTrue(
            mutation_requires_approval(
                {"op": "delete", "entity_type": "task", "id": str(self.task.id)},
            )
        )

    def test_approve_changeset_applies_pending(self):
        from planning.models import PlanChangeSet, PlanVersion
        from planning.version_services import approve_changeset, create_plan_version

        base = create_plan_version(self.project, user=self.user, source="auto")
        cs = PlanChangeSet.objects.create(
            project=self.project,
            base_version=base,
            status="pending",
            mutations=[],
            pending_mutations=[
                {
                    "op": "update",
                    "entity_type": "task",
                    "id": str(self.task.id),
                    "fields": {"title": "Build wallet service v2"},
                }
            ],
            impact_summary={},
            auto_applied=[],
            created_by=self.user,
        )
        approve_changeset(cs, user=self.user)
        self.task.refresh_from_db()
        self.assertEqual(self.task.title, "Build wallet service v2")
        cs.refresh_from_db()
        self.assertEqual(cs.status, "approved")

    @patch("planning.reindex.reindex_project")
    def test_manage_skips_reindex_when_pending_changeset(self, mock_reindex):
        from planning.engine import PlanningEngine

        manage_payload = {
            "mutations": [
                {
                    "op": "delete",
                    "entity_type": "task",
                    "id": str(self.task.id),
                    "reason": "remove",
                }
            ],
            "impact_summary": {},
            "projectName": self.project.name,
        }
        engine = PlanningEngine(team=self.team, user=self.user)
        with patch("planning.manage_update_pipeline.ManageUpdatePipeline", return_value=FakeManagePipeline(manage_payload)):
            with patch("planning.engine.sync_project_to_wiki", return_value=None):
                with patch("planning.engine.detect_date_conflicts", return_value=[]):
                    with patch("planning.remediation.remediate_project", return_value={}):
                        with patch("planning.remediation.assess_project_risk", return_value={"score": 0, "factors": [], "suggestions": []}):
                            list(
                                engine.run(
                                    "remove wallet",
                                    mode="manage",
                                    project_id=str(self.project.id),
                                )
                            )
        mock_reindex.assert_not_called()
        self.task.refresh_from_db()
        self.assertTrue(self.task.title)
