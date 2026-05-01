from unittest.mock import patch

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import Team, User
from accounts.models import TeamMember
from wiki.models import WikiPage, PageChunk
from ingest.models import IngestJob, AsyncDeadLetter
from ingest.pipeline import run_pipeline
from ingest.tasks import infer_ai_edges, run_ingest_job, wire_page_graph
from teamos_project.dead_letter import record_dead_letter

class IngestionPipelineTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="test-ingestion-user",
            email="test@teamos.local",
            password="password",
        )
        self.team = Team.objects.create(name="Test Team", slug="test-team", created_by=self.user)

    def test_url_ingestion_materialization(self):
        """Tests that a basic text ingestion creates a page and chunks."""
        job = IngestJob.objects.create(
            team=self.team,
            created_by=self.user,
            source_type="markdown",
            source_filename="test.md",
            auto_approve=True
        )
        
        sample_text = "This is a test wiki page content. It should be chunked and vectorized."
        run_pipeline(job, source_text=sample_text)
        
        # Verify WikiPage
        page = WikiPage.objects.get(team=self.team)
        self.assertEqual(page.content, sample_text)
        self.assertEqual(page.raw_content, sample_text)
        
        # Verify Chunks
        chunks = PageChunk.objects.filter(page=page)
        self.assertGreater(chunks.count(), 0)
        
        # Verify Job status
        job.refresh_from_db()
        self.assertEqual(job.status, "done")
        self.assertEqual(job.chunk_count, chunks.count())

    def test_repo_ingestion_path_mock(self):
        """Verifies the repo ingestion path handles source_type correctly."""
        job = IngestJob.objects.create(
            team=self.team,
            created_by=self.user,
            source_type="repo",
            source_url="https://github.com/example/repo",
            auto_approve=False
        )
        
        # Mocking the text extraction to avoid actual git clone in tests
        run_pipeline(job, source_text="mocked repo content")
        
        job.refresh_from_db()
        # Should be 'pending' because auto_approve=False
        self.assertEqual(job.status, "pending")
        self.assertEqual(job.raw_data, "mocked repo content")
        
        # Verify no wiki page created yet
        self.assertFalse(WikiPage.objects.filter(team=self.team).exists())


class IngestApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="ing-owner",
            email="ing-owner@example.com",
            password="test-password",
        )
        self.editor = User.objects.create_user(
            username="ing-editor",
            email="ing-editor@example.com",
            password="test-password",
        )
        self.viewer = User.objects.create_user(
            username="ing-viewer",
            email="ing-viewer@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Ingest Team", slug="ingest-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")
        TeamMember.objects.create(team=self.team, user=self.editor, role="editor")
        TeamMember.objects.create(team=self.team, user=self.viewer, role="viewer")

    @patch("ingest.views.run_ingest_job.delay")
    def test_editor_can_create_url_ingest_job(self, mocked_delay):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/ingest/{self.team.id}/url/"
        res = self.client.post(url, {"url": "https://example.com/docs"}, format="json")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["source_type"], "url")
        self.assertEqual(res.data["data"]["ingest_stage"], "queued")
        mocked_delay.assert_called_once()
        self.assertIn("trace_id", mocked_delay.call_args.kwargs)

    def test_url_ingest_requires_url(self):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/ingest/{self.team.id}/url/"
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "url_required")

    @patch("ingest.views.run_ingest_job.delay")
    def test_editor_can_create_file_ingest_job(self, mocked_delay):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/ingest/{self.team.id}/file/"
        upload = SimpleUploadedFile("notes.md", b"# Team notes\nContext", content_type="text/markdown")
        res = self.client.post(url, {"file": upload})

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["source_type"], "markdown")
        mocked_delay.assert_called_once()
        self.assertIn("trace_id", mocked_delay.call_args.kwargs)

    @patch("ingest.views.run_ingest_job.delay")
    def test_ingest_dispatch_uses_request_trace_id_header(self, mocked_delay):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/ingest/{self.team.id}/url/"
        trace_id = "trace-ingest-url-001"
        res = self.client.post(
            url,
            {"url": "https://example.com/docs"},
            format="json",
            HTTP_X_REQUEST_ID=trace_id,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        mocked_delay.assert_called_once()
        self.assertEqual(mocked_delay.call_args.kwargs["trace_id"], trace_id)

    def test_file_ingest_requires_file(self):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/ingest/{self.team.id}/file/"
        res = self.client.post(url, {}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "file_required")

    def test_viewer_cannot_create_ingest_jobs(self):
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/ingest/{self.team.id}/url/"
        res = self.client.post(url, {"url": "https://example.com/blocked"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_member_can_list_ingest_jobs(self):
        IngestJob.objects.create(
            team=self.team,
            created_by=self.owner,
            source_type="url",
            source_url="https://example.com/spec",
            status="pending",
        )
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/ingest/{self.team.id}/jobs/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(len(res.data["data"]), 1)

    @patch("ingest.views.run_ingest_job.delay")
    def test_free_plan_blocks_url_ingest_when_limit_reached(self, mocked_delay):
        self.team.plan = "free"
        self.team.save(update_fields=["plan"])
        IngestJob.objects.create(
            team=self.team,
            created_by=self.owner,
            source_type="url",
            source_url="https://example.com/1",
            status="done",
        )
        IngestJob.objects.create(
            team=self.team,
            created_by=self.owner,
            source_type="url",
            source_url="https://example.com/2",
            status="done",
        )
        self.client.force_authenticate(user=self.editor)
        url = f"/api/ingest/{self.team.id}/url/"
        res = self.client.post(url, {"url": "https://example.com/3"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "plan_limit_exceeded")
        mocked_delay.assert_not_called()


class IngestTaskReliabilityTests(TestCase):
    def test_retry_policy_configured_for_ingest_tasks(self):
        self.assertTrue(run_ingest_job.autoretry_for)
        self.assertEqual(run_ingest_job.max_retries, 2)
        self.assertTrue(run_ingest_job.retry_backoff)
        self.assertTrue(run_ingest_job.retry_jitter)

        self.assertTrue(wire_page_graph.autoretry_for)
        self.assertEqual(wire_page_graph.max_retries, 3)
        self.assertTrue(wire_page_graph.retry_backoff)

        self.assertTrue(infer_ai_edges.autoretry_for)
        self.assertEqual(infer_ai_edges.max_retries, 2)
        self.assertTrue(infer_ai_edges.retry_backoff)

    def test_celery_dead_letter_queue_policy_configured(self):
        queue_names = {queue.name for queue in settings.CELERY_TASK_QUEUES}
        self.assertIn("teamos.dead_letter", queue_names)
        self.assertTrue(settings.CELERY_TASK_ACKS_LATE)
        self.assertTrue(settings.CELERY_TASK_REJECT_ON_WORKER_LOST)


class AsyncDeadLetterTests(TestCase):
    def test_record_dead_letter_persists_entry(self):
        entry = record_dead_letter(
            task_name="ingest.run_ingest_job",
            error_message="max retries exhausted",
            trace_id="trace-dead-letter-001",
            payload={"job_id": "job-123"},
            metadata={"retries": 2, "max_retries": 2},
        )
        self.assertEqual(AsyncDeadLetter.objects.count(), 1)
        self.assertEqual(entry.task_name, "ingest.run_ingest_job")
        self.assertEqual(entry.trace_id, "trace-dead-letter-001")
