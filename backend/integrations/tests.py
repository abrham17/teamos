"""
Tests for the integrations app – token encryption, provider factory, tool registry,
and API views.
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from integrations.models import OAuthToken, ToolExecutionLog, UserIntegration
from integrations.provider_factory import (
    PROVIDER_REGISTRY,
    get_provider_class,
    get_provider_instance,
    list_providers,
)
from integrations.providers.base import ToolSchema, TokenData
from integrations.token_manager import ensure_fresh_token, revoke_integration, store_token
from integrations.tool_registry import get_user_tools, invalidate_user_tool_cache

User = get_user_model()


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_user(email=None):
    email = email or f"test_{uuid.uuid4().hex[:8]}@example.com"
    username = f"u_{uuid.uuid4().hex[:8]}"
    return User.objects.create_user(username=username, email=email, password="testpass123")


def make_integration(user, provider="github", status=UserIntegration.STATUS_CONNECTED):
    integration, _ = UserIntegration.objects.update_or_create(
        user=user, provider=provider,
        defaults={"status": status},
    )
    return integration


def make_token(integration, access="test-access-token", refresh="test-refresh-token", expires_at=None):
    token, _ = OAuthToken.objects.get_or_create(integration=integration)
    token.access = access
    token.refresh = refresh
    token.expires_at = expires_at
    token.save()
    return token


# ── Encryption ────────────────────────────────────────────────────────────────

class TokenEncryptionTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.integration = make_integration(self.user)

    def test_access_token_roundtrip(self):
        """Access token must survive encrypt → save → reload → decrypt."""
        original = "ghp_supersecrettoken12345"
        token = make_token(self.integration, access=original)
        loaded = OAuthToken.objects.get(pk=token.pk)
        self.assertEqual(loaded.access, original)

    def test_refresh_token_roundtrip(self):
        original = "ghr_refreshtokenabcdef"
        token = make_token(self.integration, refresh=original)
        loaded = OAuthToken.objects.get(pk=token.pk)
        self.assertEqual(loaded.refresh, original)

    def test_raw_db_value_is_encrypted(self):
        """Raw DB value must NOT be the plain-text token."""
        plain = "ghp_plaintexttoken"
        token = make_token(self.integration, access=plain)
        loaded = OAuthToken.objects.get(pk=token.pk)
        self.assertNotEqual(loaded._access_token, plain)
        self.assertTrue(loaded._access_token.startswith("enc::"))

    def test_empty_token_returns_empty_string(self):
        token = make_token(self.integration, access="", refresh="")
        loaded = OAuthToken.objects.get(pk=token.pk)
        self.assertEqual(loaded.access, "")
        self.assertEqual(loaded.refresh, "")

    def test_is_expired_false_when_no_expiry(self):
        token = make_token(self.integration)
        token.expires_at = None
        self.assertFalse(token.is_expired)

    def test_is_expired_true_when_past(self):
        from datetime import timedelta
        token = make_token(self.integration)
        token.expires_at = timezone.now() - timedelta(hours=1)
        self.assertTrue(token.is_expired)

    def test_is_expired_false_when_future(self):
        from datetime import timedelta
        token = make_token(self.integration)
        token.expires_at = timezone.now() + timedelta(hours=1)
        self.assertFalse(token.is_expired)


# ── Models ────────────────────────────────────────────────────────────────────

class UserIntegrationModelTests(TestCase):
    def setUp(self):
        self.user = make_user()

    def test_unique_per_provider(self):
        make_integration(self.user, provider="github")
        make_integration(self.user, provider="github")  # update_or_create, no duplicate
        self.assertEqual(UserIntegration.objects.filter(user=self.user, provider="github").count(), 1)

    def test_touch_updates_last_used(self):
        integration = make_integration(self.user)
        self.assertIsNone(integration.last_used_at)
        integration.touch()
        integration.refresh_from_db()
        self.assertIsNotNone(integration.last_used_at)

    def test_str_representation(self):
        integration = make_integration(self.user, provider="notion")
        self.assertIn("notion", str(integration))


# ── Provider Factory ──────────────────────────────────────────────────────────

class ProviderFactoryTests(TestCase):
    def test_all_declared_providers_importable(self):
        """Every provider key in PROVIDER_REGISTRY must import cleanly."""
        for key, cls in PROVIDER_REGISTRY.items():
            self.assertIsNotNone(cls, f"Provider {key!r} is None")

    def test_get_provider_class_known(self):
        cls = get_provider_class("github")
        self.assertIsNotNone(cls)
        self.assertEqual(cls.PROVIDER_KEY, "github")

    def test_get_provider_class_unknown(self):
        self.assertIsNone(get_provider_class("nonexistent_provider"))

    def test_get_provider_instance(self):
        inst = get_provider_instance("github", access_token="tok123")
        self.assertIsNotNone(inst)
        self.assertEqual(inst.access_token, "tok123")

    def test_list_providers_returns_all(self):
        providers = list_providers()
        keys = {p["key"] for p in providers}
        self.assertIn("github", keys)
        self.assertIn("notion", keys)
        self.assertIn("slack", keys)
        self.assertGreaterEqual(len(providers), 10)

    def test_list_providers_have_required_fields(self):
        for p in list_providers():
            self.assertIn("key", p)
            self.assertIn("display_name", p)
            self.assertIn("category", p)
            self.assertIn("color", p)


# ── Tool Schema ───────────────────────────────────────────────────────────────

class ToolSchemaTests(TestCase):
    def test_to_openai_format(self):
        schema = ToolSchema(
            provider="github",
            name="search_repositories",
            description="Search repos.",
            parameters={"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
        )
        openai = schema.to_openai_format()
        self.assertEqual(openai["type"], "function")
        fn = openai["function"]
        self.assertEqual(fn["name"], "ext_github_search_repositories")
        self.assertIn("[GITHUB]", fn["description"])

    def test_all_providers_return_tools(self):
        """Every provider's get_tools() should return at least 1 schema."""
        for key, cls in PROVIDER_REGISTRY.items():
            inst = cls(access_token="dummy")
            tools = inst.get_tools()
            self.assertGreater(len(tools), 0, f"{key} provider has no tools")
            for t in tools:
                self.assertIsInstance(t, ToolSchema)
                self.assertEqual(t.provider, key)


# ── Token Manager ─────────────────────────────────────────────────────────────

class TokenManagerTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.integration = make_integration(self.user, provider="github")

    def test_ensure_fresh_returns_access_token(self):
        make_token(self.integration, access="valid-token")
        result = ensure_fresh_token(self.integration)
        self.assertEqual(result, "valid-token")

    def test_ensure_fresh_returns_none_without_token(self):
        result = ensure_fresh_token(self.integration)
        self.assertIsNone(result)

    def test_revoke_integration(self):
        make_token(self.integration, access="tok")
        revoke_integration(self.integration)
        self.integration.refresh_from_db()
        self.assertEqual(self.integration.status, UserIntegration.STATUS_DISCONNECTED)
        self.assertFalse(OAuthToken.objects.filter(integration=self.integration).exists())

    def test_store_token(self):
        token_data = TokenData(
            access_token="new_access",
            refresh_token="new_refresh",
            expires_in=3600,
        )
        token = store_token(self.integration, token_data)
        self.assertEqual(token.access, "new_access")
        self.assertEqual(token.refresh, "new_refresh")
        self.assertIsNotNone(token.expires_at)


# ── Tool Registry ─────────────────────────────────────────────────────────────

class ToolRegistryTests(TestCase):
    def setUp(self):
        self.user = make_user()

    def test_no_integrations_returns_empty_list(self):
        tools = get_user_tools(str(self.user.id))
        self.assertEqual(tools, [])

    def test_disconnected_integration_excluded(self):
        integration = make_integration(self.user, provider="github", status=UserIntegration.STATUS_DISCONNECTED)
        make_token(integration, access="tok")
        tools = get_user_tools(str(self.user.id))
        self.assertEqual(tools, [])

    @patch("integrations.tool_registry.get_provider_instance")
    def test_connected_integration_loads_tools(self, mock_factory):
        integration = make_integration(self.user, provider="github")
        make_token(integration, access="tok")

        mock_provider = MagicMock()
        mock_provider.get_tools.return_value = [
            ToolSchema("github", "search_repositories", "Search repos",
                       {"type": "object", "properties": {}, "required": []})
        ]
        mock_factory.return_value = mock_provider

        invalidate_user_tool_cache(str(self.user.id))
        with patch("integrations.tool_registry.ensure_fresh_token", return_value="tok"):
            tools = get_user_tools(str(self.user.id))

        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0]["function"]["name"], "ext_github_search_repositories")


# ── API Views ─────────────────────────────────────────────────────────────────

class IntegrationAPITests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_providers(self):
        resp = self.client.get("/api/integrations/providers/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertIsInstance(data["data"], list)
        self.assertGreater(len(data["data"]), 0)

    def test_list_integrations_empty(self):
        resp = self.client.get("/api/integrations/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["data"], [])

    def test_list_integrations_with_data(self):
        make_integration(self.user, provider="github")
        resp = self.client.get("/api/integrations/")
        self.assertEqual(resp.status_code, 200)
        integrations = resp.json()["data"]
        self.assertEqual(len(integrations), 1)
        self.assertEqual(integrations[0]["provider"], "github")

    def test_connect_invalid_provider(self):
        resp = self.client.post("/api/integrations/connect/", {"provider": "fakeprovider99"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_connect_missing_provider(self):
        resp = self.client.post("/api/integrations/connect/", {}, format="json")
        self.assertEqual(resp.status_code, 400)

    @patch("integrations.views.generate_auth_url", return_value="https://github.com/oauth?state=xyz")
    def test_connect_returns_auth_url(self, mock_gen):
        resp = self.client.post("/api/integrations/connect/", {"provider": "github"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("authorization_url", resp.json()["data"])

    def test_disconnect_not_found(self):
        resp = self.client.delete("/api/integrations/github/disconnect/")
        self.assertEqual(resp.status_code, 404)

    def test_disconnect_existing(self):
        make_integration(self.user, provider="slack")
        resp = self.client.delete("/api/integrations/slack/disconnect/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(UserIntegration.objects.filter(user=self.user, provider="slack").exists())

    def test_tools_endpoint_empty(self):
        resp = self.client.get("/api/integrations/tools/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()["data"]
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["tools"], [])

    def test_audit_logs_endpoint(self):
        resp = self.client.get("/api/integrations/logs/")
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json()["data"], list)

    def test_unauthenticated_blocked(self):
        anon = APIClient()
        resp = anon.get("/api/integrations/providers/")
        self.assertIn(resp.status_code, [401, 403])


# ── Tool Executor ─────────────────────────────────────────────────────────────

class ToolExecutorTests(TestCase):
    def setUp(self):
        self.user = make_user()

    def test_non_external_tool_returns_none(self):
        from integrations.tool_executor import execute_external_tool
        result = execute_external_tool(str(self.user.id), "wiki_search_pages", {"query": "test"})
        self.assertIsNone(result)

    def test_disconnected_provider_returns_error(self):
        from integrations.tool_executor import execute_external_tool
        result = execute_external_tool(str(self.user.id), "ext_github_search_repositories", {"query": "test"})
        self.assertFalse(result["ok"])
        self.assertIn("not connected", result["error"])

    def test_malformed_tool_name(self):
        from integrations.tool_executor import execute_external_tool
        result = execute_external_tool(str(self.user.id), "ext_onlyonepart", {"query": "test"})
        self.assertFalse(result["ok"])
