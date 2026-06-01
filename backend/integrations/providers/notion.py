"""Notion OAuth provider – direct API calls via notion.so."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlencode

import requests

from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

NOTION_API = "https://api.notion.com/v1"
NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize"
NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"
NOTION_VERSION = "2022-06-28"

_CLIENT_ID = lambda: os.environ.get("NOTION_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("NOTION_CLIENT_SECRET", "")


class NotionProvider(ExternalToolProvider):
    PROVIDER_KEY = "notion"
    DISPLAY_NAME = "Notion"
    SCOPES = []  # Notion uses workspace-level access, not scopes
    SUPPORTS_REFRESH = False

    @classmethod
    def get_auth_url(cls, state: str, redirect_uri: str, extra_scopes=None) -> str:
        params = {
            "client_id": _CLIENT_ID(),
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "owner": "user",
            "state": state,
        }
        return f"{NOTION_AUTH_URL}?{urlencode(params)}"

    @classmethod
    def exchange_code(cls, code: str, redirect_uri: str, code_verifier: str = "") -> TokenData:
        import base64
        creds = base64.b64encode(f"{_CLIENT_ID()}:{_CLIENT_SECRET()}".encode()).decode()
        resp = requests.post(
            NOTION_TOKEN_URL,
            headers={"Authorization": f"Basic {creds}", "Content-Type": "application/json"},
            json={"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return TokenData(
            access_token=data["access_token"],
            extra={
                "workspace_id": data.get("workspace_id"),
                "workspace_name": data.get("workspace_name"),
                "bot_id": data.get("bot_id"),
            },
        )

    @classmethod
    def refresh_token_data(cls, refresh_token: str) -> TokenData:
        raise NotImplementedError("Notion tokens do not expire.")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        }

    def get_user_info(self) -> UserInfo:
        data = self._get(f"{NOTION_API}/users/me")
        person = data.get("person", {})
        return UserInfo(
            external_id=data["id"],
            name=data.get("name", ""),
            email=person.get("email", ""),
            extra={"workspace_id": self.extra.get("workspace_id")},
        )

    def get_tools(self) -> list[ToolSchema]:
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p, "search_pages",
                "Search Notion pages and databases by keyword.",
                {"type": "object", "properties": {
                    "query": {"type": "string"}, "page_size": {"type": "integer", "default": 10},
                }, "required": ["query"]}),
            ToolSchema(p, "create_page",
                "Create a new page in a Notion database or as a child of another page.",
                {"type": "object", "properties": {
                    "parent_id": {"type": "string", "description": "Parent page or database ID"},
                    "title": {"type": "string"},
                    "content": {"type": "string", "description": "Plain text or markdown content"},
                    "parent_type": {"type": "string", "enum": ["page_id", "database_id"], "default": "page_id"},
                }, "required": ["parent_id", "title"]}),
            ToolSchema(p, "update_page",
                "Update a Notion page's title or properties.",
                {"type": "object", "properties": {
                    "page_id": {"type": "string"}, "title": {"type": "string"},
                    "archived": {"type": "boolean"},
                }, "required": ["page_id"]}),
            ToolSchema(p, "get_page",
                "Get the details and content of a Notion page.",
                {"type": "object", "properties": {
                    "page_id": {"type": "string"},
                }, "required": ["page_id"]}),
            ToolSchema(p, "query_database",
                "Query a Notion database with optional filters.",
                {"type": "object", "properties": {
                    "database_id": {"type": "string"},
                    "filter": {"type": "object", "description": "Notion filter object (optional)"},
                    "page_size": {"type": "integer", "default": 20},
                }, "required": ["database_id"]}),
            ToolSchema(p, "create_database",
                "Create a new Notion database as a child of a page.",
                {"type": "object", "properties": {
                    "parent_page_id": {"type": "string"}, "title": {"type": "string"},
                    "properties": {"type": "object", "description": "Database property schema"},
                }, "required": ["parent_page_id", "title"]}),
        ]

    def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_search_pages(self, a):
        resp = requests.post(
            f"{NOTION_API}/search",
            headers=self._headers(),
            json={"query": a["query"], "page_size": a.get("page_size", 10)},
            timeout=15,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return self.ok([{
            "id": r["id"],
            "title": self._extract_title(r),
            "type": r["object"],
            "url": r.get("url"),
        } for r in results])

    def _tool_get_page(self, a):
        page = self._get(f"{NOTION_API}/pages/{a['page_id']}")
        blocks = self._get(f"{NOTION_API}/blocks/{a['page_id']}/children")
        content = self._blocks_to_text(blocks.get("results", []))
        return self.ok({
            "id": page["id"], "title": self._extract_title(page),
            "url": page.get("url"), "content": content,
        })

    def _tool_create_page(self, a):
        parent_type = a.get("parent_type", "page_id")
        payload = {
            "parent": {parent_type: a["parent_id"]},
            "properties": {"title": {"title": [{"text": {"content": a["title"]}}]}},
        }
        if a.get("content"):
            payload["children"] = [{"object": "block", "type": "paragraph",
                                     "paragraph": {"rich_text": [{"text": {"content": a["content"][:2000]}}]}}]
        data = self._post(f"{NOTION_API}/pages", payload)
        return self.ok({"id": data["id"], "url": data.get("url"), "title": a["title"]})

    def _tool_update_page(self, a):
        payload = {}
        if "title" in a:
            payload["properties"] = {"title": {"title": [{"text": {"content": a["title"]}}]}}
        if "archived" in a:
            payload["archived"] = a["archived"]
        resp = requests.patch(f"{NOTION_API}/pages/{a['page_id']}", headers=self._headers(), json=payload, timeout=15)
        resp.raise_for_status()
        return self.ok({"id": a["page_id"], "updated": True})

    def _tool_query_database(self, a):
        payload = {"page_size": a.get("page_size", 20)}
        if a.get("filter"):
            payload["filter"] = a["filter"]
        resp = requests.post(f"{NOTION_API}/databases/{a['database_id']}/query",
                             headers=self._headers(), json=payload, timeout=15)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return self.ok([{"id": r["id"], "title": self._extract_title(r)} for r in results])

    def _tool_create_database(self, a):
        props = a.get("properties") or {"Name": {"title": {}}}
        payload = {
            "parent": {"page_id": a["parent_page_id"]},
            "title": [{"text": {"content": a["title"]}}],
            "properties": props,
        }
        data = self._post(f"{NOTION_API}/databases", payload)
        return self.ok({"id": data["id"], "url": data.get("url"), "title": a["title"]})

    def _extract_title(self, obj: dict) -> str:
        try:
            props = obj.get("properties", {})
            for key in ("title", "Name", "Title"):
                if key in props:
                    parts = props[key].get("title", [])
                    return "".join(p["plain_text"] for p in parts)
        except Exception:
            pass
        return obj.get("id", "")

    def _blocks_to_text(self, blocks: list) -> str:
        lines = []
        for b in blocks[:30]:
            btype = b.get("type", "")
            block_data = b.get(btype, {})
            rt = block_data.get("rich_text", [])
            text = "".join(p.get("plain_text", "") for p in rt)
            if text:
                lines.append(text)
        return "\n".join(lines)
