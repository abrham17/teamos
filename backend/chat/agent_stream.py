"""
Wiki agent: non-streaming tool rounds, then chunked token emission for the final assistant text.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable, Iterator

from chat.models import ChatSession
from chat.tools import (
    ToolContext,
    execute_plan_tool,
    execute_tool,
    openai_plan_tool_schemas,
    openai_tool_schemas,
)
from ingest.vectors import vector_store
from teamos_project.llm_config import get_llm_backend
from llm_orchestrator.orchestrator import llm_call

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 8
MAX_TOOLS_PER_REQUEST = 24
CHUNK_CHARS = 40

AGENT_SYSTEM_PREFIX = (
    "You are the TeamOS Knowledge Agent — the central nervous system of the team's knowledge base. "
    "You have deep access to the wiki, knowledge graph, planning system, and persistent memory.\n\n"
    "## Your Capabilities:\n"
    "- **Wiki**: Search, read full pages, create, and update wiki pages with [[wikilinks]].\n"
    "- **Graph**: Traverse the knowledge graph, add typed relations "
    "(depends_on, contradicts, extends, implements, supersedes, parent_child, prerequisite, references), "
    "and find contradictions.\n"
    "- **Planning**: Create/update projects, tasks, milestones. Detect calendar conflicts and overdue items.\n"
    "- **Knowledge Gaps**: Identify missing pages, unlinked concepts, and shallow hub pages.\n"
    "- **Memory**: Read and write persistent memory to remember priorities, decisions, and context across sessions.\n"
    "- **Ingest**: Queue markdown through the full ingestion pipeline (governance, chunks, vectors, graph).\n\n"
    "## Your Behavior:\n"
    "1. Before making changes, use wiki_search_pages and wiki_read_full_page to understand existing content.\n"
    "2. When creating/updating pages, always add [[wikilinks]] to related pages.\n"
    "3. When you discover relationships, use graph_add_typed_relation to record them with a reason.\n"
    "4. Before planning, traverse the graph to find related knowledge and check for contradictions.\n"
    "5. Store important discoveries in agent_memory_write for future conversations.\n"
    "6. After finishing tool work, respond with a short Markdown summary for the user.\n"
    "Do not invent slugs: obtain them from wiki_search_pages or from the retrieval context.\n\n"
)

PLAN_AGENT_SYSTEM_PREFIX = (
    "You are the TeamOS Plan Agent — you manage projects, tasks, and milestones for the team. "
    "You have deep access to team knowledge and the planning system.\n\n"
    "## Your Capabilities:\n"
    "- **Planning**: Create/update/delete projects, tasks, milestones with full lifecycle management.\n"
    "- **Wiki-Grounded**: Use plan_generate_draft to create plans informed by wiki knowledge and graph context.\n"
    "- **Calendar**: Detect date conflicts and overdue items with calendar_detect_conflicts and calendar_check_overdue.\n"
    "- **Graph**: Traverse the knowledge graph to find related wiki pages for your plans.\n"
    "- **Memory**: Store planning decisions and priorities in persistent memory.\n\n"
    "## Your Behavior:\n"
    "1. Before creating plans, search the wiki and traverse the graph for relevant knowledge.\n"
    "2. Reference wiki pages in task descriptions using [[Page Title]] syntax.\n"
    "3. Check for calendar conflicts after creating/updating tasks with dates.\n"
    "4. Flag overdue items proactively.\n"
    "5. Keep edits minimal and correct. Include timeline and ownership updates.\n"
    "6. After tool execution, respond with a short Markdown summary of what changed.\n\n"
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
    llm = vector_store.openai
    if not llm:
        yield f"event: error\ndata: {json.dumps({'detail': 'Chat LLM is not configured (set GROQ_API_KEY or OPENAI_API_KEY).'})}\n\n"
        return

    if get_llm_backend() == "groq":
        yield f"event: error\ndata: {json.dumps({'detail': 'Tool agent modes are only available with LLM_BACKEND=openai (tool calling). Use Ask mode or switch backend.'})}\n\n"
        return

    messages = _build_messages(session, context_str, system_prefix)
    tool_trace: list[dict[str, Any]] = []
    tools_executed = 0

    for _round in range(MAX_TOOL_ROUNDS):
        try:
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
                result = execute(name, arguments, ctx)
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

        final_text = (msg.content or "").strip()
        if not final_text:
            final_text = "_No summary was returned._"
        for i in range(0, len(final_text), CHUNK_CHARS):
            piece = final_text[i : i + CHUNK_CHARS]
            yield f"event: chunk\ndata: {json.dumps({'token': piece})}\n\n"
        state["tool_trace"] = tool_trace
        state["full_text"] = final_text
        state["ok"] = True
        return

    yield f"event: error\ndata: {json.dumps({'detail': 'Agent stopped: tool round limit exceeded.'})}\n\n"
