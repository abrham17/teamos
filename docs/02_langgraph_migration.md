# Topic 2: LangGraph Migration — Planning Engine
**TeamOS Deep Dive Series — Phase 1, Weeks 2–6**

> Your planning engine is the most complex, most valuable, and most brittle part of your backend. This is how you make it production-grade.

---

## The Problem With Your Current Planning Engine

Your 6-stage pipeline in `planning/` is genuinely impressive engineering. Two parallel strategy generations, critique and selection, dependency inference, adaptive scheduling — that's real work. But the implementation has structural problems that will hurt you at scale:

**Problem 1: No resumability.** If the pipeline crashes at stage 4 (Critique & Select) after 3 minutes of LLM calls, the entire run is lost. The user gets an error, retries, and you pay for stages 1–3 again.

**Problem 2: No visibility mid-run.** You can't inspect the state of a running plan. You don't know if it's stuck at research, waiting on a slow LLM call, or deadlocked in the ThreadPool.

**Problem 3: Hard to extend.** Adding a new stage (say, a Simulation node before DB mutation) means modifying a linear function. Every addition touches the same code, increasing regression risk.

**Problem 4: Human-in-the-loop is bolted on, not built in.** If you want to pause mid-plan and ask the user "does this task breakdown look right before I create 47 tasks?", there's no clean place to do it.

**Problem 5: ThreadPool parallelism is fragile.** Your two parallel strategy generations (fast-track and risk-mitigated) run via `ThreadPool`. This works until it doesn't — deadlocks, worker exhaustion, and unhandled exceptions in threads are notoriously hard to debug.

LangGraph solves all five.

---

## What LangGraph Actually Is

LangGraph is a graph execution framework built on top of LangChain. You define:

- **Nodes**: Python functions that take state and return updated state
- **Edges**: Connections between nodes (conditional or unconditional)
- **State**: A typed dict that flows through the graph and accumulates results
- **Checkpointer**: Persists state to DB at every node transition

The graph is stateful, resumable, visualizable, and supports native parallelism via `Send()`.

You're not replacing your planning logic. You're wrapping it in a graph that gives you all the reliability primitives you're missing.

---

## The New Planning Graph

### State Definition

```python
# planning/agents/state.py
from typing import TypedDict, Optional, Annotated
from langgraph.graph.message import add_messages

class PlanningState(TypedDict):
    # Input
    user_prompt: str
    team_id: str
    project_id: Optional[str]
    session_id: str
    
    # Stage outputs (accumulated through graph)
    research_results: dict          # Stage 1 output
    synthesis: dict                 # Stage 2 output
    strategy_fast: dict             # Stage 3a output
    strategy_safe: dict             # Stage 3b output  
    selected_strategy: dict         # Stage 4 output
    critique_score: float           # Stage 4 output
    final_plan: dict                # Stage 5 output
    simulation_result: dict         # Stage 6 output (new)
    
    # Control flow
    guardian_approved: bool
    human_approved: Optional[bool]  # None = not yet asked
    current_stage: str
    error: Optional[str]
    retry_count: int
    
    # Metadata
    messages: Annotated[list, add_messages]  # Conversation context
    memory_refs: list               # Retrieved episodic episodes
    token_usage: dict               # Running cost tracker
```

---

### Graph Structure

```python
# planning/agents/graph.py
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.constants import Send
import psycopg

from .nodes import (
    research_node,
    synthesize_node,
    parallel_strategy_launcher,
    fast_strategy_node,
    safe_strategy_node,
    critique_node,
    finalize_node,
    simulation_node,
    guardian_node,
    human_review_node,
    db_mutation_node,
    error_handler_node,
)

def build_planning_graph(checkpointer) -> StateGraph:
    graph = StateGraph(PlanningState)

    # Add all nodes
    graph.add_node("research", research_node)
    graph.add_node("synthesize", synthesize_node)
    graph.add_node("launch_parallel_strategies", parallel_strategy_launcher)
    graph.add_node("fast_strategy", fast_strategy_node)
    graph.add_node("safe_strategy", safe_strategy_node)
    graph.add_node("critique", critique_node)
    graph.add_node("finalize", finalize_node)
    graph.add_node("simulation", simulation_node)
    graph.add_node("guardian", guardian_node)
    graph.add_node("human_review", human_review_node)
    graph.add_node("db_mutation", db_mutation_node)
    graph.add_node("error_handler", error_handler_node)

    # Entry point
    graph.set_entry_point("research")

    # Linear flow through early stages
    graph.add_edge("research", "synthesize")
    graph.add_edge("synthesize", "launch_parallel_strategies")

    # Parallel fan-out: both strategies run simultaneously
    graph.add_conditional_edges(
        "launch_parallel_strategies",
        lambda state: [
            Send("fast_strategy", state),
            Send("safe_strategy", state)
        ]
    )

    # Both strategies converge at critique
    graph.add_edge("fast_strategy", "critique")
    graph.add_edge("safe_strategy", "critique")

    graph.add_edge("critique", "finalize")
    graph.add_edge("finalize", "simulation")
    graph.add_edge("simulation", "guardian")

    # Guardian decision
    graph.add_conditional_edges(
        "guardian",
        route_after_guardian,  # see below
        {
            "approved": "human_review",
            "rejected": "error_handler",
            "needs_modification": "finalize",  # loop back
        }
    )

    # Human-in-the-loop breakpoint
    graph.add_conditional_edges(
        "human_review",
        route_after_human,
        {
            "approved": "db_mutation",
            "rejected": "error_handler",
            "pending": "human_review",  # wait state
        }
    )

    graph.add_edge("db_mutation", END)
    graph.add_edge("error_handler", END)

    return graph.compile(
        checkpointer=checkpointer,
        interrupt_before=["human_review"],  # Pause here for human input
    )


def route_after_guardian(state: PlanningState) -> str:
    if state.get("error"):
        return "rejected"
    if state["guardian_approved"]:
        return "approved"
    return "needs_modification"


def route_after_human(state: PlanningState) -> str:
    approved = state.get("human_approved")
    if approved is None:
        return "pending"
    return "approved" if approved else "rejected"
```

---

### Checkpointer Setup (Postgres)

```python
# planning/agents/checkpointer.py
import psycopg
from langgraph.checkpoint.postgres import PostgresSaver

def get_checkpointer():
    conn = psycopg.connect(settings.DATABASE_URL)
    checkpointer = PostgresSaver(conn)
    checkpointer.setup()  # Creates checkpoint tables if not exist
    return checkpointer
```

This creates two tables in your existing PostgreSQL:
- `checkpoints` — full state snapshot at each node
- `checkpoint_writes` — individual write operations (for recovery)

No new database needed.

---

### Node Implementations

Each node is a pure function: takes state, returns partial state update.

```python
# planning/agents/nodes.py

def research_node(state: PlanningState) -> dict:
    """
    Your existing Stage 1 logic, extracted into a function.
    Multi-query expansion + HyDE search + graph traversal.
    """
    from chat.universal_stream import run_research_stage
    
    results = run_research_stage(
        prompt=state["user_prompt"],
        team_id=state["team_id"],
        memory_refs=state.get("memory_refs", [])
    )
    
    return {
        "research_results": results,
        "current_stage": "research_complete",
        "token_usage": {
            **state.get("token_usage", {}),
            "research": results["tokens_used"]
        }
    }


def synthesize_node(state: PlanningState) -> dict:
    """Stage 2: Domain taxonomy + expert persona + task vocabulary."""
    from planning.engine import run_synthesis_stage
    
    synthesis = run_synthesis_stage(
        research=state["research_results"],
        team_id=state["team_id"]
    )
    
    return {
        "synthesis": synthesis,
        "current_stage": "synthesis_complete"
    }


def parallel_strategy_launcher(state: PlanningState) -> dict:
    """
    This node just signals LangGraph to fan out.
    Actual work happens in fast_strategy_node and safe_strategy_node.
    """
    return {"current_stage": "strategies_launching"}


def fast_strategy_node(state: PlanningState) -> dict:
    """Stage 3a: Maximum concurrency, aggressive timelines."""
    from planning.engine import generate_fast_strategy
    
    strategy = generate_fast_strategy(
        synthesis=state["synthesis"],
        research=state["research_results"]
    )
    return {"strategy_fast": strategy}


def safe_strategy_node(state: PlanningState) -> dict:
    """Stage 3b: QA gates, buffer time, stability focus."""
    from planning.engine import generate_safe_strategy
    
    strategy = generate_safe_strategy(
        synthesis=state["synthesis"],
        research=state["research_results"]
    )
    return {"strategy_safe": strategy}


def critique_node(state: PlanningState) -> dict:
    """Stage 4: Portfolio-director evaluates both strategies, scores 0-100."""
    from planning.engine import run_critique_stage
    
    result = run_critique_stage(
        fast=state["strategy_fast"],
        safe=state["strategy_safe"],
        synthesis=state["synthesis"]
    )
    
    return {
        "selected_strategy": result["selected"],
        "critique_score": result["score"],
        "current_stage": "critique_complete"
    }


def finalize_node(state: PlanningState) -> dict:
    """Stage 5: Dependency inference + adaptive scheduling."""
    from planning.engine import run_finalize_stage
    
    plan = run_finalize_stage(
        strategy=state["selected_strategy"],
        team_id=state["team_id"]
    )
    
    return {
        "final_plan": plan,
        "current_stage": "finalize_complete"
    }


def simulation_node(state: PlanningState) -> dict:
    """
    NEW — Stage 6: What-if simulation before DB mutation.
    Checks: dependency conflicts, resource overloads, timeline feasibility.
    Does NOT touch the database.
    """
    from planning.simulation import simulate_plan
    
    simulation = simulate_plan(
        plan=state["final_plan"],
        team_id=state["team_id"]
    )
    
    return {
        "simulation_result": simulation,
        "current_stage": "simulation_complete"
    }


def guardian_node(state: PlanningState) -> dict:
    """Tiered safety review — see Topic 3 for full implementation."""
    from planning.guardian import review_plan
    
    review = review_plan(
        plan=state["final_plan"],
        simulation=state["simulation_result"],
        team_id=state["team_id"]
    )
    
    return {
        "guardian_approved": review["approved"],
        "final_plan": review.get("modified_plan", state["final_plan"]),
        "current_stage": "guardian_complete"
    }


def human_review_node(state: PlanningState) -> dict:
    """
    Human-in-the-loop breakpoint.
    Graph pauses here. Resumed externally when user approves/rejects.
    """
    # This node is reached only when human_approved is set
    # The interrupt_before=["human_review"] config handles the pause
    return {"current_stage": "awaiting_human_approval"}


def db_mutation_node(state: PlanningState) -> dict:
    """Stage 6 (original): Atomic DB write. Your existing mutation logic."""
    from planning.engine import run_db_mutation_stage
    
    result = run_db_mutation_stage(
        plan=state["final_plan"],
        team_id=state["team_id"],
        session_id=state["session_id"]
    )
    
    return {
        "current_stage": "complete",
        "project_id": result["project_id"]
    }


def error_handler_node(state: PlanningState) -> dict:
    """Log error, notify user, clean up any partial state."""
    import logging
    logger = logging.getLogger(__name__)
    
    logger.error(
        "Planning failed",
        extra={
            "stage": state.get("current_stage"),
            "error": state.get("error"),
            "team_id": state["team_id"],
            "session_id": state["session_id"]
        }
    )
    
    return {"current_stage": "failed"}
```

---

## The Django Integration Layer

Your existing Django views call the planning engine. Replace that call with graph invocation.

```python
# planning/views/ai_assist.py
from planning.agents.graph import build_planning_graph
from planning.agents.checkpointer import get_checkpointer
import uuid

class PlanningAIAssistView(APIView):
    
    def post(self, request):
        team_id = str(request.user.current_team_id)
        thread_id = str(uuid.uuid4())  # Unique ID for this planning run
        
        config = {
            "configurable": {
                "thread_id": thread_id,
                "team_id": team_id
            }
        }
        
        initial_state = {
            "user_prompt": request.data["prompt"],
            "team_id": team_id,
            "session_id": request.data.get("session_id"),
            "messages": [],
            "memory_refs": [],
            "token_usage": {},
            "retry_count": 0,
        }
        
        checkpointer = get_checkpointer()
        graph = build_planning_graph(checkpointer)
        
        # Stream graph execution as SSE
        def generate():
            for event in graph.stream(initial_state, config, stream_mode="updates"):
                node_name = list(event.keys())[0]
                node_output = list(event.values())[0]
                
                yield f"data: {json.dumps({'stage': node_name, 'data': node_output})}\n\n"
                
                # Check if graph paused for human review
                state = graph.get_state(config)
                if state.next == ("human_review",):
                    yield f"data: {json.dumps({'stage': 'awaiting_approval', 'thread_id': thread_id, 'plan': state.values['final_plan']})}\n\n"
                    return
        
        return StreamingHttpResponse(generate(), content_type="text/event-stream")
    

class PlanningApprovalView(APIView):
    """Called when user approves or rejects the plan in UI."""
    
    def post(self, request):
        thread_id = request.data["thread_id"]
        approved = request.data["approved"]
        
        config = {"configurable": {"thread_id": thread_id}}
        
        checkpointer = get_checkpointer()
        graph = build_planning_graph(checkpointer)
        
        # Resume graph with human decision
        graph.update_state(
            config,
            {"human_approved": approved},
            as_node="human_review"
        )
        
        # Continue execution
        def generate():
            for event in graph.stream(None, config, stream_mode="updates"):
                yield f"data: {json.dumps(event)}\n\n"
        
        return StreamingHttpResponse(generate(), content_type="text/event-stream")
```

---

## Resumability in Practice

This is the killer feature. Here's what it looks like when a plan run fails mid-way and is retried:

```python
# Failure scenario: crashes at simulation_node after 3 minutes
# Checkpoint state is saved at every node transition

# On retry, resume from last checkpoint — not from scratch
config = {"configurable": {"thread_id": original_thread_id}}

graph = build_planning_graph(checkpointer)
state = graph.get_state(config)

print(state.values["current_stage"])  # "finalize_complete"
print(state.next)                      # ("simulation",)

# Resume — skips research, synthesize, strategies, critique, finalize
# Starts directly at simulation_node
for event in graph.stream(None, config):
    process(event)
```

**Zero LLM re-calls for completed stages. Zero user-facing retry required.**

---

## The New Simulation Node (What You Didn't Have Before)

This is the most valuable addition the LangGraph structure enables. Before committing 47 tasks to the database, run a simulation:

```python
# planning/simulation.py

def simulate_plan(plan: dict, team_id: str) -> dict:
    """
    Dry-run the plan against current team state.
    Returns conflict report — does NOT touch DB.
    """
    tasks = plan["tasks"]
    members = get_team_members(team_id)
    
    issues = []
    
    # Check 1: Dependency conflicts
    for task in tasks:
        for dep_id in task.get("depends_on", []):
            dep = next((t for t in tasks if t["id"] == dep_id), None)
            if dep and dep["start_date"] >= task["start_date"]:
                issues.append({
                    "type": "dependency_conflict",
                    "task": task["title"],
                    "dependency": dep["title"],
                    "severity": "high"
                })
    
    # Check 2: Resource overload
    member_load = defaultdict(list)
    for task in tasks:
        if task.get("assignee_id"):
            member_load[task["assignee_id"]].append(task)
    
    for member_id, member_tasks in member_load.items():
        concurrent = count_concurrent_tasks(member_tasks)
        if concurrent > 3:
            issues.append({
                "type": "resource_overload",
                "member_id": member_id,
                "concurrent_tasks": concurrent,
                "severity": "medium"
            })
    
    # Check 3: Timeline feasibility
    total_days = (plan["end_date"] - plan["start_date"]).days
    critical_path_days = compute_critical_path(tasks)
    
    if critical_path_days > total_days:
        issues.append({
            "type": "timeline_infeasible",
            "required_days": critical_path_days,
            "available_days": total_days,
            "severity": "critical"
        })
    
    return {
        "feasible": len([i for i in issues if i["severity"] == "critical"]) == 0,
        "issues": issues,
        "risk_score": compute_risk_score(issues)
    }
```

---

## Migration Strategy: Zero Downtime

Don't replace the old planning engine. Run both in parallel:

```python
# planning/views/ai_assist.py

USE_LANGGRAPH = settings.PLANNING_USE_LANGGRAPH  # Feature flag

class PlanningAIAssistView(APIView):
    def post(self, request):
        if USE_LANGGRAPH and request.user.current_team.plan in ["pro", "enterprise"]:
            return self._run_langgraph(request)
        else:
            return self._run_legacy(request)
```

Start with Pro/Enterprise teams only. Monitor in LangSmith. Roll out to all teams when stable.

---

## Database Schema Changes

Only additions, no modifications to existing tables:

```sql
-- LangGraph checkpoint tables (auto-created by checkpointer.setup())
-- checkpoints (thread_id, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
-- checkpoint_writes (thread_id, checkpoint_id, task_id, idx, channel, type, value)

-- Add to planning_project for traceability
ALTER TABLE planning_project ADD COLUMN langgraph_thread_id UUID;
ALTER TABLE planning_project ADD COLUMN planning_run_metadata JSONB;
```

---

## Files to Create / Modify

```
backend/
├── planning/
│   ├── agents/
│   │   ├── __init__.py          (new)
│   │   ├── graph.py             (new — full graph definition)
│   │   ├── nodes.py             (new — all node functions)
│   │   ├── state.py             (new — PlanningState TypedDict)
│   │   └── checkpointer.py     (new — Postgres connection)
│   ├── simulation.py            (new — pre-mutation simulation)
│   ├── guardian.py              (new — see Topic 3)
│   └── views/
│       └── ai_assist.py         (modified — add LangGraph path)
├── teamos_project/
│   └── settings/base.py         (modified — add PLANNING_USE_LANGGRAPH flag)
└── requirements.txt             (modified — add langgraph, psycopg)
```

**Existing planning engine code is untouched until migration is complete.**

---

## Done Criteria

- Planning runs are visible in LangSmith as a graph with per-node latency
- A failed run at stage 4 can be resumed from stage 4 without re-running stages 1–3
- Human approval breakpoint works: plan pauses, user sees plan preview, approves, graph continues
- Simulation catches at least one class of conflict before DB mutation
- Feature flag enables LangGraph path for Pro/Enterprise teams only
- All existing tests pass for the legacy path

**Time estimate: 3–4 weeks for one engineer familiar with the codebase.**

---

*Next: Topic 3 — Tiered Guardian Agent*
