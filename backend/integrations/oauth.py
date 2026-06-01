"""OAuth state generation and callback handling."""
from __future__ import annotations
import hashlib, logging, os, secrets
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from integrations.models import UserIntegration
from integrations.provider_factory import get_provider_class, PROVIDER_META
from integrations.token_manager import store_token
from integrations.tool_registry import invalidate_user_tool_cache

logger = logging.getLogger(__name__)
STATE_TTL = 600  # 10 min


def generate_auth_url(user_id: str, provider_key: str, redirect_uri: str) -> str:
    cls = get_provider_class(provider_key)
    if cls is None:
        raise ValueError(f"Unknown provider: {provider_key}")
    state = secrets.token_urlsafe(32)
    cache.set(f"oauth_state:{state}", {"user_id": str(user_id), "provider": provider_key}, STATE_TTL)
    return cls.get_auth_url(state=state, redirect_uri=redirect_uri)


def handle_callback(code: str, state: str, redirect_uri: str) -> UserIntegration:
    state_data = cache.get(f"oauth_state:{state}")
    if not state_data:
        raise ValueError("Invalid or expired OAuth state.")
    cache.delete(f"oauth_state:{state}")

    user_id = state_data["user_id"]
    provider_key = state_data["provider"]
    cls = get_provider_class(provider_key)
    if cls is None:
        raise ValueError(f"Unknown provider: {provider_key}")

    token_data = cls.exchange_code(code=code, redirect_uri=redirect_uri)
    integration, _ = UserIntegration.objects.update_or_create(
        user_id=user_id, provider=provider_key,
        defaults={"status": UserIntegration.STATUS_CONNECTED}
    )
    store_token(integration, token_data)

    # Fetch external user info
    try:
        provider_instance = cls(access_token=token_data.access_token, refresh_token=token_data.refresh_token, extra=token_data.extra)
        info = provider_instance.get_user_info()
        integration.external_user_id = info.external_id
        integration.external_user_name = info.name
        integration.external_user_email = info.email
        integration.scopes = token_data.scopes
        integration.provider_data = token_data.extra
        integration.save()
    except Exception:
        logger.exception("Could not fetch user info for %s", provider_key)

    invalidate_user_tool_cache(user_id)
    return integration
