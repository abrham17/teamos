import uuid

from django.db import models

from accounts.models import Team, User


class ProductEvent(models.Model):
    EVENT_CHOICES = [
        ("workspace_created", "Workspace Created"),
        ("first_page_created", "First Page Created"),
        ("first_ingest_completed", "First Ingest Completed"),
        ("first_chat_answer_received", "First Chat Answer Received"),
        ("invite_sent", "Invite Sent"),
        ("invite_accepted", "Invite Accepted"),
        ("upgrade_clicked", "Upgrade Clicked"),
        ("subscription_started", "Subscription Started"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="product_events", null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, related_name="product_events", null=True, blank=True)
    event_name = models.CharField(max_length=80, choices=EVENT_CHOICES)
    properties = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at"]
