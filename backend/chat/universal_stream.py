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


def _crew_needed(classification, prompt: str) -> bool:
    """
    Heuristic: use the Dynamic Crew when intent complexity is high and multiple
    capability domains are required. Low/medium complexity stays on single-agent.
    """
    from django.conf import settings
    if not getattr(settings, "CHAT_USE_CREW_FACTORY", False):
        return False
    # Rough proxy: very long prompts mentioning multiple action verbs are complex
    multi_domain_keywords = (
        "and then", "also", "afterwards", "additionally", "as well as",
        "research", "analyze", "create a plan", "update the wiki",
    )
    prompt_lower = prompt.lower()
    keyword_hits = sum(1 for kw in multi_domain_keywords if kw in prompt_lower)
    return keyword_hits >= 2


def _inject_procedural_directives(sys_prompt: str, team, prompt: str, intent_type: str) -> str:
    """Helper to load relevant ProceduralMemory directives and append them to sys_prompt."""
    try:
        from chat.models import AgentEpisode
        from chat.memory.domain_inferencer import infer_domain
        from chat.memory.injection import get_relevant_directives, format_directives_for_prompt
        
        mock_episode = AgentEpisode(team=team, trigger=prompt)
        domain = infer_domain(mock_episode)
        
        directives = get_relevant_directives(
            team_id=str(team.id),
            intent_type=intent_type,
            domain=domain,
            max_directives=8
        )
        directive_text = format_directives_for_prompt(directives)
        if directive_text:
            sys_prompt += "\n" + directive_text
    except Exception:
        logger.exception("Failed to inject procedural directives")
    return sys_prompt


@traceable(name="intent_classification", run_type="chain")
def trace_classification(prompt, team, mode, session_id):
    from chat.multi_agent import AgentRole
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
        
    if mode == "plan":
        intent = IntentSchema(
            intent_type="plan/update",
            complexity="medium",
            domains=["operations"],
            required_capabilities=["task_management"],
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


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


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
    ``mode`` is the user-selected chat mode ("ask", "agent", "plan", "research") and
    biases classification toward the corresponding specialist.
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
        "is_crew": _crew_needed(classification, prompt),
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
        citations, context_str = trace_retrieve_wiki_citations(str(team.id), prompt, team)
        yield _sse("citations", {"citations": citations})
        state["citations"] = citations

        # P1.3: Pre-fetch RAG results to pass into AgentCore (avoids redundant search)
        try:
            preloaded_rag = trace_search_similar_pages(str(team.id), prompt, 10)
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
        for event in agent.run(context_str, state, cancel_evt=cancel_evt):
            yield event
        return

    # CASE D: Research Specialist (External source-backed lookup)
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

    # CASE E: Dynamic Crew (multi-domain, high-complexity intents)
    if _crew_needed(classification, prompt):
        try:
            from chat.crew import IntentSchema
            from chat.crew.composer import compose_crew
            from chat.crew.graph import build_crew_graph
            from planning.agents.checkpointer import get_checkpointer
            from dataclasses import asdict
            import uuid

            intent = IntentSchema(
                intent_type=classification.primary_agent.value,
                complexity="high",
                domains=[],
                required_capabilities=[],
            )
            crew_composition = compose_crew(intent, prompt, team)

            thread_id = str(uuid.uuid4())
            config = {"configurable": {"thread_id": thread_id, "team_id": str(team.id)}}
            checkpointer = get_checkpointer()
            graph = build_crew_graph(crew_composition, checkpointer)

            initial_state = {
                "user_message": prompt,
                "team_id": str(team.id),
                "session_id": str(session.id),
                "intent": asdict(intent),
                "crew_composition": asdict(crew_composition),
                "agent_outputs": {},
                "agent_messages": [],
                "completed_agents": [],
                "current_agents_running": [],
                "messages": [],
            }

            yield _sse("crew_start", {"roles": [s.role for s in crew_composition.crew]})
            for event in graph.stream(initial_state, config, stream_mode="updates"):
                node_name = list(event.keys())[0]
                node_data = list(event.values())[0]
                yield _sse("crew_update", {"node": node_name, "data": node_data})

            # Retrieve final state and stream synthesized output to the chat window
            try:
                final_state = graph.get_state(config)
                final_output = final_state.values.get("final_output", {})
                if final_output:
                    if isinstance(final_output, dict):
                        if "text" in final_output:
                            response_text = final_output["text"]
                        elif "summary" in final_output:
                            response_text = final_output["summary"]
                        else:
                            response_text = "### Crew Synthesis Report\n\n"
                            for key, val in final_output.items():
                                if isinstance(val, dict):
                                    response_text += f"#### {key.replace('_', ' ').title()}\n"
                                    for k2, v2 in val.items():
                                        response_text += f"- **{k2.replace('_', ' ').title()}**: {v2}\n"
                                    response_text += "\n"
                                elif isinstance(val, list):
                                    response_text += f"#### {key.replace('_', ' ').title()}\n"
                                    for item in val:
                                        response_text += f"- {item}\n"
                                    response_text += "\n"
                                else:
                                    response_text += f"**{key.replace('_', ' ').title()}**: {val}\n\n"
                    else:
                        response_text = str(final_output)

                    # Stream text in chunks so user sees the report print live
                    chunk_size = 32
                    for i in range(0, len(response_text), chunk_size):
                        chunk = response_text[i:i+chunk_size]
                        yield _sse("chunk", {"token": chunk})
                        state["full_text"] += chunk
            except Exception:
                logger.exception("Failed to retrieve and stream final crew output")

            state["ok"] = True
            return
        except Exception:
            logger.exception("Crew graph failed — falling through to single-agent")

    # CASE C: Operational Specialist (Tool-using loop)
    tools_list = orchestrator.get_tools(classification.primary_agent)
    tool_schemas = openai_tool_schemas(tools_list, team_id=str(team.id), user_id=str(user.id))
    tool_schemas = select_relevant_tools(prompt, tool_schemas, max_tools=12)
    
    sys_prompt = orchestrator.get_system_prompt(classification.primary_agent)
    try:
        from integrations.tool_registry import get_connected_providers_context
        sys_prompt += get_connected_providers_context(str(user.id))
    except Exception:
        pass

    sys_prompt = _inject_procedural_directives(
        sys_prompt, team, prompt, classification.primary_agent.value
    )

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
    for event in agent.run(context_str, state, cancel_evt=cancel_evt):
        yield event
