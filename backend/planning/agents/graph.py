from langgraph.graph import StateGraph, END
from langgraph.constants import Send

from .state import PlanningState
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

def route_after_guardian(state: PlanningState) -> str:
    if state.get("error"):
        return "rejected"
    if state.get("guardian_approved"):
        return "approved"
    return "needs_modification"

def route_after_human(state: PlanningState) -> str:
    approved = state.get("human_approved")
    if approved is None:
        return "pending"
    return "approved" if approved else "rejected"

def build_planning_graph(checkpointer=None) -> StateGraph:
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
        route_after_guardian,
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
