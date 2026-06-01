"""Jira OAuth 2.0 provider."""
from __future__ import annotations
import os
from typing import Any
from urllib.parse import urlencode
import requests
from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

_CLIENT_ID = lambda: os.environ.get("JIRA_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("JIRA_CLIENT_SECRET", "")

class JiraProvider(ExternalToolProvider):
    PROVIDER_KEY = "jira"
    DISPLAY_NAME = "Jira"
    SCOPES = ["read:jira-work", "write:jira-work", "read:jira-user", "offline_access"]
    SUPPORTS_REFRESH = True

    @classmethod
    def get_auth_url(cls, state, redirect_uri, extra_scopes=None):
        scopes = cls.SCOPES + (extra_scopes or [])
        return f"https://auth.atlassian.com/authorize?{urlencode({'audience':'api.atlassian.com','client_id':_CLIENT_ID(),'scope':' '.join(scopes),'redirect_uri':redirect_uri,'state':state,'response_type':'code','prompt':'consent'})}"

    @classmethod
    def exchange_code(cls, code, redirect_uri, code_verifier=""):
        resp = requests.post("https://auth.atlassian.com/oauth/token", json={"grant_type":"authorization_code","client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"code":code,"redirect_uri":redirect_uri}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token",""), expires_in=d.get("expires_in"))

    @classmethod
    def refresh_token_data(cls, refresh_token):
        resp = requests.post("https://auth.atlassian.com/oauth/token", json={"grant_type":"refresh_token","client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"refresh_token":refresh_token}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token", refresh_token), expires_in=d.get("expires_in"))

    def _cloud_id(self):
        if self.extra.get("cloud_id"):
            return self.extra["cloud_id"]
        d = self._get("https://api.atlassian.com/oauth/token/accessible-resources")
        cid = d[0]["id"] if d else ""
        self.extra["cloud_id"] = cid
        return cid

    def get_user_info(self):
        d = self._get("https://api.atlassian.com/me")
        return UserInfo(external_id=d.get("account_id",""), name=d.get("display_name",""), email=d.get("email",""))

    def get_tools(self):
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p,"search_issues","Search Jira issues using JQL.",{"type":"object","properties":{"jql":{"type":"string"},"max_results":{"type":"integer","default":20}},"required":["jql"]}),
            ToolSchema(p,"create_issue","Create a new Jira issue.",{"type":"object","properties":{"project_key":{"type":"string"},"summary":{"type":"string"},"description":{"type":"string"},"issue_type":{"type":"string","default":"Task"},"assignee_id":{"type":"string"}},"required":["project_key","summary"]}),
            ToolSchema(p,"update_issue","Update a Jira issue.",{"type":"object","properties":{"issue_key":{"type":"string"},"summary":{"type":"string"},"description":{"type":"string"},"status":{"type":"string"},"assignee_id":{"type":"string"}},"required":["issue_key"]}),
            ToolSchema(p,"get_issue","Get details of a Jira issue.",{"type":"object","properties":{"issue_key":{"type":"string"}},"required":["issue_key"]}),
        ]

    def execute_tool(self, tool_name, arguments):
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _base(self):
        return f"https://api.atlassian.com/ex/jira/{self._cloud_id()}/rest/api/3"

    def _tool_search_issues(self, a):
        d = self._get(f"{self._base()}/search", {"jql": a["jql"], "maxResults": a.get("max_results",20), "fields": "summary,status,assignee,priority"})
        return self.ok([{"key":i["key"],"summary":i["fields"]["summary"],"status":i["fields"]["status"]["name"]} for i in d.get("issues",[])])

    def _tool_create_issue(self, a):
        payload = {"fields":{"project":{"key":a["project_key"]},"summary":a["summary"],"issuetype":{"name":a.get("issue_type","Task")}}}
        if a.get("description"):
            payload["fields"]["description"] = {"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":a["description"]}]}]}
        d = self._post(f"{self._base()}/issue", payload)
        return self.ok({"key":d["key"],"id":d["id"]})

    def _tool_update_issue(self, a):
        payload = {"fields":{}}
        if a.get("summary"): payload["fields"]["summary"] = a["summary"]
        if a.get("assignee_id"): payload["fields"]["assignee"] = {"accountId": a["assignee_id"]}
        resp = requests.put(f"{self._base()}/issue/{a['issue_key']}", headers=self._headers(), json=payload, timeout=15)
        resp.raise_for_status()
        return self.ok({"key": a["issue_key"], "updated": True})

    def _tool_get_issue(self, a):
        d = self._get(f"{self._base()}/issue/{a['issue_key']}")
        return self.ok({"key":d["key"],"summary":d["fields"]["summary"],"status":d["fields"]["status"]["name"],"assignee":(d["fields"].get("assignee") or {}).get("displayName")})
