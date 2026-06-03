# Topic 3: Tiered Guardian Agent
**TeamOS Deep Dive Series — Phase 1, Weeks 4–6**

> A safety layer that doesn't slow you down is the hardest thing to build in agentic systems. Most teams either skip it (fragile) or over-build it (unusable). This is how to do it right.

---

## Why Your Current Reflection Is Not Enough

Your existing system has two reflection mechanisms:

**Heuristic reflection** (fast): Rule-based checks — quota errors, permission failures, timeouts → replan. This is good for operational errors but catches nothing semantic. It won't catch a hallucinated task with a dependency on a non-existent milestone.

**LLM reflection** (slow): Triggered for critical tools or after heuristic failure. This catches more but runs on every flagged case, adding 300–800ms per invocation. It also has no structured output — it's just "did the agent decide to continue or replan?"

Neither of these is a Guardian. They're reactive — they evaluate what just happened. A Guardian is **prospective** — it evaluates what's about to happen before it hits the database.

The gap: your agents can currently create dozens of tasks, assign members, update the knowledge graph, send Slack messages, and push to GitHub — all without any structured review of whether the overall plan is coherent, safe, or within scope.

---

## The Tiered Design (Non-Negotiable)

The most common mistake when building a Guardian is making it an LLM call on every action. That's how you add 10 seconds to every planning run. The solution is three tiers that route based on action risk, not convenience.

### Tier 1: Synchronous Rule-Based (< 5ms)
**What it checks:** Hard safety rules with no ambiguity. Binary pass/fail.
**When it runs:** Before every tool call, always.
**On failure:** Immediate block. No LLM call. Error returned to agent.

Rules in Tier 1:
- Is this a destructive mutation (delete project, delete tasks in bulk)?
- Does this exceed the team's token budget?
- Does this call a tool the user's plan tier doesn't allow?
- Is the target resource owned by this team? (prevents cross-team data access)
- Does the action require a permission level the acting agent doesn't have?
- Is this an external write (Slack message, GitHub issue, email) with `dry_run=False`?

```python
# planning/guardian/tier1.py

DESTRUCTIVE_TOOLS = {
    "plan_delete_project",
    "plan_bulk_delete_tasks", 
    "wiki_delete_page",
    "ext_github_delete_branch",
}

EXTERNAL_WRITE_TOOLS = {
    "ext_slack_send_message",
    "ext_github_create_issue",
    "ext_notion_create_page",
    "ext_linear_create_issue",
}

def tier1_check(tool_name: str, tool_input: dict, context: GuardianContext) -> GuardianResult:
    
    # Check 1: Destructive operations always require explicit human approval flag
    if tool_name in DESTRUCTIVE_TOOLS:
        if not context.human_approved_destructive:
            return GuardianResult(
                approved=False,
                tier=1,
                reason=f"{tool_name} is destructive and requires explicit user approval",
                latency_ms=0
            )
    
    # Check 2: Budget enforcement
    if context.token_usage_this_run > context.team_token_budget * 0.9:
        return GuardianResult(
            approved=False,
            tier=1,
            reason="Approaching token budget limit — aborting to prevent overage",
            latency_ms=0
        )
    
    # Check 3: Plan tier entitlement
    if tool_name.startswith("ext_") and not context.team_has_integrations:
        return GuardianResult(
            approved=False,
            tier=1,
            reason=f"Integration tools require Team or Pro plan",
            latency_ms=0
        )
    
    # Check 4: Cross-team resource access
    target_team = tool_input.get("team_id") or tool_input.get("project_team_id")
    if target_team and target_team != context.acting_team_id:
        return GuardianResult(
            approved=False,
            tier=1,
            reason="Cross-team resource access denied",
            latency_ms=0
        )
    
    # Check 5: External writes in non-dry-run mode
    if tool_name in EXTERNAL_WRITE_TOOLS and not tool_input.get("dry_run", False):
        if not context.external_writes_enabled:
            return GuardianResult(
                approved=False,
                tier=1,
                reason="External writes are disabled for this session",
                latency_ms=0
            )
    
    return GuardianResult(approved=True, tier=1)
```

---

### Tier 2: Asynchronous LLM-Based (300–800ms)
**What it checks:** Semantic coherence, hallucination detection, scope violations.
**When it runs:** Only for high-risk action categories. Not on every tool call.
**On failure:** Block + modify suggestion OR escalate to human.

High-risk categories that trigger Tier 2:
- Planning mutations (creating 10+ tasks, assigning members)
- Knowledge mutations (creating or overwriting wiki pages via ingest)
- Multi-step agent chains where intermediate steps are not human-visible
- Any action that references entities the Guardian can't verify exist in the database
- Actions that conflict with existing plan data (e.g., creating a task with a deadline before its dependency)

```python
# planning/guardian/tier2.py
from langsmith import traceable

TIER2_TRIGGER_TOOLS = {
    "plan_create_project",
    "plan_bulk_create_tasks",
    "plan_assign_members",
    "wiki_create_page",
    "ingest_materialize_changeset",
    "graph_bulk_add_edges",
}

GUARDIAN_PROMPT = """
You are TeamOS Guardian — a safety and coherence reviewer for an AI planning system.

## Current Action Under Review
Tool: {tool_name}
Input: {tool_input}

## Context
Team ID: {team_id}
Current project state: {project_summary}
Recent agent actions this session: {recent_actions}
Simulation results (if available): {simulation_results}

## Your Task
Review this action for:
1. Hallucinations — does the action reference entities that don't exist?
2. Scope violations — is this action outside the user's original intent?
3. Coherence — does this action conflict with existing data or previous actions?
4. Risk — what is the reversibility if this action is wrong?

## Output (JSON only, no preamble)
{{
  "approved": true/false,
  "risk_score": 0-100,
  "issues": ["issue1", "issue2"],
  "modifications": {{}},  // suggested changes if approved with modifications
  "reason": "one sentence explanation"
}}
"""

@traceable(name="guardian_tier2", run_type="chain")
def tier2_check(
    tool_name: str,
    tool_input: dict,
    context: GuardianContext
) -> GuardianResult:
    
    if tool_name not in TIER2_TRIGGER_TOOLS:
        return GuardianResult(approved=True, tier=2, skipped=True)
    
    prompt = GUARDIAN_PROMPT.format(
        tool_name=tool_name,
        tool_input=json.dumps(tool_input, indent=2),
        team_id=context.acting_team_id,
        project_summary=context.project_summary,
        recent_actions=json.dumps(context.recent_actions[-5:]),
        simulation_results=json.dumps(context.simulation_results or {})
    )
    
    response = llm_call(
        messages=[{"role": "user", "content": prompt}],
        operation="guardian_review",
        priority="high",
        max_tokens=500
    )
    
    result = json.loads(response)
    
    return GuardianResult(
        approved=result["approved"],
        tier=2,
        risk_score=result["risk_score"],
        issues=result["issues"],
        modifications=result.get("modifications"),
        reason=result["reason"]
    )
```

---

### Tier 3: Audit Log Only (0ms overhead)
**What it checks:** Nothing — it approves immediately but creates a full audit record.
**When it runs:** All routine mutations — read operations, low-risk writes, single task updates.
**Purpose:** Forensics. If something goes wrong, you can trace every action back.

```python
# planning/guardian/tier3.py

def tier3_log(
    tool_name: str,
    tool_input: dict,
    tool_result: dict,
    context: GuardianContext
) -> None:
    """
    Called AFTER tool execution (not before).
    Never blocks. Pure audit trail.
    """
    GuardianAuditLog.objects.create(
        team_id=context.acting_team_id,
        session_id=context.session_id,
        tool_name=tool_name,
        tool_input=tool_input,
        tool_result=tool_result,
        tier=3,
        approved=True,
        agent_round=context.current_round,
        timestamp=timezone.now()
    )
```

---

## The Guardian Orchestrator

One entry point that routes to the right tier:

```python
# planning/guardian/__init__.py

class Guardian:
    
    def __init__(self, context: GuardianContext):
        self.context = context
    
    def pre_execution_check(
        self,
        tool_name: str,
        tool_input: dict
    ) -> GuardianResult:
        """Called before every tool execution."""
        
        start = time.monotonic()
        
        # Always run Tier 1 (< 5ms, no exceptions)
        t1_result = tier1_check(tool_name, tool_input, self.context)
        if not t1_result.approved:
            self._log(tool_name, tool_input, t1_result)
            return t1_result
        
        # Run Tier 2 only for high-risk tools
        if tool_name in TIER2_TRIGGER_TOOLS:
            t2_result = tier2_check(tool_name, tool_input, self.context)
            if not t2_result.approved:
                self._log(tool_name, tool_input, t2_result)
                return t2_result
            
            # If modifications suggested, return them for agent to apply
            if t2_result.modifications:
                return t2_result
        
        return GuardianResult(approved=True, latency_ms=int((time.monotonic() - start) * 1000))
    
    def post_execution_log(
        self,
        tool_name: str,
        tool_input: dict,
        tool_result: dict
    ) -> None:
        """Called after every tool execution for Tier 3 audit."""
        
        if tool_name not in TIER2_TRIGGER_TOOLS:
            tier3_log(tool_name, tool_input, tool_result, self.context)
    
    def _log(self, tool_name, tool_input, result):
        GuardianAuditLog.objects.create(
            team_id=self.context.acting_team_id,
            tool_name=tool_name,
            tool_input=tool_input,
            tier=result.tier,
            approved=result.approved,
            risk_score=result.risk_score,
            reason=result.reason,
            timestamp=timezone.now()
        )
```

---

## Integration into AgentCore

```python
# chat/agents/agent_core.py

class AgentCore:
    
    def _execute_tool_with_guardian(
        self,
        tool_name: str,
        tool_input: dict,
        round_num: int
    ) -> dict:
        
        guardian = Guardian(
            context=GuardianContext(
                acting_team_id=self.team_id,
                session_id=self.session_id,
                token_usage_this_run=self.token_usage,
                team_token_budget=self.team.token_budget,
                team_has_integrations=self.team.plan in ["team", "pro", "enterprise"],
                external_writes_enabled=self.session.external_writes_enabled,
                project_summary=self.get_project_summary(),
                recent_actions=self.action_history,
                simulation_results=self.simulation_results,
                human_approved_destructive=self.session.human_approved_destructive,
                current_round=round_num
            )
        )
        
        # Pre-execution check
        check = guardian.pre_execution_check(tool_name, tool_input)
        
        if not check.approved:
            # Stream guardian rejection to frontend
            self._stream_event({
                "type": "guardian_block",
                "tool": tool_name,
                "reason": check.reason,
                "tier": check.tier
            })
            
            # Return structured error for agent to handle
            return {"error": f"Guardian blocked: {check.reason}", "blocked": True}
        
        # Apply guardian modifications if any
        if check.modifications:
            tool_input = {**tool_input, **check.modifications}
            self._stream_event({
                "type": "guardian_modification",
                "tool": tool_name,
                "modifications": check.modifications
            })
        
        # Execute tool
        result = self.tool_registry.execute(tool_name, tool_input)
        
        # Post-execution audit
        guardian.post_execution_log(tool_name, tool_input, result)
        
        return result
```

---

## The Guardian Context Object

```python
# planning/guardian/context.py
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class GuardianContext:
    acting_team_id: str
    session_id: str
    token_usage_this_run: int
    team_token_budget: int
    team_has_integrations: bool
    external_writes_enabled: bool
    human_approved_destructive: bool
    current_round: int
    project_summary: dict = field(default_factory=dict)
    recent_actions: list = field(default_factory=list)
    simulation_results: Optional[dict] = None
```

---

## Database Schema

```python
# planning/models.py (addition)

class GuardianAuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    team = models.ForeignKey("accounts.Team", on_delete=models.CASCADE)
    session_id = models.CharField(max_length=255)
    tool_name = models.CharField(max_length=255)
    tool_input = models.JSONField()
    tool_result = models.JSONField(null=True)
    tier = models.IntegerField()                     # 1, 2, or 3
    approved = models.BooleanField()
    risk_score = models.FloatField(null=True)
    reason = models.TextField(null=True)
    agent_round = models.IntegerField(null=True)
    latency_ms = models.IntegerField(null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        indexes = [
            models.Index(fields=["team", "timestamp"]),
            models.Index(fields=["tool_name", "approved"]),
            models.Index(fields=["session_id"]),
        ]
```

---

## Frontend: Guardian Events in the UI

When the Guardian blocks or modifies an action, stream it to the frontend so users can see why an agent stopped:

```typescript
// frontend/components/chat/AgentStream.tsx

interface GuardianEvent {
  type: "guardian_block" | "guardian_modification";
  tool: string;
  reason: string;
  tier: 1 | 2 | 3;
}

function GuardianBlock({ event }: { event: GuardianEvent }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
      <ShieldIcon className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-orange-400">Guardian blocked action</p>
        <p className="text-xs text-muted-foreground mt-1">
          <span className="font-mono">{event.tool}</span> — {event.reason}
        </p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">Tier {event.tier} check</p>
      </div>
    </div>
  );
}
```

---

## What the Guardian Catches That Nothing Else Does

Real examples from production agentic systems that a Guardian would prevent:

**Case 1 — Hallucinated member assignment**
Agent creates 12 tasks and assigns them to `user_id: "abc123"` — a user who left the team 3 months ago. Your current system has no check for this. Tier 1 catches it: cross-team/inactive member validation.

**Case 2 — Scope creep**
User asks "create a plan for our Q3 launch" — agent decides it should also restructure the entire wiki knowledge graph and create 8 new knowledge domains. Tier 2 catches it: "action is outside the scope of the user's original intent."

**Case 3 — Dependency temporal violation**
Agent creates Task B with `depends_on: [Task A]` but schedules Task B to start before Task A ends. Your simulation catches this, but if simulation is skipped, Tier 1 or Tier 2 catches it.

**Case 4 — External message sent without user awareness**
Agent decides to send a Slack notification to the #general channel about a new project. User didn't ask for this. Tier 1: external writes blocked unless explicitly enabled per session.

---

## Performance Budget

| Scenario | Tier 1 | Tier 2 | Total Guardian Overhead |
|----------|--------|--------|------------------------|
| Read operation | < 1ms | skipped | < 1ms |
| Low-risk write | < 1ms | skipped | < 1ms |
| Bulk task creation | < 1ms | 300–500ms | 300–500ms (once per plan) |
| External write | < 1ms | skipped (Tier 1 handles) | < 1ms |
| Delete operation | < 1ms | skipped (blocked by Tier 1) | < 1ms |

Tier 2 runs at most once per planning session, not per tool call. This is the critical design choice.

---

## Done Criteria

- Every tool call passes through Tier 1 with < 5ms overhead verified in LangSmith
- Tier 2 triggers only for the defined high-risk tool set
- GuardianAuditLog records every action with tier and outcome
- Guardian blocks appear in the frontend chat stream as styled events
- At least 5 Tier 1 rules are tested with unit tests
- Tier 2 prompt is tested against 10 real planning runs captured from LangSmith

**Time estimate: 2 weeks for one engineer, running parallel to LangGraph migration.**

---

*Next: Topic 4 — Dynamic Crew Factory*
