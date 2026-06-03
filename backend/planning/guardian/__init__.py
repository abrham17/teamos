"""
Tiered Guardian Agent — entry point.

Routing:
  Tier 1 — synchronous rule-based checks (<5ms). Always runs.
  Tier 2 — async LLM semantic check (300–800ms). Only for high-risk tools.
  Tier 3 — audit log only (0ms). Runs post-execution for all routine mutations.
"""
import logging
import time

from django.utils import timezone

from .context import GuardianContext, GuardianResult
from .tier1 import tier1_check
from .tier2 import tier2_check, should_trigger_tier2
from .tier3 import tier3_log

logger = logging.getLogger(__name__)


class Guardian:

    def __init__(self, context: GuardianContext):
        self.context = context

    def pre_execution_check(
        self,
        tool_name: str,
        tool_input: dict
    ) -> GuardianResult:
        """Called before every tool execution."""

        start = time.monotonic()

        # Always run Tier 1 (<5ms, no exceptions)
        t1_result = tier1_check(tool_name, tool_input, self.context)
        if not t1_result.approved:
            self._log(tool_name, tool_input, t1_result)
            return t1_result

        # Run Tier 2 only for high-risk tools
        if should_trigger_tier2(tool_name):
            t2_result = tier2_check(tool_name, tool_input, self.context)
            if not t2_result.approved:
                self._log(tool_name, tool_input, t2_result)
                return t2_result

            # If modifications suggested, return them for agent to apply
            if t2_result.modifications:
                return t2_result

        latency_ms = int((time.monotonic() - start) * 1000)
        return GuardianResult(approved=True, latency_ms=latency_ms)

    def post_execution_log(
        self,
        tool_name: str,
        tool_input: dict,
        tool_result: dict
    ) -> None:
        """Called after every tool execution for Tier 3 audit."""
        if not should_trigger_tier2(tool_name):
            tier3_log(tool_name, tool_input, tool_result, self.context)

    def _log(self, tool_name: str, tool_input: dict, result: GuardianResult) -> None:
        try:
            from planning.models import GuardianAuditLog
            GuardianAuditLog.objects.create(
                team_id=self.context.acting_team_id,
                session_id=self.context.session_id,
                tool_name=tool_name,
                tool_input=tool_input,
                tool_result=None,
                tier=result.tier,
                approved=result.approved,
                risk_score=result.risk_score,
                reason=result.reason,
                agent_round=self.context.current_round,
                latency_ms=result.latency_ms,
                timestamp=timezone.now()
            )
        except Exception:
            logger.exception("GuardianAuditLog write failed — non-blocking")


def review_plan(plan: dict, simulation: dict, team_id: str) -> dict:
    """
    Entry point called by LangGraph guardian_node.
    Validates the overall plan against simulation results.
    """
    if simulation.get("feasible", True):
        return {
            "approved": True,
            "modified_plan": plan,
            "reason": "Simulation passed all checks."
        }
    return {
        "approved": False,
        "modified_plan": plan,
        "reason": "Simulation detected critical conflicts."
    }
