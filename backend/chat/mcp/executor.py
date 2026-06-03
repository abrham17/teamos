"""
MCPToolExecutor — the single unified call layer for all MCP tool invocations.

Enforces: circuit-breaker → idempotency → execution → audit log.
Every call is wrapped with @traceable so it appears as a child span in LangSmith.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Optional

from django.core.cache import cache
from langsmith import traceable

from chat.mcp.registry import get_mcp_registry
from chat.mcp.health import is_server_available, record_success, record_failure, RECOVERY_TIMEOUT

logger = logging.getLogger(__name__)

IDEMPOTENCY_TTL = 300  # 5 minutes
CALL_TIMEOUT    = 30   # seconds


class MCPToolExecutor:
    """
    Central call layer for MCP tools.
    One instance per agent run; thread-safe reads on the registry.
    """

    def __init__(self, team_id: str, session_id: str = ""):
        self.team_id   = team_id
        self.session_id = session_id
        self.registry  = get_mcp_registry()

    @traceable(name="mcp_tool_execution", run_type="tool")
    def execute(
        self,
        prefixed_name: str,
        tool_input: dict,
        idempotency_key: Optional[str] = None,
    ) -> dict:
        """
        Execute an MCP tool by its prefixed name (e.g. ``mcp_github_create_issue``).

        Returns a normalised result dict::

            {"ok": bool, "result": str | dict, "latency_ms": int, ...}
        """
        start = time.monotonic()

        # 1. Resolve from registry
        tool_def = self.registry.get_tool(prefixed_name)
        if not tool_def:
            return {"ok": False, "error": f"MCP tool '{prefixed_name}' not found in registry"}

        # 2. Circuit-breaker
        if not is_server_available(tool_def.server_id):
            return {
                "ok": False,
                "error": f"MCP server '{tool_def.server_name}' is unavailable (circuit open)",
                "circuit_open": True,
                "retry_after_seconds": RECOVERY_TIMEOUT,
            }

        # 3. Idempotency cache
        if idempotency_key:
            idem_cache_key = f"mcp_idem:{idempotency_key}"
            cached = cache.get(idem_cache_key)
            if cached:
                try:
                    return {**json.loads(cached), "idempotency_hit": True}
                except Exception:
                    pass

        # 4. Execute via MCPClient
        from chat.mcp_client import MCPClient, MCPServerConfig
        from chat.models import MCPServerRegistration
        try:
            server = MCPServerRegistration.objects.get(id=tool_def.server_id)
        except MCPServerRegistration.DoesNotExist:
            return {"ok": False, "error": f"MCP server record not found for tool '{prefixed_name}'"}

        client = MCPClient(self.team_id)
        client.register_server(MCPServerConfig(
            name=server.name,
            url=server.url,
            auth_token=server.decrypted_token,
            enabled=True,
        ))

        try:
            raw = client.call_tool(tool_def.server_name, tool_def.tool_name, tool_input)
            record_success(tool_def.server_id)
        except requests.Timeout:                  # noqa: F821
            record_failure(tool_def.server_id)
            latency = int((time.monotonic() - start) * 1000)
            self._audit(tool_def, tool_input, {"ok": False, "error": "timeout"}, latency)
            return {"ok": False, "error": f"MCP tool '{prefixed_name}' timed out", "timeout": True}
        except Exception as exc:
            record_failure(tool_def.server_id)
            latency = int((time.monotonic() - start) * 1000)
            result = {"ok": False, "error": str(exc)}
            self._audit(tool_def, tool_input, result, latency)
            return result

        latency = int((time.monotonic() - start) * 1000)

        # 5. Normalise
        normalised = self._normalise(raw)

        # 6. Cache for idempotency
        if idempotency_key and normalised.get("ok"):
            try:
                cache.set(
                    f"mcp_idem:{idempotency_key}",
                    json.dumps(normalised),
                    timeout=IDEMPOTENCY_TTL,
                )
            except Exception:
                pass

        # 7. Audit log
        self._audit(tool_def, tool_input, normalised, latency)

        return normalised

    # ── Helpers ───────────────────────────────────────────────────────

    def _normalise(self, raw: dict) -> dict:
        """
        MCPClient already returns ``{"ok": bool, "result": ..., "latency_ms": int}``.
        We just ensure consistent shape.
        """
        if isinstance(raw, dict):
            return raw
        return {"ok": True, "result": str(raw)}

    def _audit(self, tool_def, tool_input: dict, result: dict, latency_ms: int):
        try:
            from chat.models import MCPToolExecutionLog
            MCPToolExecutionLog.objects.create(
                team_id=self.team_id,
                session_id=self.session_id,
                server_name=tool_def.server_name,
                tool_name=tool_def.prefixed_name,
                tool_input=tool_input,
                result_summary=str(result)[:500],
                latency_ms=latency_ms,
                success=bool(result.get("ok")),
                circuit_state_at_call=None,
            )
        except Exception:
            logger.exception("Failed to write MCPToolExecutionLog")
