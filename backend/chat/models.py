import uuid
from django.db import models
from pgvector.django import VectorField
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
    
    # Retrospective / Procedural learning fields
    inferred_domain = models.CharField(max_length=100, null=True, blank=True)
    quality_score = models.FloatField(default=1.0)
    rounds_taken = models.PositiveIntegerField(default=1)
    failure_point = models.TextField(blank=True, default="")
    error_trace = models.TextField(blank=True, default="")

    embedding = VectorField(dimensions=1536, null=True, blank=True, help_text="Pre-computed embedding for semantic recall")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["team", "-created_at"]),
            models.Index(fields=["team", "success"]),
            models.Index(fields=["inferred_domain"]),
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


class MCPServerRegistration(models.Model):
    """
    Registration of an external MCP (Model Context Protocol) tool server.
    Each team can register multiple MCP servers (GitHub, Slack, Jira, etc.)
    whose tools become available to the agent during chat.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="mcp_servers")
    name = models.CharField(max_length=100, help_text="Short identifier e.g. 'github', 'slack'")
    url = models.URLField(help_text="MCP server endpoint URL")
    auth_token = models.TextField(blank=True, default="", help_text="Bearer token for server auth")
    capabilities = models.JSONField(default=list, blank=True, help_text="List of capability strings")
    enabled = models.BooleanField(default=True)
    # Crew role scoping (null = available to all roles)
    allowed_crew_roles = models.JSONField(
        null=True, blank=True,
        help_text="Crew roles allowed to call this server's tools. Null = all roles."
    )
    # Override the auto-inferred risk level for this server's tools
    risk_level_override = models.CharField(
        max_length=20,
        choices=[("low", "Low"), ("medium", "Medium"), ("high", "High")],
        null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("team", "name")
        ordering = ["name"]

    def _get_encryptor(self):
        import base64
        import hashlib
        from django.conf import settings
        from cryptography.fernet import Fernet
        key = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
        return Fernet(base64.urlsafe_b64encode(key))

    def save(self, *args, **kwargs):
        if self.auth_token and not self.auth_token.startswith("enc::"):
            f = self._get_encryptor()
            encrypted = f.encrypt(self.auth_token.encode("utf-8")).decode("utf-8")
            self.auth_token = f"enc::{encrypted}"
        super().save(*args, **kwargs)

    @property
    def decrypted_token(self) -> str:
        if not self.auth_token:
            return ""
        if not self.auth_token.startswith("enc::"):
            return self.auth_token
        try:
            f = self._get_encryptor()
            encrypted_payload = self.auth_token[5:]  # strip 'enc::'
            return f.decrypt(encrypted_payload.encode("utf-8")).decode("utf-8")
        except Exception:
            return ""

    def __str__(self):
        status = "✓" if self.enabled else "✗"
        return f"MCP[{status}] {self.name} ({self.team.name})"


class DirectiveType(models.TextChoices):
    PLANNING_HEURISTIC   = "planning_heuristic"    # How to structure plans for this team
    INTEGRATION_RULE     = "integration_rule"       # Constraints for external tools
    COMMUNICATION_STYLE  = "communication_style"    # How this team prefers output formatted
    RISK_PATTERN         = "risk_pattern"           # Known risk factors in this domain
    WORKFLOW_PREFERENCE  = "workflow_preference"    # Task structure preferences
    VOCABULARY           = "vocabulary"             # Domain-specific terms this team uses
    FAILURE_PATTERN      = "failure_pattern"        # What NOT to do (from failed episodes)
    SUCCESS_PATTERN      = "success_pattern"        # What worked well (from successful episodes)


class ProceduralMemory(models.Model):
    """
    Domain-tagged, typed procedural memories (directives) with confidence scoring.
    Learned from both successful and failed agent episodes.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="procedural_memories")
    
    # Directive content
    directive = models.TextField()
    directive_type = models.CharField(max_length=50, choices=DirectiveType.choices)
    
    # Domain tagging
    domain = models.CharField(max_length=100, null=True, blank=True)
    
    # Intent type applicability
    applicable_intent_types = models.JSONField(default=list, blank=True)
    
    # Provenance
    source_episode_ids = models.JSONField(default=list, blank=True)
    extraction_method = models.CharField(max_length=50)
    
    # Quality signals
    confidence = models.FloatField(default=0.7)
    reinforcement_count = models.IntegerField(default=1)
    contradiction_count = models.IntegerField(default=0)
    
    # Lifecycle
    last_used_at = models.DateTimeField(null=True, blank=True)
    last_reinforced_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)  # null = permanent
    
    class Meta:
        ordering = ["-confidence", "-reinforcement_count"]
        indexes = [
            models.Index(fields=["team", "domain", "directive_type"]),
            models.Index(fields=["team", "applicable_intent_types"]),
            models.Index(fields=["confidence", "reinforcement_count"]),
        ]

    def __str__(self):
        domain_str = self.domain or "global"
        return f"ProceduralMemory({self.team.name} [{domain_str}]: {self.directive[:40]})"


class IntentClassificationLog(models.Model):
    """
    Audit trail for classification decisions.
    Used to monitor and improve classifier examples over time.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="intent_classification_logs")
    session_id = models.CharField(max_length=255, blank=True, default="")
    
    message = models.TextField(blank=True, default="")
    message_hash = models.CharField(max_length=64, db_index=True)
    
    # Classification result
    intent_type = models.CharField(max_length=100)
    complexity = models.CharField(max_length=20)
    domains = models.JSONField(default=list, blank=True)
    required_capabilities = models.JSONField(default=list, blank=True)
    intent_confidence = models.FloatField()
    
    # Routing decision
    layer_used = models.IntegerField()         # 1, 2, or 3
    similarity_score = models.FloatField(null=True, blank=True)
    latency_ms = models.IntegerField()
    
    # Outcome
    agent_outcome = models.CharField(max_length=50, null=True, blank=True)
    crew_used = models.BooleanField(default=False)
    crew_composition = models.JSONField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["team", "intent_type", "created_at"]),
            models.Index(fields=["layer_used", "created_at"]),
        ]

    def __str__(self):
        return f"IntentClassificationLog({self.team.name}: {self.intent_type} via Layer {self.layer_used})"


class MCPToolExecutionLog(models.Model):
    """Audit trail for every MCP tool invocation — mirrors ToolExecutionLog for OAuth tools."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="mcp_tool_logs")
    session_id = models.CharField(max_length=255, blank=True, default="")
    server_name = models.CharField(max_length=100)
    tool_name = models.CharField(max_length=255)
    tool_input = models.JSONField(default=dict)
    result_summary = models.TextField(blank=True, default="")
    latency_ms = models.IntegerField(default=0)
    success = models.BooleanField(default=True)
    circuit_state_at_call = models.CharField(max_length=20, null=True, blank=True)
    idempotency_hit = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["team", "server_name", "timestamp"]),
            models.Index(fields=["tool_name", "success"]),
        ]

    def __str__(self):
        ok = "✓" if self.success else "✗"
        return f"{ok} mcp:{self.server_name}/{self.tool_name}"


class MCPRegistrationEvent(models.Model):
    """Audit trail for MCP server registration and schema-validation events."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    server = models.ForeignKey(
        MCPServerRegistration, on_delete=models.CASCADE,
        related_name="registration_events"
    )
    event_type = models.CharField(max_length=50)  # e.g. "validation_errors", "registered"
    details = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        return f"MCPRegistrationEvent({self.server.name}: {self.event_type})"
