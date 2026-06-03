"""
LangGraph node functions for the TeamOS Planning Graph.

Each node is a pure function: receives PlanningState, returns a partial
state update dict. All heavy imports are lazy to avoid circular dependencies
and to keep Django's ORM initialisation order correct.
"""
import logging
import json
from dataclasses import asdict

from accounts.models import Team
from planning.agents.state import PlanningState

logger = logging.getLogger(__name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_pipeline(state: PlanningState):
    from chat.models import ChatSession
    from planning.reasoning_pipeline import PlanningReasoningPipeline
    team = Team.objects.get(id=state["team_id"])
    session = ChatSession.objects.get(id=state["session_id"])
    return PlanningReasoningPipeline(team=team, user=session.created_by)


def _restore_domain_ctx(pipeline, synthesis: dict):
    """Restore a domain context object on the pipeline from serialised state."""
    ctx = type("DomainContext", (), synthesis)()
    for k, v in synthesis.items():
        setattr(ctx, k, v)
    pipeline.domain_ctx = ctx


def _make_research_result(research_state: dict):
    from planning.reasoning_pipeline import ResearchResult
    return ResearchResult(
        snippets=[],            # snippet objects not needed downstream
        context_text=research_state.get("context_text", ""),
        wiki_is_sparse=research_state.get("wiki_is_sparse", False),
        knowledge_gaps=research_state.get("knowledge_gaps", []),
        expertise_map=research_state.get("expertise_map", {}),
    )


# ── nodes ─────────────────────────────────────────────────────────────────────

def research_node(state: PlanningState) -> dict:
    pipeline = _get_pipeline(state)
    results = pipeline._research(state["user_prompt"])
    return {
        "research_results": asdict(results),
        "current_stage": "research_complete",
    }


def synthesize_node(state: PlanningState) -> dict:
    from planning.domain_classifier import synthesize_domain
    pipeline = _get_pipeline(state)
    domain_ctx = synthesize_domain(
        state["user_prompt"],
        state["research_results"].get("context_text", ""),
        pipeline.team,
    )
    return {
        "synthesis": asdict(domain_ctx),
        "current_stage": "synthesis_complete",
    }


def parallel_strategy_launcher(state: PlanningState) -> dict:
    return {"current_stage": "strategies_launching"}


def fast_strategy_node(state: PlanningState) -> dict:
    pipeline = _get_pipeline(state)
    _restore_domain_ctx(pipeline, state["synthesis"])
    research_res = _make_research_result(state["research_results"])

    decomp, draft = pipeline._decompose_and_draft(
        prompt=state["user_prompt"],
        mode="create",
        project_context=None,
        research=research_res,
        strategy="fast_track",
    )
    return {"strategy_fast": {"decomposition": asdict(decomp), "draft": asdict(draft)}}


def safe_strategy_node(state: PlanningState) -> dict:
    pipeline = _get_pipeline(state)
    _restore_domain_ctx(pipeline, state["synthesis"])
    research_res = _make_research_result(state["research_results"])

    decomp, draft = pipeline._decompose_and_draft(
        prompt=state["user_prompt"],
        mode="create",
        project_context=None,
        research=research_res,
        strategy="risk_mitigated",
    )
    return {"strategy_safe": {"decomposition": asdict(decomp), "draft": asdict(draft)}}


def critique_node(state: PlanningState) -> dict:
    from planning.reasoning_pipeline import DecompositionResult, PlanDraft
    pipeline = _get_pipeline(state)

    fast_decomp = DecompositionResult(**state["strategy_fast"]["decomposition"])
    fast_draft  = PlanDraft(**state["strategy_fast"]["draft"])
    safe_decomp = DecompositionResult(**state["strategy_safe"]["decomposition"])
    safe_draft  = PlanDraft(**state["strategy_safe"]["draft"])

    choice, draft, decomp, critique = pipeline._evaluate_and_select(
        fast_decomp, fast_draft, safe_decomp, safe_draft,
    )
    return {
        "selected_strategy": asdict(draft),
        "critique_score": critique.score,
        "current_stage": "critique_complete",
    }


def finalize_node(state: PlanningState) -> dict:
    from planning.reasoning_pipeline import PlanDraft
    pipeline = _get_pipeline(state)
    draft = PlanDraft(**state["selected_strategy"])
    final_draft = pipeline._finalize(draft)
    return {
        "final_plan": asdict(final_draft),
        "current_stage": "finalize_complete",
    }


def simulation_node(state: PlanningState) -> dict:
    from planning.simulation import simulate_plan
    simulation = simulate_plan(plan=state["final_plan"], team_id=state["team_id"])
    return {
        "simulation_result": simulation,
        "current_stage": "simulation_complete",
    }


def guardian_node(state: PlanningState) -> dict:
    from planning.guardian import review_plan
    review = review_plan(
        plan=state["final_plan"],
        simulation=state["simulation_result"],
        team_id=state["team_id"],
    )
    return {
        "guardian_approved": review["approved"],
        "final_plan": review.get("modified_plan", state["final_plan"]),
        "current_stage": "guardian_complete",
    }


def human_review_node(state: PlanningState) -> dict:
    """Pause point — LangGraph's interrupt_before=[\"human_review\"] handles the actual pause."""
    return {"current_stage": "awaiting_human_approval"}


def db_mutation_node(state: PlanningState) -> dict:
    from planning.engine import run_db_mutation_stage_langgraph
    pipeline = _get_pipeline(state)
    result = run_db_mutation_stage_langgraph(
        plan=state["final_plan"],
        team_id=state["team_id"],
        session_id=state["session_id"],
        user=pipeline.user,
        thread_id=state.get("thread_id"),
    )
    return {
        "current_stage": "complete",
        "project_id": result["project_id"],
    }


def error_handler_node(state: PlanningState) -> dict:
    logger.error(
        "Planning graph failed",
        extra={
            "stage": state.get("current_stage"),
            "error": state.get("error"),
            "team_id": state.get("team_id"),
            "session_id": state.get("session_id"),
        },
    )
    return {"current_stage": "failed"}
