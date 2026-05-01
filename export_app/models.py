import uuid

from django.db import models

from accounts.models import Team, User


class ExportEvent(models.Model):
    EXPORT_TYPE_CHOICES = [
        ("wiki_zip", "Wiki Zip"),
        ("page_markdown", "Page Markdown"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="export_events")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="export_events")
    export_type = models.CharField(max_length=30, choices=EXPORT_TYPE_CHOICES)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
