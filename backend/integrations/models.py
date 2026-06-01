"""
Integrations database models.

UserIntegration   – one row per user-provider pair (OAuth connection)
OAuthToken        – encrypted access/refresh tokens tied to an integration
ToolExecutionLog  – audit trail for every external tool call
"""

from __future__ import annotations

import base64
import hashlib
import uuid

from cryptography.fernet import Fernet
from django.conf import settings
from django.db import models
from django.utils import timezone

from accounts.models import User


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_fernet() -> Fernet:
    """Derive a stable Fernet key from SECRET_KEY."""
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _encrypt(value: str) -> str:
    if not value:
        return ""
    return "enc::" + _make_fernet().encrypt(value.encode()).decode()


def _decrypt(value: str) -> str:
    if not value:
        return ""
    if not value.startswith("enc::"):
        return value
    try:
        return _make_fernet().decrypt(value[5:].encode()).decode()
    except Exception:
        return ""


# ── models ────────────────────────────────────────────────────────────────────

class UserIntegration(models.Model):
    """Tracks an OAuth connection between a TeamOS user and an external service."""

    STATUS_CONNECTED = "connected"
    STATUS_DISCONNECTED = "disconnected"
    STATUS_ERROR = "error"
    STATUS_CHOICES = [
        (STATUS_CONNECTED, "Connected"),
        (STATUS_DISCONNECTED, "Disconnected"),
        (STATUS_ERROR, "Error"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="integrations")

    # e.g. "github", "notion", "google", "slack"
    provider = models.CharField(max_length=50)

    # External identity (GitHub login, Notion user id, Google sub, …)
    external_user_id = models.CharField(max_length=255, blank=True, default="")
    external_user_name = models.CharField(max_length=255, blank=True, default="")
    external_user_email = models.EmailField(blank=True, default="")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_CONNECTED)
    scopes = models.JSONField(default=list, blank=True)

    # Per-provider extra data (e.g. workspace_id for Slack, team for GitHub)
    provider_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("user", "provider")
        ordering = ["provider"]

    def __str__(self) -> str:
        return f"{self.user.email} → {self.provider} ({self.status})"

    def touch(self) -> None:
        """Update last_used_at without triggering full save."""
        UserIntegration.objects.filter(pk=self.pk).update(last_used_at=timezone.now())


class OAuthToken(models.Model):
    """Encrypted OAuth tokens bound to a UserIntegration."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    integration = models.OneToOneField(
        UserIntegration, on_delete=models.CASCADE, related_name="token"
    )

    # Stored encrypted; use .access / .refresh properties
    _access_token = models.TextField(db_column="access_token")
    _refresh_token = models.TextField(db_column="refresh_token", blank=True, default="")

    expires_at = models.DateTimeField(null=True, blank=True)
    token_type = models.CharField(max_length=50, default="Bearer")
    extra = models.JSONField(default=dict, blank=True)  # provider-specific extras

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── encrypted access ──────────────────────────────────────────────

    @property
    def access(self) -> str:
        return _decrypt(self._access_token)

    @access.setter
    def access(self, value: str) -> None:
        self._access_token = _encrypt(value)

    @property
    def refresh(self) -> str:
        return _decrypt(self._refresh_token)

    @refresh.setter
    def refresh(self, value: str) -> None:
        self._refresh_token = _encrypt(value) if value else ""

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return timezone.now() >= self.expires_at

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        exp = self.expires_at.isoformat() if self.expires_at else "no-expiry"
        return f"OAuthToken({self.integration.provider} / {exp})"


class ToolExecutionLog(models.Model):
    """Audit log for every external tool invocation via an integration."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="tool_logs")
    integration = models.ForeignKey(
        UserIntegration, on_delete=models.SET_NULL, null=True, related_name="tool_logs"
    )

    provider = models.CharField(max_length=50)
    tool_name = models.CharField(max_length=150)

    # Sanitized arguments (no secrets)
    arguments = models.JSONField(default=dict, blank=True)
    result_summary = models.TextField(blank=True, default="")

    success = models.BooleanField(default=True)
    error_message = models.TextField(blank=True, default="")
    latency_ms = models.PositiveIntegerField(default=0)

    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["user", "-timestamp"]),
            models.Index(fields=["provider", "-timestamp"]),
        ]

    def __str__(self) -> str:
        ok = "✓" if self.success else "✗"
        return f"{ok} {self.provider}.{self.tool_name} ({self.user})"
