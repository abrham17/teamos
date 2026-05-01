import uuid
from django.db import models
from wiki.models import WikiPage


class GraphEdge(models.Model):
    EDGE_TYPE_CHOICES = [
        ("wikilink", "Wikilink"),
        ("ai_inferred", "AI Inferred"),
        ("manual", "Manual"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    from_page = models.ForeignKey(WikiPage, on_delete=models.CASCADE, related_name="outgoing_edges")
    to_page = models.ForeignKey(WikiPage, on_delete=models.CASCADE, related_name="incoming_edges")
    edge_type = models.CharField(max_length=30, choices=EDGE_TYPE_CHOICES, default="wikilink")
    confidence = models.FloatField(default=1.0)
    created_by = models.CharField(max_length=30, default="human")  # human | pipeline | user
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("from_page", "to_page", "edge_type")

    def __str__(self):
        return f"{self.from_page.slug} --[{self.edge_type}]--> {self.to_page.slug}"
