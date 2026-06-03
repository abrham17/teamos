# Multi-Agent Orchestration: From Current State to the Upgraded System
**TeamOS — Full Orchestration Upgrade Plan**

> This document maps the complete journey of the multi-agent system from where it is today to where it needs to be. It covers every layer: the agent loop, routing, crew composition, supervision, memory, safety, and observability. Read it in order — each phase depends on the one before it.

---

## Part 0: Where the System Is Today

Before planning the upgrade, it's essential to be precise about what exists and what the actual failure modes are. The current system is not broken — it's a working single-orchestrator architecture that has hit a structural ceiling.

### What Exists Now

The current multi-agent system is built around a single orchestrator model. Every user message enters through `universal_stream.py`, gets classified by a regex-plus-LLM classifier, retrieves context via RAG, and is routed to one of six fixed specialist agents. That specialist runs inside `AgentCore` for up to 10 rounds with access to all 53 tools. Reflection happens after each round — first heuristic (rule-based), then LLM-based if heuristics don't resolve the situation. Episodic memory is stored and retrieved via pgvector. A retrospective Celery task extracts behavioral directives from failed and complex episodes and injects up to 20 flat directives into future system prompts.

The six specialists are: Lightweight (fast RAG, no tools), Wiki Agent, Plan Agent, Strategic Planner (the 6-stage pipeline), Research Agent (web search + ingest), and Analyst. Each is a configuration of `AgentCore` with a different system prompt and tool subset.

### The Structural Ceiling

**The routing ceiling.** One specialist is selected per message. A complex request that genuinely needs the Research Agent to gather external context, the Wiki Agent to cross-reference internal knowledge, the Strategic Planner to build a plan from both, and the Risk Critic to evaluate feasibility — that request gets one agent. The selected agent either has the wrong tools, the wrong context, or both.

**The execution ceiling.** `AgentCore` runs up to 10 rounds with a ThreadPool for parallelism. This works for simple multi-tool sequences but breaks down on long-horizon, multi-domain tasks. The ThreadPool has no graph structure — there's no way to express "run A and B in parallel, then run C only after both finish, then run D only if C succeeds." Everything is a sequential loop with occasional parallel tool calls.

**The safety ceiling.** Reflection is reactive — it evaluates what just happened. There is no prospective safety layer that reviews what is about to happen before it touches the database. Destructive operations, out-of-scope actions, and hallucinated entity references all pass through unchecked until after execution.

**The memory ceiling.** Behavioral directives are flat: up to 20 generic strings injected into every system prompt regardless of domain or intent. A directive about engineering sprint planning contaminates a marketing content session. There's no success learning — the system only learns from failures and struggles.

**The observability ceiling.** The current system is a production black box. You can read logs. You cannot see, in one place, what every LLM call cost, which tool call triggered a replan, why the specialist routing picked the wrong agent, or what the episodic memory lookup actually returned. Without this visibility, every upgrade is a guess.

### What Needs to Change — and in What Order

The upgrade has four distinct phases. Each phase depends on the previous one being stable in production. Skipping phases does not save time — it creates debugging situations that cost more time than the phase would have.

```
Phase 0 (Now)         → Existing single-orchestrator system
Phase 1 (Weeks 1–6)   → Instrument, then restructure the planning engine
Phase 2 (Weeks 6–16)  → Upgrade the orchestration layer to dynamic crews
Phase 3 (Months 4–9)  → Evolve the interface to match the new intelligence
Phase 4 (Ongoing)     → Measure, learn, and close the gaps
```

---

## Part 1: Phase 1 — The Foundation You Cannot Skip

### 1.1 Observability First (Weeks 1–2)

Nothing in the multi-agent upgrade will produce reliable results without visibility into what's actually happening in production. This is not optional infrastructure — it is the prerequisite for every diagnostic decision you will make for the next 12 months.

Every LLM call needs to be a traceable span: which model, how many tokens, how long, whether the semantic cache hit, and what operation type triggered it. Every tool call needs to be a child span of the agent run that called it: which tool, which round, which agent, what the input was, whether it succeeded or triggered retry. The full agent execution — from intent classification through specialist routing through every AgentCore round through episodic memory storage — needs to be a single trace you can click on in LangSmith and see as a waterfall.

The specific things you will learn in the first week of having this data that you cannot know without it:

You will learn which specialist agent fails most. The Strategic Planner on complex multi-domain intents is the likely answer, but you need the data before making architectural bets. You will learn how often LLM reflection fires versus heuristic reflection — if LLM reflection triggers on more than 30% of rounds, your heuristics are insufficient and you're paying for LLM calls that should be free rule-checks. You will learn your actual cost per planning run, which is almost certainly higher than your estimate. You will learn whether your episodic memory lookup is returning relevant episodes — low cosine similarity scores mean your embeddings aren't matching well enough to be useful.

Every phase of the upgrade described below will produce new behavior. Without LangSmith traces, you cannot tell whether that behavior is what you intended. With traces, a misconfigured node in the LangGraph planning graph is visible in 30 seconds. Without them, it's a 2-hour debugging session.

The instrumentation itself requires no architectural changes. It's pure decoration on existing code — a wrapper on `llm_call()`, wrappers on `AgentCore.run()` and `_execute_tool()`, wrappers on the five stages of `universal_stream.py`, wrappers on episodic memory read and write. Five days of work, zero migrations, zero API changes.

### 1.2 LangGraph Migration — Planning Engine Only (Weeks 2–6)

The Strategic Planner is the most complex, most expensive, and most fragile part of the system. It's also the most valuable to fix first because it's where multi-agent orchestration begins. The 6-stage pipeline is currently a linear function: research → synthesize → decompose → critique → finalize → DB mutation. If it crashes at stage 4 after 3 minutes of LLM calls, the entire run is lost. There is no way to resume it, inspect its mid-run state, add a human approval breakpoint, or extend it without touching the same linear function that everything else depends on.

LangGraph replaces this linear function with a graph: nodes for each stage, typed state that flows between them, a Postgres checkpointer that saves full state at every node transition, and native parallelism for the two concurrent strategy generations (fast-track and risk-mitigated). The logic inside each stage is unchanged — you are wrapping, not rewriting.

The four capabilities this adds that the current system cannot provide:

**Resumability.** A planning run that fails at stage 4 resumes from stage 4 on retry. Stages 1 through 3 are not re-run. This is not a performance optimization — it's a correctness guarantee. Users who experience a failure shouldn't pay for the same LLM calls twice.

**Human-in-the-loop breakpoints.** The graph can pause at a defined node and wait for human input before continuing. This is where the plan approval workflow belongs: the system generates a plan, pauses, presents it to the user, waits for approval or modification, and only then proceeds to the database mutation stage. This is currently impossible — the pipeline either runs to completion or it doesn't.

**The simulation node.** A pre-mutation simulation stage that runs a dry-run of the plan against the current team state — checking dependency conflicts, resource overloads, and timeline feasibility — before any database writes happen. This is a new capability enabled by the graph structure. It's not possible in a linear pipeline because there's no clean place to insert it between finalization and mutation.

**Extensibility.** Adding a new stage to the planning pipeline no longer means modifying a linear function that everything else in the planning app touches. It means adding a node to a graph and an edge connecting it. New stages don't break existing stages.

The migration uses a feature flag: the LangGraph path runs only for Pro and Enterprise teams initially, the legacy path continues for all others. This is the only safe way to deploy a change this significant. Monitor in LangSmith. Roll out to all teams when stable.

### 1.3 The Tiered Guardian Agent (Weeks 4–6, parallel to LangGraph)

The Guardian is a prospective safety layer — it reviews what the agent is about to do before it does it. The current reflection system reviews what just happened. These are different problems.

The Guardian has three tiers, and the tier design is non-negotiable. Getting this wrong means either a system that blocks too much (kills streaming latency, destroys user experience) or blocks too little (hallucinated entities in the database, external messages sent without user awareness, destructive operations run without approval).

Tier 1 runs synchronously, before every tool call, in under 5 milliseconds. It is purely rule-based. It checks: is this operation destructive? Does it exceed the token budget? Does it access a resource owned by a different team? Does it make an external write (Slack, GitHub, email) when external writes haven't been explicitly enabled for this session? Does it call an integration tool that the team's plan tier doesn't allow? All of these checks are binary and have no ambiguity. If any fails, the tool call is blocked immediately with no LLM call.

Tier 2 runs asynchronously, only for high-risk mutations, in 300 to 800 milliseconds. It makes a single LLM call to evaluate semantic coherence: does this action reference entities that don't exist in the database? Is this action outside the scope of the user's original request? Does this action conflict with data that was already committed in a previous step? Tier 2 triggers only for a defined set of high-risk mutations — bulk task creation, member assignment, wiki page creation via ingest, bulk graph edge addition. It does not trigger on every tool call. Running Tier 2 on every call would add 500 milliseconds to every single round of the agent loop.

Tier 3 is post-execution audit only. It logs every tool call — the tool name, the input, the result, the round number, the tier that reviewed it — to a `GuardianAuditLog` table. It never delays or blocks anything. Its purpose is forensics: when something goes wrong in production, you can trace every action the agent took, in order, with full inputs and outputs.

The critical design insight: Tier 2 runs at most once per planning session. Not once per tool call. The bulk task creation event is the single most consequential mutation in the planning pipeline. The Guardian evaluates it once, deeply, before it happens. Everything else gets Tier 1 rule-checks and Tier 3 logging.

---

## Part 2: Phase 2 — The Orchestration Upgrade

Phase 1 gives you a stable, observable, resumable planning engine with a safety layer. Phase 2 upgrades the entire orchestration architecture from single-agent-per-message to dynamic multi-agent crews. This is the structural leap.

### 2.1 The Intent Schema — The Foundation of Dynamic Routing

The current classifier produces one output: which specialist to route to. The upgraded classifier produces a rich structured schema: the intent type (what the user wants to do), the complexity level (low, medium, high, very high), the domains involved (product, engineering, marketing, research), the required capabilities (web search, plan creation, wiki write, risk analysis), whether the task is parallelizable, how many agent rounds it's estimated to need, and whether external integrations are required.

This schema is the foundation of everything else in Phase 2. The crew factory reads it to decide which agents to spawn. The routing decision reads it to decide whether to use a single agent or a crew. The procedural memory injection reads it to decide which domain-specific directives are relevant. Without the richer schema, none of the downstream upgrades work.

The schema is produced by a three-layer hybrid classifier. The first layer is an exact-match Redis cache — if this exact message has been classified for this team in the last 4 hours, return the cached result immediately with no computation. The second layer is an embedding similarity classifier: a small, fast sentence-transformer model that encodes the message and finds the closest match in a curated set of labeled examples. If the similarity score is above a confidence threshold, return that classification. The third layer is the existing LLM classifier, now used only when the first two layers don't have a confident answer.

The target distribution is 15 to 25% of messages handled by the cache, 60 to 70% handled by the embedding layer, and only 10 to 20% requiring an LLM call. This cuts classification latency from the current average of several hundred milliseconds to roughly 60 milliseconds — and cuts the LLM cost of classification by 80%.

The embedding index grows over time. Every message that falls through to the LLM classifier adds a new labeled example to the index if the downstream agent succeeds. The index becomes more accurate as the system processes more messages. After 4 to 6 weeks of real usage, the embedding layer's coverage of team-specific message patterns reaches 90% or better.

### 2.2 The Dynamic Crew Factory — The Core Orchestration Upgrade

The current system routes to one specialist. The Dynamic Crew Factory asks a different question: given this intent schema, what combination of agents does this task actually need?

The factory has three components that work in sequence.

The first is the Crew Composer: a single LLM call that takes the intent schema and a catalog of available agent roles and returns a crew specification — which roles are needed, which run in parallel, which are sequential and depend on others, and what focused instructions each role receives. The Crew Composer follows explicit constraints: select the minimum roles that cover the required capabilities, never add roles speculatively, use at most 2 roles for low and medium complexity, use 3 to 5 for high and very high complexity, always include a risk critic when the strategic planner is present.

The seven roles in the catalog are: Researcher (web search, wiki retrieval, graph traversal), Strategic Planner (6-stage pipeline, project and milestone creation), Task Manager (task creation, assignment, dependency management), Risk Critic (risk assessment, feasibility evaluation), Wiki Writer (knowledge base creation and updates), Integration Executor (external tool calls: GitHub, Slack, Jira, Linear, Notion), and Analyst (data analysis, metrics, memory retrieval). Each role has a defined tool scope — a subset of the full 53-tool catalog. An agent in a role cannot call tools outside its scope, even if those tools exist in the system.

The second component is the Crew Graph: a LangGraph StateGraph dynamically constructed at runtime based on the crew specification. Each agent role becomes a node. Parallel agents are connected with LangGraph's `Send()` fan-out primitive. Sequential agents are connected with conditional edges that wait for their dependencies. The supervisor is always present as the coordinating node.

The third component is the Supervisor Node: an LLM call that runs between agent completions. The supervisor does not execute tools — it coordinates. It takes the outputs from completed agents, synthesizes them, resolves conflicts, and decides what the next sequential agent should receive as context. When all agents finish, it produces the final synthesized output. The supervisor's instructions are set by the Crew Composer at graph construction time — each crew has a custom supervisor instruction tailored to the specific combination of agents and the user's intent.

### 2.3 How the Single-Agent and Crew Paths Coexist

Not every request needs a crew. The majority of user messages are simple: a single task creation, a wiki lookup, a status check, a quick calculation. Routing these through the crew factory would add latency and cost for no benefit.

The routing decision is based entirely on the intent schema. If the complexity is low or medium and the number of required capabilities is two or fewer, the system routes to a single agent using the existing specialist routing logic — no crew, no composer call, no graph construction. The request goes through the existing `AgentCore` path as it does today.

If the complexity is high or very high, or the number of required capabilities exceeds two, the system routes to the crew factory. The factory composes the crew, builds the graph, and streams execution.

This means the crew system never touches the vast majority of user interactions. A user who spends their day asking quick questions and creating single tasks will never see the crew system. A user who asks for a comprehensive competitive analysis that feeds into a 90-day strategic plan will get a full crew. The interface for both feels natural — the complexity of the execution is proportional to the complexity of the request.

### 2.4 Tool Scoping and Safety Across the Crew

When multiple agents are running in a crew, tool scoping is not optional — it's the mechanism that prevents agents from doing things they shouldn't. The Role Tool Map defines exactly which tools each role can access. The researcher cannot create tasks. The task manager cannot make external API calls. The risk critic cannot modify the wiki. The integration executor cannot create projects.

This containment model has two benefits. The safety benefit: a hallucination in the researcher's output cannot cause a database write, because the researcher doesn't have write tools. The LLM benefit: an agent with 8 relevant tools produces better outputs than an agent with 53 tools, because the LLM spends less context budget on irrelevant tool descriptions.

MCP tools (custom external servers registered per team) are integrated into this scoping system via a role policy on each server registration. Owners can declare which crew roles are allowed to call that server's tools. High-risk MCP tools (inferred by name and description heuristics at registration time) are excluded from read-only roles by default, regardless of the policy setting.

The Guardian runs on every crew agent's tool calls just as it would on a single agent's calls. Tier 1 rule checks happen before every tool call across all agents in the crew. Tier 2 LLM checks trigger for high-risk mutations — once per planning session regardless of which agent triggers them. The Guardian's context includes the outputs of all agents that have already completed, so it can evaluate whether a proposed mutation is coherent with what the rest of the crew has already done.

### 2.5 The Improved Procedural Memory Loop

The memory system upgrade runs in parallel with the crew factory and addresses the three gaps in the current retrospective learning system.

The first gap is flat directives. The upgrade replaces the generic behavioral directive store with a typed, domain-tagged `ProceduralMemory` model. Every directive has a type (planning heuristic, integration rule, communication style, risk pattern, workflow preference, vocabulary definition, failure pattern, success pattern), a domain (engineering sprint, product launch, marketing campaign, etc.), and a list of intent types it applies to. When the agent builds a system prompt, it queries for directives that match the current domain and intent type — not the full flat list.

The second gap is failure-only learning. The upgraded retrospective task analyzes both failures and highly successful episodes. A successful planning run for an engineering sprint produces just as much signal about what works for this team as a failed one. Success patterns — the approaches and task structures that produced high-quality outcomes — are extracted, stored, and injected into future runs in the same domain.

The third gap is directive quality decay. Directives that are contradicted by subsequent episodes lose confidence. Directives that are unused for 30 days decay slowly. Directives that are confirmed across 5 or more episodes with high confidence become permanent. A nightly Celery maintenance task prunes expired, contradicted, and low-confidence directives and promotes high-value ones.

The result after 30 days of real usage is a team-specific knowledge system that the agents draw on for every run. The vocabulary the team uses. The buffer factors that work for their velocity. The assignment patterns that have historically led to conflicts. The milestone structures that have high completion rates. None of this is hardcoded — it emerges from the team's actual behavior.

---

## Part 3: Phase 3 — Interface Evolution

The backend upgrades make the system significantly more capable. The interface upgrades make that capability visible and trustworthy.

### 3.1 Making the Intent Legible

The first moment of every interaction — the moment after the user sends a message and before the agent starts working — should communicate that the system understood the request correctly. The intent card appears immediately after submission, showing what the system interpreted the request to mean, whether it's routing to a single agent or composing a crew, and what that crew looks like.

This acknowledgment layer does something important beyond user experience: it creates a correction opportunity. If the system misclassified a complex multi-domain request as a simple lookup, the user can correct it before the wrong agent runs. The cost of a misclassification drops from "wait 30 seconds for the wrong output, re-prompt, wait again" to "tap the intent to fix it, proceed with the right routing."

### 3.2 Making the Crew Visible

When a crew is running, users see a live panel in the chat interface showing each agent's current status. Not a spinner — a named, role-labeled row with a status (queued, thinking, executing, done) and a plain-language description of the current action. The researcher is "searching for competitor pricing data." The strategic planner is "building a 90-day milestone structure." The risk critic is "evaluating resource allocation."

Inter-agent messages — when the supervisor passes context from one agent to another — appear as brief connecting annotations between agent rows. "Researcher found 3 pricing tiers; Planner should account for discount structure in Q4 milestone." This makes the coordination between agents visible without requiring users to read raw JSON.

### 3.3 Making the Canvas Alive

The planning canvas gains agent awareness. When an agent is actively working on a canvas node — creating tasks within a project, evaluating a milestone for risk, connecting wiki documentation — that node shows a pulsing status indicator with the agent's role color. Users watching the planning engine run see nodes appearing, connecting, and settling in real time.

Every node created or modified by an agent carries a reasoning trace: why this node was created, what alternatives were considered, and if the risk critic flagged it, what the concern was and how it was resolved. Dependency reasoning is especially valuable here — the logic behind "Task B must follow Task A" is currently invisible and frequently wrong. Making it visible gives users the information they need to correct it.

The plan diff view and human approval experience belong here too. When the LangGraph pipeline pauses for human review, the canvas enters diff mode: new nodes in one color, modified nodes with before/after comparison, deleted nodes with strike-through. The approval UI shows the full plan structure, the simulation's risk score, any unresolved Guardian flags, and two clear choices: approve and commit, or stay in the canvas and modify.

---

## Part 4: The Full State Transition — Current System to Upgraded System

This section maps every component of the multi-agent architecture from its current state to its upgraded state. It is the reference document for understanding what changes and what stays the same.

### Intent Classification

**Current state:** Regex patterns covering common messages. LLM call for anything that doesn't match. Output is a single specialist label.

**Upgraded state:** Three-layer hybrid classifier. Redis cache layer (< 1ms), embedding similarity layer (30–80ms), LLM fallback (400–900ms). Output is a full IntentSchema: type, complexity, domains, required capabilities, parallelizability, estimated rounds, external dependency flag. LLM fires on fewer than 20% of messages after 2 weeks of operation.

**What stays the same:** The LLM classification prompt logic, the specialist label mapping, the integration with `universal_stream.py`.

**What changes:** Everything around the LLM call — the fast path that routes most messages without it, the structured output schema, the Redis cache, the embedding index.

---

### Specialist Routing

**Current state:** Static map from intent label to one of six fixed specialists. One specialist per message, always.

**Upgraded state:** Conditional routing based on the IntentSchema. Low complexity, fewer than 2 required capabilities: single specialist path (unchanged from current). High complexity or more than 2 required capabilities: crew factory path. The six static specialists still exist and handle the majority of traffic.

**What stays the same:** The six specialist configurations (Lightweight, Wiki Agent, Plan Agent, Strategic Planner, Research Agent, Analyst), their system prompts, their tool assignments, the single-agent `AgentCore` path.

**What changes:** The routing condition. The crew factory path for complex intents.

---

### Agent Execution Loop (AgentCore)

**Current state:** Single `AgentCore` instance per message. Up to 10 rounds. ThreadPool for parallel tool calls (4 workers). Heuristic then LLM reflection after each round. Full tool list (all 53 tools) available to every agent. No scoping.

**Upgraded state (single-agent path):** Unchanged for simple queries. Same `AgentCore`, same round limit, same reflection logic.

**Upgraded state (crew path):** Multiple `AgentCore` instances, one per crew role. Each instance has a maximum of 6 rounds (lower per-agent limit). Each instance has a scoped tool list (8 to 12 tools depending on role). Instances run in parallel or sequential order as defined by the crew graph. The Guardian wraps every tool call in every instance.

**What stays the same:** The core `AgentCore` loop logic, the reflection mechanisms, the tool execution infrastructure, the idempotency key system.

**What changes:** Tool scoping per role, the Guardian wrapper on tool calls, the maximum round limit for crew agents, the parallel execution model (LangGraph `Send()` instead of ThreadPool).

---

### The Planning Engine (6-Stage Pipeline)

**Current state:** Linear function. Research → Synthesize → Decompose (two parallel via ThreadPool) → Critique → Finalize → DB Mutation. No checkpointing. No resumability. No simulation stage. No human approval breakpoint. Cannot be extended without modifying the linear function.

**Upgraded state:** LangGraph StateGraph. Same 6 stages as nodes. Plus two new nodes: Simulation (pre-mutation dry-run) and Human Review (approval breakpoint). Postgres checkpointing at every node transition. Native parallelism via `Send()` for the two strategy generations. Feature-flagged per plan tier (Pro and Enterprise first, then all).

**What stays the same:** The logic inside each stage. The research prompts, the synthesis logic, the critique scoring, the finalization and dependency inference, the DB mutation transaction. None of this changes — it moves into node functions.

**What changes:** The execution model (graph instead of linear function), resumability on failure, the simulation stage, the human approval breakpoint, the Postgres checkpoint tables.

---

### Reflection and Self-Correction

**Current state:** Two-level reflection after each round. Heuristic: rule-based checks on tool results (quota errors → replan, timeouts → retry once, not found → retry with different params). LLM: fast LLM call for critical tools or heuristic failures, evaluates outcome and decides continue/retry/replan. Retrospective Celery task analyzes failed/complex episodes and extracts up to 20 flat directives.

**Upgraded state:** Same two-level reflection, unchanged. Extended with crew-level supervisor synthesis between agent completions. Guardian pre-execution checks on every tool call. Retrospective task extended with success pattern extraction and domain tagging.

**What stays the same:** Heuristic reflection rules, LLM reflection logic, Celery task scheduling.

**What changes:** The retrospective task output structure (domain-tagged, typed `ProceduralMemory` instead of flat directives), the addition of success pattern analysis, the nightly directive quality maintenance task.

---

### Memory System

**Current state:** Three components. Episodic Memory (`AgentEpisode` with pgvector embeddings, recalled via cosine similarity). Working Memory (`AgentMemory` key-value with TTL). Behavioral Directives (flat list, up to 20, extracted by Celery retrospective task, injected into all system prompts regardless of domain or intent).

**Upgraded state:** Same three components, with the behavioral directive layer replaced. `ProceduralMemory` model adds domain, directive type, applicable intent types, confidence score, reinforcement count, contradiction count, and lifecycle fields. Injection logic is precision-filtered: maximum 8 directives per prompt, matched to current domain and intent type. Nightly maintenance task manages quality decay and pruning.

**What stays the same:** Episodic memory model and lookup, working memory model and TTL logic, the Celery retrospective task trigger conditions.

**What changes:** The directive data model, the injection logic, the retrospective task's extraction logic (adds domain tagging and success analysis), the nightly maintenance task (new).

---

### Safety Layer

**Current state:** Heuristic reflection catches operational errors (timeouts, quota failures, not-found errors). LLM reflection catches semantic issues for critical tools. No prospective review before tool execution. No structured audit trail beyond the existing `ToolExecutionLog`.

**Upgraded state:** Tiered Guardian Agent sits between the agent and every tool call. Tier 1 (< 5ms, always): rule-based pre-execution checks for destructive operations, budget overruns, plan tier violations, cross-team access, and external writes. Tier 2 (300–800ms, high-risk tools only): LLM-based semantic review for bulk mutations. Tier 3 (0ms overhead, always): post-execution audit log in `GuardianAuditLog` table.

**What stays the same:** Heuristic reflection, LLM reflection, `ToolExecutionLog`.

**What changes:** The addition of the Guardian pre-execution layer, `GuardianAuditLog` table, Guardian events streamed to the frontend.

---

### Observability

**Current state:** Django logs. `ToolExecutionLog` table. `ChatTokenUsage` table. No distributed trace across an entire agent run. No per-stage latency breakdown. No way to see why a specific run cost what it cost or which step caused a failure.

**Upgraded state:** LangSmith traces on every component. Every LLM call is a span. Every tool call is a child span of the agent run. Every agent run is a child span of the full `universal_stream` execution. Every planning graph node is a child span of the planning run. Episodic memory lookups are traced. Retrospective task runs are traced. Custom dashboards for cost monitoring, slow runs, failure analysis, and reflection rate.

**What stays the same:** Existing logs and database audit tables (these complement LangSmith, they don't replace it).

**What changes:** Every significant code path gains `@traceable` decoration. LangSmith project is configured. Custom dashboards are set up.

---

## Part 5: The Dependency Graph of the Upgrade

Every component of the upgrade has dependencies. Building them out of order creates situations where you're debugging a complex new system without the tools to understand what it's doing.

```
Observability (Topic 1)
    │
    ├── Required by: everything else
    │   You cannot safely diagnose LangGraph, Guardian, or Crew behavior
    │   without traces. This is not the most exciting work. It is the work
    │   that makes all other work tractable.
    │
    ▼
LangGraph Planning Engine (Topic 2) ←── Guardian Agent (Topic 3)
    │                                        │
    │   These two run in parallel.           │
    │   LangGraph gives the planning         │
    │   engine structure. Guardian           │
    │   makes that structure safe.           │
    │   Neither depends on the other,        │
    │   but both depend on observability.    │
    │                                        │
    └───────────────────┬────────────────────┘
                        │
                        ▼
              Dynamic Crew Factory (Topic 4)
                        │
    The crew factory requires:
    - LangGraph (for the crew graph execution model)
    - Guardian (to protect crew tool calls)
    - Observability (to diagnose crew behavior)
    Without all three, crew debugging is nearly impossible.
                        │
              ┌─────────┴─────────┐
              │                   │
              ▼                   ▼
    Procedural Memory       Hybrid Intent Classifier
      (Topic 5)                 (Topic 6)
              │                   │
    Depends on crew factory    Feeds the crew factory.
    domain inference.          Can be built in parallel
    Can be built in parallel   with Topic 5.
    with Topic 6.
              │                   │
              └─────────┬─────────┘
                        │
                        ▼
              MCP Tools Upgrade (Topic 7)
                        │
    Can start in parallel with Topics 5 and 6.
    Depends on Guardian (Tier 1 and 2 rules for MCP tools)
    and Observability (MCP tool traces in LangSmith).
                        │
                        ▼
              Frontend Evolution (Topic 8)
                        │
    Can begin in parallel with Phase 2 backend work.
    Chat interface upgrades (intent card, crew panel, Guardian blocks)
    require Phase 1 backend upgrades to be in production.
    Canvas upgrades require LangGraph planning engine to be live.
```

---

## Part 6: Risks and How to Manage Them

### Risk 1: The LangGraph Migration Introduces Regressions in the Planning Engine

The planning engine is the most complex and most used part of the backend. Migrating it to LangGraph while keeping the legacy path running in parallel is the right approach, but the feature flag must be treated as a production gate — not a test toggle. Pro and Enterprise users should be on the LangGraph path for a minimum of two weeks before any rollout to Free or Team users. During that window, LangSmith traces from both paths should be compared directly: do LangGraph planning runs produce equivalent quality to legacy runs? Are they slower or faster? Are the Guardian checks firing at the right rate?

### Risk 2: The Crew Factory Increases Latency for Complex Queries

The crew factory adds a Crew Composer LLM call before any agent work begins. For very high complexity intents, this adds 400 to 700 milliseconds. This is generally acceptable because very high complexity intents already take several minutes to complete — adding 700 milliseconds to a 3-minute run is a rounding error. But the Crew Composer call must be fast and deterministic. It should use the Flash model, have a low max token limit, and have a strict output schema enforced by the prompt. A Crew Composer that produces variable or malformed output will cause silent failures in graph construction.

### Risk 3: Tool Scoping Breaks Existing Agent Behavior

When a crew agent is scoped to 8 to 12 tools instead of all 53, there is a risk that existing agent behavior that relied on cross-domain tool access breaks. The most likely failure mode: a Strategic Planner that currently calls `web_search` directly will no longer be able to — it needs to receive web search results from the Researcher via the supervisor. This is the correct behavior, but it requires that the Researcher always runs before the Strategic Planner in any crew that includes both. The Crew Composer must enforce this dependency. Test at least 3 full crew compositions end-to-end before declaring the crew factory production-ready.

### Risk 4: The Guardian Blocks Too Aggressively

A Guardian that fires Tier 2 checks too broadly will add 400 to 800 milliseconds to interactions that don't need deep review. The Tier 2 trigger set must be kept small and explicit: only the handful of tools that represent genuinely high-risk mutations. If Tier 2 is triggering on more than 5% of tool calls in LangSmith traces, the trigger list is too broad. Narrow it.

### Risk 5: The Embedding Classifier Confidently Misclassifies Edge Cases

The embedding classifier operates at a confidence threshold. Messages that score just above the threshold but are genuinely ambiguous will be classified incorrectly and routed to the wrong agent or the wrong crew composition. This is the boundary zone problem. During the first 4 weeks of the hybrid classifier being live, monitor the agent outcome for messages classified by the embedding layer with similarity scores between 0.82 and 0.90. If the failure rate in that zone is elevated, raise the threshold to 0.88. The goal is not to maximize Layer 2 coverage — it's to maximize classification accuracy at the threshold.

---

## Part 7: The Weekly Execution Timeline

```
Week 1–2
  → LangSmith instrumentation across all components
  → Baseline metrics: cost per planning run, reflection rate, episodic memory quality

Week 2–6
  → LangGraph planning engine migration
  → Feature flag: Pro/Enterprise only
  → Simulation node live
  → Human approval breakpoint live

Week 4–6 (parallel to LangGraph weeks 4–6)
  → Tiered Guardian Agent
  → Tier 1 rules tested with unit tests
  → Tier 2 prompt tested against 10 real planning runs from LangSmith
  → GuardianAuditLog in production

Week 6–10
  → Dynamic Crew Factory
  → Crew Composer prompt engineered and tested
  → Three end-to-end crew compositions tested: (researcher + planner),
    (planner + risk_critic + task_manager), (researcher + wiki_writer + integration_executor)
  → Simple queries confirmed on single-agent path (no regression)

Week 8–12 (parallel to Crew Factory weeks 8–12)
  → Domain-tagged Procedural Memory
  → Migration of existing flat directives to new model
  → Domain inference running on all new episodes
  → Retrospective task extracting success patterns
  → Nightly maintenance task live

Week 10–14 (parallel to Procedural Memory weeks 10–14)
  → Hybrid Intent Classifier
  → 80+ labeled examples in the embedding index
  → Layer distribution visible in LangSmith
  → Weekly curation command documented and scheduled
  → MCP Tools Upgrade (parallel to classifier work)
  → MCPRegistry with schema validation
  → Circuit breaker and health checks
  → MCPToolExecutor with tracing and idempotency
  → Guardian Tier 1 and 2 extended for MCP tools

Month 4–6
  → Chat interface upgrades: intent card, crew panel, Guardian block rendering
  → Floating panel system

Month 5–7
  → Canvas agent avatars, reasoning traces, plan diff view, approval UI
  → Wiki mini-graph, freshness indicators, live ingest experience

Month 6–9
  → Settings upgrades: memory panel, integration health dashboard, cost transparency
  → React Flow canvas upgrade
  → Mobile experience audit

Month 9+
  → Reassess unified canvas based on user data
  → Evaluate whether MCP tool registry should be publicly exposed to ecosystem
  → Evaluate retrieval quality improvements based on 6 months of episodic memory data
```

---

## Part 8: What Success Looks Like

At the end of this upgrade, the multi-agent orchestration system has these characteristics:

**Every production run is fully observable.** A single click on a LangSmith trace shows the intent classification result, the routing decision, every agent in the crew and what it did, every tool call and its latency, every Guardian check and its outcome, the total cost, and the outcome. There are no more debugging sessions that start with "let me add some print statements."

**Complex tasks are handled by the right combination of agents.** A request to research competitors, synthesize findings into a strategic plan, create executable tasks, and document the rationale in the wiki — that request spawns a crew of four agents with the right tool scopes, runs in parallel where possible, coordinates through a supervisor, and produces a coherent output. No single agent is asked to be five things at once.

**The planning engine never loses work.** A planning run that fails at any stage resumes from that stage. Users never re-trigger a 3-minute planning run because of a transient LLM timeout. The human approval breakpoint is clean, interactive, and the diff view makes it genuinely informative.

**The system learns from every team.** After 60 days, the procedural memory system has built a team-specific model of how this team works: their vocabulary, their sprint cadence, their assignment patterns, their risk tolerance, their known failure modes, their successful approaches by domain. This knowledge is precise enough to be useful and filtered enough not to be noise.

**The system is safe without being slow.** The Guardian blocks destructive and out-of-scope operations before they happen. It does so in under 5 milliseconds for routine checks. It invokes LLM judgment only for genuinely high-risk mutations, and only once per planning session. The streaming latency for normal interactions is unchanged from today.

**The interface makes the intelligence visible.** Users know what the system understood from their request. They can see which agents are working and what they're doing. They can read the reasoning behind every canvas node. They can approve or modify a plan before it touches the database. They can see what the system has learned about their team and correct it when it's wrong.

That is the upgraded system. Not a replacement of what exists, but a deliberate evolution of it — every capability built on top of the working foundation, every change measured against the observability infrastructure that comes first.

---

*The distance from where the system is today to where this plan takes it is large. But every step is specific, sequenced, and reversible. Build in order. Measure continuously. Evolve, don't replace.*
