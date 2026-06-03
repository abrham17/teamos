import uuid
import hashlib

from django.db import models
from pgvector.django import VectorField

from accounts.models import Team, User


class Project(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("on_hold", "On Hold"),
        ("completed", "Completed"),
        ("archived", "Archived"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_projects"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    related_wiki_pages = models.ManyToManyField(
        "wiki.WikiPage",
        blank=True,
        related_name="associated_projects",
        help_text="Wiki pages/documents semantically linked to this project."
    )
    langgraph_thread_id = models.UUIDField(null=True, blank=True)
    planning_run_metadata = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]


    def __str__(self):
        return f"[{self.team.name}] {self.name}"


class ProjectMember(models.Model):
    """
    Explicit roles within a specific project.
    A user can have a different functional role per project (e.g. 'Lead' in one, 'Reviewer' in another).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="project_memberships")
    role = models.CharField(max_length=100, help_text="e.g. Project Lead, Frontend Dev, Stakeholder")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("project", "user")
        ordering = ["joined_at"]

    def __str__(self):
        return f"{self.user.email} as {self.role} in {self.project.name}"


class Task(models.Model):
    STATUS_CHOICES = [
        ("todo", "Todo"),
        ("in-progress", "In Progress"),
        ("completed", "Completed"),
        ("blocked", "Blocked"),
    ]
    PRIORITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="todo")
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default="medium")
    assignee = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_plan_tasks"
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    parent_task = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="subtasks"
    )
    dependencies = models.ManyToManyField("self", symmetrical=False, blank=True, related_name="dependents")
    order_index = models.PositiveIntegerField(default=0)
    semantic_key = models.CharField(max_length=64, blank=True, db_index=True)
    title_embedding = VectorField(dimensions=1536, null=True, blank=True)
    human_locked_fields = models.JSONField(
        default=dict,
        blank=True,
        help_text="Map of field name -> ISO timestamp when a human locked the field from AI overwrites.",
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_plan_tasks"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order_index", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "semantic_key"],
                condition=~models.Q(semantic_key=""),
                name="unique_task_semantic_key_per_project",
            ),
        ]

    def __str__(self):
        return self.title


class Milestone(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("reached", "Reached"),
        ("missed", "Missed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="milestones")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    target_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    order_index = models.PositiveIntegerField(default=0)
    semantic_key = models.CharField(max_length=64, blank=True, db_index=True)
    human_locked_fields = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_milestones"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order_index", "target_date", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "semantic_key"],
                condition=~models.Q(semantic_key=""),
                name="unique_milestone_semantic_key_per_project",
            ),
        ]

    def __str__(self):
        return self.title


class PlanVersion(models.Model):
    SOURCE_CHOICES = [
        ("manual", "Manual"),
        ("agent_proposal", "Agent Proposal"),
        ("agent_applied", "Agent Applied"),
        ("auto", "Auto"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="plan_versions")
    parent_version = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="child_versions"
    )
    snapshot_data = models.JSONField(help_text="ProjectDetailSerializer-shaped JSON")
    source = models.CharField(max_length=32, choices=SOURCE_CHOICES, default="auto")
    prompt_hash = models.CharField(max_length=64, blank=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_plan_versions"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"PlanVersion {self.id} for {self.project.name}"


class PlanChangeSet(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("partially_applied", "Partially Applied"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="plan_changesets")
    base_version = models.ForeignKey(
        PlanVersion, on_delete=models.CASCADE, related_name="changesets_as_base"
    )
    proposed_version = models.ForeignKey(
        PlanVersion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="changesets_as_proposal",
    )
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default="pending")
    mutations = models.JSONField(default=list)
    impact_summary = models.JSONField(default=dict)
    auto_applied = models.JSONField(default=list)
    pending_mutations = models.JSONField(default=list)
    remediation_preview = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_plan_changesets"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"PlanChangeSet {self.status} for {self.project.name}"


class PlanEvent(models.Model):
    ENTITY_TYPES = [
        ("task", "Task"),
        ("milestone", "Milestone"),
        ("project", "Project"),
        ("dependency", "Dependency"),
    ]
    EVENT_TYPES = [
        ("task_created", "Task Created"),
        ("task_updated", "Task Updated"),
        ("task_deleted", "Task Deleted"),
        ("milestone_created", "Milestone Created"),
        ("milestone_updated", "Milestone Updated"),
        ("milestone_deleted", "Milestone Deleted"),
        ("project_updated", "Project Updated"),
        ("dependency_changed", "Dependency Changed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="plan_events")
    entity_type = models.CharField(max_length=20, choices=ENTITY_TYPES)
    entity_id = models.UUIDField(null=True, blank=True)
    event_type = models.CharField(max_length=32, choices=EVENT_TYPES)
    payload = models.JSONField(default=dict)
    changeset = models.ForeignKey(
        PlanChangeSet, on_delete=models.SET_NULL, null=True, blank=True, related_name="events"
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="plan_events"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event_type} on {self.entity_type}"


class PlanChunk(models.Model):
    SOURCE_KIND_CHOICES = [
        ("project", "Project"),
        ("task", "Task"),
        ("milestone", "Milestone"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="chunks")
    chunk_index = models.PositiveIntegerField()
    source_kind = models.CharField(max_length=20, choices=SOURCE_KIND_CHOICES)
    source_ref_id = models.UUIDField(null=True, blank=True)
    title = models.CharField(max_length=300)
    content = models.TextField()
    content_hash = models.CharField(max_length=64, db_index=True)
    embedding = VectorField(dimensions=1536, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("project", "chunk_index")
        ordering = ["chunk_index"]

    def __str__(self):
        return f"{self.project.name} chunk {self.chunk_index}"

    @staticmethod
    def hash_content(value: str) -> str:
        return hashlib.sha256((value or "").encode("utf-8", errors="ignore")).hexdigest()


class PlanSnapshot(models.Model):
    SNAPSHOT_TYPE_CHOICES = [
        ("auto", "Auto"),
        ("manual", "Manual"),
        ("agent", "Agent"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="snapshots")
    snapshot_type = models.CharField(max_length=20, choices=SNAPSHOT_TYPE_CHOICES, default="auto")
    data = models.JSONField(help_text="JSON of full project state")
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_snapshots"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Snapshot of {self.project.name} at {self.created_at}"


class TaskComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="task_comments")
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.author.email} on {self.task.title}"


class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ("task_overdue", "Task Overdue"),
        ("task_due_today", "Task Due Today"),
        ("task_assigned", "Task Assigned"),
        ("task_completed", "Task Completed"),
        ("milestone_missed", "Milestone Missed"),
        ("milestone_approaching", "Milestone Approaching"),
        ("milestone_reached", "Milestone Reached"),
        ("conflict_detected", "Conflict Detected"),
        ("integration_synced", "Integration Synced"),
        ("mention", "Mention"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="notifications")
    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=255)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.user.email}] {self.title}"


class CanvasLayout(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name="canvas")
    nodes = models.JSONField(default=list)
    edges = models.JSONField(default=list)
    viewport = models.JSONField(default=dict)
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="updated_canvases"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Canvas Layout"

    def __str__(self):
        return f"Canvas for {self.project.name}"


class IntegrationAction(models.Model):
    ACTION_CHOICES = [
        ("calendar_create", "Calendar Event Created"),
        ("calendar_update", "Calendar Event Updated"),
        ("calendar_delete", "Calendar Event Deleted"),
        ("slack_notify", "Slack Message Sent"),
        ("github_issue", "GitHub Issue Created"),
        ("jira_issue", "Jira Issue Created"),
        ("linear_issue", "Linear Issue Created"),
        ("notion_page", "Notion Page Created"),
        ("gmail_reminder", "Gmail Reminder Sent"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="integration_actions")
    entity_type = models.CharField(max_length=20)
    entity_id = models.UUIDField()
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    provider = models.CharField(max_length=30)
    external_ref = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=20, default="pending")
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id", "action"]),
        ]

    def __str__(self):
        return f"{self.action} on {self.entity_type} {self.entity_id}"


class CanvasTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(
        "accounts.Team", on_delete=models.CASCADE, related_name="canvas_templates"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    nodes = models.JSONField(default=list)
    edges = models.JSONField(default=list)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_canvas_templates"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Canvas Template"

    def __str__(self):
        return f"[{self.team.name}] {self.name}"


class ProjectIntegrationConfig(models.Model):
    project = models.OneToOneField(
        Project, on_delete=models.CASCADE, related_name="integration_config"
    )
    auto_calendar_sync = models.BooleanField(default=True)
    auto_slack_notify = models.BooleanField(default=False)
    auto_github_issues = models.BooleanField(default=False)
    auto_jira_issues = models.BooleanField(default=False)
    auto_linear_issues = models.BooleanField(default=False)
    slack_channel = models.CharField(max_length=100, blank=True)
    github_repo = models.CharField(max_length=200, blank=True)
    jira_project_key = models.CharField(max_length=20, blank=True)
    linear_team_id = models.CharField(max_length=50, blank=True)
    notify_on_assign = models.BooleanField(default=True)
    notify_on_overdue = models.BooleanField(default=True)
    notify_on_complete = models.BooleanField(default=False)
    notify_on_milestone = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Project Integration Config"

    def __str__(self):
        return f"Integration config for {self.project.name}"


class GuardianAuditLog(models.Model):
    """
    Immutable audit record written by the Guardian Agent for every tool invocation.
    Tier 1 & 2 records are written on pre-execution (whether approved or blocked).
    Tier 3 records are written post-execution for routine, low-risk mutations.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    team = models.ForeignKey(
        "accounts.Team",
        on_delete=models.CASCADE,
        related_name="guardian_audit_logs",
    )
    session_id = models.CharField(max_length=255)
    tool_name = models.CharField(max_length=255)
    tool_input = models.JSONField()
    tool_result = models.JSONField(null=True, blank=True)
    tier = models.IntegerField()          # 1, 2, or 3
    approved = models.BooleanField()
    risk_score = models.FloatField(null=True, blank=True)
    reason = models.TextField(null=True, blank=True)
    agent_round = models.IntegerField(null=True, blank=True)
    latency_ms = models.IntegerField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["team", "timestamp"]),
            models.Index(fields=["tool_name", "approved"]),
            models.Index(fields=["session_id"]),
        ]

    def __str__(self):
        status = "✓" if self.approved else "✗"
        return f"[T{self.tier}]{status} {self.tool_name} @ {self.timestamp:%Y-%m-%d %H:%M}"
