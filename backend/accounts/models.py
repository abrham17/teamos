import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clerk_user_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    email = models.EmailField(unique=True)
    avatar_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return self.email


class Team(models.Model):
    PLAN_CHOICES = [("free", "Free"), ("team", "Team"), ("pro", "Pro")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    slug = models.SlugField(unique=True, max_length=120)
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default="free")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="created_teams")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TeamMember(models.Model):
    ROLE_CHOICES = [("owner", "Owner"), ("editor", "Editor"), ("viewer", "Viewer")]

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="team_memberships")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="viewer")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("team", "user")

    def __str__(self):
        return f"{self.user.email} in {self.team.name} ({self.role})"


class TeamInvite(models.Model):
    SEND_STATUS_CHOICES = [("pending", "Pending"), ("sent", "Sent"), ("failed", "Failed")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="invites")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    invitee_email = models.EmailField()
    role = models.CharField(max_length=20, default="editor")
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="accepted_invites"
    )
    send_status = models.CharField(max_length=20, choices=SEND_STATUS_CHOICES, default="pending")
    sent_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Invite {self.invitee_email} to {self.team.name} ({self.token})"


class TeamAuditEvent(models.Model):
    EVENT_CHOICES = [
        ("invite_created", "Invite Created"),
        ("invite_sent", "Invite Sent"),
        ("invite_send_failed", "Invite Send Failed"),
        ("invite_accepted", "Invite Accepted"),
        ("invite_revoked", "Invite Revoked"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="audit_events")
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_actions"
    )
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.team.name}: {self.event_type}"
