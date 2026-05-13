import uuid
from django.db import models
from django.conf import settings
from accounts.models import Team

class TeamApiUsage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="api_usages")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="api_usages")
    
    operation = models.CharField(max_length=60, help_text="e.g. chat_ask, chat_agent, ingest_decompose, etc.")
    model_used = models.CharField(max_length=60)
    
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=12, decimal_places=6, default=0.0)
    latency_ms = models.PositiveIntegerField(default=0)
    
    VALUE_SCORE_CHOICES = [
        ("high", "High"),
        ("medium", "Medium"),
        ("low", "Low"),
    ]
    value_score = models.CharField(max_length=10, choices=VALUE_SCORE_CHOICES, default="medium")
    
    billing_month = models.CharField(max_length=7, help_text="YYYY-MM format")
    
    ROUTED_BY_CHOICES = [
        ("free_fixed", "Free Fixed"),
        ("continuous_curve", "Continuous Curve"),
        ("grace_period_fallback", "Grace Period Fallback"),
        ("value_aware_priority", "Value-Aware Priority"),
        ("pro_background_routing", "Pro Background Routing"),
        ("team_background_routing", "Team Background Routing"),
        ("cache", "Cache Hit"),
        ("enterprise_sla", "Enterprise SLA"),
    ]
    routed_by = models.CharField(max_length=30, choices=ROUTED_BY_CHOICES, default="continuous_curve")
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["team", "billing_month"]),
            models.Index(fields=["user", "billing_month"]),
        ]

    def __str__(self):
        return f"{self.team.name} - {self.operation} - {self.created_at.strftime('%Y-%m-%d')}"
