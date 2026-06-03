# Topic 4: Dynamic Crew Factory
**TeamOS Deep Dive Series — Phase 2, Weeks 6–10**

> This is the upgrade that turns your system from "a smart agent with tools" into an actual multi-agent operating system. It's the most architecturally significant change on the list.

---

## What's Broken With Static Routing

Your current specialist routing works like this:

```
User message → Intent classifier → Pick one specialist from 6 → Run AgentCore with that specialist's tools
```

The six specialists are fixed: Lightweight, Wiki Agent, Plan Agent, Strategic Planner, Research Agent, Analyst.

This model has a ceiling. Consider what happens when a user says:

> "Research our competitors, compare their pricing to ours, draft a strategic response plan, and create tasks for the team to execute it."

That intent spans Research Agent (web search + ingest), Wiki Agent (knowledge retrieval and writing), Strategic Planner (6-stage pipeline), and Plan Agent (task creation). Your current system picks one specialist and leaves the others' capabilities on the table. The result is either a degraded output (one agent trying to do four jobs with the wrong tool set) or a conversation where the user has to ask four separate times.

Dynamic Crew Factory solves this by asking: "what combination of agents does this intent actually need?" and spawning that crew.

---

## Architecture Overview

```
User Message
     │
     ▼
Intent Classifier (enhanced — see Topic 6)
     │
     ▼ Structured Intent Schema
     │ { intent_type, complexity, domains, required_capabilities }
     │
     ▼
Crew Factory
     │
     ├── Crew Composer (LLM) → decides which agent roles to spawn
     │
     └── LangGraph Crew Graph
           ├── Agent A (Researcher)      ─┐
           ├── Agent B (StrategicPlanner) ├── run with scoped tools + message passing
           ├── Agent C (RiskCritic)      ─┘
           └── Supervisor (coordinates, resolves conflicts, synthesizes)
                    │
                    ▼
              Guardian (reviews final output before DB)
                    │
                    ▼
              DB Mutations + Canvas Update + SSE Stream
```

---

## Step 1: Enhanced Intent Schema

Before the Crew Factory can compose a crew, it needs richer intent information than your current classifier provides.

```python
# chat/intent/schema.py
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class IntentSchema:
    intent_type: str           # "plan/create", "research/analyze", "wiki/update", etc.
    complexity: str            # "low", "medium", "high", "very_high"
    domains: List[str]         # ["product", "engineering", "marketing"]
    required_capabilities: List[str]  # ["web_search", "plan_creation", "wiki_write", "risk_analysis"]
    parallelizable: bool       # Can sub-tasks run in parallel?
    estimated_rounds: int      # Expected agent loop depth
    requires_external: bool    # Needs OAuth integrations?
    confidence: float          # 0.0 - 1.0
```

---

## Step 2: The Crew Composer

This is the LLM call that maps an intent schema to a list of agent roles.

```python
# chat/crew/composer.py

AVAILABLE_ROLES = {
    "researcher": {
        "description": "Web search, document ingestion, knowledge retrieval, graph traversal",
        "tools": ["web_search", "wiki_search_pages", "graph_get_neighbors", "ingest_url"],
        "max_concurrent": 2
    },
    "strategic_planner": {
        "description": "6-stage planning pipeline, project structuring, milestone definition",
        "tools": ["plan_create_project", "plan_create_milestone", "planning_engine"],
        "max_concurrent": 1
    },
    "task_manager": {
        "description": "Task creation, assignment, dependency management, scheduling",
        "tools": ["plan_create_task", "plan_assign_member", "plan_detect_conflicts"],
        "max_concurrent": 1
    },
    "risk_critic": {
        "description": "Evaluates plans for risks, feasibility issues, and blind spots",
        "tools": ["plan_assess_risk", "wiki_search_pages", "graph_get_neighbors"],
        "max_concurrent": 1
    },
    "wiki_writer": {
        "description": "Knowledge base creation, page updates, semantic linking",
        "tools": ["wiki_create_page", "wiki_update_page", "wiki_search_pages", "graph_add_edge"],
        "max_concurrent": 1
    },
    "integration_executor": {
        "description": "External tool execution: GitHub, Slack, Jira, Linear, Notion",
        "tools": ["ext_github_*", "ext_slack_*", "ext_jira_*", "ext_linear_*"],
        "max_concurrent": 2
    },
    "analyst": {
        "description": "Data analysis, metrics interpretation, performance review",
        "tools": ["memory_retrieve", "wiki_search_pages", "graph_analytics"],
        "max_concurrent": 1
    },
}

CREW_COMPOSER_PROMPT = """
You are the TeamOS Crew Composer. Based on the user's intent, select the minimum set of agent roles needed.

## User Intent
{intent_schema}

## Available Roles
{available_roles}

## Rules
- Select the minimum roles that cover all required capabilities
- Don't add roles "just in case" — every role adds latency and cost
- If complexity is "low", use at most 2 roles
- If complexity is "medium", use 2-3 roles  
- If complexity is "high" or "very_high", use 3-5 roles
- Always include a role that covers the primary intent_type
- risk_critic should be included whenever strategic_planner is included

## Output (JSON only)
{{
  "crew": [
    {{
      "role": "researcher",
      "priority": 1,
      "runs_parallel": true,
      "depends_on": [],
      "instructions": "Focus on competitor pricing and market positioning for our SaaS product"
    }},
    {{
      "role": "strategic_planner",
      "priority": 2,
      "runs_parallel": false,
      "depends_on": ["researcher"],
      "instructions": "Use researcher output to build a 90-day strategic response plan"
    }}
  ],
  "supervisor_instructions": "Coordinate researcher and planner outputs into a unified deliverable",
  "estimated_total_rounds": 8
}}
"""

def compose_crew(intent: IntentSchema, user_message: str) -> CrewComposition:
    response = llm_call(
        messages=[{
            "role": "user",
            "content": CREW_COMPOSER_PROMPT.format(
                intent_schema=asdict(intent),
                available_roles=json.dumps(AVAILABLE_ROLES, indent=2),
                user_message=user_message
            )
        }],
        operation="crew_composition",
        priority="normal",
        max_tokens=800
    )
    
    return CrewComposition(**json.loads(response))
```

---

## Step 3: The Crew Graph (LangGraph)

Each crew run is a LangGraph graph, dynamically constructed based on the crew composition.

```python
# chat/crew/graph.py
from langgraph.graph import StateGraph, END
from langgraph.constants import Send
from langgraph.checkpoint.postgres import PostgresSaver

class CrewState(TypedDict):
    # Input
    user_message: str
    team_id: str
    session_id: str
    intent: dict
    crew_composition: dict
    
    # Per-agent outputs (keyed by role)
    agent_outputs: dict          # {"researcher": {...}, "planner": {...}}
    agent_messages: list         # Cross-agent message log
    
    # Supervisor
    supervisor_synthesis: dict
    final_output: dict
    
    # Control
    guardian_approved: bool
    current_agents_running: list
    completed_agents: list
    messages: Annotated[list, add_messages]


def build_crew_graph(crew_composition: CrewComposition, checkpointer) -> CompiledGraph:
    graph = StateGraph(CrewState)
    
    # Add supervisor node (always present)
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("guardian", guardian_node)
    graph.add_node("output", output_node)
    
    # Dynamically add agent nodes based on crew composition
    parallel_agents = []
    sequential_agents = []
    
    for agent_spec in crew_composition.crew:
        node_name = f"agent_{agent_spec.role}"
        
        # Create agent node with role-specific tools and instructions
        agent_node = create_agent_node(agent_spec)
        graph.add_node(node_name, agent_node)
        
        if agent_spec.runs_parallel and not agent_spec.depends_on:
            parallel_agents.append(node_name)
        else:
            sequential_agents.append((node_name, agent_spec.depends_on))
    
    # Entry: supervisor starts everything
    graph.set_entry_point("supervisor")
    
    # Fan out to parallel agents
    if parallel_agents:
        graph.add_conditional_edges(
            "supervisor",
            lambda state: [Send(name, state) for name in parallel_agents]
        )
        
        # All parallel agents converge back at supervisor for synthesis
        for agent_name in parallel_agents:
            graph.add_edge(agent_name, "supervisor")
    
    # Sequential agents run after their dependencies complete
    for agent_name, deps in sequential_agents:
        if deps:
            # After each dependency completes, supervisor decides next
            graph.add_conditional_edges(
                "supervisor",
                route_to_next_agent,
                {agent_name: agent_name, "synthesize": "supervisor"}
            )
            graph.add_edge(agent_name, "supervisor")
        else:
            graph.add_edge("supervisor", agent_name)
            graph.add_edge(agent_name, "supervisor")
    
    # Final flow
    graph.add_edge("supervisor", "guardian")
    graph.add_conditional_edges(
        "guardian",
        lambda s: "output" if s["guardian_approved"] else END
    )
    graph.add_edge("output", END)
    
    return graph.compile(checkpointer=checkpointer)
```

---

## Step 4: Agent Nodes

Each agent node is an isolated AgentCore run with scoped tools.

```python
# chat/crew/agents.py

def create_agent_node(agent_spec: AgentRoleSpec):
    """Factory function — returns a node function for a specific agent role."""
    
    def agent_node(state: CrewState) -> dict:
        role = agent_spec.role
        
        # Get tools for this role only (scoped — not all 53 tools)
        scoped_tools = get_tools_for_role(role, state["team_id"])
        
        # Build context from previous agent outputs (agent-to-agent messaging)
        agent_context = build_agent_context(
            role=role,
            user_message=state["user_message"],
            instructions=agent_spec.instructions,
            prior_outputs=state["agent_outputs"],
            agent_messages=state["agent_messages"]
        )
        
        # Run scoped AgentCore
        core = AgentCore(
            team_id=state["team_id"],
            session_id=state["session_id"],
            tools=scoped_tools,
            max_rounds=6,           # Lower per-agent round limit
            role_context=agent_context
        )
        
        result = core.run(agent_context["messages"])
        
        # Post output to shared crew state
        return {
            "agent_outputs": {
                **state.get("agent_outputs", {}),
                role: result
            },
            "agent_messages": [
                *state.get("agent_messages", []),
                {
                    "from": role,
                    "content": result["summary"],
                    "timestamp": time.time()
                }
            ],
            "completed_agents": [
                *state.get("completed_agents", []),
                role
            ]
        }
    
    return agent_node
```

---

## Step 5: The Supervisor Node

The supervisor doesn't execute tasks. It coordinates: decides what runs next, synthesizes outputs, resolves conflicts between agent findings.

```python
# chat/crew/supervisor.py

SUPERVISOR_PROMPT = """
You are the TeamOS Crew Supervisor coordinating a team of AI agents.

## Original User Request
{user_message}

## Crew Instructions
{supervisor_instructions}

## Current State
Completed agents: {completed_agents}
Running agents: {current_agents_running}
Agent outputs so far:
{agent_outputs}

## Agent Messages (inter-agent communication)
{agent_messages}

## Your Task
1. If parallel agents just completed, synthesize their outputs before proceeding.
2. Identify conflicts between agent findings and resolve them.
3. Decide: should the next sequential agent run now? Or do we need more from current agents?
4. If all agents are complete, produce the final synthesized output.

## Output (JSON only)
{{
  "action": "run_next_agent" | "request_more" | "synthesize_final",
  "next_agent": "task_manager",       // if action is run_next_agent
  "synthesis": {{}},                   // if action is synthesize_final
  "conflict_resolutions": [],
  "inter_agent_message": "Researcher found X, Planner should account for this in timeline"
}}
"""

def supervisor_node(state: CrewState) -> dict:
    response = llm_call(
        messages=[{
            "role": "user",
            "content": SUPERVISOR_PROMPT.format(
                user_message=state["user_message"],
                supervisor_instructions=state["crew_composition"]["supervisor_instructions"],
                completed_agents=state.get("completed_agents", []),
                current_agents_running=state.get("current_agents_running", []),
                agent_outputs=json.dumps(state.get("agent_outputs", {}), indent=2),
                agent_messages=json.dumps(state.get("agent_messages", []), indent=2)
            )
        }],
        operation="crew_supervisor",
        priority="high",
        max_tokens=1000
    )
    
    decision = json.loads(response)
    
    if decision["action"] == "synthesize_final":
        return {
            "supervisor_synthesis": decision["synthesis"],
            "agent_messages": [
                *state.get("agent_messages", []),
                {"from": "supervisor", "content": "Final synthesis complete", "timestamp": time.time()}
            ]
        }
    
    if decision.get("inter_agent_message"):
        return {
            "agent_messages": [
                *state.get("agent_messages", []),
                {
                    "from": "supervisor",
                    "to": decision.get("next_agent"),
                    "content": decision["inter_agent_message"],
                    "timestamp": time.time()
                }
            ]
        }
    
    return {}
```

---

## Step 6: Tool Scoping Per Role

This is critical for safety and performance. Each agent only sees its own tools, not all 53.

```python
# chat/crew/tools.py

ROLE_TOOL_MAP = {
    "researcher": [
        "web_search",
        "wiki_search_pages",
        "wiki_get_page",
        "graph_get_neighbors",
        "graph_find_path",
        "memory_retrieve",
        "ingest_url",
    ],
    "strategic_planner": [
        "wiki_search_pages",
        "graph_get_neighbors",
        "plan_create_project",
        "plan_create_milestone",
        "plan_assess_risk",
        "memory_retrieve",
        "memory_store",
    ],
    "task_manager": [
        "plan_create_task",
        "plan_update_task",
        "plan_assign_member",
        "plan_detect_conflicts",
        "plan_get_project",
        "plan_list_tasks",
    ],
    "risk_critic": [
        "wiki_search_pages",
        "graph_get_neighbors",
        "plan_assess_risk",
        "plan_list_tasks",
        "memory_retrieve",
    ],
    "wiki_writer": [
        "wiki_create_page",
        "wiki_update_page",
        "wiki_search_pages",
        "wiki_get_page",
        "graph_add_edge",
        "graph_add_node",
    ],
    "integration_executor": [
        "ext_github_create_issue",
        "ext_github_list_issues",
        "ext_slack_send_message",
        "ext_slack_list_channels",
        "ext_jira_create_issue",
        "ext_linear_create_issue",
        "ext_notion_create_page",
    ],
    "analyst": [
        "memory_retrieve",
        "wiki_search_pages",
        "graph_analytics_page_rank",
        "graph_analytics_communities",
        "plan_get_project",
        "plan_list_tasks",
    ],
}

def get_tools_for_role(role: str, team_id: str) -> list:
    tool_names = ROLE_TOOL_MAP.get(role, [])
    
    # Filter to only tools the team actually has access to
    # (e.g., only include ext_ tools if OAuth is connected)
    return [
        tool for tool in tool_names
        if is_tool_available(tool, team_id)
    ]
```

---

## Step 7: Django View Integration

```python
# chat/views/stream.py

class ChatStreamView(APIView):
    
    def post(self, request):
        user_message = request.data["message"]
        team_id = str(request.user.current_team_id)
        
        # Step 1: Classify intent (enhanced — see Topic 6)
        intent = classify_intent_enhanced(user_message, team_id)
        
        # Step 2: Decide: single agent or crew?
        if intent.complexity in ["low", "medium"] and len(intent.required_capabilities) <= 2:
            # Use existing single-agent path (no change for simple queries)
            return self._run_single_agent(request, intent)
        
        # Step 3: Compose crew for complex intents
        crew_composition = compose_crew(intent, user_message)
        
        # Step 4: Run crew graph
        return self._run_crew(request, intent, crew_composition)
    
    def _run_crew(self, request, intent, crew_composition):
        thread_id = str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id, "team_id": request.user.current_team_id}}
        
        checkpointer = get_checkpointer()
        graph = build_crew_graph(crew_composition, checkpointer)
        
        initial_state = {
            "user_message": request.data["message"],
            "team_id": str(request.user.current_team_id),
            "session_id": request.data.get("session_id"),
            "intent": asdict(intent),
            "crew_composition": asdict(crew_composition),
            "agent_outputs": {},
            "agent_messages": [],
            "completed_agents": [],
            "current_agents_running": [],
            "messages": []
        }
        
        def generate():
            for event in graph.stream(initial_state, config, stream_mode="updates"):
                node_name = list(event.keys())[0]
                node_data = list(event.values())[0]
                
                # Stream crew progress to frontend
                yield f"data: {json.dumps({'node': node_name, 'data': node_data})}\n\n"
        
        return StreamingHttpResponse(generate(), content_type="text/event-stream")
```

---

## Frontend: Crew Activity in Chat

```typescript
// frontend/components/chat/CrewActivity.tsx

interface AgentActivityEvent {
  node: string;
  data: {
    agent_outputs?: Record<string, any>;
    agent_messages?: AgentMessage[];
    completed_agents?: string[];
  };
}

function CrewActivityPanel({ events }: { events: AgentActivityEvent[] }) {
  const activeAgents = deriveActiveAgents(events);
  
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
      <div className="flex items-center gap-2">
        <UsersIcon className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-purple-400">Active Crew</span>
      </div>
      
      {activeAgents.map(agent => (
        <div key={agent.role} className="flex items-center gap-2">
          <AgentStatusDot status={agent.status} />
          <span className="text-xs capitalize text-foreground">{agent.role.replace("_", " ")}</span>
          <span className="text-xs text-muted-foreground ml-auto">{agent.currentAction}</span>
        </div>
      ))}
      
      {/* Inter-agent messages */}
      <AgentMessageThread messages={getInterAgentMessages(events)} />
    </div>
  );
}
```

---

## When NOT to Use a Crew

This is as important as knowing when to use one. A crew for a simple query is wasteful and slow.

| User Message | Use Crew? | Why |
|---|---|---|
| "What's the status of Project X?" | No | Single wiki/plan lookup |
| "Create a task: fix login bug" | No | Single task_manager action |
| "Summarize last week's meetings" | No | Single researcher action |
| "Research competitors and build a plan" | Yes | Research + planning domains |
| "Analyze our sprint, find risks, update wiki" | Yes | Analyst + risk_critic + wiki_writer |
| "Create Q3 OKRs from our goals and sync to Linear" | Yes | Planner + integration_executor |

The intent classifier's `complexity` and `required_capabilities` fields drive this decision. Enforce the rule: if `len(required_capabilities) <= 2` and `complexity != "very_high"`, use single agent.

---

## Done Criteria

- Simple queries (< 2 capabilities, low/medium complexity) still use single agent — no regression
- Complex multi-domain queries spawn the correct crew based on intent
- Each agent in a crew only has access to its scoped tools
- Inter-agent messages are visible in LangSmith traces
- Crew progress streams to frontend as SSE events
- At least 3 crew compositions tested end-to-end: (researcher + planner), (planner + risk_critic + task_manager), (researcher + wiki_writer + integration_executor)

**Time estimate: 4 weeks for one engineer. This is the biggest change — don't rush it.**

---

*Next: Topic 5 — Improved Procedural Memory*
