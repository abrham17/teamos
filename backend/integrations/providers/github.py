"""GitHub OAuth provider – direct REST API calls, no external gateway needed."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlencode

import requests

from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

GITHUB_API = "https://api.github.com"
GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"

_CLIENT_ID = lambda: os.environ.get("GITHUB_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("GITHUB_CLIENT_SECRET", "")


class GitHubProvider(ExternalToolProvider):
    PROVIDER_KEY = "github"
    DISPLAY_NAME = "GitHub"
    SCOPES = ["repo", "read:user", "user:email", "read:org"]
    SUPPORTS_REFRESH = False  # GitHub uses long-lived tokens

    # ── OAuth ──────────────────────────────────────────────────────────

    @classmethod
    def get_auth_url(cls, state: str, redirect_uri: str, extra_scopes=None) -> str:
        scopes = cls.SCOPES + (extra_scopes or [])
        params = {
            "client_id": _CLIENT_ID(),
            "redirect_uri": redirect_uri,
            "scope": " ".join(scopes),
            "state": state,
        }
        return f"{GITHUB_AUTH_URL}?{urlencode(params)}"

    @classmethod
    def exchange_code(cls, code: str, redirect_uri: str, code_verifier: str = "") -> TokenData:
        resp = requests.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": _CLIENT_ID(),
                "client_secret": _CLIENT_SECRET(),
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise ValueError(data.get("error_description", data["error"]))
        return TokenData(
            access_token=data["access_token"],
            token_type=data.get("token_type", "bearer"),
            scopes=data.get("scope", "").split(","),
        )

    @classmethod
    def refresh_token_data(cls, refresh_token: str) -> TokenData:
        raise NotImplementedError("GitHub tokens do not expire and cannot be refreshed.")

    def get_user_info(self) -> UserInfo:
        data = self._get(f"{GITHUB_API}/user")
        emails = []
        try:
            emails = self._get(f"{GITHUB_API}/user/emails")
        except Exception:
            pass
        primary_email = next(
            (e["email"] for e in emails if isinstance(e, dict) and e.get("primary")),
            data.get("email", ""),
        )
        return UserInfo(
            external_id=str(data["id"]),
            name=data.get("name") or data.get("login", ""),
            email=primary_email,
            extra={"login": data.get("login"), "avatar_url": data.get("avatar_url")},
        )

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"token {self.access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    # ── Tools ──────────────────────────────────────────────────────────

    def get_tools(self) -> list[ToolSchema]:
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p, "search_repositories",
                "Search GitHub repositories by keyword, language, or topic.",
                {"type": "object", "properties": {
                    "query": {"type": "string", "description": "Search query (e.g. 'django REST API language:python')"},
                    "per_page": {"type": "integer", "default": 10},
                }, "required": ["query"]}),
            ToolSchema(p, "get_repository",
                "Get details of a specific GitHub repository.",
                {"type": "object", "properties": {
                    "owner": {"type": "string"}, "repo": {"type": "string"},
                }, "required": ["owner", "repo"]}),
            ToolSchema(p, "list_issues",
                "List open issues for a GitHub repository.",
                {"type": "object", "properties": {
                    "owner": {"type": "string"}, "repo": {"type": "string"},
                    "state": {"type": "string", "enum": ["open", "closed", "all"], "default": "open"},
                    "per_page": {"type": "integer", "default": 20},
                }, "required": ["owner", "repo"]}),
            ToolSchema(p, "create_issue",
                "Create a new issue in a GitHub repository.",
                {"type": "object", "properties": {
                    "owner": {"type": "string"}, "repo": {"type": "string"},
                    "title": {"type": "string"}, "body": {"type": "string"},
                    "labels": {"type": "array", "items": {"type": "string"}},
                }, "required": ["owner", "repo", "title"]}),
            ToolSchema(p, "list_pull_requests",
                "List pull requests for a GitHub repository.",
                {"type": "object", "properties": {
                    "owner": {"type": "string"}, "repo": {"type": "string"},
                    "state": {"type": "string", "enum": ["open", "closed", "all"], "default": "open"},
                    "per_page": {"type": "integer", "default": 20},
                }, "required": ["owner", "repo"]}),
            ToolSchema(p, "create_pull_request",
                "Create a new pull request in a GitHub repository.",
                {"type": "object", "properties": {
                    "owner": {"type": "string"}, "repo": {"type": "string"},
                    "title": {"type": "string"}, "body": {"type": "string"},
                    "head": {"type": "string", "description": "Branch with changes"},
                    "base": {"type": "string", "description": "Target branch", "default": "main"},
                }, "required": ["owner", "repo", "title", "head"]}),
            ToolSchema(p, "read_file",
                "Read the content of a file in a GitHub repository.",
                {"type": "object", "properties": {
                    "owner": {"type": "string"}, "repo": {"type": "string"},
                    "path": {"type": "string"}, "ref": {"type": "string", "default": "main"},
                }, "required": ["owner", "repo", "path"]}),
            ToolSchema(p, "search_code",
                "Search code across GitHub repositories.",
                {"type": "object", "properties": {
                    "query": {"type": "string"}, "per_page": {"type": "integer", "default": 10},
                }, "required": ["query"]}),
            ToolSchema(p, "list_commits",
                "List recent commits for a GitHub repository.",
                {"type": "object", "properties": {
                    "owner": {"type": "string"}, "repo": {"type": "string"},
                    "sha": {"type": "string", "default": "main"},
                    "per_page": {"type": "integer", "default": 20},
                }, "required": ["owner", "repo"]}),
            ToolSchema(p, "create_branch",
                "Create a new branch in a GitHub repository.",
                {"type": "object", "properties": {
                    "owner": {"type": "string"}, "repo": {"type": "string"},
                    "branch": {"type": "string"}, "from_branch": {"type": "string", "default": "main"},
                }, "required": ["owner", "repo", "branch"]}),
        ]

    def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_search_repositories(self, a):
        data = self._get(f"{GITHUB_API}/search/repositories",
                         {"q": a["query"], "per_page": a.get("per_page", 10)})
        return self.ok([{"full_name": r["full_name"], "description": r.get("description"),
                         "stars": r["stargazers_count"], "url": r["html_url"]}
                        for r in data.get("items", [])])

    def _tool_get_repository(self, a):
        data = self._get(f"{GITHUB_API}/repos/{a['owner']}/{a['repo']}")
        return self.ok({"full_name": data["full_name"], "description": data.get("description"),
                        "stars": data["stargazers_count"], "language": data.get("language"),
                        "url": data["html_url"], "default_branch": data["default_branch"]})

    def _tool_list_issues(self, a):
        data = self._get(f"{GITHUB_API}/repos/{a['owner']}/{a['repo']}/issues",
                         {"state": a.get("state", "open"), "per_page": a.get("per_page", 20)})
        return self.ok([{"number": i["number"], "title": i["title"],
                         "state": i["state"], "url": i["html_url"]}
                        for i in data if "pull_request" not in i])

    def _tool_create_issue(self, a):
        data = self._post(f"{GITHUB_API}/repos/{a['owner']}/{a['repo']}/issues",
                          {"title": a["title"], "body": a.get("body", ""),
                           "labels": a.get("labels", [])})
        return self.ok({"number": data["number"], "url": data["html_url"], "title": data["title"]})

    def _tool_list_pull_requests(self, a):
        data = self._get(f"{GITHUB_API}/repos/{a['owner']}/{a['repo']}/pulls",
                         {"state": a.get("state", "open"), "per_page": a.get("per_page", 20)})
        return self.ok([{"number": p["number"], "title": p["title"],
                         "state": p["state"], "url": p["html_url"]}
                        for p in data])

    def _tool_create_pull_request(self, a):
        data = self._post(f"{GITHUB_API}/repos/{a['owner']}/{a['repo']}/pulls",
                          {"title": a["title"], "body": a.get("body", ""),
                           "head": a["head"], "base": a.get("base", "main")})
        return self.ok({"number": data["number"], "url": data["html_url"], "title": data["title"]})

    def _tool_read_file(self, a):
        import base64
        data = self._get(f"{GITHUB_API}/repos/{a['owner']}/{a['repo']}/contents/{a['path']}",
                         {"ref": a.get("ref", "main")})
        content = base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")
        return self.ok({"path": data["path"], "content": content[:8000], "sha": data["sha"]})

    def _tool_search_code(self, a):
        data = self._get(f"{GITHUB_API}/search/code",
                         {"q": a["query"], "per_page": a.get("per_page", 10)})
        return self.ok([{"path": i["path"], "repo": i["repository"]["full_name"],
                         "url": i["html_url"]}
                        for i in data.get("items", [])])

    def _tool_list_commits(self, a):
        data = self._get(f"{GITHUB_API}/repos/{a['owner']}/{a['repo']}/commits",
                         {"sha": a.get("sha", "main"), "per_page": a.get("per_page", 20)})
        return self.ok([{"sha": c["sha"][:7], "message": c["commit"]["message"].split("\n")[0],
                         "author": c["commit"]["author"]["name"],
                         "date": c["commit"]["author"]["date"]}
                        for c in data])

    def _tool_create_branch(self, a):
        repo_url = f"{GITHUB_API}/repos/{a['owner']}/{a['repo']}"
        ref_data = self._get(f"{repo_url}/git/ref/heads/{a.get('from_branch', 'main')}")
        sha = ref_data["object"]["sha"]
        data = self._post(f"{repo_url}/git/refs",
                          {"ref": f"refs/heads/{a['branch']}", "sha": sha})
        return self.ok({"branch": a["branch"], "sha": sha})
