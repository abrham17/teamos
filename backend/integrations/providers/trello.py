"""Trello OAuth provider."""
from __future__ import annotations
import os
from urllib.parse import urlencode
import requests
from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

_API_KEY = lambda: os.environ.get("TRELLO_CLIENT_ID", "")
_BASE = "https://api.trello.com/1"

class TrelloProvider(ExternalToolProvider):
    PROVIDER_KEY = "trello"
    DISPLAY_NAME = "Trello"
    SCOPES = ["read", "write"]
    SUPPORTS_REFRESH = False

    @classmethod
    def get_auth_url(cls, state, redirect_uri, extra_scopes=None):
        return f"https://trello.com/1/authorize?{urlencode({'expiration':'never','name':'TeamOS','scope':'read,write','response_type':'token','key':_API_KEY(),'return_url':redirect_uri,'callback_method':'fragment'})}"

    @classmethod
    def exchange_code(cls, code, redirect_uri, code_verifier=""):
        # Trello gives the token directly in the fragment (redirect), code is the token
        return TokenData(access_token=code)

    @classmethod
    def refresh_token_data(cls, refresh_token):
        raise NotImplementedError("Trello tokens do not expire.")

    def _params(self, **kwargs):
        return {"key": _API_KEY(), "token": self.access_token, **kwargs}

    def get_user_info(self):
        d = requests.get(f"{_BASE}/members/me", params=self._params(), timeout=15).json()
        return UserInfo(external_id=d.get("id",""), name=d.get("fullName",""), email=d.get("email",""))

    def get_tools(self):
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p,"list_boards","List Trello boards.",{"type":"object","properties":{}}),
            ToolSchema(p,"list_cards","List cards on a Trello board.",{"type":"object","properties":{"board_id":{"type":"string"}},"required":["board_id"]}),
            ToolSchema(p,"create_card","Create a new Trello card.",{"type":"object","properties":{"list_id":{"type":"string"},"name":{"type":"string"},"desc":{"type":"string"}},"required":["list_id","name"]}),
            ToolSchema(p,"move_card","Move a Trello card to another list.",{"type":"object","properties":{"card_id":{"type":"string"},"list_id":{"type":"string"}},"required":["card_id","list_id"]}),
        ]

    def execute_tool(self, tool_name, arguments):
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_list_boards(self, a):
        d = requests.get(f"{_BASE}/members/me/boards", params=self._params(fields="id,name,shortUrl"), timeout=15).json()
        return self.ok([{"id":b["id"],"name":b["name"],"url":b.get("shortUrl")} for b in d])

    def _tool_list_cards(self, a):
        d = requests.get(f"{_BASE}/boards/{a['board_id']}/cards", params=self._params(fields="id,name,idList,due"), timeout=15).json()
        return self.ok([{"id":c["id"],"name":c["name"],"list_id":c.get("idList")} for c in d])

    def _tool_create_card(self, a):
        d = requests.post(f"{_BASE}/cards", params=self._params(idList=a["list_id"],name=a["name"],desc=a.get("desc","")), timeout=15).json()
        return self.ok({"id":d["id"],"name":d["name"],"url":d.get("shortUrl")})

    def _tool_move_card(self, a):
        d = requests.put(f"{_BASE}/cards/{a['card_id']}", params=self._params(idList=a["list_id"]), timeout=15).json()
        return self.ok({"id":d["id"],"name":d["name"]})
