"""Execute external tool calls and write audit logs."""
from __future__ import annotations
import json
import logging
import time
from typing import Any
from integrations.models import ToolExecutionLog, UserIntegration
from integrations.provider_factory import get_provider_instance
from integrations.token_manager import ensure_fresh_token

logger = logging.getLogger(__name__)


def execute_external_tool(user_id: str, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """
    Route ext_<provider>_<tool> calls to the correct provider.
    Returns None if tool_name is not an external tool (falls through to internal tools).
    """
    if not tool_name.startswith("ext_"):
        return None  # not an external tool

    parts = tool_name[4:].split("_", 1)
    if len(parts) != 2:
        return {"ok": False, "error": f"Malformed external tool name: {tool_name}"}

    provider_key, actual_tool = parts

    try:
        integration = UserIntegration.objects.get(
            user_id=user_id, provider=provider_key, status=UserIntegration.STATUS_CONNECTED
        )
    except UserIntegration.DoesNotExist:
        return {"ok": False, "error": f"{provider_key} is not connected. Connect it from Settings → Integrations."}

    access_token = ensure_fresh_token(integration)
    if not access_token:
        return {"ok": False, "error": f"{provider_key} token is expired or invalid. Reconnect from Settings."}

    extra = {}
    try:
        extra = integration.token.extra or {}
    except Exception:
        pass

    provider = get_provider_instance(provider_key, access_token, extra=extra)
    if provider is None:
        return {"ok": False, "error": f"Provider '{provider_key}' is not supported."}

    start = time.time()
    result = {"ok": False, "error": "Unknown error"}
    try:
        result = provider.execute_tool(actual_tool, arguments)
        integration.touch()
    except Exception as e:
        logger.exception("External tool execution failed: %s", tool_name)
        result = {"ok": False, "error": str(e)}
    finally:
        latency = int((time.time() - start) * 1000)
        _log_execution(user_id, integration, provider_key, actual_tool, arguments, result, latency)

    return result


def _log_execution(user_id, integration, provider, tool_name, arguments, result, latency_ms):
    try:
        safe_args = {k: v for k, v in arguments.items() if k not in ("token", "password", "secret")}
        ToolExecutionLog.objects.create(
            user_id=user_id,
            integration=integration,
            provider=provider,
            tool_name=tool_name,
            arguments=safe_args,
            result_summary=str(result.get("result", ""))[:500] if result.get("ok") else "",
            success=bool(result.get("ok")),
            error_message=result.get("error", "")[:500] if not result.get("ok") else "",
            latency_ms=latency_ms,
        )
    except Exception:
        logger.exception("Failed to write tool execution log")
