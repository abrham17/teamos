import json
from langsmith import traceable
from llm_orchestrator.orchestrator import llm_json_call
from accounts.models import Team
from .context import GuardianContext, GuardianResult

TIER2_TRIGGER_TOOLS = {
    "plan_create_project",
    "plan_bulk_create_tasks",
    "plan_assign_members",
    "wiki_create_page",
    "ingest_materialize_changeset",
    "graph_bulk_add_edges",
}

def should_trigger_tier2(tool_name: str) -> bool:
    if tool_name in TIER2_TRIGGER_TOOLS:
        return True
    if tool_name.startswith("mcp_"):
        try:
            from chat.mcp.registry import get_mcp_registry
            registry = get_mcp_registry()
            tool_def = registry.get_tool(tool_name)
            if tool_def and tool_def.risk_level == "high":
                return True
        except Exception:
            pass
    return False

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
  "risk_score": 0,
  "issues": ["issue1", "issue2"],
  "modifications": {{}},
  "reason": "one sentence explanation"
}}
"""

@traceable(name="guardian_tier2", run_type="chain")
def tier2_check(
    tool_name: str,
    tool_input: dict,
    context: GuardianContext
) -> GuardianResult:
    
    if not should_trigger_tier2(tool_name):
        return GuardianResult(approved=True, tier=2, skipped=True)
    
    prompt = GUARDIAN_PROMPT.format(
        tool_name=tool_name,
        tool_input=json.dumps(tool_input, indent=2),
        team_id=context.acting_team_id,
        project_summary=context.project_summary,
        recent_actions=json.dumps(context.recent_actions[-5:]),
        simulation_results=json.dumps(context.simulation_results or {})
    )
    
    try:
        team = Team.objects.get(id=context.acting_team_id)
        result = llm_json_call(
            team=team,
            operation="guardian_review",
            messages=[{"role": "user", "content": prompt}],
            default_on_error={
                "approved": True,
                "risk_score": 0,
                "issues": [],
                "reason": "Fallback approval due to LLM error"
            }
        )
        
        return GuardianResult(
            approved=result.get("approved", True),
            tier=2,
            risk_score=result.get("risk_score", 0),
            issues=result.get("issues", []),
            modifications=result.get("modifications"),
            reason=result.get("reason", "")
        )
    except Exception as e:
        return GuardianResult(
            approved=True,
            tier=2,
            reason=f"Guardian error: {str(e)}"
        )
