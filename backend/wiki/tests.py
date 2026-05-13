from unittest.mock import patch

from django.test import TestCase
from django.core.files.base import ContentFile
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User
from ingest.models import IngestJob, WikiChangeSet, RawSource, WikiSourceCitation
from wiki.models import WikiPage


class WikiApiTests(APITestCase):
    def setUp(self):
        self.editor = User.objects.create_user(
            username="wiki-editor",
            email="wiki-editor@example.com",
            password="test-password",
        )
        self.viewer = User.objects.create_user(
            username="wiki-viewer",
            email="wiki-viewer@example.com",
            password="test-password",
        )
        self.outsider = User.objects.create_user(
            username="wiki-outsider",
            email="wiki-outsider@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Wiki Team", slug="wiki-team", created_by=self.editor)
        TeamMember.objects.create(team=self.team, user=self.editor, role="editor")
        TeamMember.objects.create(team=self.team, user=self.viewer, role="viewer")

    def test_editor_can_create_page(self):
        self.client.force_authenticate(user=self.editor)
        url = f"/api/wiki/{self.team.id}/pages/"
        res = self.client.post(
            url,
            {"title": "Engineering Overview", "content": "System architecture notes"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["title"], "Engineering Overview")
        self.assertTrue(WikiPage.objects.filter(team=self.team, slug="engineering-overview").exists())

    def test_frontmatter_roundtrip_on_create_and_update(self):
        self.client.force_authenticate(user=self.editor)
        create_url = f"/api/wiki/{self.team.id}/pages/"
        create_res = self.client.post(
            create_url,
            {
                "title": "Metadata Page",
                "content": "Metadata content",
                "frontmatter": {"status": "draft", "priority": "High"},
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_res.data["data"]["frontmatter"]["status"], "draft")

        slug = create_res.data["data"]["slug"]
        update_url = f"/api/wiki/{self.team.id}/pages/{slug}/"
        update_res = self.client.put(
            update_url,
            {
                "title": "Metadata Page",
                "content": "Updated metadata content",
                "frontmatter": {"status": "stable", "priority": "Medium", "tags": "ops,docs"},
            },
            format="json",
        )
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)
        self.assertEqual(update_res.data["data"]["frontmatter"]["status"], "stable")
        self.assertEqual(update_res.data["data"]["frontmatter"]["priority"], "Medium")

    @patch("wiki.views.run_pipeline")
    def test_title_rename_updates_slug_and_publish_uses_new_slug(self, mock_run):
        def fake(job, source_text="", trace_id=None):
            job.status = "done"
            job.raw_data = source_text or ""
            job.ingest_stage = "completed"
            job.save(update_fields=["status", "raw_data", "ingest_stage", "updated_at"])

        mock_run.side_effect = fake
        self.client.force_authenticate(user=self.editor)
        page = WikiPage.objects.create(
            team=self.team,
            title="Old Title",
            slug="old-title",
            content="content",
            created_by=self.editor,
        )

        update_url = f"/api/wiki/{self.team.id}/pages/{page.slug}/"
        update_res = self.client.put(
            update_url,
            {"title": "New Title", "content": "updated content"},
            format="json",
        )
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)
        new_slug = update_res.data["data"]["slug"]
        self.assertNotEqual(new_slug, "old-title")

        old_publish = f"/api/wiki/{self.team.id}/pages/old-title/publish/"
        old_res = self.client.post(old_publish, {"auto_approve": True}, format="json")
        self.assertEqual(old_res.status_code, status.HTTP_404_NOT_FOUND)

        new_publish = f"/api/wiki/{self.team.id}/pages/{new_slug}/publish/"
        new_res = self.client.post(new_publish, {"auto_approve": True}, format="json")
        self.assertEqual(new_res.status_code, status.HTTP_200_OK)
        self.assertEqual(new_res.data["data"]["mode"], "completed")

    def test_viewer_cannot_create_page(self):
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/wiki/{self.team.id}/pages/"
        res = self.client.post(url, {"title": "Nope", "content": "not allowed"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_free_plan_blocks_page_creation_when_limit_reached(self):
        self.team.plan = "free"
        self.team.save(update_fields=["plan"])
        for i in range(10):
            WikiPage.objects.create(
                team=self.team,
                title=f"Existing {i}",
                slug=f"existing-{i}",
                content="x",
                created_by=self.editor,
            )
        self.client.force_authenticate(user=self.editor)
        url = f"/api/wiki/{self.team.id}/pages/"
        res = self.client.post(
            url,
            {"title": "Over Limit", "content": "Blocked"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "plan_limit_exceeded")

    def test_member_can_get_page_detail(self):
        page = WikiPage.objects.create(
            team=self.team,
            title="Roadmap",
            slug="roadmap",
            content="Q3 priorities",
            created_by=self.editor,
        )
        self.client.force_authenticate(user=self.viewer)
        url = f"/api/wiki/{self.team.id}/pages/{page.slug}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["slug"], "roadmap")

    def test_non_member_cannot_list_pages(self):
        self.client.force_authenticate(user=self.outsider)
        url = f"/api/wiki/{self.team.id}/pages/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @patch("wiki.views.run_pipeline")
    def test_wiki_publish_completed_mode(self, mock_run):
        def fake(job, source_text="", trace_id=None):
            job.status = "done"
            job.ingest_stage = "completed"
            job.raw_data = source_text or ""
            job.save(update_fields=["status", "ingest_stage", "raw_data", "updated_at"])

        mock_run.side_effect = fake
        self.client.force_authenticate(user=self.editor)
        page = WikiPage.objects.create(
            team=self.team,
            title="Pub Page",
            slug="pub-page",
            content="Body for publish",
            created_by=self.editor,
        )
        url = f"/api/wiki/{self.team.id}/pages/{page.slug}/publish/"
        res = self.client.post(url, {"auto_approve": True}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["mode"], "completed")

    @patch("wiki.views.run_pipeline")
    def test_wiki_publish_review_required_returns_changeset(self, mock_run):
        def fake(job, source_text="", trace_id=None):
            job.status = "review_required"
            job.raw_data = source_text or ""
            job.save(update_fields=["status", "raw_data", "updated_at"])
            WikiChangeSet.objects.create(
                job=job,
                proposed_content=source_text or "x",
                diff_summary={"contradictions": [], "additions": []},
                status=WikiChangeSet.STATUS_PENDING,
            )

        mock_run.side_effect = fake
        self.client.force_authenticate(user=self.editor)
        page = WikiPage.objects.create(
            team=self.team,
            title="Review Page",
            slug="review-page",
            content="Needs governance",
            created_by=self.editor,
        )
        url = f"/api/wiki/{self.team.id}/pages/{page.slug}/publish/"
        res = self.client.post(url, {"auto_approve": False}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["mode"], "review_required")
        self.assertIsNotNone(res.data["data"]["changeset"])
        self.assertEqual(res.data["data"]["changeset"]["status"], "pending")

    @patch("wiki.views.run_pipeline")
    def test_publish_review_required_does_not_mutate_page_and_preserves_baseline(self, mock_run):
        def fake(job, source_text="", trace_id=None):
            job.status = "review_required"
            job.raw_data = source_text or ""
            job.save(update_fields=["status", "raw_data", "updated_at"])
            WikiChangeSet.objects.create(
                job=job,
                proposed_content=source_text or "",
                diff_summary={"contradictions": [], "additions": []},
                status=WikiChangeSet.STATUS_PENDING,
            )

        mock_run.side_effect = fake
        self.client.force_authenticate(user=self.editor)
        page = WikiPage.objects.create(
            team=self.team,
            title="Draft Page",
            slug="draft-page",
            content="Original persisted content",
            created_by=self.editor,
        )
        url = f"/api/wiki/{self.team.id}/pages/{page.slug}/publish/"
        proposed = "Unsaved editor content pending approval"
        res = self.client.post(url, {"auto_approve": False, "content": proposed}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["mode"], "review_required")
        self.assertEqual(res.data["data"]["changeset"]["proposed_content"], proposed)
        self.assertEqual(res.data["data"]["changeset"]["baseline_content"], "Original persisted content")

        page.refresh_from_db()
        self.assertEqual(page.content, "Original persisted content")

        cs = WikiChangeSet.objects.get(id=res.data["data"]["changeset"]["id"])
        reject_url = f"/api/wiki/{self.team.id}/changesets/{cs.id}/reject/"
        reject_res = self.client.post(reject_url, {}, format="json")
        self.assertEqual(reject_res.status_code, status.HTTP_200_OK)
        page.refresh_from_db()
        self.assertEqual(page.content, "Original persisted content")

    def test_publish_rejects_empty_content_without_mutation(self):
        self.client.force_authenticate(user=self.editor)
        page = WikiPage.objects.create(
            team=self.team,
            title="Non Empty",
            slug="non-empty",
            content="Keep me",
            created_by=self.editor,
        )
        url = f"/api/wiki/{self.team.id}/pages/{page.slug}/publish/"
        res = self.client.post(url, {"content": "   "}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "empty_content")
        page.refresh_from_db()
        self.assertEqual(page.content, "Keep me")

    @patch("ingest.pipeline._chat_json_completion")
    def test_publish_review_pipeline_creates_changeset_without_mutating_page(self, mock_llm):
        mock_llm.side_effect = [
            {"type": "standard", "template_name": "Standard Page"},
            {"contradictions": ["Conflicts with current onboarding policy"], "additions": ["New rollout steps"]},
        ]
        self.client.force_authenticate(user=self.editor)
        page = WikiPage.objects.create(
            team=self.team,
            title="New Markdown",
            slug="new-markdown",
            content="Original page body",
            created_by=self.editor,
        )
        proposed = "# New Markdown\n\nUpdated body for review."

        url = f"/api/wiki/{self.team.id}/pages/{page.slug}/publish/"
        res = self.client.post(
            url,
            {"auto_approve": False, "content": proposed},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["mode"], "review_required")
        changeset = res.data["data"]["changeset"]
        self.assertEqual(changeset["proposed_content"], proposed)
        self.assertEqual(changeset["baseline_content"], "Original page body")
        self.assertEqual(changeset["diff_summary"]["contradictions"], ["Conflicts with current onboarding policy"])
        page.refresh_from_db()
        self.assertEqual(page.content, "Original page body")

    @patch("ingest.pipeline._chat_json_completion")
    def test_publish_review_approve_applies_proposed_markdown(self, mock_llm):
        mock_llm.side_effect = [
            {"type": "standard", "template_name": "Standard Page"},
            {"contradictions": ["Review this change"], "additions": []},
            {"type": "standard", "template_name": "Standard Page"},
        ]
        self.client.force_authenticate(user=self.editor)
        page = WikiPage.objects.create(
            team=self.team,
            title="Approval Markdown",
            slug="approval-markdown",
            content="Before approval",
            created_by=self.editor,
        )
        proposed = "# Approval Markdown\n\nAfter approval."

        publish_url = f"/api/wiki/{self.team.id}/pages/{page.slug}/publish/"
        publish_res = self.client.post(
            publish_url,
            {"auto_approve": False, "content": proposed},
            format="json",
        )
        self.assertEqual(publish_res.status_code, status.HTTP_200_OK)
        changeset_id = publish_res.data["data"]["changeset"]["id"]

        approve_url = f"/api/wiki/{self.team.id}/changesets/{changeset_id}/approve/"
        approve_res = self.client.post(approve_url, {}, format="json")
        self.assertEqual(approve_res.status_code, status.HTTP_200_OK)
        page.refresh_from_db()
        self.assertEqual(page.content, proposed)
        self.assertEqual(WikiChangeSet.objects.get(id=changeset_id).status, WikiChangeSet.STATUS_APPROVED)

    @patch("wiki.views.approve_wiki_changeset")
    def test_wiki_changeset_approve_calls_service(self, mock_approve):
        self.client.force_authenticate(user=self.editor)
        page = WikiPage.objects.create(
            team=self.team,
            title="Approve Me",
            slug="approve-me",
            content="v1",
            created_by=self.editor,
        )
        job = IngestJob.objects.create(
            team=self.team,
            created_by=self.editor,
            source_type="markdown",
            wiki_page=page,
            status="review_required",
        )
        cs = WikiChangeSet.objects.create(
            job=job,
            proposed_content="v2",
            diff_summary={},
            status=WikiChangeSet.STATUS_PENDING,
        )
        mock_approve.return_value = page
        url = f"/api/wiki/{self.team.id}/changesets/{cs.id}/approve/"
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        mock_approve.assert_called_once()

    def test_page_detail_citations_include_source_char_ranges(self):
        self.client.force_authenticate(user=self.editor)
        page = WikiPage.objects.create(
            team=self.team,
            title="Cited Page",
            slug="cited-page",
            content="citation body",
            created_by=self.editor,
        )
        source = RawSource.objects.create(
            team=self.team,
            source_type="markdown",
            original_filename="doc.md",
            extracted_text="abcdefghijk",
            created_by=self.editor,
        )
        WikiSourceCitation.objects.create(
            wiki_page=page,
            raw_source=source,
            wiki_section="Intro",
            source_char_start=2,
            source_char_end=7,
            source_page_number=1,
        )
        url = f"/api/wiki/{self.team.id}/pages/{page.slug}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        citation = res.data["data"]["citations"][0]
        self.assertEqual(citation["source_char_start"], 2)
        self.assertEqual(citation["source_char_end"], 7)

    def test_raw_source_detail_returns_absolute_file_url(self):
        self.client.force_authenticate(user=self.editor)
        source = RawSource.objects.create(
            team=self.team,
            source_type="pdf",
            original_filename="guide.pdf",
            extracted_text="sample",
            created_by=self.editor,
        )
        source.file.save("raw_sources/demo.pdf", ContentFile(b"demo"), save=True)
        url = f"/api/wiki/{self.team.id}/raw-sources/{source.id}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        file_url = res.data["data"]["file_url"]
        self.assertTrue(file_url.startswith("http://testserver/") or file_url.startswith("https://"))


class ReindexServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reindex-user",
            email="reindex@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Re Team", slug="re-team", created_by=self.user)

    @patch("ingest.tasks.wire_page_graph.delay")
    @patch("wiki.services.reindex.vector_store")
    def test_reindex_upserts_chunks(self, mock_vs, _mock_wire):
        mock_vs.ensure_collection.return_value = "team_x"
        mock_vs.upsert_chunks.return_value = None
        page = WikiPage.objects.create(
            team=self.team,
            title="Idx Page",
            slug="idx-page",
            content="one two three four five six seven eight",
            created_by=self.user,
        )
        from wiki.services.reindex import reindex_wiki_page

        n = reindex_wiki_page(page, queue_graph=True)
        self.assertGreater(n, 0)
        mock_vs.upsert_chunks.assert_called_once()
