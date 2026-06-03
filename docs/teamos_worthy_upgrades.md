# TeamOS — Worthy 2028 Upgrades

> Only the changes that are actually worth building, in the order you should build them.

---

## Phase 1 — Foundation (Weeks 1–6)

### 1. Observability First: Agent Tracing
**What:** Integrate LangSmith (or equivalent) across your existing `AgentCore` and `universal_stream.py`.
**Why:** Every upgrade you plan becomes a guess without visibility into what your agents are doing in production. Trace every tool call, LLM call, routing decision, and reflection step.
**Scope:** Instrument existing code — no architecture change required.

---

### 2. LangGraph Migration: Planning Engine Only
**What:** Port the 6-stage planning pipeline into a LangGraph `StateGraph` with Postgres checkpointing.
**Why:** Your current linear pipeline in custom Django/Celery code cannot resume on failure, cannot be inspected mid-run, and is hard to extend. LangGraph gives you resumability, visualizable state, and human-in-the-loop breakpoints with minimal new concepts.
**Scope:** Replace the planning flow only. Leave `AgentCore` and all other flows untouched until this is stable.

```python
class TeamOSPlanState(TypedDict):
    messages: list
    plan_id: Optional[str]
    canvas_state: dict
    memory_refs: list
    guardrail_results: dict

graph = StateGraph(TeamOSPlanState)
graph.add_node("research", research_node)
graph.add_node("synthesize", synthesize_node)
# ... etc
```

---

### 3. Tiered Guardian Agent (Planning Mutations Only)
**What:** A dedicated safety review layer that sits between the planning engine and DB mutation.
**Why:** Your current heuristic + LLM reflection is shallow. A Guardian that catches hallucinated tasks, budget overruns, and permission violations before they hit the database is a reliability and enterprise-readiness win.

**Critical Design Rule — Latency Tiers:**
- **Tier 1 (sync, rule-based, <5ms):** Destructive operations, budget exceeded, out-of-scope tool calls → block immediately.
- **Tier 2 (async, LLM-based, 300–800ms):** High-risk mutations (delete project, send external message, execute code) → block and await.
- **Tier 3 (log-only):** Routine mutations → audit trail only, never delay.

Do not run LLM Guardian checks on every tool call. That will kill your streaming latency.

---

## Phase 2 — High-Value Agentic Upgrades (Weeks 6–16)

### 4. Dynamic Crew Factory
**What:** Replace your static 6-role specialist routing with a dynamic crew composition system.
**Why:** Your current routing hardcodes which agent handles which intent. Dynamic composition — where the orchestrator decides which sub-agent roles are needed based on intent schema — is the single biggest leverage point for handling complex, multi-domain tasks.

**How it works:**
1. Intent Classifier outputs structured schema: `{ "intent_type": "plan/create", "complexity": "high", "domains": ["product", "engineering"] }`
2. Crew Factory prompt selects needed roles (Researcher, StrategicPlanner, RiskCritic, CanvasIntegrator) and their tool access scopes.
3. LangGraph spawns sub-graphs per role, with agent-to-agent messaging.

**Start small:** Support dynamic crew composition for planning + research combos first. Extend from there.

---

### 5. Improved Procedural Memory Loop
**What:** Make your existing retrospective Celery task more granular — extract team-specific rules, task vocabulary, and risk patterns per project domain, not just general behavioral directives.
**Why:** Your current system extracts directives from failed/complex episodes and injects up to 20 into system prompts. The upgrade: tag directives by domain (`product_launch`, `engineering_sprint`) and inject only the relevant ones per intent. Reduces noise, increases precision.

**Scope:** Modify `AgentMemory` model to add a `domain` tag. Update the retrospective task to classify extracted rules before storing.

---

### 6. Hybrid Fast-Path Intent Classifier
**What:** Add embedding similarity (sentence-transformers or voyage-ai) as the primary classification layer, with LLM fallback only for ambiguous cases.
**Why:** Your current regex + occasional LLM classification is fast for simple cases but expensive for everything else. Embedding-based routing handles 80%+ of intents in <100ms with no LLM cost. LLM is reserved for genuinely ambiguous inputs.

**Output schema to target:**
```json
{
  "intent_type": "plan/create",
  "complexity": "high",
  "required_agents": ["planner", "risk_critic"],
  "domain": "product_launch"
}
```

**Scope:** FastAPI endpoint + Redis cache for common intent patterns.

---

## Phase 3 — Canvas & UI Evolution (Months 4–9)

### 7. Agent Avatars + Reasoning Traces on Canvas
**What:** Show active agents as visual indicators on canvas nodes with live status (thinking / executing / blocked). Add collapsible reasoning traces directly on relevant nodes.
**Why:** This makes your agents visible and legible. Users can see what the system is doing without switching to chat. It's a high-perceived-value feature with relatively contained implementation scope.
**Scope:** Canvas component changes only. Stream agent events via existing SSE to update node state.

---

### 8. Lightweight Floating Panel System
**What:** Allow any page (wiki, planning, graph, chat) to be popped into a floating panel that persists while navigating.
**Why:** This gives you 80% of the "spatial pods" value at 10% of the cost. A user working on a plan can pull up a wiki page without losing canvas context. No infinite canvas required — just Next.js parallel routes or a drawer system.
**Scope:** Frontend only. No backend changes.

---

### 9. Enhanced Canvas with React Flow (Upgraded, Not Replaced)
**What:** Upgrade your existing `/plan` canvas with React Flow custom nodes, better edge types, minimap, and multi-select grouping.
**Why:** Your canvas already exists. It needs to be better at handling complex plans visually — not replaced with a spatial operating system. Add AI auto-layout modes for plan graphs. Add node "status" indicators (at risk, blocked, complete).
**Scope:** Contained to the planning canvas component.

---

## What to Skip (And Why)

| Idea | Verdict |
|------|---------|
| Unified infinite canvas as primary interface | Too expensive, kills onboarding, premature |
| Temporal Knowledge Graph (Neo4j/Graphiti) | Vague — define 3 queries you can't answer now first |
| Full pod architecture replacing page router | Build floating panels instead, same value at 10% cost |
| Tldraw as primary canvas | Too early to bet on it; React Flow is sufficient |
| 3D/spatial with React Three Fiber | No user need for this yet |
| Multimodal voice input (Phase 1) | Build core reliability first |

---

## Implementation Order Summary

```
Week 1–2   → LangSmith tracing on existing system
Week 2–6   → LangGraph planning engine migration
Week 4–6   → Tiered Guardian Agent (planning mutations)
Week 6–10  → Dynamic Crew Factory (planning + research)
Week 8–12  → Improved procedural memory (domain-tagged directives)
Week 10–14 → Hybrid intent classifier (embedding-based fast path)
Month 4–6  → Agent avatars + reasoning traces on canvas
Month 5–7  → Floating panel system
Month 6–9  → React Flow canvas upgrade
Month 9+   → Reassess unified canvas based on user data
```

---

*Build on what works. Instrument before you redesign. Evolve the canvas, don't bet the product on it.*
