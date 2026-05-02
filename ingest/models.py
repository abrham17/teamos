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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.OneToOneField(IngestJob, on_delete=models.CASCADE, related_name="changeset")
    proposed_content = models.TextField()  # The synthesized merge
    diff_summary = models.JSONField(default=dict) # {"contradictions": [], "additions": []}
    created_at = models.DateTimeField(auto_now_add=True)


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
