"""
Unified Agent Core.

Central agent execution engine that combines:
- Dynamic context building (context_builder.py)
- Multi-round tool execution with reflection (agent_reflector.py)
- Inner planning (approach selection before execution)
- Episodic memory (learning from outcomes)
- Streaming SSE event emission

This replaces the monolithic _iter_tool_agent_sse_events with a modular,
self-reflecting agent loop that can plan, act, evaluate, and replan.
"""

from __future__ import annotations

import json
import logging
import concurrent.futures
from dataclasses import dataclass, field
from typing import Any, Callable, Iterator

from accounts.models import Team
from chat.agent_reflector import AgentReflector, Reflection
from chat.context_builder import ContextBuilder
from chat.models import ChatSession
from chat.tools import ToolContext
from chat.working_memory import WorkingMemory
from llm_orchestrator.orchestrator import llm_call

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 10
MAX_TOOLS_PER_REQUEST = 30
TOOL_TIMEOUT_SECONDS = 20.0


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@dataclass
class AgentConfig:
    """Configuration for an agent run."""
    system_prefix: str
    tools: list[dict[str, Any]]
    execute_fn: Callable[[str, str, ToolContext], dict[str, Any]]
    mode: str = "agent"
    max_rounds: int = MAX_TOOL_ROUNDS
    max_tools: int = MAX_TOOLS_PER_REQUEST
    enable_reflection: bool = True
    enable_inner_plan: bool = True
    enable_thinking_events: bool = True


INNER_PLAN_INJECTION = (
    "\n\nBefore using tools, briefly think about your approach in 1-2 sentences. "
    "What is the user asking? What tools will you need? What order? "
    "Put this reasoning in your message text BEFORE any tool calls."
)


class AgentCore:
    """
    Unified agent execution engine.

    Emits SSE events:
      - thinking: {content}     — agent's inner reasoning (from message text before tools)
      - tool_call: {name, arguments} — tool invocation
      - tool_result: {name, ok, result} — tool outcome
      - reflection: {success, feedback, severity} — self-evaluation
      - replan: {reason}        — agent decided to change approach
      - chunk: {token}          — final streaming response tokens
      - error: {detail}         — failure
      - done: {status, mode, tool_trace} — completion
    """

    def __init__(
        self,
        session: ChatSession,
        ctx: ToolContext,
        config: AgentConfig,
    ):
        self.session = session
        self.ctx = ctx
        self.config = config
        self.team: Team = session.team
        self.reflector = AgentReflector(self.team) if config.enable_reflection else None
        self.context_builder = ContextBuilder(str(session.team_id))
        self.working_memory = WorkingMemory(str(session.id))

    def run(self, context_str: str, state: dict[str, Any]) -> Iterator[str]:
        """
        Execute the full agent loop with reflection.

        Args:
            context_str: Pre-built context string (from RAG retrieval in the view).
            state: Mutable dict to communicate results back to the caller.
        """
        state["ok"] = False

        messages = self._build_messages(context_str)
        tool_trace: list[dict[str, Any]] = []
        tools_executed = 0
        retry_budget = 2  # max retries from reflection

        for _round in range(self.config.max_rounds):
            # ── LLM call ──────────────────────────────────────────
            try:
                resp, model_used, routed_by = llm_call(
                    team=self.team,
                    operation="chat_agent",
                    messages=messages,
                    user=self.session.created_by,
                    tools=self.config.tools,
                    tool_choice="auto",
                )
            except Exception as e:
                logger.exception("Agent LLM call failed (round %d)", _round)
                yield _sse("error", {"detail": str(e)})
                return

            msg = resp.choices[0].message
            self._last_model_used = model_used

            # ── Extract thinking (text before tool calls) ─────────
            if msg.content and self.config.enable_thinking_events:
                yield _sse("thinking", {"content": msg.content})

            # ── No tool calls → final answer ──────────────────────
            if not msg.tool_calls:
                # Pass the initial content to avoid double LLM call
                initial_content = msg.content or ""
                yield from self._stream_final_answer(messages, state, tool_trace, initial_content)
                return

            # ── Process tool calls ────────────────────────────────
            assistant_payload: dict[str, Any] = {
                "role": "assistant",
                "content": msg.content or None,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments or "{}",
                        },
                    }
                    for tc in msg.tool_calls
                ],
            }
            messages.append(assistant_payload)

            round_results: list[dict[str, Any]] = []

            for tc in msg.tool_calls:
                if tools_executed >= self.config.max_tools:
                    yield _sse("error", {"detail": "Tool budget exceeded."})
                    return

                tools_executed += 1
                name = tc.function.name
                arguments = tc.function.arguments or "{}"

                yield _sse("tool_call", {"name": name, "arguments": arguments})

                # Execute with timeout
                result = self._execute_tool(name, arguments)

                entry = {"name": name, "arguments": arguments, "result": result}
                tool_trace.append(entry)
                round_results.append(entry)

                yield _sse("tool_result", {
                    "name": name,
                    "ok": result.get("ok"),
                    "result": result,
                })

                # Track in working memory scratchpad
                self.working_memory.track_tool_call(name, {}, bool(result.get("ok")))

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })

            # ── Reflection on this round ──────────────────────────
            if self.reflector and self.config.enable_reflection:
                reflection = self.reflector.evaluate_round(round_results)

                if not reflection.success:
                    yield _sse("reflection", reflection.to_dict())

                    if reflection.should_replan:
                        yield _sse("replan", {"reason": reflection.feedback})
                        # Inject replan instruction into messages
                        messages.append({
                            "role": "user",
                            "content": (
                                f"[SYSTEM REFLECTION]: The previous approach failed. "
                                f"Reason: {reflection.feedback}. "
                                f"Please try a different approach."
                            ),
                        })
                        continue

                    if reflection.should_retry and retry_budget > 0:
                        retry_budget -= 1
                        # Inject retry hint
                        messages.append({
                            "role": "user",
                            "content": (
                                f"[SYSTEM REFLECTION]: The last tool call had issues: "
                                f"{reflection.feedback}. Please retry with adjusted parameters."
                            ),
                        })
                        continue

            # Normal continuation — next LLM round
            continue

        # Exhausted rounds
        yield _sse("error", {"detail": "Agent stopped: tool round limit exceeded."})

    def _build_messages(self, context_str: str) -> list[dict[str, Any]]:
        """Build the initial message list with system prompt + history using ContextBuilder."""
        # Use ContextBuilder for dynamic context allocation
        built_context = self.context_builder.build(
            query=context_str[:500],  # Use the RAG query as hint
            session=self.session,
            include_graph=True,
            history_limit=12,
        )

        system = self.config.system_prefix

        # Add memory block from ContextBuilder
        if built_context.memory_block:
            system += "\n\n" + built_context.memory_block

        # Inject working memory scratchpad (what the agent did this session)
        wm_ctx = self.working_memory.recall_session()
        if wm_ctx:
            system += "\n\n" + wm_ctx

        # Add semantic memory recall (Phase 4)
        try:
            from chat.semantic_memory import get_memory_context
            semantic_ctx = get_memory_context(str(self.session.team_id), context_str[:500])
            if semantic_ctx:
                system += "\n\n" + semantic_ctx
        except Exception:
            pass

        if self.config.enable_inner_plan:
            system += INNER_PLAN_INJECTION

        # Add RAG + graph context from ContextBuilder
        if built_context.rag_block:
            system += "\n\nRetrieved team knowledge:\n" + built_context.rag_block
        if built_context.graph_block:
            system += "\n\nGraph-connected context:\n" + built_context.graph_block

        if not built_context.rag_block and not built_context.graph_block:
            system += "\n\nNo retrieval snippets were returned for this query."

        messages: list[dict[str, Any]] = [{"role": "system", "content": system}]

        # Add session history from ContextBuilder (or fallback)
        if built_context.history_block:
            history_lines = built_context.history_block.split("\n")
            for line in history_lines:
                if line.startswith("user:"):
                    messages.append({"role": "user", "content": line[5:].strip()})
                elif line.startswith("assistant:"):
                    messages.append({"role": "assistant", "content": line[10:].strip()})
        else:
            recent = list(self.session.messages.order_by("-created_at")[:12])
            for msg in reversed(recent):
                if msg.role not in ("user", "assistant"):
                    continue
                messages.append({"role": msg.role, "content": msg.content})

        return messages

    def _execute_tool(self, name: str, arguments: str) -> dict[str, Any]:
        """Execute a tool with timeout protection."""
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(self.config.execute_fn, name, arguments, self.ctx)
            try:
                return future.result(timeout=TOOL_TIMEOUT_SECONDS)
            except concurrent.futures.TimeoutError:
                logger.error("Tool %s timed out after %ss", name, TOOL_TIMEOUT_SECONDS)
                return {"ok": False, "error": f"Tool {name} execution timed out."}
            except Exception as e:
                logger.exception("Tool %s failed", name)
                return {"ok": False, "error": str(e)}

    def _stream_final_answer(
        self,
        messages: list[dict[str, Any]],
        state: dict[str, Any],
        tool_trace: list[dict[str, Any]],
        initial_content: str = "",
    ) -> Iterator[str]:
        """Stream the final text response. If initial_content is provided, stream it directly without new LLM call."""
        try:
            final_text = ""

            # If we already have content from the first LLM call, use it directly
            if initial_content.strip():
                final_text = initial_content
                # Stream it character by character for consistency
                for char in final_text:
                    yield _sse("chunk", {"token": char})
            else:
                # Otherwise, make a new streaming call
                stream_resp, stream_model_used, _ = llm_call(
                    team=self.team,
                    operation="chat_agent",
                    messages=messages,
                    user=self.session.created_by,
                    stream=True,
                )
                for chunk in stream_resp:
                    if chunk.choices and chunk.choices[0].delta.content:
                        piece = chunk.choices[0].delta.content
                        final_text += piece
                        yield _sse("chunk", {"token": piece})

            if not final_text.strip():
                final_text = "_No summary was returned._"
                yield _sse("chunk", {"token": final_text})

            state["tool_trace"] = tool_trace
            state["full_text"] = final_text
            state["model_used"] = getattr(self, "_last_model_used", "gpt-4o")
            state["ok"] = True

            # Store episodic memory
            user_message = messages[-1].get("content", "") if messages else ""
            self._store_episode(user_message, tool_trace, final_text)

        except Exception as e:
            logger.exception("Agent final streaming failed")
            yield _sse("error", {"detail": str(e)})

    def _store_episode(
        self,
        user_message: str,
        tool_trace: list[dict[str, Any]],
        final_text: str,
    ):
        """Store this interaction as an episodic memory for future recall."""
        try:
            from chat.models import AgentEpisode
            AgentEpisode.objects.create(
                team=self.team,
                trigger=user_message[:500],
                actions=tool_trace[:20],
                outcome={
                    "success": True,
                    "tool_count": len(tool_trace),
                    "summary_length": len(final_text),
                },
                learnings=final_text[:500],
            )
            # Clear the session scratchpad — next session starts fresh
            self.working_memory.clear()
        except Exception:
            logger.exception("Failed to store agent episode")

