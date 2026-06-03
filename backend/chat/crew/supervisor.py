"""
Crew Supervisor node — coordinates agent runs and synthesises their outputs.
Does NOT execute tasks itself; it directs traffic and resolves conflicts.
"""
import json
import logging
import time

from langsmith import traceable

logger = logging.getLogger(__name__)

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

Agent messages (inter-agent communication):
{agent_messages}

## Your Task
1. If parallel agents just completed, synthesize their outputs before proceeding.
2. Identify conflicts between agent findings and resolve them.
3. Decide: should the next sequential agent run now? Or do we need more from current agents?
4. If all agents are complete, produce the final synthesized output.

## Output (JSON only, no preamble)
{{
  "action": "run_next_agent" | "request_more" | "synthesize_final",
  "next_agent": "task_manager",
  "synthesis": {{}},
  "conflict_resolutions": [],
  "inter_agent_message": "Researcher found X, Planner should account for this in timeline"
}}
"""


@traceable(name="supervisor_node", run_type="chain")
def supervisor_node(state: dict) -> dict:
    from llm_orchestrator.orchestrator import llm_json_call
    from accounts.models import Team

    team = Team.objects.get(id=state["team_id"])

    prompt = SUPERVISOR_PROMPT.format(
        user_message=state.get("user_message", ""),
        supervisor_instructions=state.get("crew_composition", {}).get("supervisor_instructions", ""),
        completed_agents=json.dumps(state.get("completed_agents", [])),
        current_agents_running=json.dumps(state.get("current_agents_running", [])),
        agent_outputs=json.dumps(state.get("agent_outputs", {}), indent=2)[:6000],
        agent_messages=json.dumps(state.get("agent_messages", []), indent=2)[:2000],
    )

    result = llm_json_call(
        team=team,
        operation="crew_supervisor",
        messages=[{"role": "user", "content": prompt}],
        default_on_error={"action": "synthesize_final", "synthesis": {}, "conflict_resolutions": []},
    )

    updates: dict = {}

    updates["next_step"] = result.get("action", "synthesize_final")
    updates["next_agent"] = result.get("next_agent", "")

    if result.get("action") == "synthesize_final":
        updates["supervisor_synthesis"] = result.get("synthesis", {})

    if result.get("inter_agent_message"):
        updates["agent_messages"] = [
            *state.get("agent_messages", []),
            {
                "from": "supervisor",
                "to": result.get("next_agent"),
                "content": result["inter_agent_message"],
                "timestamp": time.time(),
            },
        ]

    return updates
