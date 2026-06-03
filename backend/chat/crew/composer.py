"""
Crew Composer — maps an IntentSchema to a CrewComposition via LLM.
Only invoked for complex, multi-domain intents.
"""
import json
import logging
from dataclasses import asdict

from langsmith import traceable

from chat.crew import IntentSchema, AgentRoleSpec, CrewComposition

logger = logging.getLogger(__name__)

AVAILABLE_ROLES = {
    "researcher": {
        "description": "Web search, document ingestion, knowledge retrieval, graph traversal",
        "tools": ["web_search", "wiki_search_pages", "graph_get_neighbors", "ingest_url"],
        "max_concurrent": 2,
    },
    "strategic_planner": {
        "description": "6-stage planning pipeline, project structuring, milestone definition",
        "tools": ["plan_create_project", "plan_create_milestone", "planning_engine"],
        "max_concurrent": 1,
    },
    "task_manager": {
        "description": "Task creation, assignment, dependency management, scheduling",
        "tools": ["plan_create_task", "plan_assign_member", "plan_detect_conflicts"],
        "max_concurrent": 1,
    },
    "risk_critic": {
        "description": "Evaluates plans for risks, feasibility issues, and blind spots",
        "tools": ["plan_assess_risk", "wiki_search_pages", "graph_get_neighbors"],
        "max_concurrent": 1,
    },
    "wiki_writer": {
        "description": "Knowledge base creation, page updates, semantic linking",
        "tools": ["wiki_create_page", "wiki_update_page", "wiki_search_pages", "graph_add_edge"],
        "max_concurrent": 1,
    },
    "integration_executor": {
        "description": "External tool execution: GitHub, Slack, Jira, Linear, Notion",
        "tools": ["ext_github_*", "ext_slack_*", "ext_jira_*", "ext_linear_*"],
        "max_concurrent": 2,
    },
    "analyst": {
        "description": "Data analysis, metrics interpretation, performance review",
        "tools": ["memory_retrieve", "wiki_search_pages", "graph_analytics"],
        "max_concurrent": 1,
    },
}

CREW_COMPOSER_PROMPT = """
You are the TeamOS Crew Composer. Based on the user's intent, select the minimum set of agent roles needed.

## User Intent
{intent_schema}

## User Message
{user_message}

## Available Roles
{available_roles}

## Rules
- Select the minimum roles that cover all required_capabilities
- Do NOT add roles "just in case" — every role adds latency and cost
- If complexity is "low", use at most 2 roles
- If complexity is "medium", use 2-3 roles
- If complexity is "high" or "very_high", use 3-5 roles
- Always include a role that covers the primary intent_type
- risk_critic MUST be included whenever strategic_planner is included

## Output (JSON only, no preamble)
{{
  "crew": [
    {{
      "role": "researcher",
      "priority": 1,
      "runs_parallel": true,
      "depends_on": [],
      "instructions": "Focus on competitor pricing and market positioning"
    }}
  ],
  "supervisor_instructions": "Coordinate outputs into a unified deliverable",
  "estimated_total_rounds": 8
}}
"""


@traceable(name="compose_crew", run_type="chain")
def compose_crew(intent: IntentSchema, user_message: str, team) -> CrewComposition:
    """
    Call the LLM to map an IntentSchema to a CrewComposition.
    Falls back to a sensible single-role crew on any error.
    """
    from llm_orchestrator.orchestrator import llm_json_call

    prompt = CREW_COMPOSER_PROMPT.format(
        intent_schema=json.dumps(asdict(intent), indent=2),
        available_roles=json.dumps(AVAILABLE_ROLES, indent=2),
        user_message=user_message,
    )

    default_crew = {
        "crew": [{"role": "researcher", "priority": 1, "runs_parallel": False, "depends_on": [], "instructions": user_message}],
        "supervisor_instructions": "Complete the user request as best you can.",
        "estimated_total_rounds": 4,
    }

    try:
        result = llm_json_call(
            team=team,
            operation="crew_composition",
            messages=[{"role": "user", "content": prompt}],
            default_on_error=default_crew,
        )
    except Exception:
        logger.exception("Crew composition LLM call failed — using fallback")
        result = default_crew

    crew = [
        AgentRoleSpec(
            role=spec["role"],
            priority=spec.get("priority", 1),
            runs_parallel=spec.get("runs_parallel", False),
            depends_on=spec.get("depends_on", []),
            instructions=spec.get("instructions", ""),
        )
        for spec in result.get("crew", default_crew["crew"])
    ]

    return CrewComposition(
        crew=crew,
        supervisor_instructions=result.get("supervisor_instructions", ""),
        estimated_total_rounds=result.get("estimated_total_rounds", 8),
    )
