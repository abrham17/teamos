import uuid

from django.db import models

from accounts.models import Team


class TeamSubscription(models.Model):
    STATUS_CHOICES = [
        ("trialing", "Trialing"),
        ("trial_expired", "Trial Expired"),
        ("active", "Active"),
        ("past_due", "Past Due"),
        ("suspended", "Suspended"),
        ("canceled", "Canceled"),
        ("incomplete", "Incomplete"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.OneToOneField(Team, on_delete=models.CASCADE, related_name="subscription")
    provider = models.CharField(max_length=40, default="paddle")
    external_customer_id = models.CharField(max_length=200, blank=True)
    external_subscription_id = models.CharField(max_length=200, blank=True)
    plan_key = models.CharField(max_length=60, default="free")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="trialing")
    current_period_end = models.DateTimeField(null=True, blank=True)
    trial_expires_at = models.DateTimeField(null=True, blank=True)
    grace_expires_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)


class BillingWebhookEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.CharField(max_length=40)
    event_id = models.CharField(max_length=200)
    event_type = models.CharField(max_length=120)
    payload = models.JSONField(default=dict, blank=True)
    processed = models.BooleanField(default=False)
    processed_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("provider", "event_id")
        ordering = ["-created_at"]
