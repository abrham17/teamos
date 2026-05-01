import uuid
from django.test import TestCase
from accounts.models import Team, User
from wiki.models import WikiPage, PageChunk
from ingest.models import IngestJob
from ingest.pipeline import run_pipeline

class IngestionPipelineTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="test@teamos.local", password="password")
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
