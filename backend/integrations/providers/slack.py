"""Slack OAuth provider."""
from __future__ import annotations
import os
from typing import Any
from urllib.parse import urlencode
import requests
from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

SLACK_API = "https://slack.com/api"
_CLIENT_ID = lambda: os.environ.get("SLACK_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("SLACK_CLIENT_SECRET", "")


class SlackProvider(ExternalToolProvider):
    PROVIDER_KEY = "slack"
    DISPLAY_NAME = "Slack"
    SCOPES = ["channels:read", "channels:history", "chat:write", "users:read",
              "search:read", "channels:manage"]
    SUPPORTS_REFRESH = False

    @classmethod
    def get_auth_url(cls, state, redirect_uri, extra_scopes=None):
        scopes = cls.SCOPES + (extra_scopes or [])
        return f"https://slack.com/oauth/v2/authorize?{urlencode({'client_id': _CLIENT_ID(), 'scope': ','.join(scopes), 'redirect_uri': redirect_uri, 'state': state})}"

    @classmethod
    def exchange_code(cls, code, redirect_uri, code_verifier=""):
        resp = requests.post(f"{SLACK_API}/oauth.v2.access", data={
            "client_id": _CLIENT_ID(), "client_secret": _CLIENT_SECRET(),
            "code": code, "redirect_uri": redirect_uri,
        }, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(data.get("error", "Slack OAuth failed"))
        token = data.get("access_token") or data.get("authed_user", {}).get("access_token", "")
        return TokenData(access_token=token, extra={"team_id": data.get("team", {}).get("id"), "team_name": data.get("team", {}).get("name"), "bot_user_id": data.get("bot_user_id")})

    @classmethod
    def refresh_token_data(cls, refresh_token):
        raise NotImplementedError("Slack tokens do not expire.")

    def _call(self, method, **kwargs):
        resp = requests.post(f"{SLACK_API}/{method}", headers={"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}, json=kwargs, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(data.get("error", "Slack API error"))
        return data

    def get_user_info(self):
        data = self._call("auth.test")
        return UserInfo(external_id=data.get("user_id", ""), name=data.get("user", ""), email="", extra={"team": data.get("team"), "team_id": data.get("team_id")})

    def get_tools(self):
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p, "send_message", "Send a message to a Slack channel.", {"type": "object", "properties": {"channel": {"type": "string", "description": "Channel name or ID"}, "text": {"type": "string"}, "thread_ts": {"type": "string", "description": "Thread timestamp to reply in"}}, "required": ["channel", "text"]}),
            ToolSchema(p, "list_channels", "List public channels in the Slack workspace.", {"type": "object", "properties": {"limit": {"type": "integer", "default": 50}}}),
            ToolSchema(p, "get_channel_history", "Get recent messages from a Slack channel.", {"type": "object", "properties": {"channel": {"type": "string"}, "limit": {"type": "integer", "default": 20}}, "required": ["channel"]}),
            ToolSchema(p, "search_messages", "Search Slack messages by keyword.", {"type": "object", "properties": {"query": {"type": "string"}, "count": {"type": "integer", "default": 10}}, "required": ["query"]}),
            ToolSchema(p, "create_channel", "Create a new Slack channel.", {"type": "object", "properties": {"name": {"type": "string"}, "is_private": {"type": "boolean", "default": False}}, "required": ["name"]}),
        ]

    def execute_tool(self, tool_name, arguments):
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_send_message(self, a):
        payload = {"channel": a["channel"], "text": a["text"]}
        if a.get("thread_ts"):
            payload["thread_ts"] = a["thread_ts"]
        data = self._call("chat.postMessage", **payload)
        return self.ok({"ts": data.get("ts"), "channel": data.get("channel")})

    def _tool_list_channels(self, a):
        data = self._call("conversations.list", limit=a.get("limit", 50), types="public_channel")
        return self.ok([{"id": c["id"], "name": c["name"], "num_members": c.get("num_members")} for c in data.get("channels", [])])

    def _tool_get_channel_history(self, a):
        data = self._call("conversations.history", channel=a["channel"], limit=a.get("limit", 20))
        return self.ok([{"user": m.get("user"), "text": m.get("text"), "ts": m.get("ts")} for m in data.get("messages", [])])

    def _tool_search_messages(self, a):
        resp = requests.get(f"{SLACK_API}/search.messages", headers={"Authorization": f"Bearer {self.access_token}"}, params={"query": a["query"], "count": a.get("count", 10)}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        matches = data.get("messages", {}).get("matches", [])
        return self.ok([{"text": m.get("text"), "channel": m.get("channel", {}).get("name"), "ts": m.get("ts")} for m in matches])

    def _tool_create_channel(self, a):
        data = self._call("conversations.create", name=a["name"], is_private=a.get("is_private", False))
        ch = data.get("channel", {})
        return self.ok({"id": ch.get("id"), "name": ch.get("name")})
