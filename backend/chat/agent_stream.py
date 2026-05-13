"""
Wiki agent: non-streaming tool rounds, then chunked token emission for the final assistant text.

Supports two execution paths:
1. Legacy: _iter_tool_agent_sse_events (original monolithic loop)
2. AgentCore: iter_agent_core_events (new modular engine with reflection)

The view layer selects which path to use. Both emit the same SSE events.
"""

from __future__ import annotations

import json
import logging
import concurrent.futures
from typing import Any, Callable, Iterator

from chat.models import ChatSession
from chat.multi_agent import get_orchestrator, AgentRole, SPECIALIST_TOOLS
from chat.tools import (
    ToolContext,
    execute_plan_tool,
    execute_tool,
    openai_plan_tool_schemas,
    openai_tool_schemas,
)
from llm_orchestrator.orchestrator import llm_call

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 8
MAX_TOOLS_PER_REQUEST = 24
CHUNK_CHARS = 40

AGENT_SYSTEM_PREFIX = (
    "You are the TeamOS Executive Intelligence — the elite knowledge and operational core of this team. "
    "You do not just provide answers; you maintain, connect, and evolve the team's entire digital brain.\n\n"
    "## Your Capabilities:\n"
    "- **Wiki**: Master of documentation. Create, update, and search wiki pages using [[wikilinks]].\n"
    "- **Graph**: Architect of relationships. Add typed relations (depends_on, contradicts, extends, etc.) and resolve contradictions.\n"
    "- **Planning**: Operational lead. Manage projects, tasks, and milestones. Detect conflicts proactively.\n"
    "- **Memory**: Long-term strategist. Store and recall critical context, decisions, and priorities.\n"
    "- **Ingest**: Knowledge harvester. Queue full ingestion for complex markdown or research.\n\n"
    "## Your Behavior (EXECUTION PROTOCOL):\n"
    "1. **Action First**: If a user asks to 'track', 'record', 'note', or 'plan', use your tools immediately. Do not just describe how you would do it.\n"
    "2. **Connect Everything**: Every new page or update MUST include [[wikilinks]] to related knowledge. Never leave an island of information.\n"
    "3. **Semantic Integrity**: When information is updated, check for graph contradictions. If you find one, point it out and offer to resolve it.\n"
    "4. **Persistent Context**: Use `agent_memory_write` for every major decision or priority shift. Read memory at the start of complex requests.\n"
    "5. **High Fidelity**: Use professional, concise, and structured Markdown. Use tables for data and Mermaid for flows.\n"
    "6. **No Placeholders**: Never say 'I will do X' without calling the tool to actually do it in the same turn.\n\n"
)

PLAN_AGENT_SYSTEM_PREFIX = (
    "You are the TeamOS Lead Planner — responsible for the delivery and execution excellence of this team. "
    "You transform vague ideas into precise, actionable roadmaps.\n\n"
    "## Your Capabilities:\n"
    "- **Full Lifecycle**: Create, update, and manage projects, tasks, and milestones with absolute precision.\n"
    "- **Grounded Strategy**: Use `plan_generate_draft` to architect plans based on existing wiki knowledge.\n"
    "- **Operational Risk**: Use `calendar_detect_conflicts` and `calendar_check_overdue` to find blockers before they happen.\n"
    "- **Contextual Awareness**: Traverse the graph to find relevant constraints or previous decisions.\n\n"
    "## Your Behavior (PLANNING PROTOCOL):\n"
    "1. **Be Proactive**: If a user mentions a goal, draft a project and milestones immediately. Don't ask for permission if the intent is clear.\n"
    "2. **Detail Oriented**: Every task should have a clear title and, if possible, a deadline and priority.\n"
    "3. **Wiki Integration**: Link tasks to relevant wiki pages using [[Page Title]] syntax in the description.\n"
    "4. **Conflict Resolution**: After any major update, run a conflict check and summarize the team's bandwidth.\n"
    "5. **Professional Summary**: After execution, provide a clean, high-fidelity summary of the plan using tables and clear hierarchies.\n\n"
)


def _build_messages(session: ChatSession, context_str: str, system_prefix: str) -> list[dict[str, Any]]:
    # Inject persistent memory context
    memory_block = ""
    try:
        from chat.agent_memory_service import get_agent_context_block
        team_id = str(session.team_id)
        memory_block = get_agent_context_block(team_id)
    except Exception:
        pass

    system = system_prefix
    if memory_block:
        system += memory_block + "\n\n"
    system += (
        "Retrieved team knowledge excerpts (may be partial):\n" + context_str
        if context_str.strip()
        else "No retrieval snippets were returned for this query."
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    recent = list(session.messages.order_by("-created_at")[:12])
    for msg in reversed(recent):
        if msg.role not in ("user", "assistant"):
            continue
        messages.append({"role": msg.role, "content": msg.content})
    return messages


def iter_agent_sse_events(
    session: ChatSession,
    context_str: str,
    ctx: ToolContext,
    state: dict[str, Any],
) -> Iterator[str]:
    yield from _iter_tool_agent_sse_events(
        session=session,
        context_str=context_str,
        ctx=ctx,
        state=state,
        system_prefix=AGENT_SYSTEM_PREFIX,
        tools=openai_tool_schemas(),
        execute=execute_tool,
    )


def iter_plan_agent_sse_events(
    session: ChatSession,
    context_str: str,
    ctx: ToolContext,
    state: dict[str, Any],
) -> Iterator[str]:
    yield from _iter_tool_agent_sse_events(
        session=session,
        context_str=context_str,
        ctx=ctx,
        state=state,
        system_prefix=PLAN_AGENT_SYSTEM_PREFIX,
        tools=openai_plan_tool_schemas(),
        execute=execute_plan_tool,
    )


def _iter_tool_agent_sse_events(
    *,
    session: ChatSession,
    context_str: str,
    ctx: ToolContext,
    state: dict[str, Any],
    system_prefix: str,
    tools: list[dict[str, Any]],
    execute: Callable[[str, str, ToolContext], dict[str, Any]],
) -> Iterator[str]:
    state["ok"] = False
    
    messages = _build_messages(session, context_str, system_prefix)
    tool_trace: list[dict[str, Any]] = []
    tools_executed = 0

    for _round in range(MAX_TOOL_ROUNDS):
        try:
            # Operation is chat_agent for both wiki and plan agents
            resp, model_used, routed_by = llm_call(
                team=session.team,
                operation="chat_agent",
                messages=messages,
                user=session.created_by,
                tools=tools,
                tool_choice="auto",
            )
        except Exception as e:
            logger.exception("Agent LLM call failed")
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"
            return

        msg = resp.choices[0].message
        if msg.tool_calls:
            assistant_payload: dict[str, Any] = {
                "role": "assistant",
                "content": msg.content or None,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments or "{}"},
                    }
                    for tc in msg.tool_calls
                ],
            }
            messages.append(assistant_payload)

            for tc in msg.tool_calls:
                if tools_executed >= MAX_TOOLS_PER_REQUEST:
                    yield f"event: error\ndata: {json.dumps({'detail': 'Too many tool calls in one request.'})}\n\n"
                    yield f"event: tool_result\ndata: {json.dumps({'name': tc.function.name, 'ok': False, 'error': 'tool_budget_exceeded'})}\n\n"
                    return
                tools_executed += 1
                name = tc.function.name
                arguments = tc.function.arguments or "{}"
                yield f"event: tool_call\ndata: {json.dumps({'name': name, 'arguments': arguments})}\n\n"
                
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(execute, name, arguments, ctx)
                    try:
                        result = future.result(timeout=15.0)
                    except concurrent.futures.TimeoutError:
                        logger.error(f"Tool {name} timed out after 15 seconds")
                        result = {"ok": False, "error": f"Tool {name} execution timed out."}
                    except Exception as e:
                        logger.exception(f"Tool {name} failed with exception")
                        result = {"ok": False, "error": str(e)}
                        
                tool_trace.append({"name": name, "arguments": arguments, "result": result})
                yield f"event: tool_result\ndata: {json.dumps({'name': name, 'ok': result.get('ok'), 'result': result})}\n\n"
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result),
                    }
                )
            continue

        # True streaming for final pass
        try:
            # We discard the non-streamed final message and do a true streaming call
            stream_resp, stream_model_used, _ = llm_call(
                team=session.team,
                operation="chat_agent",
                messages=messages,
                user=session.created_by,
                stream=True,
            )
            final_text = ""
            for chunk in stream_resp:
                if chunk.choices and chunk.choices[0].delta.content:
                    piece = chunk.choices[0].delta.content
                    final_text += piece
                    yield f"event: chunk\ndata: {json.dumps({'token': piece})}\n\n"
            
            if not final_text.strip():
                final_text = "_No summary was returned._"
                yield f"event: chunk\ndata: {json.dumps({'token': final_text})}\n\n"
                
            state["tool_trace"] = tool_trace
            state["full_text"] = final_text
            state["model_used"] = stream_model_used
            state["ok"] = True
            return
        except Exception as e:
            logger.exception("Agent streaming failed")
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"
            return

    yield f"event: error\ndata: {json.dumps({'detail': 'Agent stopped: tool round limit exceeded.'})}\n\n"


# ── AgentCore-based entry points (new modular engine) ─────────────────


def iter_agent_core_events(
    session: ChatSession,
    context_str: str,
    ctx: ToolContext,
    state: dict[str, Any],
) -> Iterator[str]:
    """New agent path using AgentCore with reflection and multi-agent routing."""
    from chat.agent_core import AgentConfig, AgentCore

    # Attempt multi-agent classification to restrict tools to relevant specialist
    all_tools = openai_tool_schemas()
    selected_tools = all_tools  # default: all tools
    try:
        orchestrator = get_orchestrator(str(session.team_id), str(session.created_by_id))
        # Extract user message from last history entry for classification
        last_user_msg = ""
        recent = list(session.messages.order_by("-created_at")[:1])
        if recent:
            last_user_msg = recent[0].content
        if last_user_msg:
            classification = orchestrator.classify_sync(last_user_msg, session.team)
            specialist_tool_names = set(SPECIALIST_TOOLS.get(classification.primary_agent, []))
            if specialist_tool_names:
                # Filter to specialist tools + always include memory/graph tools
                core_tools = {"agent_memory_read", "agent_memory_write", "agent_memory_delete",
                              "graph_traverse_neighbors", "knowledge_gap_analysis"}
                allowed = specialist_tool_names | core_tools
                filtered = [t for t in all_tools if t["function"]["name"] in allowed]
                if filtered:
                    selected_tools = filtered
    except Exception:
        logger.debug("Orchestrator classify failed — using all tools", exc_info=True)

    config = AgentConfig(
        system_prefix=AGENT_SYSTEM_PREFIX,
        tools=selected_tools,
        execute_fn=execute_tool,
        mode="agent",
        enable_reflection=True,
        enable_inner_plan=True,
        enable_thinking_events=True,
    )
    core = AgentCore(session=session, ctx=ctx, config=config)
    yield from core.run(context_str, state)


def iter_plan_agent_core_events(
    session: ChatSession,
    context_str: str,
    ctx: ToolContext,
    state: dict[str, Any],
) -> Iterator[str]:
    """New plan agent path using AgentCore with reflection."""
    from chat.agent_core import AgentConfig, AgentCore

    config = AgentConfig(
        system_prefix=PLAN_AGENT_SYSTEM_PREFIX,
        tools=openai_plan_tool_schemas(),
        execute_fn=execute_plan_tool,
        mode="plan",
        enable_reflection=True,
        enable_inner_plan=True,
        enable_thinking_events=True,
    )
    core = AgentCore(session=session, ctx=ctx, config=config)
    yield from core.run(context_str, state)
