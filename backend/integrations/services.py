"""High-level integration service layer."""
from __future__ import annotations
from integrations.models import UserIntegration, ToolExecutionLog
from integrations.tool_registry import get_user_tools, invalidate_user_tool_cache
from integrations.tool_executor import execute_external_tool
from integrations.token_manager import revoke_integration


def list_user_integrations(user_id: str) -> list[dict]:
    integrations = UserIntegration.objects.filter(user_id=user_id).order_by("provider")
    return [_serialize(i) for i in integrations]


def disconnect_integration(user_id: str, provider_key: str) -> bool:
    try:
        integration = UserIntegration.objects.get(user_id=user_id, provider=provider_key)
        revoke_integration(integration)
        invalidate_user_tool_cache(user_id)
        return True
    except UserIntegration.DoesNotExist:
        return False


def get_audit_logs(user_id: str, limit: int = 50) -> list[dict]:
    logs = ToolExecutionLog.objects.filter(user_id=user_id).order_by("-timestamp")[:limit]
    return [{"provider": l.provider, "tool": l.tool_name, "success": l.success,
             "latency_ms": l.latency_ms, "timestamp": l.timestamp.isoformat()} for l in logs]


def _serialize(integration: UserIntegration) -> dict:
    from integrations.provider_factory import PROVIDER_META
    meta = PROVIDER_META.get(integration.provider, {})
    has_token = False
    try:
        has_token = bool(integration.token._access_token)
    except Exception:
        pass
    return {
        "id": str(integration.id),
        "provider": integration.provider,
        "display_name": meta.get("display_name", integration.provider),
        "category": meta.get("category", "other"),
        "color": meta.get("color", "#6b7280"),
        "icon": meta.get("icon", integration.provider),
        "status": integration.status,
        "external_user_name": integration.external_user_name,
        "external_user_email": integration.external_user_email,
        "scopes": integration.scopes,
        "has_token": has_token,
        "connected_at": integration.created_at.isoformat(),
        "last_used_at": integration.last_used_at.isoformat() if integration.last_used_at else None,
    }
