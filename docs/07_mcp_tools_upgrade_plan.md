# Topic 7: MCP Tools in the Upgraded TeamOS
**TeamOS Deep Dive Series — Phase 2, Weeks 10–14 (parallel to Topic 6)**

> You already have MCP server registration. The upgrade makes MCP tools first-class citizens: discoverable, safe, observable, and composable inside the crew system.

---

## Where MCP Tools Live Today

Your current system has the foundation right. From the README:

- `MCPServerRegistration` model — per-team MCP servers with encrypted auth tokens
- Tools are prefixed `mcp_<server_name>_<tool_name>` and registered at runtime
- The chat agent can call MCP tools through `AgentCore` alongside internal and OAuth tools

The foundation is solid. But the current implementation has gaps that become serious problems once you upgrade to LangGraph crews and the Guardian:

**Gap 1: MCP tools are opaque to the Guardian.** The Guardian (Topic 3) has typed rule sets for internal tools (`plan_create_task`, `wiki_create_page`) and OAuth tools (`ext_slack_send_message`). MCP tools are unknown — they bypass Tier 1 and Tier 2 checks entirely. An MCP tool could execute a destructive database operation and the Guardian would never see it.

**Gap 2: MCP tools have no role scoping.** The Dynamic Crew Factory (Topic 4) scopes tools per agent role (`ROLE_TOOL_MAP`). MCP tools don't exist in this map. Any crew agent can call any registered MCP tool, which defeats the containment model.

**Gap 3: MCP tool schema is trusted at face value.** You accept the OpenAI-compatible function schema from the MCP server as-is and hand it to the agent. There's no validation that the schema is well-formed, that the tool name doesn't shadow an internal tool, or that the declared parameters match what the server actually expects.

**Gap 4: MCP calls are not traced.** LangSmith (Topic 1) wraps `llm_call()` and `_execute_tool()`. But MCP tool execution goes through a different path — it's a live HTTP/SSE call to an external server. These calls are currently invisible in your traces.

**Gap 5: MCP server failures silently degrade the agent.** If an MCP server is down, the agent gets a connection error, triggers LLM reflection, retries, and burns tokens. There's no circuit breaker, no health check, no graceful fallback.

This plan fixes all five gaps without changing the MCP protocol or requiring server changes.

---

## Architecture: MCP in the Upgraded System

```
MCPServerRegistration (DB)
         │
         ▼
MCPRegistry (in-memory, rebuilt on startup + TTL refresh)
         │
         ├── Tool Schema Validation (on register)
         ├── Health Check Cache (Redis, 60s TTL)
         └── Circuit Breaker State (Redis)
                    │
                    ▼
         MCPToolExecutor (wraps all MCP calls)
         │
         ├── GuardianContext enrichment (MCP-aware tier rules)
         ├── LangSmith @traceable span
         ├── Idempotency key enforcement
         └── Result normalization
                    │
                    ▼
         AgentCore / CrewAgent (via unified ToolRegistry)
                    │
                    ▼
         Crew Role Scoping (MCPToolPolicy per server)
```

---

## Step 1: MCP Tool Registry with Validation

When an MCP server is registered or refreshed, validate its schema before making tools available to agents.

```python
# integrations/mcp/registry.py
from dataclasses import dataclass, field
from typing import Optional
import redis
import json

redis_client = redis.Redis.from_url(settings.REDIS_URL)

INTERNAL_TOOL_NAMES = {
    "wiki_search_pages", "wiki_create_page", "wiki_update_page",
    "plan_create_task", "plan_create_project", "plan_assign_member",
    "graph_add_node", "graph_add_edge", "graph_get_neighbors",
    "memory_store", "memory_retrieve",
    # ... all 53 internal tools
}

@dataclass
class MCPToolDefinition:
    server_id: str
    server_name: str
    tool_name: str           # e.g., "my_server_query_database"
    prefixed_name: str       # e.g., "mcp_my_server_query_database"
    description: str
    parameters_schema: dict  # OpenAI-compatible JSON schema
    is_destructive: bool     # Inferred from schema + name heuristics
    is_external_write: bool  # Inferred: does this write outside the team's workspace?
    risk_level: str          # "low", "medium", "high" — assigned at registration
    team_id: str


class MCPRegistry:
    """
    Singleton per Django process. Rebuilt on startup, refreshed on MCPServerRegistration save.
    """
    
    def __init__(self):
        self._tools: dict[str, MCPToolDefinition] = {}  # prefixed_name → definition
    
    def register_server(self, server: "MCPServerRegistration") -> list[str]:
        """
        Fetch the server's tool list, validate schemas, and register all tools.
        Returns list of registered tool names.
        """
        tools_raw = self._fetch_server_tools(server)
        registered = []
        errors = []
        
        for tool_raw in tools_raw:
            result = self._validate_and_register(tool_raw, server)
            if result.ok:
                registered.append(result.prefixed_name)
            else:
                errors.append(result.error)
        
        if errors:
            # Log validation errors — don't fail silently
            MCPRegistrationEvent.objects.create(
                server=server,
                event_type="validation_errors",
                details={"errors": errors}
            )
        
        return registered
    
    def _validate_and_register(self, tool_raw: dict, server: "MCPServerRegistration"):
        tool_name = tool_raw.get("name", "")
        prefixed = f"mcp_{server.name}_{tool_name}"
        
        # Rule 1: No shadowing of internal tools
        if tool_name in INTERNAL_TOOL_NAMES or prefixed in INTERNAL_TOOL_NAMES:
            return RegistrationResult(
                ok=False,
                error=f"Tool '{tool_name}' shadows an internal tool name — rejected"
            )
        
        # Rule 2: Schema must be valid JSON Schema (basic check)
        params = tool_raw.get("inputSchema") or tool_raw.get("parameters", {})
        if not isinstance(params, dict) or "properties" not in params:
            return RegistrationResult(
                ok=False,
                error=f"Tool '{tool_name}' has malformed parameter schema"
            )
        
        # Rule 3: Description must exist and be non-empty
        description = tool_raw.get("description", "").strip()
        if len(description) < 10:
            return RegistrationResult(
                ok=False,
                error=f"Tool '{tool_name}' has missing or too-short description"
            )
        
        # Infer risk level from name and description heuristics
        risk_level = self._infer_risk_level(tool_name, description, params)
        is_destructive = self._is_destructive(tool_name, description)
        is_external_write = self._is_external_write(tool_name, description)
        
        definition = MCPToolDefinition(
            server_id=str(server.id),
            server_name=server.name,
            tool_name=tool_name,
            prefixed_name=prefixed,
            description=description,
            parameters_schema=params,
            is_destructive=is_destructive,
            is_external_write=is_external_write,
            risk_level=risk_level,
            team_id=str(server.team_id),
        )
        
        self._tools[prefixed] = definition
        
        return RegistrationResult(ok=True, prefixed_name=prefixed)
    
    def _infer_risk_level(self, name: str, description: str, params: dict) -> str:
        """
        Heuristic risk classification. Not foolproof — Guardian Tier 2 handles ambiguous cases.
        """
        name_lower = name.lower()
        desc_lower = description.lower()
        
        HIGH_RISK_SIGNALS = [
            "delete", "drop", "truncate", "destroy", "remove", "purge",
            "execute", "run", "deploy", "publish", "send", "post", "write",
            "create", "insert", "update", "modify", "patch"
        ]
        LOW_RISK_SIGNALS = [
            "get", "list", "fetch", "read", "query", "search", "find",
            "describe", "show", "view", "inspect"
        ]
        
        for signal in HIGH_RISK_SIGNALS:
            if signal in name_lower or signal in desc_lower:
                return "high"
        
        for signal in LOW_RISK_SIGNALS:
            if signal in name_lower or signal in desc_lower:
                return "low"
        
        return "medium"  # Default when uncertain
    
    def _is_destructive(self, name: str, description: str) -> bool:
        signals = ["delete", "drop", "truncate", "destroy", "purge", "remove"]
        combined = (name + description).lower()
        return any(s in combined for s in signals)
    
    def _is_external_write(self, name: str, description: str) -> bool:
        """
        Detects tools that write outside the TeamOS workspace
        (email, Slack, GitHub, webhooks, databases, filesystems).
        """
        signals = [
            "send", "email", "slack", "github", "post", "webhook",
            "database", "filesystem", "write file", "deploy"
        ]
        combined = (name + description).lower()
        return any(s in combined for s in signals)
    
    def get_tools_for_team(self, team_id: str) -> list[MCPToolDefinition]:
        return [t for t in self._tools.values() if t.team_id == team_id]
    
    def get_tool(self, prefixed_name: str) -> Optional[MCPToolDefinition]:
        return self._tools.get(prefixed_name)


# Singleton
_registry: Optional[MCPRegistry] = None

def get_mcp_registry() -> MCPRegistry:
    global _registry
    if _registry is None:
        _registry = MCPRegistry()
        _registry.load_all_from_db()
    return _registry
```

---

## Step 2: MCP Health Checks and Circuit Breaker

MCP servers are external services. They go down. The circuit breaker prevents the agent from hammering a dead server.

```python
# integrations/mcp/health.py
import redis
import time
from enum import Enum

redis_client = redis.Redis.from_url(settings.REDIS_URL)

class CircuitState(str, Enum):
    CLOSED = "closed"      # Normal: requests allowed
    OPEN = "open"          # Failing: requests blocked
    HALF_OPEN = "half_open"  # Testing: one request allowed

HEALTH_TTL = 60           # Cache health check result for 60 seconds
FAILURE_THRESHOLD = 3     # Open circuit after 3 consecutive failures
RECOVERY_TIMEOUT = 120    # Try again after 2 minutes


def get_circuit_state(server_id: str) -> CircuitState:
    state = redis_client.get(f"mcp_circuit:{server_id}:state")
    if not state:
        return CircuitState.CLOSED
    return CircuitState(state.decode())


def record_success(server_id: str):
    redis_client.delete(f"mcp_circuit:{server_id}:failures")
    redis_client.set(f"mcp_circuit:{server_id}:state", CircuitState.CLOSED)


def record_failure(server_id: str):
    failures_key = f"mcp_circuit:{server_id}:failures"
    failures = redis_client.incr(failures_key)
    redis_client.expire(failures_key, RECOVERY_TIMEOUT * 2)
    
    if failures >= FAILURE_THRESHOLD:
        redis_client.set(
            f"mcp_circuit:{server_id}:state",
            CircuitState.OPEN,
            ex=RECOVERY_TIMEOUT
        )
        # Alert via existing notification system
        trigger_mcp_server_alert(server_id, failure_count=failures)


def is_server_available(server_id: str) -> bool:
    state = get_circuit_state(server_id)
    
    if state == CircuitState.CLOSED:
        return True
    
    if state == CircuitState.OPEN:
        # Check if recovery timeout has elapsed (TTL expired → key gone → CLOSED)
        return False
    
    # HALF_OPEN: allow one probe request
    return True


def check_server_health(server: "MCPServerRegistration") -> bool:
    """
    Lightweight ping to MCP server. Cached in Redis for 60s.
    Called by background Celery task, not inline with requests.
    """
    cache_key = f"mcp_health:{server.id}"
    cached = redis_client.get(cache_key)
    
    if cached is not None:
        return cached == b"1"
    
    try:
        # MCP protocol: list tools endpoint as health proxy
        client = MCPClient(server.url, auth_token=decrypt_token(server.auth_token_encrypted))
        client.list_tools(timeout=5)
        redis_client.setex(cache_key, HEALTH_TTL, "1")
        record_success(str(server.id))
        return True
    except Exception:
        redis_client.setex(cache_key, HEALTH_TTL, "0")
        record_failure(str(server.id))
        return False
```

Background health check (add to Celery Beat):

```python
# integrations/tasks.py

@shared_task
def check_all_mcp_servers():
    """Runs every 5 minutes. Updates health cache and circuit states."""
    servers = MCPServerRegistration.objects.filter(is_active=True)
    for server in servers:
        check_server_health(server)
```

Add to `CELERY_BEAT_SCHEDULE`:

```python
"check-mcp-servers": {
    "task": "integrations.tasks.check_all_mcp_servers",
    "schedule": crontab(minute="*/5"),
},
```

---

## Step 3: MCPToolExecutor — The Unified Call Layer

All MCP tool calls go through one executor. This is where tracing, Guardian integration, idempotency, and circuit breaking converge.

```python
# integrations/mcp/executor.py
from langsmith import traceable
import time
import uuid

class MCPToolExecutor:
    
    def __init__(self, team_id: str, session_id: str):
        self.team_id = team_id
        self.session_id = session_id
        self.registry = get_mcp_registry()
    
    @traceable(name="mcp_tool_execution", run_type="tool")
    def execute(
        self,
        prefixed_name: str,
        tool_input: dict,
        idempotency_key: Optional[str] = None
    ) -> dict:
        
        start = time.monotonic()
        
        # 1. Resolve tool definition
        tool_def = self.registry.get_tool(prefixed_name)
        if not tool_def:
            return {"error": f"MCP tool '{prefixed_name}' not found in registry"}
        
        # 2. Circuit breaker check
        if not is_server_available(tool_def.server_id):
            return {
                "error": f"MCP server '{tool_def.server_name}' is currently unavailable (circuit open)",
                "circuit_open": True,
                "retry_after_seconds": RECOVERY_TIMEOUT
            }
        
        # 3. Idempotency check (Redis, same TTL as internal tools: 5 min)
        if idempotency_key:
            idem_cache_key = f"mcp_idem:{idempotency_key}"
            cached_result = redis_client.get(idem_cache_key)
            if cached_result:
                return {"result": json.loads(cached_result), "idempotency_hit": True}
        
        # 4. Execute against MCP server
        server = MCPServerRegistration.objects.get(id=tool_def.server_id)
        client = MCPClient(
            server.url,
            auth_token=decrypt_token(server.auth_token_encrypted)
        )
        
        try:
            result = client.call_tool(
                name=tool_def.tool_name,
                arguments=tool_input,
                timeout=30
            )
            record_success(tool_def.server_id)
            
        except TimeoutError:
            record_failure(tool_def.server_id)
            return {
                "error": f"MCP tool '{prefixed_name}' timed out after 30s",
                "timeout": True
            }
        except Exception as e:
            record_failure(tool_def.server_id)
            return {
                "error": f"MCP tool '{prefixed_name}' failed: {str(e)}",
                "server_error": True
            }
        
        # 5. Normalize result to unified format
        normalized = self._normalize_result(result)
        
        # 6. Cache for idempotency
        if idempotency_key and not normalized.get("error"):
            redis_client.setex(
                f"mcp_idem:{idempotency_key}",
                300,  # 5 min TTL
                json.dumps(normalized)
            )
        
        # 7. Audit log (Tier 3 equivalent — always)
        MCPToolExecutionLog.objects.create(
            team_id=self.team_id,
            session_id=self.session_id,
            server_name=tool_def.server_name,
            tool_name=prefixed_name,
            tool_input=tool_input,
            result_summary=str(normalized)[:500],
            latency_ms=int((time.monotonic() - start) * 1000),
            success=not bool(normalized.get("error"))
        )
        
        return normalized
    
    def _normalize_result(self, raw_result) -> dict:
        """
        MCP servers return varied result formats. Normalize to:
        { "content": [...], "isError": bool }
        """
        if isinstance(raw_result, dict):
            if "content" in raw_result:
                return raw_result  # Already MCP format
            return {"content": [{"type": "text", "text": json.dumps(raw_result)}], "isError": False}
        
        if isinstance(raw_result, str):
            return {"content": [{"type": "text", "text": raw_result}], "isError": False}
        
        return {"content": [{"type": "text", "text": str(raw_result)}], "isError": False}
```

---

## Step 4: Guardian Awareness of MCP Tools

Extend the Guardian's Tier 1 and Tier 2 rules to cover MCP tools. This requires the registry's risk metadata.

```python
# planning/guardian/tier1.py — MCP extension

def tier1_check_mcp(
    prefixed_name: str,
    tool_input: dict,
    context: GuardianContext
) -> GuardianResult:
    """
    Called before any MCP tool execution.
    Uses registry metadata — no hardcoded tool names needed.
    """
    registry = get_mcp_registry()
    tool_def = registry.get_tool(prefixed_name)
    
    if not tool_def:
        # Tool not in registry — block immediately
        return GuardianResult(
            approved=False,
            tier=1,
            reason=f"MCP tool '{prefixed_name}' is not registered for this team"
        )
    
    # Rule: Destructive tools require explicit human approval
    if tool_def.is_destructive and not context.human_approved_destructive:
        return GuardianResult(
            approved=False,
            tier=1,
            reason=f"MCP tool '{prefixed_name}' is classified as destructive — requires explicit approval"
        )
    
    # Rule: External writes require session-level permission
    if tool_def.is_external_write and not context.external_writes_enabled:
        return GuardianResult(
            approved=False,
            tier=1,
            reason=f"MCP tool '{prefixed_name}' writes externally — enable external writes for this session"
        )
    
    # Rule: Circuit breaker check (fast — Redis lookup)
    if not is_server_available(tool_def.server_id):
        return GuardianResult(
            approved=False,
            tier=1,
            reason=f"MCP server '{tool_def.server_name}' is unavailable"
        )
    
    return GuardianResult(approved=True, tier=1)


# In planning/guardian/tier2.py — extend TIER2_TRIGGER_TOOLS
# Instead of hardcoding MCP tool names, trigger Tier 2 by risk level:

def should_trigger_tier2(tool_name: str) -> bool:
    # Existing internal tool check
    if tool_name in TIER2_TRIGGER_TOOLS:
        return True
    
    # MCP tool check — use registry risk level
    if tool_name.startswith("mcp_"):
        registry = get_mcp_registry()
        tool_def = registry.get_tool(tool_name)
        if tool_def and tool_def.risk_level == "high":
            return True
    
    return False
```

Now the Guardian handles MCP tools without knowing their names in advance. Risk classification happens at registration time, not at runtime.

---

## Step 5: MCP Tools in the Crew Role Scoping

The Dynamic Crew Factory (Topic 4) scopes tools per role. MCP tools need to be included in this scoping — but dynamically, since MCP tools are team-specific.

The model: each `MCPServerRegistration` carries a `crew_role_policy` field that declares which crew roles can access that server's tools.

### Model Extension

```python
# integrations/models.py

class MCPServerRegistration(models.Model):
    # ... existing fields ...
    
    # New: which crew roles can use this server's tools
    # null = available to all roles (legacy behavior)
    # ["researcher", "integration_executor"] = only these roles
    allowed_crew_roles = models.JSONField(
        null=True,
        blank=True,
        help_text="Crew roles allowed to call this server's tools. Null = all roles."
    )
    
    # New: risk classification override (if auto-inference is wrong)
    risk_level_override = models.CharField(
        max_length=20,
        choices=[("low", "Low"), ("medium", "Medium"), ("high", "High")],
        null=True,
        blank=True
    )
```

### Scoping in the Crew Factory

```python
# chat/crew/tools.py — extended get_tools_for_role()

def get_tools_for_role(role: str, team_id: str) -> list:
    # Step 1: Internal tools for this role (existing logic)
    internal_tools = [
        tool for tool in ROLE_TOOL_MAP.get(role, [])
        if is_tool_available(tool, team_id)
    ]
    
    # Step 2: MCP tools scoped to this role
    mcp_tools = []
    registry = get_mcp_registry()
    
    for tool_def in registry.get_tools_for_team(team_id):
        server = MCPServerRegistration.objects.get(id=tool_def.server_id)
        
        allowed_roles = server.allowed_crew_roles
        
        if allowed_roles is None:
            # No restriction — available to all roles
            # But: high-risk MCP tools are never available to read-only roles
            if tool_def.risk_level == "high" and role in ["researcher", "analyst", "risk_critic"]:
                continue  # Read-only roles can't access high-risk MCP tools
            mcp_tools.append(tool_def.prefixed_name)
        
        elif role in allowed_roles:
            mcp_tools.append(tool_def.prefixed_name)
    
    return internal_tools + mcp_tools
```

### UI for Role Policy in Settings

The `/integrations` settings page should expose this:

```typescript
// frontend/components/settings/MCPServerCard.tsx

interface MCPServerPolicy {
  allowed_crew_roles: string[] | null;  // null = all roles
  risk_level_override: "low" | "medium" | "high" | null;
}

// In the MCP server card component:
<div className="mt-3 border-t border-border pt-3">
  <p className="text-xs font-medium text-muted-foreground mb-2">Crew Role Access</p>
  <div className="flex flex-wrap gap-1.5">
    {CREW_ROLES.map(role => (
      <button
        key={role}
        onClick={() => toggleRole(server.id, role)}
        className={cn(
          "px-2 py-0.5 rounded text-xs border transition-colors",
          isRoleAllowed(server, role)
            ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
            : "border-border text-muted-foreground"
        )}
      >
        {role.replace("_", " ")}
      </button>
    ))}
  </div>
  <p className="text-xs text-muted-foreground mt-1.5">
    {server.allowed_crew_roles === null
      ? "Available to all agent roles"
      : `Restricted to: ${server.allowed_crew_roles.join(", ")}`}
  </p>
</div>
```

---

## Step 6: MCP Tool Discovery in the Agent

When an agent is composing its tool list, it needs to know what MCP tools are available and what they do. The agent shouldn't have to guess.

```python
# chat/agents/agent_core.py — tool list construction

def build_tool_list(self, role: str) -> list[dict]:
    """
    Returns OpenAI-compatible tool definitions for the agent's system prompt.
    Includes internal, OAuth, and MCP tools scoped to this role.
    """
    tools = []
    
    # Internal tools
    for tool_name in get_tools_for_role(role, self.team_id):
        if not tool_name.startswith("mcp_"):
            tools.append(INTERNAL_TOOL_SCHEMAS[tool_name])
    
    # OAuth tools (existing)
    for tool_name in get_tools_for_role(role, self.team_id):
        if tool_name.startswith("ext_"):
            tools.append(OAUTH_TOOL_SCHEMAS[tool_name])
    
    # MCP tools — schema from registry
    registry = get_mcp_registry()
    for tool_name in get_tools_for_role(role, self.team_id):
        if tool_name.startswith("mcp_"):
            tool_def = registry.get_tool(tool_name)
            if tool_def and is_server_available(tool_def.server_id):
                tools.append({
                    "type": "function",
                    "function": {
                        "name": tool_def.prefixed_name,
                        "description": (
                            f"[MCP: {tool_def.server_name}] {tool_def.description}"
                        ),
                        "parameters": tool_def.parameters_schema
                    }
                })
    
    return tools
```

The `[MCP: server_name]` prefix in the description matters — it tells the agent (and the LLM) that this tool is external and may have latency or availability constraints.

---

## Step 7: MCP in the LangGraph Planning State

The planning engine (Topic 2) needs to know about MCP tool availability at graph construction time — not mid-run, where a server going down would be a surprise.

```python
# planning/agents/state.py — extended

class PlanningState(TypedDict):
    # ... existing fields ...
    
    # New: MCP server availability snapshot (taken at graph start)
    mcp_available_servers: list   # List of server names that were healthy at start
    mcp_tools_used: list          # Track which MCP tools were called during run
```

```python
# planning/agents/nodes.py — in the first node (research_node)

def research_node(state: PlanningState) -> dict:
    # Snapshot MCP availability at start of planning run
    # This prevents mid-run surprises from circuit state changes
    registry = get_mcp_registry()
    available_servers = [
        tool_def.server_name
        for tool_def in registry.get_tools_for_team(state["team_id"])
        if is_server_available(tool_def.server_id)
    ]
    
    return {
        "mcp_available_servers": available_servers,
        # ... rest of research output
    }
```

---

## Step 8: MCP-Aware Procedural Memory

MCP tools generate learnable patterns just like internal tools. The procedural memory system (Topic 5) should extract MCP-specific integration rules.

```python
# The retrospective task already extracts INTEGRATION_RULE type directives.
# Extend it to tag MCP tools explicitly:

def extract_mcp_patterns(episode: AgentEpisode, team_id: str):
    """
    Called when an episode used MCP tools.
    Extracts server-specific rules: timeouts, parameter quirks, failure modes.
    """
    mcp_tool_calls = [
        action for action in episode.tool_trace
        if action["tool"].startswith("mcp_")
    ]
    
    if not mcp_tool_calls:
        return
    
    # Group by server
    by_server = {}
    for call in mcp_tool_calls:
        server_name = call["tool"].split("_")[1]
        by_server.setdefault(server_name, []).append(call)
    
    for server_name, calls in by_server.items():
        failures = [c for c in calls if c.get("error")]
        timeouts = [c for c in calls if c.get("timeout")]
        
        if timeouts:
            ProceduralMemory.objects.get_or_create(
                team_id=team_id,
                directive_type=DirectiveType.INTEGRATION_RULE,
                domain=f"mcp_{server_name}",
                defaults={
                    "directive": f"MCP server '{server_name}' has experienced timeouts — add buffer time when planning tasks that depend on it",
                    "confidence": 0.75,
                    "applicable_intent_types": ["plan/create", "task/create"],
                    "extraction_method": "mcp_pattern_analysis"
                }
            )
```

---

## Database Changes

Additive only — no existing table modifications:

```python
# integrations/models.py

class MCPToolExecutionLog(models.Model):
    """Audit trail for all MCP tool calls. Mirrors ToolExecutionLog for OAuth tools."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    team = models.ForeignKey("accounts.Team", on_delete=models.CASCADE)
    session_id = models.CharField(max_length=255)
    server_name = models.CharField(max_length=100)
    tool_name = models.CharField(max_length=255)
    tool_input = models.JSONField()
    result_summary = models.TextField()
    latency_ms = models.IntegerField()
    success = models.BooleanField()
    circuit_state_at_call = models.CharField(max_length=20, null=True)
    idempotency_hit = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        indexes = [
            models.Index(fields=["team", "server_name", "timestamp"]),
            models.Index(fields=["tool_name", "success"]),
        ]


class MCPRegistrationEvent(models.Model):
    """Audit trail for server registration and validation events."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    server = models.ForeignKey("MCPServerRegistration", on_delete=models.CASCADE)
    event_type = models.CharField(max_length=50)
    details = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)
```

Migration for `MCPServerRegistration` additions:

```python
# In a new migration file
operations = [
    migrations.AddField(
        model_name="mcpserverregistration",
        name="allowed_crew_roles",
        field=models.JSONField(null=True, blank=True),
    ),
    migrations.AddField(
        model_name="mcpserverregistration",
        name="risk_level_override",
        field=models.CharField(max_length=20, null=True, blank=True),
    ),
]
```

---

## Files to Create / Modify

```
backend/
├── integrations/
│   ├── mcp/
│   │   ├── __init__.py              (new)
│   │   ├── registry.py              (new — MCPRegistry, MCPToolDefinition)
│   │   ├── executor.py              (new — MCPToolExecutor)
│   │   ├── health.py                (new — circuit breaker, health checks)
│   │   └── client.py                (modified — add timeout handling)
│   ├── models.py                    (modified — add MCPToolExecutionLog,
│   │                                             MCPRegistrationEvent,
│   │                                             allowed_crew_roles,
│   │                                             risk_level_override)
│   └── tasks.py                     (modified — add check_all_mcp_servers task)
├── planning/
│   └── guardian/
│       └── tier1.py                 (modified — add tier1_check_mcp())
│       └── tier2.py                 (modified — extend should_trigger_tier2())
├── chat/
│   ├── crew/
│   │   └── tools.py                 (modified — MCP tools in role scoping)
│   ├── agents/
│   │   └── agent_core.py            (modified — MCP in tool list construction)
│   └── tasks/
│       └── retrospective.py         (modified — extract_mcp_patterns())
├── planning/agents/
│   └── state.py                     (modified — mcp_available_servers field)
└── frontend/
    └── components/settings/
        └── MCPServerCard.tsx         (modified — role policy UI)
```

---

## LangSmith Observability for MCP

With `@traceable` on `MCPToolExecutor.execute()`, every MCP call appears in LangSmith as a child span of the agent run that called it. You'll immediately see:

- Which MCP tools are called and in which agent rounds
- Latency per server (which server is your bottleneck)
- Failure rate per tool (which tools are flaky)
- Circuit breaker trips correlated with agent failures

Create two saved views in LangSmith after deploying:

**MCP Health Dashboard:** Filter `run_type = "tool" AND name LIKE "mcp_%"` → track latency and failure rate per server name.

**Circuit Breaker Correlation:** Filter agent runs where `mcp_circuit_open = true` → see which user queries fail because of MCP server downtime.

---

## Performance Budget

| Operation | Overhead | Where |
|-----------|----------|-------|
| Registry lookup | < 1ms | In-memory dict |
| Circuit breaker check | < 2ms | Redis GET |
| Idempotency check | < 2ms | Redis GET |
| Health cache check | < 2ms | Redis GET |
| Tier 1 Guardian (MCP) | < 5ms | In-memory + Redis |
| Tier 2 Guardian (high-risk MCP) | 300–600ms | LLM call — once per session |
| Actual MCP tool execution | Varies (10ms–30s) | External network |

The infrastructure overhead per MCP call is under 10ms. The dominant cost is always the external MCP server, not the wrapper.

---

## Done Criteria

- All MCP tool calls appear in LangSmith as child spans with latency + outcome
- Schema validation rejects tools with shadowed names, missing descriptions, or malformed schemas at registration time — not at call time
- Circuit breaker opens after 3 consecutive failures and recovers automatically
- Guardian Tier 1 blocks destructive and external-write MCP tools without hardcoded tool names
- Crew role scoping includes MCP tools (high-risk tools excluded from read-only roles by default)
- `MCPToolExecutionLog` records every call with latency and success/failure
- Celery health check task runs every 5 minutes and updates circuit state
- `allowed_crew_roles` is configurable in the `/integrations` settings UI
- After 2 weeks, the retrospective task has produced at least one `INTEGRATION_RULE` directive tagged to an MCP server domain

**Time estimate: 2.5 weeks for one engineer, running in parallel with Topic 6.**

---

## Implementation Order Within This Topic

```
Days 1–3   → MCPRegistry with schema validation (Step 1)
Days 3–5   → Health check + circuit breaker (Step 2)
Days 5–8   → MCPToolExecutor with tracing + idempotency (Step 3)
Days 8–10  → Guardian Tier 1 + Tier 2 MCP extension (Step 4)
Days 10–13 → Crew role scoping + UI (Steps 5–6)
Days 13–16 → LangGraph state integration + procedural memory (Steps 7–8)
Day 17     → LangSmith dashboards, load testing, done criteria review
```

---

## How This Fits the Broader Upgrade Sequence

```
Week 1–2   → Topic 1: LangSmith tracing
Week 2–6   → Topic 2: LangGraph planning engine
Week 4–6   → Topic 3: Tiered Guardian Agent
Week 6–10  → Topic 4: Dynamic Crew Factory
Week 8–12  → Topic 5: Procedural memory (domain-tagged)
Week 10–14 → Topic 6: Hybrid intent classifier      ←── parallel
Week 10–14 → Topic 7: MCP tools upgrade (this doc)  ←── parallel
```

Topics 6 and 7 run in parallel. They share no code surface — Topic 6 touches `universal_stream.py` and `chat/intent/`, while Topic 7 touches `integrations/mcp/` and the Guardian. One engineer can own each track independently.

---

*MCP tools are only as good as the system that wraps them. Instrument, protect, scope, and learn from them — and they become a genuine force multiplier for every crew agent you build.*
