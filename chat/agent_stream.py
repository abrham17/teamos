"""
Wiki agent: non-streaming tool rounds, then chunked token emission for the final assistant text.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from chat.models import ChatSession
from chat.tools import ToolContext, execute_tool, openai_tool_schemas
from ingest.vectors import vector_store
from teamos_project.llm_config import chat_completion_model, get_llm_backend

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 8
MAX_TOOLS_PER_REQUEST = 24
CHUNK_CHARS = 40

AGENT_SYSTEM_PREFIX = (
    "You are the TeamOS Wiki Agent. You can call tools to search, create, and update wiki pages, "
    "add graph edges between pages, and queue markdown through the full ingest pipeline. "
    "Use wiki_search_pages when you need to find slugs or page IDs. Prefer small, correct edits. "
    "After finishing tool work, respond with a short Markdown summary for the user (what changed, page titles). "
    "Do not invent slugs: obtain them from wiki_search_pages or from the retrieval context.\n\n"
)


def _build_messages(session: ChatSession, context_str: str) -> list[dict[str, Any]]:
    system = AGENT_SYSTEM_PREFIX + (
        "Retrieved wiki excerpts (may be partial):\n" + context_str
        if context_str.strip()
        else "No retrieval snippets were returned for this query; use wiki_search_pages if you need context."
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
    state["ok"] = False
    llm = vector_store.openai
    if not llm:
        yield f"event: error\ndata: {json.dumps({'detail': 'Chat LLM is not configured (set GROQ_API_KEY or OPENAI_API_KEY).'})}\n\n"
        return

    if get_llm_backend() == "groq":
        yield f"event: error\ndata: {json.dumps({'detail': 'Wiki agent mode is only available with LLM_BACKEND=openai (tool calling). Use Ask mode or switch backend.'})}\n\n"
        return

    messages = _build_messages(session, context_str)
    model_name = chat_completion_model()
    tools = openai_tool_schemas()
    tool_trace: list[dict[str, Any]] = []
    tools_executed = 0

    for _round in range(MAX_TOOL_ROUNDS):
        try:
            resp = llm.chat.completions.create(
                model=model_name,
                messages=messages,
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
                result = execute_tool(name, arguments, ctx)
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
