import uuid
from django.db import models
from accounts.models import Team, User


class IngestJob(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"), ("running", "Running"),
        ("done", "Done"), ("failed", "Failed"),
    ]
    SOURCE_CHOICES = [
        ("url", "URL"), ("pdf", "PDF"), ("docx", "DOCX"), ("markdown", "Markdown"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="ingest_jobs")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    source_url = models.URLField(blank=True)
    source_filename = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    chunk_count = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True)
    wiki_page = models.ForeignKey(
        "wiki.WikiPage", on_delete=models.SET_NULL, null=True, blank=True, related_name="ingest_jobs"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"IngestJob({self.source_type}, {self.status})"
