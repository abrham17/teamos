"""Linear OAuth provider."""
from __future__ import annotations
import os
from typing import Any
from urllib.parse import urlencode
import requests
from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

_CLIENT_ID = lambda: os.environ.get("LINEAR_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("LINEAR_CLIENT_SECRET", "")
LINEAR_GQL = "https://api.linear.app/graphql"

class LinearProvider(ExternalToolProvider):
    PROVIDER_KEY = "linear"
    DISPLAY_NAME = "Linear"
    SCOPES = ["read", "write"]
    SUPPORTS_REFRESH = False

    @classmethod
    def get_auth_url(cls, state, redirect_uri, extra_scopes=None):
        scopes = cls.SCOPES + (extra_scopes or [])
        return f"https://linear.app/oauth/authorize?{urlencode({'client_id':_CLIENT_ID(),'redirect_uri':redirect_uri,'response_type':'code','scope':','.join(scopes),'state':state})}"

    @classmethod
    def exchange_code(cls, code, redirect_uri, code_verifier=""):
        resp = requests.post("https://api.linear.app/oauth/token", data={"code":code,"redirect_uri":redirect_uri,"client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"grant_type":"authorization_code"}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"])

    @classmethod
    def refresh_token_data(cls, refresh_token):
        raise NotImplementedError("Linear tokens do not expire.")

    def _gql(self, query, variables=None):
        resp = requests.post(LINEAR_GQL, headers={**self._headers(), "Content-Type":"application/json"}, json={"query":query,"variables":variables or {}}, timeout=15)
        resp.raise_for_status()
        return resp.json().get("data", {})

    def get_user_info(self):
        d = self._gql("{ viewer { id name email } }")
        v = d.get("viewer", {})
        return UserInfo(external_id=v.get("id",""), name=v.get("name",""), email=v.get("email",""))

    def get_tools(self):
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p,"search_issues","Search Linear issues.",{"type":"object","properties":{"query":{"type":"string"},"first":{"type":"integer","default":20}},"required":["query"]}),
            ToolSchema(p,"create_issue","Create a Linear issue.",{"type":"object","properties":{"team_id":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"integer","description":"0=no priority, 1=urgent, 2=high, 3=medium, 4=low"}},"required":["team_id","title"]}),
            ToolSchema(p,"list_teams","List Linear teams.",{"type":"object","properties":{}}),
        ]

    def execute_tool(self, tool_name, arguments):
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_search_issues(self, a):
        d = self._gql('query($filter:IssueFilter,$first:Int){issues(filter:$filter,first:$first){nodes{id title state{name} priority}}}', {"filter":{"title":{"containsIgnoreCase":a["query"]}},"first":a.get("first",20)})
        return self.ok([{"id":i["id"],"title":i["title"],"state":i["state"]["name"]} for i in d.get("issues",{}).get("nodes",[])])

    def _tool_create_issue(self, a):
        d = self._gql('mutation($input:IssueCreateInput!){issueCreate(input:$input){issue{id title}}}', {"input":{"teamId":a["team_id"],"title":a["title"],"description":a.get("description",""),"priority":a.get("priority",0)}})
        issue = d.get("issueCreate",{}).get("issue",{})
        return self.ok({"id":issue.get("id"),"title":issue.get("title")})

    def _tool_list_teams(self, a):
        d = self._gql("{teams{nodes{id name key}}}")
        return self.ok([{"id":t["id"],"name":t["name"],"key":t["key"]} for t in d.get("teams",{}).get("nodes",[])])
