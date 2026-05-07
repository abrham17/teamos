import uuid
from django.db import models
from wiki.models import WikiPage


class GraphEdge(models.Model):
    EDGE_TYPE_CHOICES = [
        ("wikilink", "Wikilink"),
        ("ai_inferred", "AI Inferred"),
        ("manual", "Manual"),
        ("citation", "Citation"),
        ("semantic", "Semantic Similarity"),
        # Typed semantic relations (agent-driven)
        ("depends_on", "Depends On"),
        ("contradicts", "Contradicts"),
        ("extends", "Extends"),
        ("implements", "Implements"),
        ("supersedes", "Supersedes"),
        ("parent_child", "Parent-Child"),
        ("prerequisite", "Prerequisite"),
        ("references", "References"),
    ]

    TYPED_RELATION_TYPES = frozenset({
        "depends_on", "contradicts", "extends", "implements",
        "supersedes", "parent_child", "prerequisite", "references",
    })

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    from_page = models.ForeignKey(WikiPage, on_delete=models.CASCADE, related_name="outgoing_edges")
    to_page = models.ForeignKey(WikiPage, on_delete=models.CASCADE, related_name="incoming_edges")
    edge_type = models.CharField(max_length=30, choices=EDGE_TYPE_CHOICES, default="wikilink")
    confidence = models.FloatField(default=1.0)
    reason = models.TextField(blank=True, help_text="Agent-generated explanation of why this relation exists.")
    metadata = models.JSONField(default=dict, blank=True, help_text="Extra context, e.g. conflicting snippets.")
    created_by = models.CharField(max_length=30, default="human")  # human | pipeline | agent | user
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("from_page", "to_page", "edge_type")

    def __str__(self):
        return f"{self.from_page.slug} --[{self.edge_type}]--> {self.to_page.slug}"
