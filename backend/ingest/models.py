import uuid
from django.db import models
from accounts.models import Team, User
from wiki.models import WikiPage

class IngestJob(models.Model):
    STAGE_CHOICES = [
        ("queued", "Queued"),
        ("extracting", "Extracting"),
        ("governance", "Governance"),
        ("materializing", "Materializing"),
        ("vectorizing", "Vectorizing"),
        ("graph_sync", "Graph Sync"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"), ("running", "Running"),
        ("review_required", "Review Required"), # New state
        ("done", "Done"), ("failed", "Failed"),
    ]
    SOURCE_CHOICES = [
        ("url", "URL"),
        ("pdf", "PDF"),
        ("docx", "DOCX"),
        ("markdown", "Markdown"),
        ("repo", "Repository"),
        ("youtube", "YouTube"),
        ("image", "Image (OCR)"),
        ("code_zip", "Code zip"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="ingest_jobs")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    source_type = models.CharField(max_length=32, choices=SOURCE_CHOICES)
    source_url = models.URLField(blank=True)
    source_filename = models.CharField(max_length=300, blank=True)
    staging_file = models.FileField(
        upload_to="ingest_staging/%Y/%m/",
        blank=True,
        null=True,
        help_text="Temporary binary upload (PDF, DOCX, image, zip); deleted after extract.",
    )
    source_metadata = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    ingest_stage = models.CharField(max_length=30, choices=STAGE_CHOICES, default="queued")
    ingest_stage_detail = models.CharField(max_length=200, blank=True)
    auto_approve = models.BooleanField(default=True)
    raw_data = models.TextField(blank=True)  # Full raw text extracted
    chunk_count = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True)
    wiki_page = models.ForeignKey(
        "wiki.WikiPage", on_delete=models.SET_NULL, null=True, blank=True, related_name="ingest_jobs"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"IngestJob({self.source_type}, {self.status})"


class WikiChangeSet(models.Model):
    """
    A 'Knowledge Pull Request'. Holds proposed changes for review.
    """

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.OneToOneField(IngestJob, on_delete=models.CASCADE, related_name="changeset")
    proposed_content = models.TextField()  # The synthesized merge
    diff_summary = models.JSONField(default=dict)  # {"contradictions": [], "additions": []}
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class KnowledgeActivity(models.Model):
    """
    Chronological log of how the wiki evolves.
    """
    EVENT_TYPES = [
        ("ingest_merge", "AI Merge"),
        ("ingest_create", "AI Create"),
        ("manual_edit", "Manual Edit"),
        ("conflict_resolved", "Conflict Resolved"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="activities")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    page = models.ForeignKey(WikiPage, on_delete=models.SET_NULL, null=True, blank=True)
    summary = models.CharField(max_length=500)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AsyncDeadLetter(models.Model):
    STATUS_CHOICES = [
        ("new", "New"),
        ("requeued", "Requeued"),
        ("resolved", "Resolved"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task_name = models.CharField(max_length=200)
    trace_id = models.CharField(max_length=120, db_index=True)
    error_message = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class RawSource(models.Model):
    """
    Permanent storage of original ingested material.
    Never deleted — provides full traceability from wiki content back to the original source.
    """
    SOURCE_TYPE_CHOICES = [
        ("pdf", "PDF"),
        ("docx", "DOCX"),
        ("url", "URL"),
        ("youtube", "YouTube"),
        ("markdown", "Markdown"),
        ("image", "Image"),
        ("repo", "Repository"),
        ("code_zip", "Code Zip"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="raw_sources")
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPE_CHOICES)

    # The original file (S3/media storage) — NEVER deleted
    file = models.FileField(upload_to="raw_sources/%Y/%m/", null=True, blank=True)
    original_filename = models.CharField(max_length=500, blank=True)

    # For URL/YouTube sources
    source_url = models.URLField(blank=True, max_length=2000)

    # Full extracted text with position markers
    extracted_text = models.TextField(blank=True)

    # Structural metadata: page numbers, timestamps, section headers
    # For PDF:     {"pages": [{"number": 1, "char_start": 0, "char_end": 2340}, ...]}
    # For YouTube: {"segments": [{"timestamp": "00:02:15", "char_start": 0, "char_end": 500}, ...]}
    # For DOCX:    {"sections": [{"heading": "Intro", "char_start": 0, "char_end": 1000}, ...]}
    structure_map = models.JSONField(default=dict, blank=True)

    ingest_job = models.OneToOneField(
        IngestJob, on_delete=models.SET_NULL, null=True, blank=True, related_name="raw_source"
    )

    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"RawSource({self.source_type}, {self.original_filename or self.source_url})"


class WikiSourceCitation(models.Model):
    """
    Maps a specific section of a wiki page back to a specific position in a raw source.
    Enables "click to view original" functionality.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wiki_page = models.ForeignKey(
        WikiPage, on_delete=models.CASCADE, related_name="source_citations"
    )
    raw_source = models.ForeignKey(
        RawSource, on_delete=models.CASCADE, related_name="citations"
    )

    # Position in the wiki page
    wiki_section = models.CharField(max_length=300, blank=True, help_text="Section heading in wiki page")
    wiki_char_start = models.IntegerField(default=0)
    wiki_char_end = models.IntegerField(default=0)

    # Position in the raw source
    source_char_start = models.IntegerField(default=0)
    source_char_end = models.IntegerField(default=0)
    source_page_number = models.IntegerField(null=True, blank=True, help_text="For PDFs")
    source_timestamp = models.CharField(max_length=20, blank=True, help_text="For YouTube, e.g. 02:15")
    source_section = models.CharField(max_length=300, blank=True, help_text="Section heading in raw source")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["wiki_char_start"]

    def __str__(self):
        return f"Citation: {self.wiki_page.title} ← {self.raw_source.source_type}"

