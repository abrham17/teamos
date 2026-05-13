# TeamOS Agentic System — Full Improvement Plan

> A comprehensive blueprint for evolving TeamOS from a tool-calling assistant into a fully autonomous, self-improving agentic knowledge and project management system.

---

## Table of Contents

1. [Current Architecture Audit](#current-architecture-audit)
2. [Vision: The Target System](#vision-the-target-system)
3. [Deep Planning Agent Overhaul](#deep-planning-agent-overhaul)
4. [Wiki Intelligence Layer](#wiki-intelligence-layer)
5. [Unified Agent Core (Backend)](#unified-agent-core-backend)
6. [Frontend Agentic UX](#frontend-agentic-ux)
7. [Memory & Context System](#memory--context-system)
8. [Knowledge Graph Evolution](#knowledge-graph-evolution)
9. [Autonomous Background Agents](#autonomous-background-agents)
10. [Multi-Agent Orchestration](#multi-agent-orchestration)
11. [Implementation Roadmap](#implementation-roadmap)

---

## Current Architecture Audit

### What Exists Today

```
┌──────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                          │
│ ┌─────────────┐ ┌──────────────────┐ ┌─────────────────────────┐ │
│ │ ChatInterface│ │ AIPlannerOverlay │ │ Wiki (TipTap Editor)    │ │
│ │ 3 modes:    │ │ SSE streaming    │ │ Manual editing only     │ │
│ │ ask/agent/  │ │ agent executor   │ │ No AI inline editing    │ │
│ │ plan        │ │                  │ │                         │ │
│ └─────────────┘ └──────────────────┘ └─────────────────────────┘ │
└──────────────────────┬───────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────┐
│ BACKEND                                                           │
│ ┌──────────────┐ ┌──────────────────┐ ┌────────────────────────┐ │
│ │ chat/        │ │ planning/        │ │ graph_engine/           │ │
│ │ agent_stream │ │ agent_executor   │ │ traversal.py            │ │
│ │ tools.py     │ │ agent_sync.py    │ │ BFS only, no reasoning │ │
│ │ memory_svc   │ │ services.py      │ │                        │ │
│ └──────────────┘ └──────────────────┘ └────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────────┐ ┌────────────────────────┐ │
│ │ ingest/      │ │ llm_orchestrator │ │ wiki/                  │ │
│ │ vectors.py   │ │ router.py        │ │ models, views          │ │
│ │ PGVector     │ │ Single-model     │ │ No AI assistance       │ │
│ └──────────────┘ └──────────────────┘ └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Current Limitations

| Area | Limitation |
|------|-----------|
| **Agent Loop** | Max 8 tool rounds, no self-reflection, no backtracking |
| **Planning** | Single-shot LLM draft → hardcoded pipeline, no iteration |
| **Wiki** | Agent can create/update pages but no deep analysis, no auto-restructuring |
| **Memory** | Key-value only, no semantic recall, no priority decay, no episodic memory |
| **Graph** | BFS traversal only, no reasoning over paths, no causal inference |
| **Context Window** | Static 12-message history + RAG, no dynamic pruning |
| **Multi-Agent** | None — single agent personality does everything |
| **Background** | No autonomous tasks, no scheduled analysis, no proactive alerts |
| **Frontend** | Chat is text-only interaction; planning overlay is one-way fire-and-forget |

---

## Vision: The Target System

TeamOS should evolve into an **Autonomous Team Intelligence** where:

1. **The agent thinks before acting** — Plans multi-step strategies, self-evaluates, retries on failure
2. **Knowledge maintains itself** — Wiki pages auto-update when related content changes, contradictions self-resolve
3. **Projects self-manage** — Overdue tasks trigger re-planning, resource conflicts auto-balance
4. **The system learns** — Memory captures patterns, future plans improve from past outcomes
5. **Multiple specialist agents** collaborate on complex requests

---

## Deep Planning Agent Overhaul

### 3.1 Reasoning-First Planning

**Current:** `prompt → single LLM call → JSON plan`

**Target:** Multi-stage reasoning pipeline with self-critique:

```
prompt
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Stage 1: DECOMPOSE                                   │
│ Break the mission into sub-goals and constraints     │
│ Output: {goals[], constraints[], assumptions[]}      │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│ Stage 2: RESEARCH                                    │
│ Deep wiki + graph traversal for EACH sub-goal        │
│ Pull: related projects, past decisions, SOPs,        │
│       team expertise profiles, historical velocity   │
│ Output: {context_per_goal[], knowledge_gaps[]}       │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│ Stage 3: DRAFT                                       │
│ Generate plan with explicit reasoning traces         │
│ Each task annotated with: WHY this priority,         │
│   WHY this deadline, WHO based on expertise          │
│ Output: {plan, reasoning_traces[]}                   │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│ Stage 4: CRITIQUE                                    │
│ Second LLM pass evaluates the plan for:             │
│ - Missing dependencies, unrealistic timelines       │
│ - Resource over-allocation, knowledge gaps          │
│ - Contradictions with existing projects             │
│ Output: {issues[], score, revised_plan}             │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│ Stage 5: EXECUTE + VERIFY                            │
│ Create entities, run conflict detection,            │
│ verify each task was created correctly,             │
│ sync wiki, assess risk                              │
└─────────────────────────────────────────────────────┘
```

### 3.2 Implementation: `planning/reasoning_pipeline.py` (new)

```python
class PlanningReasoner:
    """Multi-stage reasoning pipeline for plan generation."""

    async def decompose(self, prompt: str, context: dict) -> DecompositionResult:
        """Break mission into sub-goals with constraints."""
        ...

    async def research(self, goals: list[Goal], team_id: str) -> ResearchResult:
        """Deep context gathering per goal using vector search + graph."""
        ...

    async def draft(self, decomposition: DecompositionResult, research: ResearchResult) -> PlanDraft:
        """Generate initial plan with reasoning traces."""
        ...

    async def critique(self, draft: PlanDraft) -> CritiqueResult:
        """Self-evaluate and revise the plan."""
        ...

    async def execute(self, plan: PlanDraft, team_id: str, user: User) -> ExecutionResult:
        """Create all entities and verify."""
        ...
```

### 3.3 Dependency Intelligence

**New capability:** The planner should infer task dependencies automatically.

- **Backend:** `planning/dependency_inference.py`
  - LLM analyzes task titles/descriptions to infer `depends_on` relationships
  - Graph-based topological sort for execution order
  - Critical path calculation for timeline optimization
  - Circular dependency detection + resolution suggestions

- **Frontend:** `DependencyGraph.tsx` (already scaffolded)
  - Interactive DAG visualization
  - Drag to reorder, click to edit
  - Critical path highlighted in red
  - "AI Suggest Dependencies" button

### 3.4 Adaptive Scheduling

**New capability:** The agent adjusts schedules based on team velocity.

```python
class AdaptiveScheduler:
    """Learns from past project completion rates to estimate realistic timelines."""

    def calculate_team_velocity(self, team_id: str) -> VelocityMetrics:
        """Analyze historical task completion rates."""
        # Average time from todo → completed per priority level
        # Buffer calculation based on variance
        ...

    def adjust_plan_dates(self, draft: PlanDraft, velocity: VelocityMetrics) -> PlanDraft:
        """Stretch or compress timelines based on actual team speed."""
        ...

    def suggest_parallel_tracks(self, tasks: list[Task], members: list[Member]) -> list[Track]:
        """Identify tasks that can run in parallel given team capacity."""
        ...
```

### 3.5 Plan Outcome Tracking

**New capability:** After a project completes, the agent analyzes what went right/wrong.

- **Model:** `PlanOutcome` — stores predicted vs actual dates, blockers encountered
- **Service:** `planning/retrospective.py` — LLM-driven post-mortem analysis
- **Memory:** Results stored in agent memory to improve future estimates
- **Frontend:** "Retrospective" tab in project detail view

---

## Wiki Intelligence Layer

### 4.1 AI-Powered Wiki Editing

**Current:** Manual TipTap editing. Agent can only create/update whole pages.

**Target:** Inline AI assistance within the wiki editor.

#### Backend: `wiki/ai_assist.py` (new)

```python
class WikiAIAssist:
    """Inline AI editing capabilities for the wiki."""

    def expand_section(self, page_id: str, section_heading: str, instructions: str) -> str:
        """Expand a section with more detail using wiki context."""
        ...

    def summarize_page(self, page_id: str) -> str:
        """Generate executive summary of a wiki page."""
        ...

    def suggest_links(self, page_id: str) -> list[SuggestedLink]:
        """Suggest [[wikilinks]] to other pages based on content."""
        ...

    def detect_stale_content(self, page_id: str) -> list[StaleSection]:
        """Identify sections that may be outdated based on newer pages."""
        ...

    def generate_from_plan(self, project_id: str) -> str:
        """Generate comprehensive wiki documentation from a project plan."""
        ...
```

#### Frontend: Wiki AI Toolbar

- **Slash commands** in TipTap: `/ai expand`, `/ai summarize`, `/ai link`, `/ai from-plan`
- **Floating AI bubble** on text selection → "Rewrite", "Expand", "Simplify", "Add References"
- **Auto-link suggestions** panel showing unlinked mentions of other pages

### 4.2 Wiki Auto-Maintenance

**New background service:** `wiki/auto_maintain.py`

```python
class WikiAutoMaintainer:
    """Autonomous wiki health maintenance."""

    def detect_contradictions(self, team_id: str) -> list[Contradiction]:
        """Find pages that contradict each other using semantic comparison."""
        ...

    def merge_duplicates(self, team_id: str) -> list[MergeSuggestion]:
        """Find semantically similar pages that should be merged."""
        ...

    def update_stale_references(self, updated_page_id: str):
        """When a page is updated, check if other pages referencing it need updates."""
        ...

    def generate_index_pages(self, team_id: str):
        """Auto-generate category/index pages from page_type groupings."""
        ...

    def compute_page_health_score(self, page_id: str) -> float:
        """Score a page 0-100 based on: freshness, completeness, link density, contradictions."""
        ...
```

### 4.3 Wiki ↔ Plan Deep Sync

**Enhanced bidirectional sync:**

| Trigger | Action |
|---------|--------|
| Task status → completed | Update wiki page: mark section as done, add completion date |
| Wiki SOP updated | Check if any tasks reference this SOP, notify if procedures changed |
| New wiki page created | Scan active plans for tasks that should reference it |
| Plan milestone reached | Auto-generate a milestone report wiki page |
| Wiki page deleted | Check for plan tasks referencing it, flag as orphaned |

Implementation: Event-driven hooks in `wiki/signals.py` and `planning/signals.py`

---

## Unified Agent Core (Backend)

### 5.1 Refactored Agent Architecture

**Current:** Two separate agent paths (`iter_agent_sse_events` and `iter_plan_agent_sse_events`) with shared but monolithic tool execution.

**Target:** Modular agent framework with pluggable capabilities.

```
┌───────────────────────────────────────────────────────────────┐
│ AgentCore                                                      │
│ ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
│ │ Planner      │ │ Executor     │ │ Reflector              │ │
│ │ (think)      │ │ (act)        │ │ (evaluate)             │ │
│ └──────────────┘ └──────────────┘ └────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
│ │ MemoryMgr    │ │ ToolRegistry │ │ ContextBuilder         │ │
│ │ (remember)   │ │ (capabilities│ │ (focus)                │ │
│ └──────────────┘ └──────────────┘ └────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

#### New file: `chat/agent_core.py`

```python
class AgentCore:
    """Unified agent execution engine with planning, reflection, and memory."""

    def __init__(self, team_id: str, user: User, mode: str):
        self.planner = AgentPlanner(mode)
        self.executor = AgentExecutor(team_id, user)
        self.reflector = AgentReflector()
        self.memory = AgentMemoryManager(team_id)
        self.context = ContextBuilder(team_id)
        self.tools = ToolRegistry(mode)

    async def run(self, user_message: str, session: ChatSession) -> AsyncIterator[SSEEvent]:
        # 1. Load relevant memory
        memory_context = self.memory.get_relevant_context(user_message)

        # 2. Build focused context (not just top-K RAG)
        focused_context = await self.context.build(
            query=user_message,
            memory=memory_context,
            session_history=session.recent_messages(12),
        )

        # 3. Plan the approach (inner monologue)
        plan = await self.planner.plan(user_message, focused_context)
        yield SSEEvent("agent_plan", plan.to_dict())

        # 4. Execute with reflection loop
        for step in plan.steps:
            result = await self.executor.execute_step(step)
            yield SSEEvent("agent_step", result.to_dict())

            # Reflect: did this step succeed? Should we adjust?
            reflection = await self.reflector.evaluate(step, result, plan)
            if reflection.should_retry:
                result = await self.executor.retry_step(step, reflection.feedback)
            elif reflection.should_replan:
                plan = await self.planner.replan(plan, reflection.insights)
                yield SSEEvent("agent_replan", plan.to_dict())

        # 5. Persist learnings to memory
        await self.memory.store_episode(user_message, plan, results)

        # 6. Generate final response
        async for token in self.generate_summary(plan, results):
            yield SSEEvent("chunk", {"token": token})
```

### 5.2 Self-Reflection Protocol

**New capability:** After each tool call, the agent evaluates success.

```python
class AgentReflector:
    """Evaluates tool results and decides whether to continue, retry, or replan."""

    REFLECTION_PROMPT = """
    You just executed: {tool_name}({arguments})
    Result: {result}
    Original goal: {goal}

    Evaluate:
    1. Did this achieve what was intended? (yes/partial/no)
    2. Are there unexpected side effects?
    3. Should we retry with different parameters?
    4. Should we change our overall approach?

    Return JSON: {success, retry, replan, feedback}
    """

    async def evaluate(self, step, result, plan) -> Reflection:
        ...
```

### 5.3 Dynamic Context Window Management

**Current:** Fixed 12 messages + static RAG.

**Target:** Intelligent context window with priority-based pruning.

```python
class ContextBuilder:
    """Builds optimal context within token budget."""

    def __init__(self, team_id: str, max_tokens: int = 12000):
        self.max_tokens = max_tokens

    async def build(self, query: str, memory: list, session_history: list) -> str:
        budget = TokenBudget(self.max_tokens)

        # Priority 1: Agent memory (critical context) — 15% budget
        memory_block = budget.allocate(memory, priority=1, max_pct=0.15)

        # Priority 2: Most relevant RAG results — 40% budget
        rag_results = await self.vector_search(query)
        rag_block = budget.allocate(rag_results, priority=2, max_pct=0.40)

        # Priority 3: Graph-connected context — 20% budget
        graph_context = await self.graph_expand(rag_results[:3])
        graph_block = budget.allocate(graph_context, priority=3, max_pct=0.20)

        # Priority 4: Session history (recent first) — 25% budget
        history_block = budget.allocate(session_history, priority=4, max_pct=0.25)

        return self.compose(memory_block, rag_block, graph_block, history_block)
```

---

## Frontend Agentic UX

### 6.1 Agent Thought Transparency

**Current:** User sees tool calls and results but not the agent's reasoning.

**Target:** "Thinking" pane showing the agent's inner monologue.

```tsx
// New component: AgentThinkingPane.tsx
interface ThoughtStep {
  type: "reasoning" | "plan" | "critique" | "replan";
  content: string;
  timestamp: number;
}

function AgentThinkingPane({ thoughts }: { thoughts: ThoughtStep[] }) {
  return (
    <aside className="agent-thoughts-panel">
      {thoughts.map(t => (
        <ThoughtBubble key={t.timestamp} type={t.type}>
          {t.content}
        </ThoughtBubble>
      ))}
    </aside>
  );
}
```

### 6.2 Interactive Plan Builder

**Current:** Plan overlay generates and applies atomically.

**Target:** Interactive canvas where user and agent co-build plans.

- **Drag-drop task reordering** with AI suggestion badges
- **Inline edit** → agent re-evaluates dependencies and dates
- **"What if" mode** — change one variable, AI shows cascade effects
- **Split-view** — left: plan structure, right: AI reasoning for each decision

### 6.3 Proactive Agent Notifications

**Current:** Agent only acts when prompted.

**Target:** Agent initiates conversations when it detects issues.

```tsx
// FloatingAIChat.tsx enhancement
interface ProactiveAlert {
  type: "overdue" | "conflict" | "stale_wiki" | "knowledge_gap" | "milestone_approaching";
  severity: "info" | "warning" | "critical";
  message: string;
  suggested_action: string;
  auto_fixable: boolean;
}

function ProactiveAlertBanner({ alerts }: { alerts: ProactiveAlert[] }) {
  // Show non-intrusive banner at top when agent has observations
}
```

### 6.4 Agent Mode Enhancements in Chat

**Current:** Three modes (ask, agent, plan) selected manually.

**Target:** Auto-detection + specialized UIs per mode.

| Detection Signal | Auto-Mode | UI Enhancement |
|-----------------|-----------|----------------|
| "create a plan for..." | plan | Show plan canvas inline |
| "update the wiki page..." | agent | Show page diff preview |
| "what's the status of..." | ask + agent | Show live project card |
| "track this decision..." | agent | Show decision template |

---

## Memory & Context System

### 7.1 Episodic Memory

**Current:** Key-value store (`AgentMemory` model) with basic categories.

**Target:** Rich episodic memory with temporal reasoning.

```python
# New model: chat/models.py
class AgentEpisode(models.Model):
    """Records of complete agent interactions and their outcomes."""
    team = models.ForeignKey(Team, on_delete=models.CASCADE)
    trigger = models.TextField()  # What initiated this episode
    plan = models.JSONField()  # What the agent planned to do
    actions = models.JSONField()  # What tools were called
    outcome = models.JSONField()  # Success/failure + metrics
    learnings = models.TextField()  # Extracted lessons
    embedding = VectorField(dimensions=1536)  # For semantic recall
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [HnswIndex(fields=["embedding"], m=16, ef_construction=64)]
```

### 7.2 Semantic Memory Recall

**Current:** Exact key match only.

**Target:** Vector-similarity-based memory retrieval.

```python
class SemanticMemory:
    """Recall memories based on semantic similarity to current context."""

    def recall(self, query: str, team_id: str, top_k: int = 5) -> list[MemoryEntry]:
        query_embedding = embed(query)
        return AgentEpisode.objects.filter(team_id=team_id).order_by(
            CosineDistance("embedding", query_embedding)
        )[:top_k]

    def should_remember(self, interaction: AgentInteraction) -> bool:
        """Determine if this interaction is worth persisting."""
        # High value: decisions, failures, priority changes, new patterns
        ...
```

### 7.3 Working Memory (Scratchpad)

**New concept:** Per-session working memory for complex multi-turn tasks.

```python
class WorkingMemory:
    """In-session scratchpad for the agent to track intermediate state."""

    def __init__(self, session_id: str):
        self.scratchpad: dict[str, Any] = {}  # Redis-backed

    def note(self, key: str, value: Any):
        """Agent writes intermediate findings here."""
        ...

    def recall_session(self) -> str:
        """Formatted scratchpad for context injection."""
        ...
```

---

## Knowledge Graph Evolution

### 8.1 Reasoning Over Paths

**Current:** BFS traversal returns flat list of neighbors.

**Target:** Path-based reasoning that explains connections.

```python
class GraphReasoner:
    """Reason over knowledge graph paths to derive insights."""

    def explain_connection(self, page_a: str, page_b: str, team_id: str) -> str:
        """Find and explain the shortest path between two concepts."""
        path = self.shortest_path(page_a, page_b)
        explanation = llm_call(
            f"Explain how {page_a} connects to {page_b} through: {path}"
        )
        return explanation

    def find_prerequisites(self, page_id: str) -> list[Prerequisite]:
        """Traverse depends_on + prerequisite edges to build learning path."""
        ...

    def causal_chain(self, from_concept: str, to_concept: str) -> CausalChain:
        """Find causal/dependency chains between concepts."""
        ...

    def detect_cycles(self, team_id: str) -> list[Cycle]:
        """Find circular dependencies that may indicate contradictions."""
        ...
```

### 8.2 Auto-Graph Enrichment

**New background process:** Continuously enrich the knowledge graph.

```python
class GraphEnricher:
    """Automatically discovers and adds edges based on content analysis."""

    def enrich_on_page_save(self, page: WikiPage):
        """After a page is saved, discover new edges."""
        # 1. Extract entities and concepts
        entities = self.extract_entities(page.content)

        # 2. Find existing pages that match these entities
        for entity in entities:
            matches = self.vector_search(entity, page.team_id)
            for match in matches:
                if match.id != page.id and not self.edge_exists(page.id, match.id):
                    # 3. LLM determines relation type
                    relation = self.classify_relation(page, match, entity)
                    GraphEdge.objects.create(
                        from_page=page, to_page=match,
                        edge_type=relation.type,
                        metadata={"reason": relation.reason, "auto": True}
                    )

    def periodic_global_enrichment(self, team_id: str):
        """Scheduled: re-scan all pages for missed connections."""
        ...
```

### 8.3 Graph-Grounded Planning

**Enhancement to planning:** Use graph paths to infer task dependencies.

```python
def infer_dependencies_from_graph(tasks: list[dict], team_id: str) -> list[tuple[str, str]]:
    """
    For each pair of tasks, check if their referenced wiki pages
    have depends_on or prerequisite edges, implying task dependency.
    """
    dependencies = []
    for i, t1 in enumerate(tasks):
        for t2 in tasks[i+1:]:
            refs_1 = t1.get("wikiReferences", [])
            refs_2 = t2.get("wikiReferences", [])
            for r1 in refs_1:
                for r2 in refs_2:
                    if graph_has_path(r1, r2, relation_types=["depends_on", "prerequisite"]):
                        dependencies.append((t1["title"], t2["title"]))
    return dependencies
```

---

## Autonomous Background Agents

### 9.1 Scheduled Agent Tasks

**New system:** Celery/background tasks that run agent logic without user prompting.

```python
# New file: chat/background_agents.py

@celery_app.task(bind=True)
def daily_team_health_check(self, team_id: str):
    """Runs daily: checks overdue items, stale wiki, approaching milestones."""
    health = {
        "overdue": check_overdue_items(team_id),
        "conflicts": detect_date_conflicts(team_id),
        "stale_pages": detect_stale_wiki_pages(team_id),
        "approaching_milestones": get_milestones_within_days(team_id, days=3),
        "knowledge_gaps": knowledge_gap_analysis(team_id),
    }

    if any_critical(health):
        create_proactive_alert(team_id, health)
        # Optionally: auto-fix low-risk issues
        if health["conflicts"]:
            auto_resolve_conflicts(team_id, health["conflicts"])

    store_health_snapshot(team_id, health)


@celery_app.task(bind=True)
def on_wiki_page_updated(self, page_id: str):
    """Triggered after wiki page save: update graph, check plan references."""
    page = WikiPage.objects.get(id=page_id)

    # 1. Re-enrich graph edges
    GraphEnricher().enrich_on_page_save(page)

    # 2. Check if active plans reference this page
    affected_tasks = Task.objects.filter(
        description__contains=f"[[{page.title}]]",
        status__in=["todo", "in-progress"]
    )
    if affected_tasks.exists():
        # Create notification: "Wiki page X was updated, affecting N active tasks"
        create_plan_impact_alert(page, affected_tasks)

    # 3. Check for contradictions with recently edited pages
    detect_new_contradictions(page)


@celery_app.task(bind=True)
def weekly_retrospective(self, team_id: str):
    """Weekly: generate team performance summary and learning extraction."""
    completed_this_week = Task.objects.filter(
        project__team_id=team_id,
        status="completed",
        updated_at__gte=one_week_ago(),
    )

    # LLM-driven retrospective
    summary = generate_weekly_summary(team_id, completed_this_week)
    store_in_memory(team_id, "weekly_retro", summary)

    # Auto-create a wiki page with the summary
    create_weekly_wiki_page(team_id, summary)
```

### 9.2 Event-Driven Agent Triggers

```python
# planning/signals.py
@receiver(post_save, sender=Task)
def on_task_status_change(sender, instance, **kwargs):
    if instance.tracker.has_changed("status"):
        old_status = instance.tracker.previous("status")
        new_status = instance.status

        if new_status == "blocked":
            # Agent auto-investigates why
            schedule_blocker_analysis.delay(str(instance.id))

        if new_status == "completed":
            # Check if milestone can be marked as reached
            check_milestone_completion.delay(str(instance.project_id))
            # Update wiki page
            update_wiki_on_task_complete.delay(str(instance.id))
```

---

## Multi-Agent Orchestration

### 10.1 Specialist Agents

Instead of one monolithic agent, deploy specialists:

| Agent | Responsibility | Tools |
|-------|---------------|-------|
| **WikiAgent** | Knowledge management, page quality, linking | wiki_*, graph_*, knowledge_gap_analysis |
| **PlanAgent** | Project planning, scheduling, resource allocation | plan_*, calendar_*, risk_assessment |
| **AnalystAgent** | Data analysis, retrospectives, trend detection | memory_*, analytics queries |
| **CoordinatorAgent** | Routes requests, orchestrates specialists | All (dispatcher) |

### 10.2 Agent Communication Protocol

```python
class AgentMessage:
    """Inter-agent communication."""
    from_agent: str
    to_agent: str
    intent: str  # "request_info", "delegate_task", "report_finding"
    payload: dict
    priority: int
    requires_response: bool

class AgentOrchestrator:
    """Routes complex requests across specialist agents."""

    async def handle(self, user_message: str, session: ChatSession):
        # 1. Coordinator classifies intent
        classification = await self.coordinator.classify(user_message)

        # 2. Route to specialist(s)
        if classification.requires_multiple:
            # Parallel execution with result aggregation
            results = await asyncio.gather(*[
                self.dispatch(agent, subtask)
                for agent, subtask in classification.subtasks
            ])
            # 3. Coordinator synthesizes
            final = await self.coordinator.synthesize(results)
        else:
            final = await self.dispatch(classification.primary_agent, user_message)

        return final
```

### 10.3 Agent Handoff Protocol

When the WikiAgent is working and discovers a planning issue:

```python
# WikiAgent discovers stale task references
finding = "Wiki page 'API Design' was updated but 3 tasks still reference the old API spec"

# Hand off to PlanAgent
await orchestrator.handoff(
    from_agent="wiki",
    to_agent="plan",
    intent="update_affected_tasks",
    payload={"finding": finding, "affected_task_ids": [...]}
)
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

| Task | Priority | Effort |
|------|----------|--------|
| Refactor agent core into `AgentCore` class | P0 | 3 days |
| Add self-reflection after each tool call | P0 | 2 days |
| Implement dynamic context builder | P0 | 2 days |
| Add episodic memory model + migrations | P0 | 1 day |
| Frontend: Agent thinking pane SSE events | P0 | 2 days |

### Phase 2: Planning Deep Dive (Weeks 3-4)

| Task | Priority | Effort |
|------|----------|--------|
| Multi-stage reasoning pipeline | P0 | 4 days |
| Dependency inference from graph | P0 | 2 days |
| Adaptive scheduling (velocity-based) | P1 | 2 days |
| Plan self-critique step | P0 | 2 days |
| Frontend: Interactive plan canvas | P1 | 3 days |
| Frontend: "What-if" mode | P2 | 2 days |

### Phase 3: Wiki Intelligence (Weeks 5-6)

| Task | Priority | Effort |
|------|----------|--------|
| Wiki AI assist backend (expand, summarize, link) | P0 | 3 days |
| Frontend: Slash commands in TipTap | P0 | 2 days |
| Frontend: Selection AI bubble | P1 | 2 days |
| Wiki auto-maintenance background service | P1 | 3 days |
| Enhanced Wiki ↔ Plan sync signals | P1 | 2 days |
| Page health scoring | P2 | 1 day |

### Phase 4: Memory & Graph (Weeks 7-8)

| Task | Priority | Effort |
|------|----------|--------|
| Semantic memory recall (vector-based) | P0 | 2 days |
| Working memory (session scratchpad) | P1 | 1 day |
| Graph reasoning (path explanation) | P1 | 3 days |
| Auto-graph enrichment on page save | P1 | 2 days |
| Graph-grounded dependency inference | P1 | 2 days |

### Phase 5: Autonomy (Weeks 9-10)

| Task | Priority | Effort |
|------|----------|--------|
| Daily health check background task | P0 | 2 days |
| Event-driven agent triggers (signals) | P0 | 2 days |
| Proactive alert system (frontend) | P1 | 2 days |
| Weekly retrospective auto-generation | P2 | 2 days |
| Wiki page update cascade checker | P1 | 2 days |

### Phase 6: Multi-Agent (Weeks 11-12)

| Task | Priority | Effort |
|------|----------|--------|
| Agent specialist separation | P1 | 3 days |
| Coordinator/router agent | P1 | 2 days |
| Inter-agent communication protocol | P2 | 2 days |
| Agent handoff UX in frontend | P2 | 2 days |

---

## Key Files to Create/Modify

### New Backend Files
- `chat/agent_core.py` — Unified agent framework
- `chat/agent_reflector.py` — Self-evaluation after tool calls
- `chat/agent_planner_inner.py` — Inner planning (approach selection)
- `chat/context_builder.py` — Dynamic context window management
- `chat/background_agents.py` — Autonomous scheduled tasks
- `chat/models.py` — Add `AgentEpisode` model
- `planning/reasoning_pipeline.py` — Multi-stage plan reasoning
- `planning/dependency_inference.py` — Auto-dependency detection
- `planning/adaptive_scheduler.py` — Velocity-based scheduling
- `planning/retrospective.py` — Plan outcome analysis
- `planning/signals.py` — Event-driven plan triggers
- `wiki/ai_assist.py` — Inline AI editing capabilities
- `wiki/auto_maintain.py` — Background wiki health maintenance
- `wiki/signals.py` — Wiki change event handlers
- `graph_engine/reasoner.py` — Path-based reasoning
- `graph_engine/enricher.py` — Auto-edge discovery

### Modified Backend Files
- `chat/agent_stream.py` — Integrate new AgentCore
- `chat/tools.py` — Add new tool schemas for wiki AI assist
- `chat/agent_memory_service.py` — Add semantic recall
- `planning/agent_executor.py` — Use reasoning pipeline
- `planning/agent_sync.py` — Enhanced bidirectional sync
- `graph_engine/traversal.py` — Add reasoning capabilities
- `llm_orchestrator/orchestrator.py` — Support async calls

### New Frontend Files
- `components/chat/AgentThinkingPane.tsx` — Show agent reasoning
- `components/chat/ProactiveAlertBanner.tsx` — Agent-initiated alerts
- `components/wiki-v2/AIAssistToolbar.tsx` — Inline wiki AI
- `components/wiki-v2/SlashCommandMenu.tsx` — AI slash commands
- `features/planner/components/InteractivePlanCanvas.tsx` — Co-build plans
- `features/planner/components/WhatIfSimulator.tsx` — Scenario modeling

### Modified Frontend Files
- `components/chat/ChatInterface.tsx` — Integrate thinking pane
- `components/chat/ChatAgentToolTimeline.tsx` — Show reflection steps
- `features/planner/components/AIPlannerOverlay.tsx` — Multi-stage UI
- `features/planner/PlannerWorkspace.tsx` — Proactive alerts

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Plan generation quality (user acceptance rate) | ~60% | >90% |
| Agent tool call success rate | ~85% | >97% |
| Average plan iterations before acceptance | 1 (no iteration) | 1.2 (self-correcting) |
| Wiki pages auto-maintained | 0 | 100% with health score |
| Knowledge gaps detected proactively | Manual only | Daily automated |
| Average time to create a complete project plan | 30s (single LLM call) | 45s (5-stage pipeline, higher quality) |
| Agent memory recall relevance | N/A (key-value) | >80% semantic match |
| Cross-project conflict detection | On-demand only | Continuous monitoring |

---

## Architecture Principles

1. **Agent-First, Human-Verified** — The system should do the work and present results for approval, not ask what to do.
2. **Everything is Connected** — No island of information. Every entity links to wiki, graph, memory.
3. **Learn from Outcomes** — Every completed project teaches the system something for next time.
4. **Graceful Degradation** — If LLM fails, fall back to simpler heuristics. Never crash.
5. **Transparency** — Users should always be able to see WHY the agent made a decision.
6. **Minimal Latency** — Background work happens async. User-facing work streams in real-time.
