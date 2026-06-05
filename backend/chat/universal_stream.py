from __future__ import annotations

import json
import logging
import threading
from typing import Any, Iterator

from accounts.models import Team, User
from chat.agent_core import AgentConfig, AgentCore
from chat.models import ChatSession
from chat.multi_agent import AgentRole, get_orchestrator
from chat.tools import ToolContext, execute_tool, openai_tool_schemas, select_relevant_tools
from chat.wiki_search import _retrieve_wiki_citations
from ingest.vectors import vector_store
from teamos_project.entitlements import check_quota
from langsmith import traceable

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@traceable(name="intent_classification", run_type="chain")
def trace_classification(prompt, team, mode, session_id):
    from chat.intent.schema import IntentSchema, HybridClassification
    
    if mode == "research":
        intent = IntentSchema(
            intent_type="research/analyze",
            complexity="medium",
            domains=["research"],
            required_capabilities=["web_search"],
            confidence=1.0
        )
        return HybridClassification(intent=intent, layer_used=1)
        
    from chat.intent import HybridIntentClassifier
    classifier = HybridIntentClassifier()
    return classifier.classify(prompt, team, session_id=session_id)


@traceable(name="wiki_rag_retrieval", run_type="retriever")
def trace_retrieve_wiki_citations(team_id, prompt, team):
    return _retrieve_wiki_citations(team_id, prompt, team_obj=team)


@traceable(name="vector_search", run_type="retriever")
def trace_search_similar_pages(team_id, prompt, limit):
    return vector_store.search_similar_pages(team_id, prompt, limit=limit)


@traceable(name="universal_intelligence_events", run_type="chain")
def iter_universal_intelligence_events(
    *,
    team: Team,
    user: User,
    session: ChatSession,
    prompt: str,
    project_id: str | None = None,
    mode: str = "ask",
    state: dict[str, Any],
    cancel_evt: threading.Event | None = None,
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
    classification = trace_classification(prompt, team, mode, str(session.id))
    
    yield _sse("agent_strategy", {
        "primary_agent": classification.primary_agent.value,
        "reasoning_depth": classification.reasoning_depth,
        "confidence": classification.confidence,
        "intent_type": classification.intent.intent_type,
        "complexity": classification.intent.complexity,
        "domains": classification.intent.domains,
        "layer_used": classification.layer_used,
        "latency_ms": classification.latency_ms,
    })

    if classification.primary_agent == AgentRole.RESEARCH:
        research_quota = check_quota(team, "research_search")
        if not research_quota.allowed:
            yield _sse("error", {
                "detail": "Research mode is unavailable for this team right now.",
                "code": "research_unavailable",
                "details": research_quota.to_details(),
            })
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
        citations, context_str = trace_retrieve_wiki_citations(str(team.id), prompt, team)
        yield _sse("citations", {"citations": citations})
        state["citations"] = citations

        try:
            preloaded_rag = trace_search_similar_pages(str(team.id), prompt, 10)
        except Exception:
            preloaded_rag = None

    # Force ask mode to lightweight (no tools, RAG only)
    if mode == "ask":
        classification.primary_agent = AgentRole.LIGHTWEIGHT

    # Prepare ToolContext for tool-using agents
    from accounts.models import TeamMember
    membership = TeamMember.objects.filter(team=team, user=user).first()
    ctx = ToolContext(user=user, team_id=str(team.id), membership=membership, session_id=str(session.id))
    
    # Lightweight Lookup (no tools, speed optimized)
    if classification.primary_agent == AgentRole.LIGHTWEIGHT:
        config = AgentConfig(
            system_prefix=orchestrator.get_system_prompt(AgentRole.LIGHTWEIGHT),
            tools=[],
            execute_fn=execute_tool,
            enable_reflection=False,
            enable_inner_plan=False,
            enable_thinking_events=False,
        )
        agent = AgentCore(session=session, ctx=ctx, config=config, preloaded_rag=preloaded_rag)
        for event in agent.run(context_str, state, cancel_evt=cancel_evt):
            yield event
        return

    # Research Specialist (external source-backed)
    if research_mode:
        tools_list = orchestrator.get_tools(AgentRole.RESEARCH)
        tool_schemas = openai_tool_schemas(tools_list, team_id=str(team.id), user_id=str(user.id))
        tool_schemas = select_relevant_tools(prompt, tool_schemas, max_tools=8)

        sys_prompt = orchestrator.get_system_prompt(AgentRole.RESEARCH)
        try:
            from integrations.tool_registry import get_connected_providers_context
            sys_prompt += get_connected_providers_context(str(user.id))
        except Exception:
            pass

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
        for event in agent.run(context_str, state, cancel_evt=cancel_evt):
            yield event
        return

    # Default: Tool-using agent (Wiki specialist)
    tools_list = orchestrator.get_tools(classification.primary_agent)
    tool_schemas = openai_tool_schemas(tools_list, team_id=str(team.id), user_id=str(user.id))
    tool_schemas = select_relevant_tools(prompt, tool_schemas, max_tools=12)
    
    sys_prompt = orchestrator.get_system_prompt(classification.primary_agent)
    try:
        from integrations.tool_registry import get_connected_providers_context
        sys_prompt += get_connected_providers_context(str(user.id))
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
    
    agent = AgentCore(session=session, ctx=ctx, config=config, preloaded_rag=preloaded_rag)
    for event in agent.run(context_str, state, cancel_evt=cancel_evt):
        yield event
