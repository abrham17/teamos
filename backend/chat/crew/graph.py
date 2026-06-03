"""
Dynamic Crew Graph — LangGraph graph built at runtime from a CrewComposition.

The graph structure:
  supervisor → [parallel agents fan-out] → supervisor (synthesis)
             → [sequential agents in dependency order]
             → guardian → output → END
"""
import logging
from typing import Annotated

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.constants import Send
from typing_extensions import TypedDict

from chat.crew import CrewComposition
from chat.crew.supervisor import supervisor_node
from chat.crew.agents import create_agent_node

logger = logging.getLogger(__name__)


class CrewState(TypedDict):
    # Input
    user_message: str
    team_id: str
    session_id: str
    intent: dict
    crew_composition: dict

    # Per-agent outputs (keyed by role)
    agent_outputs: dict
    agent_messages: list

    # Supervisor
    supervisor_synthesis: dict
    final_output: dict

    # Control
    next_step: str
    next_agent: str
    guardian_approved: bool
    current_agents_running: list
    completed_agents: list
    messages: Annotated[list, add_messages]



def _guardian_node(state: CrewState) -> dict:
    """Run the Guardian's plan review on the supervisor synthesis."""
    from planning.guardian import review_plan
    from planning.simulation import simulate_plan

    synthesis = state.get("supervisor_synthesis", {})
    # Crew output may not always have a DB-writable plan; guardian just approves here
    # unless simulation data exists in agent outputs
    simulation = {}
    for role_output in state.get("agent_outputs", {}).values():
        if isinstance(role_output, dict) and "simulation_result" in role_output:
            simulation = role_output["simulation_result"]
            break

    review = review_plan(plan=synthesis, simulation=simulation, team_id=state["team_id"])
    return {"guardian_approved": review["approved"]}


def _output_node(state: CrewState) -> dict:
    """Consolidate supervisor synthesis into the final output."""
    return {"final_output": state.get("supervisor_synthesis", {})}


def _route_after_guardian(state: CrewState) -> str:
    return "output" if state.get("guardian_approved", True) else END


def _route_from_supervisor(state: CrewState):
    crew_comp = state.get("crew_composition", {})
    crew_list = crew_comp.get("crew", [])
    completed = state.get("completed_agents", [])

    # Find parallel agents that have not run yet
    parallel_roles = [
        spec["role"] for spec in crew_list
        if spec.get("runs_parallel") and not spec.get("depends_on")
    ]
    to_run_parallel = [r for r in parallel_roles if r not in completed]

    if to_run_parallel:
        return [Send(f"agent_{r}", state) for r in to_run_parallel]

    # Dynamic routing
    next_step = state.get("next_step")
    next_agent = state.get("next_agent")

    if next_step == "run_next_agent" and next_agent:
        node_name = f"agent_{next_agent}"
        # Safeguard: only route if it exists in crew_list
        all_roles = [spec["role"] for spec in crew_list]
        if next_agent in all_roles:
            return node_name

    return "guardian"


def build_crew_graph(crew_composition: CrewComposition, checkpointer=None):
    """
    Dynamically construct a LangGraph graph from a CrewComposition.
    Returns a compiled graph ready for streaming.
    """
    graph = StateGraph(CrewState)

    # Fixed nodes
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("guardian", _guardian_node)
    graph.add_node("output", _output_node)

    for spec in crew_composition.crew:
        node_name = f"agent_{spec.role}"
        graph.add_node(node_name, create_agent_node(spec))
        # All crew agents report back to supervisor upon completion
        graph.add_edge(node_name, "supervisor")

    # Entry point is always supervisor
    graph.set_entry_point("supervisor")

    # Supervisor routes dynamically
    path_map = {
        "guardian": "guardian",
    }
    for spec in crew_composition.crew:
        node_name = f"agent_{spec.role}"
        path_map[node_name] = node_name

    graph.add_conditional_edges(
        "supervisor",
        _route_from_supervisor,
        path_map
    )

    # Guardian routes to output or ENDs
    graph.add_conditional_edges("guardian", _route_after_guardian, {"output": "output", END: END})
    graph.add_edge("output", END)

    return graph.compile(checkpointer=checkpointer)
