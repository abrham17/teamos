"""Multi-agent orchestration — specialist agents with coordinator routing."""

import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator

from llm_orchestrator.orchestrator import llm_call

logger = logging.getLogger(__name__)


class AgentRole(Enum):
    COORDINATOR = "coordinator"
    WIKI = "wiki"
    PLAN = "plan"
    STRATEGIC_PLANNER = "strategic_planner"  # Deep reasoning pipeline
    ANALYST = "analyst"
    LIGHTWEIGHT = "lightweight"  # Quick RAG lookup


@dataclass
class AgentMessage:
    from_agent: AgentRole
    to_agent: AgentRole
    intent: str  # "request_info", "delegate_task", "report_finding"
    payload: dict
    priority: int = 1
    requires_response: bool = True


@dataclass
class Classification:
    primary_agent: AgentRole
    requires_multiple: bool = False
    subtasks: list[tuple[AgentRole, str]] = field(default_factory=list)
    confidence: float = 1.0
    reasoning_depth: str = "standard"  # "lightweight", "standard", "deep"


SPECIALIST_SYSTEM_PROMPTS = {
    AgentRole.WIKI: (
        "You are the WikiAgent — a knowledge management specialist. "
        "Your expertise: wiki page creation/editing, knowledge organization, "
        "page quality assessment, linking strategy, content structuring. "
        "Use wiki_* and graph_* tools. Focus on knowledge accuracy and organization."
    ),
    AgentRole.PLAN: (
        "You are the PlanAgent — a project planning specialist. "
        "Your expertise: project management, task tracking, scheduling, "
        "resource allocation, status updates. "
        "Use project_query / task_query / milestone_query on write tools (casual names, not UUIDs). "
        "Focus on maintaining and updating existing plans."
    ),
    AgentRole.STRATEGIC_PLANNER: (
        "You are the Strategic Planner — a deep-reasoning project architect. "
        "Your expertise: building comprehensive project roadmaps from scratch, "
        "complex mission decomposition, multi-source research, and risk mitigation. "
        "You use a structured 5-stage reasoning pipeline: Decompose -> Research -> Draft -> Critique -> Finalize."
    ),
    AgentRole.ANALYST: (
        "You are the AnalystAgent — a data analysis specialist. "
        "Your expertise: retrospectives, trend detection, performance analysis, "
        "knowledge gap identification. Use memory_* and analytics tools. "
        "Focus on actionable insights from data."
    ),
    AgentRole.LIGHTWEIGHT: (
        "You are a Lightweight Assistant. You provide quick, accurate answers from existing knowledge "
        "without using complex tools or planning loops. Focus on speed and directness."
    ),
}

SPECIALIST_TOOLS = {
    AgentRole.WIKI: [
        "wiki_search_pages", "wiki_list_pages", "wiki_team_overview",
        "wiki_read_full_page", "wiki_create_page",
        "wiki_update_page", "wiki_delete_page", "wiki_list_pages",
        "graph_add_edge", "graph_remove_edge", "graph_traverse_neighbors",
        "graph_add_typed_relation", "knowledge_gap_analysis",
    ],
    AgentRole.PLAN: [
        "plan_search", "plan_read_entity", "plan_list_projects",
        "plan_create_project", "plan_update_project", "plan_delete_project",
        "plan_create_task", "plan_update_task", "plan_delete_task",
        "plan_create_milestone", "plan_update_milestone",
        "plan_detect_conflicts", "plan_sync_wiki", "plan_risk_assessment",
        "plan_check_overdue",
    ],
    AgentRole.STRATEGIC_PLANNER: [
        "plan_generate_draft", "plan_detect_conflicts", "plan_risk_assessment",
        "plan_sync_wiki", "wiki_search_pages", "graph_traverse_neighbors",
    ],
    AgentRole.ANALYST: [
        "memory_search", "memory_store", "memory_delete",
        "plan_get_analytics", "wiki_get_analytics",
    ],
    AgentRole.LIGHTWEIGHT: [],  # No tools, just RAG
}


class AgentOrchestrator:
    """Routes complex requests across specialist agents."""

    def __init__(self, team_id: str, user_id: str):
        self.team_id = team_id
        self.user_id = user_id

    async def classify(self, user_message: str) -> Classification:
        """Determine which specialist(s) should handle this request."""
        prompt = f"""Classify this user request for routing to specialist agents.

User message: "{user_message}"

Available specialists:
- lightweight: Quick lookup, factual answer, no tools needed. Choose this for simple questions.
- wiki: knowledge management, wiki edits, linking strategy.
- plan: project management, listing tasks, minor schedule updates.
- strategic_planner: Building a new project plan from scratch, complex roadmapping, deep reasoning.
- analyst: data analysis, retrospectives, trends.

Return JSON:
{{
  "primary_agent": "lightweight|wiki|plan|strategic_planner|analyst",
  "reasoning_depth": "lightweight|standard|deep",
  "requires_multiple": true/false,
  "subtasks": [["agent_name", "subtask description"], ...],
  "confidence": 0.0-1.0
}}

If the user wants to "create a plan", "architect a project", or "build a roadmap", use strategic_planner and deep reasoning.
If the user asks a simple question like "Who is...", use lightweight."""

        resp, _, _ = llm_call(
            messages=[
                {"role": "system", "content": "You are a request router. Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
        )

        try:
            import json
            data = json.loads(resp.choices[0].message.content if resp else "{}")
            primary = AgentRole(data.get("primary_agent", "lightweight"))
            return Classification(
                primary_agent=primary,
                requires_multiple=data.get("requires_multiple", False),
                subtasks=[
                    (AgentRole(st[0]), st[1])
                    for st in data.get("subtasks", [])
                ],
                confidence=data.get("confidence", 0.8),
                reasoning_depth=data.get("reasoning_depth", "standard"),
            )
        except (json.JSONDecodeError, AttributeError, ValueError):
            return Classification(primary_agent=AgentRole.LIGHTWEIGHT)

    def classify_sync(self, user_message: str, team) -> Classification:
        """Synchronous classification with team budget awareness."""
        import json as _json
        prompt = f"""Classify this user request for routing to specialist agents.

User message: "{user_message}"

Available specialists:
- lightweight: Quick lookup, factual answer, no tools needed.
- wiki: knowledge management, wiki edits.
- plan: project management, minor updates.
- strategic_planner: New project creation, roadmapping, deep reasoning.
- analyst: data analysis.

Return JSON:
{{
  "primary_agent": "lightweight|wiki|plan|strategic_planner|analyst",
  "reasoning_depth": "lightweight|standard|deep",
  "requires_multiple": true/false,
  "subtasks": [["agent_name", "subtask description"], ...],
  "confidence": 0.0-1.0
}}"""

        try:
            resp, _, _ = llm_call(
                team=team,
                operation="query_expansion",
                messages=[
                    {"role": "system", "content": "You are a request router. Return only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
            )
            data = _json.loads(resp.choices[0].message.content if resp else "{}")
            primary = AgentRole(data.get("primary_agent", "lightweight"))
            return Classification(
                primary_agent=primary,
                requires_multiple=data.get("requires_multiple", False),
                subtasks=[
                    (AgentRole(st[0]), st[1])
                    for st in data.get("subtasks", [])
                ],
                confidence=data.get("confidence", 0.8),
                reasoning_depth=data.get("reasoning_depth", "standard"),
            )
        except Exception:
            return Classification(primary_agent=AgentRole.LIGHTWEIGHT)

    def get_system_prompt(self, role: AgentRole) -> str:
        return SPECIALIST_SYSTEM_PROMPTS.get(role, "")

    def get_tools(self, role: AgentRole) -> list[str]:
        return SPECIALIST_TOOLS.get(role, [])

    async def handoff(
        self, from_agent: AgentRole, to_agent: AgentRole,
        intent: str, payload: dict
    ) -> dict:
        """Pass work from one specialist to another."""
        msg = AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            intent=intent,
            payload=payload,
        )

        logger.info(
            "Handoff: %s → %s [%s]",
            from_agent.value, to_agent.value, intent
        )

        # The receiving agent processes the handoff
        prompt = f"""You received a handoff from the {from_agent.value} agent.

Intent: {intent}
Payload: {payload}

Process this handoff and return your findings or actions taken.
Return JSON with your response."""

        resp, _, _ = llm_call(
            system=self.get_system_prompt(to_agent),
            prompt=prompt,
        )

        try:
            import json
            return json.loads(resp.choices[0].message.content if resp else "{}")
        except (json.JSONDecodeError, AttributeError):
            return {"status": "error", "detail": "Handoff processing failed"}

    async def synthesize(self, results: list[dict]) -> str:
        """Combine results from multiple specialists into a coherent response."""
        prompt = f"""Synthesize these results from multiple specialist agents into a single coherent response.

Results:
{results}

Create a unified response that:
1. Addresses the user's original request
2. Integrates findings from all specialists
3. Highlights any conflicts or dependencies between findings
4. Provides clear next steps

Output in natural language, formatted as markdown."""

        resp, _, _ = llm_call(
            messages=[
                {"role": "system", "content": "You are a coordinator synthesizing multi-agent results."},
                {"role": "user", "content": prompt},
            ],
        )
        return resp.choices[0].message.content if resp else ""


# Singleton instance per request
_orchestrators: dict[str, AgentOrchestrator] = {}


def get_orchestrator(team_id: str, user_id: str) -> AgentOrchestrator:
    key = f"{team_id}:{user_id}"
    if key not in _orchestrators:
        _orchestrators[key] = AgentOrchestrator(team_id, user_id)
    return _orchestrators[key]
