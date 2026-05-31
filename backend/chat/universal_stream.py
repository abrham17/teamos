from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from accounts.models import Team, User
from chat.agent_core import AgentConfig, AgentCore
from chat.models import ChatSession
from chat.multi_agent import AgentRole, get_orchestrator
from chat.tools import ToolContext, execute_tool, openai_tool_schemas, select_relevant_tools
from chat.wiki_search import _retrieve_wiki_citations
from ingest.vectors import vector_store
from teamos_project.entitlements import check_quota

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
    mode: str = "ask",
    state: dict[str, Any],
) -> Iterator[str]:
    """
    Main entry point for Universal Intelligence.
    Classifies intent and routes to the appropriate reasoning engine.
    ``mode`` is the user-selected chat mode ("ask", "agent", "plan", "research") and
    biases classification toward the corresponding specialist.
    """
    orchestrator = get_orchestrator(str(team.id), str(user.id))
    state["full_text"] = ""
    state["tool_trace"] = []
    state["ok"] = False
    
    # 1. Classification Phase
    yield _sse("status", {"status": "Analyzing mission intent..."})
    classification = orchestrator.classify_sync(prompt, team, preferred_mode=mode)
    
    yield _sse("agent_strategy", {
        "primary_agent": classification.primary_agent.value,
        "reasoning_depth": classification.reasoning_depth,
        "confidence": classification.confidence,
    })

    if classification.primary_agent == AgentRole.RESEARCH:
        research_quota = check_quota(team, "research_search")
        if not research_quota.allowed:
            yield _sse(
                "error",
                {
                    "detail": "Research mode is unavailable for this team right now.",
                    "code": "research_unavailable",
                    "details": research_quota.to_details(),
                },
            )
            return

    research_mode = classification.primary_agent == AgentRole.RESEARCH

    # 2. Knowledge Retrieval
    if research_mode:
        yield _sse("research_start", {"query": prompt, "status": "Searching external sources..."})
        state["citations"] = []
        context_str = ""
        preloaded_rag = []
    else:
        yield _sse("status", {"status": "Searching team knowledge..."})
        citations, context_str = _retrieve_wiki_citations(str(team.id), prompt, team_obj=team)
        yield _sse("citations", {"citations": citations})
        state["citations"] = citations

        # P1.3: Pre-fetch RAG results to pass into AgentCore (avoids redundant search)
        try:
            preloaded_rag = vector_store.search_similar_pages(str(team.id), prompt, limit=10)
        except Exception:
            preloaded_rag = None

    # 3. Routing Phase
    
    # CASE A: Strategic Planning (Deep Reasoning Pipeline)
    if classification.primary_agent == AgentRole.STRATEGIC_PLANNER:
        from planning.agent_executor import run_planner_agent_v2
        
        chat_history = []
        try:
            msgs = session.messages.order_by("created_at")[:50]
            for m in msgs:
                # Classify sender_type to role
                role = "assistant" if m.sender_type == "assistant" else "user"
                chat_history.append({"role": role, "content": m.content})
        except Exception:
            logger.exception("Failed to build chat history for strategic planner")

        # Planning agent handles its own persistence and high-fidelity events
        yield from run_planner_agent_v2(
            team_id=str(team.id),
            prompt=prompt,
            mode="manage" if project_id else "create",
            project_id=project_id,
            user=user,
            chat_history=chat_history,
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
        agent = AgentCore(session=session, ctx=ctx, config=config,
                          preloaded_rag=preloaded_rag)
        
        # We need a small wrapper to capture the results for state
        for event in agent.run(context_str, state):
            yield event
        return

    # CASE D: Research Specialist (External source-backed lookup)
    if research_mode:
        tools_list = orchestrator.get_tools(AgentRole.RESEARCH)
        tool_schemas = openai_tool_schemas(tools_list, team_id=str(team.id))
        tool_schemas = select_relevant_tools(prompt, tool_schemas, max_tools=8)

        sys_prompt = orchestrator.get_system_prompt(AgentRole.RESEARCH)
        config = AgentConfig(
            system_prefix=sys_prompt,
            tools=tool_schemas,
            execute_fn=execute_tool,
            mode=AgentRole.RESEARCH.value,
            max_rounds=6,
            max_tools=12,
            enable_reflection=True,
            enable_inner_plan=True,
            enable_thinking_events=True,
        )

        agent = AgentCore(session=session, ctx=ctx, config=config, preloaded_rag=preloaded_rag)
        for event in agent.run(context_str, state):
            yield event
        return

    # CASE C: Operational Specialist (Tool-using loop)
    tools_list = orchestrator.get_tools(classification.primary_agent)
    tool_schemas = openai_tool_schemas(tools_list, team_id=str(team.id))
    tool_schemas = select_relevant_tools(prompt, tool_schemas, max_tools=12)
    
    sys_prompt = orchestrator.get_system_prompt(classification.primary_agent)
    try:
        from django.core.cache import cache
        directives = cache.get(f"behavior_directives:{str(team.id)}")
        if directives:
            directives_text = "\n".join(f"- {d}" for d in directives)
            sys_prompt += (
                f"\n\nCRITICAL BEHAVIORAL DIRECTIVES (LEARNED FROM PAST RUNS):\n"
                f"{directives_text}\n"
            )
    except Exception:
        pass

    config = AgentConfig(
        system_prefix=sys_prompt,
        tools=tool_schemas,
        execute_fn=execute_tool,
        mode=classification.primary_agent.value,
        enable_reflection=True,
        enable_inner_plan=True,
    )
    
    agent = AgentCore(session=session, ctx=ctx, config=config,
                      preloaded_rag=preloaded_rag)
    for event in agent.run(context_str, state):
        yield event
