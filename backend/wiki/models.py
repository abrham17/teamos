import uuid
from django.db import models
from accounts.models import User, Team


class WikiPage(models.Model):
    PAGE_TYPE_CHOICES = [
        ("standard", "Standard"),
        ("decision", "Decision Record"),
        ("meeting", "Meeting Notes"),
        ("brief", "Project Brief"),
        ("incident", "Incident Report"),
        ("sop", "SOP"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="pages")
    title = models.CharField(max_length=300)
    slug = models.SlugField(max_length=300)
    content = models.TextField(blank=True)          # raw Markdown
    page_type = models.CharField(max_length=30, choices=PAGE_TYPE_CHOICES, default="standard")
    frontmatter = models.JSONField(default=dict, blank=True)   # tags, status, related, etc.
    raw_file_url = models.URLField(blank=True)       # original uploaded file (S3)
    source_url = models.URLField(blank=True)         # original URL if ingested from web
    is_deleted = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="created_pages")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("team", "slug")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"[{self.team.name}] {self.title}"

    @property
    def summary(self):
        """First 200 chars of content stripped of markdown syntax."""
        import re
        text = re.sub(r"[#*`_\[\]()]", "", self.content)
        return text[:200].strip()


class PageChunk(models.Model):
    """A semantic chunk of a WikiPage, embedded and stored in Qdrant."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(WikiPage, on_delete=models.CASCADE, related_name="chunks")
    chunk_index = models.PositiveIntegerField()
    section_title = models.CharField(max_length=300, blank=True)
    content = models.TextField()
    content_hash = models.CharField(max_length=64, db_index=True)  # SHA-256
    qdrant_point_id = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("page", "chunk_index")
        ordering = ["chunk_index"]


class PageTemplate(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, null=True, blank=True, related_name="templates")
    name = models.CharField(max_length=100)
    page_type = models.CharField(max_length=30, default="standard")
    default_content = models.TextField()    # markdown template body
    default_frontmatter = models.JSONField(default=dict)
    is_builtin = models.BooleanField(default=False)

    def __str__(self):
        return self.name
