"""REST API views for the integrations platform."""
from __future__ import annotations
import logging, os
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from teamos_project.api_response import ok, fail
from integrations.oauth import generate_auth_url, handle_callback
from integrations.services import list_user_integrations, disconnect_integration, get_audit_logs
from integrations.tool_registry import get_user_tools, get_connected_providers_context
from integrations.provider_factory import list_providers

logger = logging.getLogger(__name__)


def _redirect_uri(request, provider: str) -> str:
    base = os.environ.get("FRONTEND_URL", "https://team-os.tech")
    return f"{base}/integrations/callback/{provider}"


class IntegrationProvidersView(APIView):
    """GET /api/integrations/providers/ – list all available providers."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return ok(list_providers())


class IntegrationListView(APIView):
    """GET /api/integrations/ – list user's connected integrations."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return ok(list_user_integrations(str(request.user.id)))


class IntegrationConnectView(APIView):
    """POST /api/integrations/connect/ – start OAuth flow."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        provider = (request.data.get("provider") or "").strip().lower()
        if not provider:
            return fail("provider is required.", status_code=400, code="missing_provider")
        try:
            redirect_uri = _redirect_uri(request, provider)
            auth_url = generate_auth_url(str(request.user.id), provider, redirect_uri)
            return ok({"authorization_url": auth_url, "provider": provider})
        except ValueError as e:
            return fail(str(e), status_code=400, code="invalid_provider")
        except Exception as e:
            logger.exception("Failed to generate auth URL for %s", provider)
            return fail("Failed to start OAuth flow.", status_code=500, code="oauth_start_failed")


class IntegrationCallbackView(APIView):
    """POST /api/integrations/callback/ – exchange code for token (called by frontend after redirect)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = (request.data.get("code") or "").strip()
        state = (request.data.get("state") or "").strip()
        provider = (request.data.get("provider") or "").strip().lower()
        if not code or not state:
            return fail("code and state are required.", status_code=400, code="missing_params")
        try:
            redirect_uri = _redirect_uri(request, provider)
            integration = handle_callback(code=code, state=state, redirect_uri=redirect_uri)
            from integrations.services import _serialize
            return ok(_serialize(integration))
        except ValueError as e:
            return fail(str(e), status_code=400, code="oauth_callback_invalid")
        except Exception:
            logger.exception("OAuth callback failed")
            return fail("Failed to complete OAuth connection.", status_code=500, code="oauth_callback_failed")


class IntegrationDisconnectView(APIView):
    """DELETE /api/integrations/<provider>/disconnect/ – revoke and remove."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, provider):
        disconnected = disconnect_integration(str(request.user.id), provider)
        if not disconnected:
            return fail("Integration not found.", status_code=404, code="not_found")
        return Response(status=204)


class IntegrationToolsView(APIView):
    """GET /api/integrations/tools/ – list all available external tools for the agent."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tools = get_user_tools(str(request.user.id))
        context = get_connected_providers_context(str(request.user.id))
        return ok({"tools": tools, "agent_context": context, "count": len(tools)})


class IntegrationAuditLogsView(APIView):
    """GET /api/integrations/logs/ – recent tool execution audit log."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit = min(int(request.query_params.get("limit", 50)), 200)
        logs = get_audit_logs(str(request.user.id), limit=limit)
        return ok(logs)
