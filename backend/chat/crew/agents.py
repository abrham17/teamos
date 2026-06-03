"""
Crew agent nodes — factory that wraps a scoped AgentCore run
for each role in the crew composition.
"""
import logging
import time
from dataclasses import asdict

from chat.crew import AgentRoleSpec
from chat.crew.tools import get_tools_for_role

logger = logging.getLogger(__name__)


def _build_agent_context(
    role: str,
    user_message: str,
    instructions: str,
    prior_outputs: dict,
    agent_messages: list,
) -> str:
    """Build a focused system context for this agent including prior crew outputs."""
    parts = [
        f"You are the {role.replace('_', ' ').title()} agent in a multi-agent crew.",
        f"\nYour specific instructions:\n{instructions}",
        f"\nOriginal user request:\n{user_message}",
    ]

    if prior_outputs:
        parts.append("\n\nOutputs from other agents already completed:")
        for other_role, output in prior_outputs.items():
            summary = output.get("summary") or str(output)[:500]
            parts.append(f"\n[{other_role}]: {summary}")

    if agent_messages:
        recent = agent_messages[-3:]
        parts.append("\n\nRecent inter-agent messages:")
        for msg in recent:
            if msg.get("to") == role or msg.get("to") is None:
                parts.append(f"  → {msg.get('from', 'supervisor')}: {msg.get('content', '')}")

    return "\n".join(parts)


def create_agent_node(agent_spec: AgentRoleSpec):
    """
    Factory — returns a LangGraph node function for a specific agent role.
    The node runs a scoped AgentCore and posts its output to the shared CrewState.
    """
    role = agent_spec.role

    def agent_node(state: dict) -> dict:
        from chat.agent_core import AgentCore, AgentConfig
        from chat.tools import get_tools_for_session, ToolContext
        from accounts.models import Team
        from chat.models import ChatSession

        team = Team.objects.get(id=state["team_id"])

        # Build a lightweight ToolContext for this crew run
        try:
            session = ChatSession.objects.get(id=state["session_id"])
        except ChatSession.DoesNotExist:
            session = None

        ctx = ToolContext(team=team, session=session, user=session.created_by if session else None)

        # Get scoped tools for this role only
        all_tools = get_tools_for_session(team, session)
        scoped_tools = get_tools_for_role(role, str(team.id), all_tools)

        context_str = _build_agent_context(
            role=role,
            user_message=state.get("user_message", ""),
            instructions=agent_spec.instructions,
            prior_outputs=state.get("agent_outputs", {}),
            agent_messages=state.get("agent_messages", []),
        )

        config = AgentConfig(
            system_prefix=context_str,
            tools=scoped_tools,
            execute_fn=ctx.execute,
            mode="crew_agent",
            max_rounds=6,
            enable_reflection=True,
            enable_inner_plan=True,
            enable_thinking_events=False,   # suppress thinking in crew sub-agents
        )

        # Collect streamed output into a result dict
        chunks: list[str] = []
        tool_trace: list[dict] = []

        import json
        for sse_line in AgentCore(session=session, ctx=ctx, config=config).run(
            context_str=context_str,
            state={"messages": state.get("messages", [])},
        ):
            # Extract chunk tokens and tool results from SSE lines
            if sse_line.startswith("event: chunk"):
                try:
                    data = json.loads(sse_line.split("data: ", 1)[1])
                    chunks.append(data.get("token", ""))
                except Exception:
                    pass
            elif sse_line.startswith("event: tool_result"):
                try:
                    data = json.loads(sse_line.split("data: ", 1)[1])
                    tool_trace.append(data)
                except Exception:
                    pass

        summary = "".join(chunks)[:2000]
        result = {"summary": summary, "tool_trace": tool_trace, "role": role}

        return {
            "agent_outputs": {
                **state.get("agent_outputs", {}),
                role: result,
            },
            "agent_messages": [
                *state.get("agent_messages", []),
                {
                    "from": role,
                    "content": summary[:500],
                    "timestamp": time.time(),
                },
            ],
            "completed_agents": [
                *state.get("completed_agents", []),
                role,
            ],
        }

    agent_node.__name__ = f"agent_{role}"
    return agent_node
