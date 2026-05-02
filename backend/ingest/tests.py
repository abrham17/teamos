from unittest.mock import MagicMock, patch

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import Team, User
from accounts.models import TeamMember
from wiki.models import WikiPage, PageChunk
from ingest.models import IngestJob, AsyncDeadLetter
from types import SimpleNamespace

from openai import OpenAIError

from ingest.extractors import pdf_text, url_fetch, youtube_text
from ingest.extractors.dispatch import extract_plain_text
from ingest.pipeline import _derive_title, run_pipeline
from ingest.tasks import infer_ai_edges, run_ingest_job, wire_page_graph
from ingest.vectors import VectorStore
from teamos_project.dead_letter import record_dead_letter
from teamos_project.llm_env import production_llm_backend_from_env


class ProductionLlmBackendEnvTests(SimpleTestCase):
    def test_forces_openai_by_default(self):
        self.assertEqual(production_llm_backend_from_env({}), "openai")
        self.assertEqual(
            production_llm_backend_from_env({"LLM_BACKEND": "groq"}),
            "openai",
        )

    def test_escape_hatch_allows_groq(self):
        env = {"ALLOW_NON_OPENAI_LLM_IN_PRODUCTION": "1", "LLM_BACKEND": "groq"}
        self.assertEqual(production_llm_backend_from_env(env), "groq")

    def test_escape_hatch_invalid_backend_becomes_openai(self):
        env = {"ALLOW_NON_OPENAI_LLM_IN_PRODUCTION": "1", "LLM_BACKEND": "mistral"}
        self.assertEqual(production_llm_backend_from_env(env), "openai")


class VectorStoreEmbeddingFallbackTests(TestCase):
    """_get_embedding uses deterministic vectors when OpenAI is missing or errors."""

    @override_settings(USE_DETERMINISTIC_EMBEDDINGS=False, OPENAI_EMBEDDING_DIMENSIONS=1536)
    def test_no_openai_uses_mock_shape(self):
        vs = VectorStore.__new__(VectorStore)
        vs._embed_client = None
        emb = VectorStore._get_embedding(vs, "chunk text")
        self.assertEqual(len(emb), 1536)
        self.assertAlmostEqual(sum(x * x for x in emb), 1.0, places=5)

    @override_settings(USE_DETERMINISTIC_EMBEDDINGS=False, OPENAI_EMBEDDING_DIMENSIONS=1536)
    def test_openai_error_falls_back_to_same_mock_as_no_key(self):
        vs_fail = VectorStore.__new__(VectorStore)
        vs_fail._embed_client = MagicMock()
        vs_fail._embed_client.embeddings.create.side_effect = OpenAIError(
            "simulated embedding failure"
        )

        vs_no = VectorStore.__new__(VectorStore)
        vs_no._embed_client = None

        text = "reliability SLOs and authentication"
        self.assertEqual(
            VectorStore._get_embedding(vs_fail, text),
            VectorStore._get_embedding(vs_no, text),
        )

    @override_settings(
        USE_DETERMINISTIC_EMBEDDINGS=False,
        OPENAI_EMBEDDING_MODEL="custom-embedding-model-for-test",
        OPENAI_EMBEDDING_DIMENSIONS=1536,
    )
    def test_openai_embedding_uses_model_from_settings(self):
        vs = VectorStore.__new__(VectorStore)
        mock_emb = MagicMock()
        mock_emb.embedding = [0.1] * 1536
        vs._embed_client = MagicMock()
        vs._embed_client.embeddings.create.return_value = MagicMock(data=[mock_emb])
        VectorStore._get_embedding(vs, "hello world")
        vs._embed_client.embeddings.create.assert_called_once()
        self.assertEqual(
            vs._embed_client.embeddings.create.call_args.kwargs["model"],
            "custom-embedding-model-for-test",
        )

    @override_settings(USE_DETERMINISTIC_EMBEDDINGS=True, OPENAI_EMBEDDING_DIMENSIONS=1536)
    def test_deterministic_short_circuits_without_openai_call(self):
        vs = VectorStore.__new__(VectorStore)
        vs._embed_client = MagicMock()
        emb = VectorStore._get_embedding(vs, "forced local")
        vs._embed_client.embeddings.create.assert_not_called()
        self.assertEqual(len(emb), 1536)


class DeriveTitleTests(TestCase):
    def test_h1_becomes_title(self):
        job = SimpleNamespace(source_type="markdown", source_url="", source_filename="")
        t = _derive_title(job, "# My Roadmap\n\nBody here.")
        self.assertEqual(t, "My Roadmap")

    def test_filename_fallback(self):
        job = SimpleNamespace(source_type="markdown", source_url="", source_filename="release_notes.md")
        t = _derive_title(job, "no heading here")
        self.assertEqual(t, "release notes")

    def test_youtube_title_from_oembed_line(self):
        job = SimpleNamespace(
            source_type="youtube",
            source_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            source_filename="",
        )
        t = _derive_title(job, "Title: Never Gonna Give You Up\n\nDescription here")
        self.assertEqual(t, "Never Gonna Give You Up")


class YoutubeVideoIdTests(SimpleTestCase):
    def test_parse_watch_url(self):
        self.assertEqual(
            youtube_text.youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            "dQw4w9WgXcQ",
        )

    def test_parse_short_url(self):
        self.assertEqual(
            youtube_text.youtube_video_id("https://youtu.be/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ",
        )


class UrlSsrFTests(SimpleTestCase):
    def test_blocks_loopback_hostname(self):
        with self.assertRaises(ValueError):
            url_fetch._assert_url_safe("http://127.0.0.1:8080/internal")


class PdfExtractTests(SimpleTestCase):
    def test_extract_pdf_minimal(self):
        try:
            from io import BytesIO

            from pypdf import PdfWriter
        except ImportError:
            self.skipTest("pypdf not installed")
        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        buf = BytesIO()
        writer.write(buf)
        text = pdf_text.extract_pdf_text(buf.getvalue())
        self.assertIsInstance(text, str)


class ExtractDispatchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ex-user",
            email="ex@example.com",
            password="x",
        )
        self.team = Team.objects.create(name="Ex Team", slug="ex-team", created_by=self.user)

    def test_markdown_uses_passed_source_text(self):
        job = IngestJob.objects.create(
            team=self.team,
            created_by=self.user,
            source_type="markdown",
            source_filename="a.md",
            auto_approve=False,
        )
        out = extract_plain_text(job, source_text="# Hello\nbody")
        self.assertIn("Hello", out)


class IngestionPipelineTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="test-ingestion-user",
            email="test@teamos.local",
            password="password",
        )
        self.team = Team.objects.create(name="Test Team", slug="test-team", created_by=self.user)

    @patch("ingest.tasks.wire_page_graph.delay")
    @patch("wiki.services.reindex.vector_store")
    @patch("ingest.pipeline.vector_store")
    def test_url_ingestion_materialization(self, mock_pipeline_vector_store, mock_reindex_vector_store, _mock_wire_delay):
        """Creates a page and chunks; Qdrant and graph wiring are mocked (no live vector DB)."""
        for mock_vector_store in (mock_pipeline_vector_store, mock_reindex_vector_store):
            mock_vector_store.ensure_collection.return_value = "team_test"
            mock_vector_store.upsert_chunks.return_value = None

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

    @patch("ingest.pipeline.vector_store.search_similar_pages", return_value=[])
    @patch("ingest.extractors.dispatch.repo.fetch_repo_text", return_value="mocked repo content")
    def test_repo_ingestion_path_mock(self, _mock_repo_text, _mock_search):
        """Verifies the repo ingestion path handles source_type correctly."""
        job = IngestJob.objects.create(
            team=self.team,
            created_by=self.user,
            source_type="repo",
            source_url="https://github.com/example/repo",
            auto_approve=False
        )

        run_pipeline(job, source_text="ignored for repo type")
        
        job.refresh_from_db()
        self.assertEqual(job.status, "review_required")
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

    @patch("ingest.views.run_ingest_job.delay")
    def test_youtube_url_sets_source_type(self, _mock_delay):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/ingest/{self.team.id}/url/"
        res = self.client.post(
            url,
            {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["data"]["source_type"], "youtube")

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

    @patch("ingest.views.run_ingest_job.delay")
    def test_unsupported_file_type_rejected(self, _mock_delay):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/ingest/{self.team.id}/file/"
        upload = SimpleUploadedFile("data.bin", b"\x00\x01\x02", content_type="application/octet-stream")
        res = self.client.post(url, {"file": upload})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["error"]["code"], "unsupported_file_type")

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
        for i in range(10):
            IngestJob.objects.create(
                team=self.team,
                created_by=self.owner,
                source_type="url",
                source_url=f"https://example.com/{i}",
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
