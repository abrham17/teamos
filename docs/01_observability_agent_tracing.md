# Topic 1: Observability & Agent Tracing
**TeamOS Deep Dive Series — Phase 1, Weeks 1–2**

> Before you change anything, you need to see everything. This is the most unglamorous and most important upgrade on the list.

---

## Why This Comes First

Your current system is a black box in production. You know what goes in (user message) and what comes out (streamed response), but between those two points you have:

- Intent classification
- RAG retrieval (multi-query expansion, HyDE, cosine search)
- Specialist routing decision
- Multi-round AgentCore execution (up to 10 rounds)
- Parallel tool calls (ThreadPool, 4 workers)
- Heuristic + LLM reflection at each round
- Episodic memory lookup and storage
- Streaming SSE output

Any one of these steps can silently degrade, produce wrong outputs, or run at 10x expected latency — and you currently have no way to know which step is the problem without reading logs manually or adding `print()` statements.

Every architecture upgrade you make after this — LangGraph, Guardian Agent, Dynamic Crew Factory — will produce behaviour you can't diagnose without this foundation. You're flying blind.

---

## What You're Instrumenting

### The Four Layers to Trace

**Layer 1: LLM Calls**
Every call to `llm_call()` in `llm_orchestrator/` should emit a trace with:
- Model used (Flash vs Pro)
- Prompt token count
- Completion token count
- Latency (ms)
- Cache hit or miss
- Operation type (classification / planning / reflection / tool-eval)
- Cost estimate

**Layer 2: Tool Calls**
Every tool execution in AgentCore should trace:
- Tool name and source (internal / OAuth / MCP)
- Input parameters (sanitized — no secrets)
- Execution latency
- Success / failure / retry
- Idempotency key (Redis hit or miss)
- Round number within the agent loop

**Layer 3: Agent Flow**
The full execution trace for one user message:
- Intent classification result + confidence
- Which specialist was selected and why
- How many rounds the AgentCore ran
- Which reflection type triggered (heuristic vs LLM)
- Whether replanning occurred
- Final outcome (success / partial / failure)
- Total wall-clock time
- Total tokens consumed

**Layer 4: Memory Operations**
- Episodic memory lookup: query vector, top-k results, similarity scores
- AgentMemory reads/writes (key, TTL, hit/miss)
- Retrospective learning triggers: which episodes triggered, what directives were extracted

---

## Tool Choice: LangSmith vs Alternatives

### Option A: LangSmith (Recommended)
LangSmith is the standard tracing layer for LangChain/LangGraph systems, and since you're migrating to LangGraph in Week 2, this is the obvious choice. It gives you:

- Automatic tracing of any LangChain/LangGraph component with zero extra code
- Manual trace wrapping for non-LangChain code (your existing AgentCore)
- Run comparison (compare two runs side by side)
- Prompt playground (test prompt variants against real traces)
- Dataset creation from real runs (critical for evals later)
- Latency breakdown per node in a graph

**Cost:** Free tier covers most development needs. Paid at scale.

### Option B: Langfuse (Open Source Alternative)
If you want full control and no vendor dependency, Langfuse is self-hostable, has a clean UI, and supports manual tracing via a simple Python SDK. Works well if LangSmith's pricing becomes a concern at scale.

### Option C: Custom (Not Recommended)
You could instrument everything manually into your existing `ToolExecutionLog` and add a tracing table to PostgreSQL. Don't. You'll spend 3 weeks building a worse version of LangSmith.

**Decision: Start with LangSmith. Switch to Langfuse later if needed.**

---

## Implementation Plan

### Step 1: Environment Setup (Day 1)

```bash
pip install langsmith langchain-core
```

```python
# settings/base.py
LANGSMITH_API_KEY = env("LANGSMITH_API_KEY")
LANGSMITH_PROJECT = "teamos-production"
LANGSMITH_TRACING = env.bool("LANGSMITH_TRACING", default=True)

# Set env vars (LangSmith reads these automatically)
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = LANGSMITH_API_KEY
os.environ["LANGCHAIN_PROJECT"] = LANGSMITH_PROJECT
```

---

### Step 2: Wrap Your LLM Orchestrator (Day 1–2)

Your `llm_call()` in `llm_orchestrator/` is the single entry point for all AI calls. Wrap it once here and every caller gets traced automatically.

```python
# llm_orchestrator/client.py
from langsmith import traceable

@traceable(name="llm_call", run_type="llm")
def llm_call(
    messages: list,
    operation: str = "general",
    priority: str = "normal",
    team_id: str = None,
    **kwargs
) -> str:
    # Your existing routing logic (Flash vs Pro cost-curve) stays unchanged
    model = _select_model(priority, team_id)
    
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        **kwargs
    )
    
    # LangSmith automatically captures input/output/latency
    return response.choices[0].message.content
```

The `@traceable` decorator captures everything automatically. You don't need to change any caller.

---

### Step 3: Wrap AgentCore Execution (Day 2–3)

```python
# chat/agents/agent_core.py
from langsmith import traceable, trace

class AgentCore:

    @traceable(name="agent_execution", run_type="chain")
    def run(self, session_id: str, user_message: str, mode: str, team_id: str):
        with trace(
            name=f"agent_run_{mode}",
            metadata={
                "session_id": session_id,
                "mode": mode,
                "team_id": team_id
            }
        ) as run:
            for round_num in range(self.max_rounds):
                round_result = self._execute_round(round_num, run)
                
                # Tag each round explicitly
                run.add_metadata({
                    f"round_{round_num}_tools": round_result.tools_called,
                    f"round_{round_num}_reflection": round_result.reflection_type,
                    f"round_{round_num}_outcome": round_result.outcome
                })
                
                if round_result.done:
                    break
            
            run.add_metadata({"total_rounds": round_num + 1})

    @traceable(name="tool_execution", run_type="tool")
    def _execute_tool(self, tool_name: str, tool_input: dict, round_num: int):
        # Your existing tool execution logic unchanged
        result = self.tool_registry.execute(tool_name, tool_input)
        return result
```

---

### Step 4: Wrap Universal Intelligence Stream (Day 3–4)

```python
# chat/universal_stream.py
from langsmith import traceable

@traceable(name="universal_stream", run_type="chain")
def process_message(session_id, user_message, team_id, mode):
    
    # Stage 1: Classification
    with traceable(name="intent_classification")():
        intent = classify_intent(user_message)
    
    # Stage 2: RAG Retrieval  
    with traceable(name="rag_retrieval")():
        context = retrieve_context(intent, team_id)
    
    # Stage 3: Specialist Routing
    with traceable(name="specialist_routing")():
        specialist = route_to_specialist(intent, context)
    
    # Stage 4: Agent Core
    result = agent_core.run(session_id, user_message, specialist, team_id)
    
    return result
```

---

### Step 5: Trace Memory Operations (Day 4–5)

```python
# chat/memory/episodic.py
from langsmith import traceable

@traceable(name="episodic_memory_lookup", run_type="retriever")
def recall_episodes(query_embedding: list, team_id: str, top_k: int = 5):
    episodes = AgentEpisode.objects.filter(team_id=team_id).order_by(
        # cosine distance via pgvector
    )[:top_k]
    
    # LangSmith will capture the query + results automatically
    return [e.to_dict() for e in episodes]

@traceable(name="retrospective_learning", run_type="chain")  
def run_retrospective(episode_ids: list, team_id: str):
    # Your existing Celery task logic
    ...
```

---

### Step 6: Add Custom Dashboards in LangSmith (Day 5)

Once traces are flowing, create these saved views in LangSmith:

**Dashboard 1: Cost Monitor**
- Filter: `operation = "planning"` — see exactly what each planning run costs
- Alert: if any single run exceeds $0.50

**Dashboard 2: Slow Runs**
- Filter: total latency > 30s — these are your worst user experiences
- Drill into which stage is the bottleneck

**Dashboard 3: Failure Analysis**
- Filter: `outcome = "failure"` or `reflection_type = "replan"`
- See which tools fail most, which specialist routes fail most

**Dashboard 4: Reflection Rate**
- Track LLM reflection triggers per week — if this goes up, your tool reliability is degrading

---

## What You'll Learn in the First Week

Within 7 days of deploying this, you will know:

1. **Which specialist route fails most often** — probably the planning engine on complex multi-domain intents
2. **Which tools are slowest** — external OAuth tools (GitHub, Jira, Notion) will dominate
3. **Whether your semantic cache is actually hitting** — the 15-min TTL cache in `llm_orchestrator/`
4. **How often LLM reflection triggers vs heuristic** — if LLM reflection triggers on >30% of rounds, your heuristics are too weak
5. **Your actual cost per planning run** — you probably don't know this exactly right now
6. **Whether episodic memory recall is finding relevant episodes** — low cosine similarity scores mean your embeddings are poor matches

Every one of those insights changes what you build next. That's why this comes first.

---

## What Good Traces Look Like

A healthy planning run in LangSmith should look like this:

```
universal_stream (4.2s total)
├── intent_classification (87ms) ✓
├── rag_retrieval (340ms) ✓
│   ├── query_expansion (45ms)
│   ├── vector_search x3 (210ms)
│   └── graph_traversal (85ms)
├── specialist_routing (12ms) → "strategic_planner" ✓
└── agent_execution (3.7s)
    ├── round_0 (1.1s)
    │   ├── tool: wiki_search_pages (340ms) ✓
    │   ├── tool: graph_get_neighbors (180ms) ✓
    │   └── reflection: heuristic → continue ✓
    ├── round_1 (1.4s)
    │   ├── tool: plan_create_task x12 (890ms) ✓
    │   └── reflection: heuristic → done ✓
    └── episodic_memory_store (210ms) ✓
```

A bad run might show:
```
agent_execution (28s total)  ← RED FLAG
├── round_0 (2s) ✓
├── round_1: tool: ext_github_list_issues (14s) TIMEOUT
├── reflection: llm → replan  ← LLM reflection triggered
├── round_2 (3s) ✓
└── round_3 (8s) ext_github... TIMEOUT again
```

That tells you: GitHub integration is flaky, and your heuristic reflection isn't catching timeouts fast enough. Without tracing, this just looks like "the agent was slow."

---

## Files to Touch

```
backend/
├── llm_orchestrator/
│   └── client.py              ← Add @traceable to llm_call()
├── chat/
│   ├── universal_stream.py    ← Wrap 5 stages with traceable
│   ├── agents/
│   │   └── agent_core.py      ← Wrap run() and _execute_tool()
│   └── memory/
│       ├── episodic.py        ← Wrap recall + store
│       └── retrospective.py   ← Wrap Celery task
├── teamos_project/
│   └── settings/base.py       ← Add LangSmith env vars
└── requirements.txt           ← Add langsmith
```

**No database migrations. No API changes. No frontend changes. Pure instrumentation.**

---

## Done Criteria

You're done with this phase when:
- Every LLM call appears in LangSmith with latency + token counts
- Every tool execution is a child span of the agent run that called it
- You can click any production run and see exactly which step took how long
- You've identified at least one concrete reliability problem to fix next

**Time estimate: 5 working days for one engineer.**

---

*Next: Topic 2 — LangGraph Migration (Planning Engine)*
