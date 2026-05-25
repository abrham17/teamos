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
        ("milestone_missed", "Milestone Missed"),
        ("conflict_detected", "Conflict Detected"),
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
