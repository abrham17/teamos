"""Token lifecycle management – refresh, revocation, encryption."""
from __future__ import annotations
import logging
from datetime import timedelta
from django.utils import timezone
from integrations.models import OAuthToken, UserIntegration
from integrations.provider_factory import get_provider_class

logger = logging.getLogger(__name__)


def ensure_fresh_token(integration: UserIntegration) -> str | None:
    """Return a valid access token, refreshing if needed. Returns None on failure."""
    try:
        token = integration.token
    except OAuthToken.DoesNotExist:
        logger.warning("No token found for integration %s", integration.id)
        return None

    if not token.is_expired:
        return token.access

    cls = get_provider_class(integration.provider)
    if cls is None or not cls.SUPPORTS_REFRESH:
        return token.access  # best-effort

    if not token.refresh:
        logger.warning("Token expired but no refresh_token for %s/%s", integration.user_id, integration.provider)
        integration.status = UserIntegration.STATUS_ERROR
        integration.save(update_fields=["status"])
        return None

    try:
        token_data = cls.refresh_token_data(token.refresh)
        token.access = token_data.access_token
        if token_data.refresh_token:
            token.refresh = token_data.refresh_token
        if token_data.expires_in:
            token.expires_at = timezone.now() + timedelta(seconds=token_data.expires_in - 60)
        token.save()
        logger.info("Refreshed token for %s/%s", integration.user_id, integration.provider)
        return token.access
    except Exception:
        logger.exception("Token refresh failed for %s/%s", integration.user_id, integration.provider)
        integration.status = UserIntegration.STATUS_ERROR
        integration.save(update_fields=["status"])
        return None


def revoke_integration(integration: UserIntegration) -> None:
    """Mark integration as disconnected and clear tokens."""
    try:
        integration.token.delete()
    except OAuthToken.DoesNotExist:
        pass
    integration.status = UserIntegration.STATUS_DISCONNECTED
    integration.save(update_fields=["status", "updated_at"])


def store_token(integration: UserIntegration, token_data) -> OAuthToken:
    """Create or update an OAuthToken for an integration."""
    from datetime import timedelta
    token, _ = OAuthToken.objects.get_or_create(integration=integration)
    token.access = token_data.access_token
    token.refresh = token_data.refresh_token or ""
    token.token_type = token_data.token_type or "Bearer"
    token.extra = token_data.extra or {}
    if token_data.expires_in:
        token.expires_at = timezone.now() + timedelta(seconds=token_data.expires_in - 60)
    else:
        token.expires_at = None
    token.save()
    return token
