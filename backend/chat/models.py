import uuid
from django.db import models
from accounts.models import Team, User


class ChatSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="chat_sessions")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chat_sessions")
    title = models.CharField(max_length=200, default="New Chat")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.title} ({self.created_by.email})"


class ChatMessage(models.Model):
    ROLE_CHOICES = [
        ("user", "User"),
        ("assistant", "Assistant"),
        ("system", "System"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    citations = models.JSONField(default=list, blank=True)
    # Citations format: [{"chunk_id": "uuid", "page_title": "title", "page_slug": "slug", "text_snippet": "...", "score": 0.9}]
    metadata = models.JSONField(default=dict, blank=True)
    # e.g. {"mode": "ask"|"agent", "tool_trace": [...]} for user/assistant agent turns
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.role}] {self.content[:50]}"


class ChatTokenUsage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="chat_token_usages")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="chat_token_usages")
    session = models.ForeignKey(ChatSession, on_delete=models.SET_NULL, null=True, blank=True, related_name="token_usages")
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AgentEpisode(models.Model):
    """
    Episodic memory: records of complete agent interactions and their outcomes.
    Used for learning from past successes/failures to improve future execution.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="agent_episodes")
    session = models.ForeignKey(
        ChatSession, on_delete=models.SET_NULL, null=True, blank=True, related_name="episodes"
    )
    trigger = models.TextField(help_text="The user message or event that initiated this episode")
    plan = models.JSONField(default=dict, blank=True, help_text="The approach the agent planned")
    actions = models.JSONField(default=list, help_text="Tool calls executed in order")
    outcome = models.JSONField(default=dict, help_text="Success/failure metrics and results")
    learnings = models.TextField(blank=True, help_text="Extracted lessons for future recall")
    tags = models.JSONField(default=list, blank=True, help_text="Semantic tags for retrieval")
    success = models.BooleanField(default=True)
    duration_ms = models.PositiveIntegerField(default=0, help_text="Total execution time")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["team", "-created_at"]),
            models.Index(fields=["team", "success"]),
        ]

    def __str__(self):
        status = "✓" if self.success else "✗"
        return f"AgentEpisode({status} {self.trigger[:40]})"


class AgentMemory(models.Model):
    """
    Persistent key-value memory for the agent, scoped per team.
    Survives across chat sessions so the agent maintains awareness of
    team priorities, known blockers, knowledge gaps, recent decisions, etc.
    """
    MEMORY_CATEGORIES = [
        ("priorities", "Current Priorities"),
        ("blockers", "Known Blockers"),
        ("gaps", "Knowledge Gaps"),
        ("decisions", "Recent Decisions"),
        ("contradictions", "Active Contradictions"),
        ("context", "General Context"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="agent_memories")
    key = models.CharField(max_length=200, help_text="e.g. current_priorities, known_blockers")
    category = models.CharField(max_length=30, choices=MEMORY_CATEGORIES, default="context")
    value = models.JSONField(default=dict)
    summary = models.TextField(blank=True, help_text="Human-readable summary of this memory entry.")
    ttl_days = models.PositiveIntegerField(default=30, help_text="Days until this memory expires")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("team", "key")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"AgentMemory({self.team.name}: {self.key})"

