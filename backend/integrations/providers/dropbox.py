"""Dropbox OAuth provider."""
from __future__ import annotations
import os
from urllib.parse import urlencode
import requests
from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

_CLIENT_ID = lambda: os.environ.get("DROPBOX_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("DROPBOX_CLIENT_SECRET", "")

class DropboxProvider(ExternalToolProvider):
    PROVIDER_KEY = "dropbox"
    DISPLAY_NAME = "Dropbox"
    SCOPES = ["files.metadata.read", "files.content.read", "files.content.write", "account_info.read"]
    SUPPORTS_REFRESH = True

    @classmethod
    def get_auth_url(cls, state, redirect_uri, extra_scopes=None):
        scopes = cls.SCOPES + (extra_scopes or [])
        return f"https://www.dropbox.com/oauth2/authorize?{urlencode({'client_id':_CLIENT_ID(),'redirect_uri':redirect_uri,'response_type':'code','scope':' '.join(scopes),'state':state,'token_access_type':'offline'})}"

    @classmethod
    def exchange_code(cls, code, redirect_uri, code_verifier=""):
        resp = requests.post("https://api.dropboxapi.com/oauth2/token", data={"code":code,"grant_type":"authorization_code","client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"redirect_uri":redirect_uri}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token",""), expires_in=d.get("expires_in"))

    @classmethod
    def refresh_token_data(cls, refresh_token):
        resp = requests.post("https://api.dropboxapi.com/oauth2/token", data={"refresh_token":refresh_token,"grant_type":"refresh_token","client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET()}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=refresh_token, expires_in=d.get("expires_in"))

    def _rpc(self, endpoint, json_body=None):
        resp = requests.post(f"https://api.dropboxapi.com/2/{endpoint}", headers={**self._headers(),"Content-Type":"application/json"}, json=json_body or {}, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def get_user_info(self):
        d = self._rpc("users/get_current_account")
        return UserInfo(external_id=d.get("account_id",""), name=d.get("name",{}).get("display_name",""), email=d.get("email",""))

    def get_tools(self):
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p,"search_files","Search files in Dropbox.",{"type":"object","properties":{"query":{"type":"string"},"max_results":{"type":"integer","default":20}},"required":["query"]}),
            ToolSchema(p,"list_folder","List contents of a Dropbox folder.",{"type":"object","properties":{"path":{"type":"string","description":"Folder path, empty string for root","default":""}}}),
            ToolSchema(p,"get_file_metadata","Get metadata for a Dropbox file.",{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}),
        ]

    def execute_tool(self, tool_name, arguments):
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_search_files(self, a):
        d = self._rpc("files/search_v2", {"query":a["query"],"options":{"max_results":a.get("max_results",20)}})
        return self.ok([{"path":m["metadata"]["metadata"].get("path_display"),"name":m["metadata"]["metadata"].get("name")} for m in d.get("matches",[])])

    def _tool_list_folder(self, a):
        d = self._rpc("files/list_folder", {"path":a.get("path","")})
        return self.ok([{"name":e.get("name"),"path":e.get("path_display"),"type":e[".tag"]} for e in d.get("entries",[])])

    def _tool_get_file_metadata(self, a):
        d = self._rpc("files/get_metadata", {"path":a["path"]})
        return self.ok({"name":d.get("name"),"path":d.get("path_display"),"size":d.get("size"),"modified":d.get("server_modified")})
