"""
Agent Self-Reflection.

After each tool call (or group of tool calls), the reflector evaluates whether
the result achieved the intended goal and decides: continue, retry, or replan.

This is injected into the agent loop as a lightweight LLM call that prevents
the agent from blindly continuing after failures or partial results.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from accounts.models import Team
from llm_orchestrator.orchestrator import llm_json_call

logger = logging.getLogger(__name__)


@dataclass
class Reflection:
    """Result of evaluating a tool call outcome."""
    success: bool
    should_retry: bool = False
    should_replan: bool = False
    feedback: str = ""
    severity: str = "info"  # info | warning | critical

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "should_retry": self.should_retry,
            "should_replan": self.should_replan,
            "feedback": self.feedback,
            "severity": self.severity,
        }

    @classmethod
    def ok(cls, feedback: str = "") -> Reflection:
        return cls(success=True, feedback=feedback)

    @classmethod
    def skip(cls) -> Reflection:
        """No reflection needed (e.g. trivial tool call)."""
        return cls(success=True, feedback="")


# Tools that are trivial and don't need reflection
SKIP_REFLECTION_TOOLS = {
    "wiki_search_pages",
    "wiki_read_full_page",
    "agent_memory_read",
    "plan_list_projects",
    "graph_traverse_neighbors",
    "graph_find_contradictions",
    "knowledge_gap_analysis",
    "calendar_detect_conflicts",
    "calendar_check_overdue",
    "plan_check_overdue",
}

# Tools where failure is critical and should trigger a replan
CRITICAL_TOOLS = {
    "plan_create_project",
    "plan_generate_draft",
    "wiki_create_page",
}

REFLECTION_SYSTEM = (
    "You are an internal quality evaluator for an AI agent. "
    "Given a tool call and its result, evaluate whether it succeeded and what to do next. "
    "Return ONLY valid JSON with these fields:\n"
    '  "success": boolean — did the tool achieve what was intended?\n'
    '  "should_retry": boolean — should the agent retry this exact call with different params?\n'
    '  "should_replan": boolean — should the agent abandon the current approach entirely?\n'
    '  "feedback": string — brief actionable insight (1-2 sentences max)\n'
    '  "severity": "info" | "warning" | "critical"\n'
)


class AgentReflector:
    """
    Evaluates tool call outcomes and provides feedback to the agent loop.

    Uses a fast/cheap LLM call for reflection to minimize latency.
    Falls back to heuristic evaluation if the LLM call fails.
    """

    def __init__(self, team: Team):
        self.team = team

    def evaluate(
        self,
        tool_name: str,
        tool_args: str,
        tool_result: dict[str, Any],
        current_goal: str = "",
    ) -> Reflection:
        """
        Evaluate a single tool call result.

        For trivial/read-only tools, uses fast heuristic.
        For write/critical tools, uses LLM evaluation.
        """
        # Skip reflection for read-only tools
        if tool_name in SKIP_REFLECTION_TOOLS:
            return self._heuristic_check(tool_name, tool_result)

        # Fast heuristic check first
        heuristic = self._heuristic_check(tool_name, tool_result)
        if heuristic.success:
            return heuristic

        # For failures on critical tools, use LLM for deeper analysis
        if tool_name in CRITICAL_TOOLS or not heuristic.success:
            try:
                return self._llm_evaluate(tool_name, tool_args, tool_result, current_goal)
            except Exception:
                logger.exception("LLM reflection failed, using heuristic")
                return heuristic

        return heuristic

    def evaluate_round(
        self,
        tool_calls: list[dict[str, Any]],
        current_goal: str = "",
    ) -> Reflection:
        """
        Evaluate an entire round of tool calls.
        Returns the most severe reflection across all calls.
        """
        worst = Reflection.ok()

        for tc in tool_calls:
            r = self.evaluate(
                tool_name=tc["name"],
                tool_args=tc.get("arguments", "{}"),
                tool_result=tc.get("result", {}),
                current_goal=current_goal,
            )
            if r.should_replan:
                return r
            if r.should_retry or (not r.success and worst.success):
                worst = r

        return worst

    def _heuristic_check(self, tool_name: str, result: dict[str, Any]) -> Reflection:
        """Fast rule-based check without LLM."""
        ok = result.get("ok", False)

        if ok:
            return Reflection.ok()

        error = result.get("error", "")
        error_lower = str(error).lower()

        # Quota/permission errors → don't retry, inform user
        if any(w in error_lower for w in ("quota", "forbidden", "permission", "limit")):
            return Reflection(
                success=False,
                should_retry=False,
                should_replan=True,
                feedback=f"Tool {tool_name} blocked: {error}. Cannot continue this approach.",
                severity="critical",
            )

        # Timeout → maybe retry once
        if "timeout" in error_lower:
            return Reflection(
                success=False,
                should_retry=True,
                should_replan=False,
                feedback=f"Tool {tool_name} timed out. Retrying once.",
                severity="warning",
            )

        # Not found → might need different params
        if any(w in error_lower for w in ("not_found", "does not exist", "no such")):
            return Reflection(
                success=False,
                should_retry=True,
                should_replan=False,
                feedback=f"Tool {tool_name} target not found. Try with different parameters.",
                severity="warning",
            )

        # Generic failure
        is_critical = tool_name in CRITICAL_TOOLS
        return Reflection(
            success=False,
            should_retry=not is_critical,
            should_replan=is_critical,
            feedback=f"Tool {tool_name} failed: {error}",
            severity="critical" if is_critical else "warning",
        )

    def _llm_evaluate(
        self,
        tool_name: str,
        tool_args: str,
        result: dict[str, Any],
        goal: str,
    ) -> Reflection:
        """Use a fast LLM call for deeper evaluation."""
        # Truncate large results to keep reflection fast
        result_str = json.dumps(result)
        if len(result_str) > 800:
            result_str = result_str[:800] + "..."

        user_content = (
            f"Tool: {tool_name}\n"
            f"Arguments: {tool_args}\n"
            f"Result: {result_str}\n"
        )
        if goal:
            user_content += f"Current goal: {goal}\n"

        messages = [
            {"role": "system", "content": REFLECTION_SYSTEM},
            {"role": "user", "content": user_content},
        ]

        data = llm_json_call(
            team=self.team,
            operation="agent_reflection",
            messages=messages,
            default_on_error={"success": False, "should_retry": False, "should_replan": False, "feedback": "Reflection failed", "severity": "warning"},
        )

        return Reflection(
            success=data.get("success", False),
            should_retry=data.get("should_retry", False),
            should_replan=data.get("should_replan", False),
            feedback=data.get("feedback", ""),
            severity=data.get("severity", "info"),
        )
