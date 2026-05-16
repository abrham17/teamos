from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from accounts.models import Team, User
from chat.agent_core import AgentConfig, AgentCore
from chat.models import ChatMessage, ChatSession
from chat.multi_agent import AgentRole, get_orchestrator
from chat.tools import ToolContext, execute_tool, openai_tool_schemas
from chat.wiki_search import _retrieve_wiki_citations

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def iter_universal_intelligence_events(
    *,
    team: Team,
    user: User,
    session: ChatSession,
    prompt: str,
    project_id: str | None = None,
    state: dict[str, Any],
) -> Iterator[str]:
    """
    Main entry point for Universal Intelligence.
    Classifies intent and routes to the appropriate reasoning engine.
    """
    orchestrator = get_orchestrator(str(team.id), str(user.id))
    state["full_text"] = ""
    state["tool_trace"] = []
    state["ok"] = False
    
    # 1. Classification Phase
    yield _sse("status", {"status": "Analyzing mission intent..."})
    classification = orchestrator.classify_sync(prompt, team)
    
    yield _sse("agent_strategy", {
        "primary_agent": classification.primary_agent.value,
        "reasoning_depth": classification.reasoning_depth,
        "confidence": classification.confidence,
    })

    # 2. Knowledge Retrieval (Always do RAG to ground the agent)
    yield _sse("status", {"status": "Searching team knowledge..."})
    citations, context_str = _retrieve_wiki_citations(str(team.id), prompt, team_obj=team)
    yield _sse("citations", {"citations": citations})
    state["citations"] = citations

    # 3. Routing Phase
    
    # CASE A: Strategic Planning (Deep Reasoning Pipeline)
    if classification.primary_agent == AgentRole.STRATEGIC_PLANNER:
        from planning.agent_executor import run_planner_agent_v2
        # Planning agent handles its own persistence and high-fidelity events
        yield from run_planner_agent_v2(
            team_id=str(team.id),
            prompt=prompt,
            mode="manage" if project_id else "create",
            project_id=project_id,
            user=user,
        )
        state["ok"] = True
        return

    # Prepare ToolContext for cases B & C
    from accounts.models import TeamMember
    membership = TeamMember.objects.filter(team=team, user=user).first()
    ctx = ToolContext(user=user, team_id=str(team.id), membership=membership, session_id=str(session.id))
    
    # CASE B: Lightweight Lookup (Speed Optimized)
    if classification.primary_agent == AgentRole.LIGHTWEIGHT:
        config = AgentConfig(
            system_prefix=orchestrator.get_system_prompt(AgentRole.LIGHTWEIGHT),
            tools=[],  # No tools for speed
            execute_fn=execute_tool,
            enable_reflection=False,
            enable_inner_plan=False,
            enable_thinking_events=False,
        )
        agent = AgentCore(session=session, ctx=ctx, config=config)
        
        # We need a small wrapper to capture the results for state
        for event in agent.run(context_str, state):
            yield event
        return

    # CASE C: Operational Specialist (Tool-using loop)
    tools_list = orchestrator.get_tools(classification.primary_agent)
    tool_schemas = openai_tool_schemas(tools_list)
    
    config = AgentConfig(
        system_prefix=orchestrator.get_system_prompt(classification.primary_agent),
        tools=tool_schemas,
        execute_fn=execute_tool,
        mode=classification.primary_agent.value,
        enable_reflection=True,
        enable_inner_plan=True,
    )
    
    agent = AgentCore(session=session, ctx=ctx, config=config)
    for event in agent.run(context_str, state):
        yield event

