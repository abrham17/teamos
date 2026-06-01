"""Dynamic tool discovery – loads tools from all connected integrations."""
from __future__ import annotations
import logging
from django.core.cache import cache
from integrations.models import UserIntegration
from integrations.provider_factory import get_provider_instance
from integrations.token_manager import ensure_fresh_token

logger = logging.getLogger(__name__)
TOOL_CACHE_TTL = 120  # seconds


def get_user_tools(user_id: str) -> list[dict]:
    """Return OpenAI-format tool schemas for all of a user's connected integrations."""
    cache_key = f"ext_tools:{user_id}"
    try:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        cached = None

    integrations = UserIntegration.objects.filter(
        user_id=user_id, status=UserIntegration.STATUS_CONNECTED
    ).select_related("token")

    all_tools = []
    for integration in integrations:
        access_token = ensure_fresh_token(integration)
        if not access_token:
            continue
        try:
            extra = {}
            try:
                extra = integration.token.extra or {}
            except Exception:
                pass
            provider = get_provider_instance(integration.provider, access_token, extra=extra)
            if provider is None:
                continue
            for tool in provider.get_tools():
                all_tools.append(tool.to_openai_format())
        except Exception:
            logger.exception("Failed to load tools for %s/%s", user_id, integration.provider)

    try:
        cache.set(cache_key, all_tools, TOOL_CACHE_TTL)
    except Exception:
        pass
    return all_tools


def invalidate_user_tool_cache(user_id: str) -> None:
    try:
        cache.delete(f"ext_tools:{user_id}")
    except Exception:
        pass


def get_connected_providers_context(user_id: str) -> str:
    """Return a text snippet injected into the agent system prompt."""
    integrations = UserIntegration.objects.filter(
        user_id=user_id, status=UserIntegration.STATUS_CONNECTED
    ).values_list("provider", flat=True)
    if not integrations:
        return ""
    names = ", ".join(sorted(set(integrations)))
    return (
        f"\n\nConnected external integrations: {names}\n"
        "You may use tools from these services when relevant to the user's request. "
        "Tool names are prefixed with ext_<provider>_."
    )
