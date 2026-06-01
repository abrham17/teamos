"""GitLab OAuth provider."""
from __future__ import annotations
import os
from urllib.parse import urlencode
import requests
from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

_CLIENT_ID = lambda: os.environ.get("GITLAB_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("GITLAB_CLIENT_SECRET", "")
GITLAB = "https://gitlab.com"
GITLAB_API = f"{GITLAB}/api/v4"

class GitLabProvider(ExternalToolProvider):
    PROVIDER_KEY = "gitlab"
    DISPLAY_NAME = "GitLab"
    SCOPES = ["api", "read_user", "read_repository"]
    SUPPORTS_REFRESH = True

    @classmethod
    def get_auth_url(cls, state, redirect_uri, extra_scopes=None):
        scopes = cls.SCOPES + (extra_scopes or [])
        return f"{GITLAB}/oauth/authorize?{urlencode({'client_id':_CLIENT_ID(),'redirect_uri':redirect_uri,'response_type':'code','scope':' '.join(scopes),'state':state})}"

    @classmethod
    def exchange_code(cls, code, redirect_uri, code_verifier=""):
        resp = requests.post(f"{GITLAB}/oauth/token", data={"client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"code":code,"grant_type":"authorization_code","redirect_uri":redirect_uri}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token",""), expires_in=d.get("expires_in"))

    @classmethod
    def refresh_token_data(cls, refresh_token):
        resp = requests.post(f"{GITLAB}/oauth/token", data={"client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"refresh_token":refresh_token,"grant_type":"refresh_token"}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token",refresh_token), expires_in=d.get("expires_in"))

    def get_user_info(self):
        d = self._get(f"{GITLAB_API}/user")
        return UserInfo(external_id=str(d.get("id","")), name=d.get("name",""), email=d.get("email",""))

    def get_tools(self):
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p,"search_projects","Search GitLab projects.",{"type":"object","properties":{"search":{"type":"string"},"per_page":{"type":"integer","default":20}},"required":["search"]}),
            ToolSchema(p,"list_issues","List issues in a GitLab project.",{"type":"object","properties":{"project_id":{"type":"string"},"state":{"type":"string","default":"opened"}},"required":["project_id"]}),
            ToolSchema(p,"create_issue","Create a GitLab issue.",{"type":"object","properties":{"project_id":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"}},"required":["project_id","title"]}),
            ToolSchema(p,"create_merge_request","Create a GitLab merge request.",{"type":"object","properties":{"project_id":{"type":"string"},"title":{"type":"string"},"source_branch":{"type":"string"},"target_branch":{"type":"string","default":"main"}},"required":["project_id","title","source_branch"]}),
        ]

    def execute_tool(self, tool_name, arguments):
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_search_projects(self, a):
        d = self._get(f"{GITLAB_API}/projects", {"search":a["search"],"per_page":a.get("per_page",20),"simple":True})
        return self.ok([{"id":p["id"],"name":p["name"],"url":p.get("web_url")} for p in d])

    def _tool_list_issues(self, a):
        d = self._get(f"{GITLAB_API}/projects/{a['project_id']}/issues", {"state":a.get("state","opened")})
        return self.ok([{"id":i["id"],"title":i["title"],"state":i["state"],"url":i.get("web_url")} for i in d])

    def _tool_create_issue(self, a):
        d = self._post(f"{GITLAB_API}/projects/{a['project_id']}/issues", {"title":a["title"],"description":a.get("description","")})
        return self.ok({"id":d["id"],"iid":d["iid"],"url":d.get("web_url")})

    def _tool_create_merge_request(self, a):
        d = self._post(f"{GITLAB_API}/projects/{a['project_id']}/merge_requests", {"title":a["title"],"source_branch":a["source_branch"],"target_branch":a.get("target_branch","main")})
        return self.ok({"id":d["id"],"url":d.get("web_url")})
