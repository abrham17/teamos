"""
Abstract base for all external integration providers.

Every provider must implement:
  - PROVIDER_KEY   – short slug, e.g. "github"
  - SCOPES         – default OAuth scope list
  - get_auth_url() – build the authorization redirect URL
  - exchange_code()– exchange authorization code → token dict
  - refresh_token()– refresh an expired token → updated token dict
  - get_tools()    – return list of tool schemas (OpenAI function format)
  - execute_tool() – execute a single tool call, return result dict
  - get_user_info()– fetch the external user's identity info
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolSchema:
    """OpenAI-compatible function tool schema."""
    provider: str
    name: str
    description: str
    parameters: dict[str, Any]

    def to_openai_format(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": f"ext_{self.provider}_{self.name}",
                "description": f"[{self.provider.upper()}] {self.description}",
                "parameters": self.parameters,
            },
        }


@dataclass
class TokenData:
    """Normalized token data returned by exchange_code / refresh_token."""
    access_token: str
    refresh_token: str = ""
    expires_in: int | None = None     # seconds
    token_type: str = "Bearer"
    scopes: list[str] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class UserInfo:
    """External provider identity."""
    external_id: str
    name: str = ""
    email: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


class ExternalToolProvider(ABC):
    """Abstract base that every integration provider must implement."""

    PROVIDER_KEY: str = ""          # e.g. "github"
    DISPLAY_NAME: str = ""          # e.g. "GitHub"
    SCOPES: list[str] = []          # default OAuth scopes
    SUPPORTS_PKCE: bool = False      # set True if provider supports PKCE
    SUPPORTS_REFRESH: bool = True    # set False if provider doesn't issue refresh tokens

    def __init__(self, access_token: str, refresh_token: str = "", extra: dict | None = None):
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.extra = extra or {}

    # ── OAuth flow ───────────────────────────────────────────────────────────

    @classmethod
    @abstractmethod
    def get_auth_url(cls, state: str, redirect_uri: str, extra_scopes: list[str] | None = None) -> str:
        """Return the authorization URL the user should be redirected to."""

    @classmethod
    @abstractmethod
    def exchange_code(cls, code: str, redirect_uri: str, code_verifier: str = "") -> TokenData:
        """Exchange authorization code for tokens."""

    @classmethod
    @abstractmethod
    def refresh_token_data(cls, refresh_token: str) -> TokenData:
        """Refresh an expired access token using the refresh token."""

    # ── Provider info ────────────────────────────────────────────────────────

    @abstractmethod
    def get_user_info(self) -> UserInfo:
        """Fetch the authenticated external user's profile."""

    # ── Tool interface ───────────────────────────────────────────────────────

    @abstractmethod
    def get_tools(self) -> list[ToolSchema]:
        """Return all available tools for this provider."""

    @abstractmethod
    def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """
        Execute a tool and return a normalized result dict.
        Must include at minimum: {"ok": bool, "result": ...}
        """

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}"}

    def _get(self, url: str, params: dict | None = None, **kwargs) -> Any:
        import requests
        resp = requests.get(url, headers=self._headers(), params=params, timeout=15, **kwargs)
        resp.raise_for_status()
        return resp.json()

    def _post(self, url: str, json: dict | None = None, **kwargs) -> Any:
        import requests
        resp = requests.post(url, headers=self._headers(), json=json, timeout=15, **kwargs)
        resp.raise_for_status()
        return resp.json()

    def _patch(self, url: str, json: dict | None = None, **kwargs) -> Any:
        import requests
        resp = requests.patch(url, headers=self._headers(), json=json, timeout=15, **kwargs)
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def ok(result: Any) -> dict[str, Any]:
        return {"ok": True, "result": result}

    @staticmethod
    def err(msg: str) -> dict[str, Any]:
        return {"ok": False, "error": msg}
