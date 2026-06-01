"""Discord OAuth provider."""
from __future__ import annotations
import os
from urllib.parse import urlencode
import requests
from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

_CLIENT_ID = lambda: os.environ.get("DISCORD_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("DISCORD_CLIENT_SECRET", "")
DISCORD_API = "https://discord.com/api/v10"

class DiscordProvider(ExternalToolProvider):
    PROVIDER_KEY = "discord"
    DISPLAY_NAME = "Discord"
    SCOPES = ["identify", "email", "guilds", "messages.read"]
    SUPPORTS_REFRESH = True

    @classmethod
    def get_auth_url(cls, state, redirect_uri, extra_scopes=None):
        scopes = cls.SCOPES + (extra_scopes or [])
        return f"https://discord.com/oauth2/authorize?{urlencode({'client_id':_CLIENT_ID(),'redirect_uri':redirect_uri,'response_type':'code','scope':' '.join(scopes),'state':state})}"

    @classmethod
    def exchange_code(cls, code, redirect_uri, code_verifier=""):
        resp = requests.post(f"{DISCORD_API}/oauth2/token", data={"client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"grant_type":"authorization_code","code":code,"redirect_uri":redirect_uri}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token",""), expires_in=d.get("expires_in"), scopes=d.get("scope","").split())

    @classmethod
    def refresh_token_data(cls, refresh_token):
        resp = requests.post(f"{DISCORD_API}/oauth2/token", data={"client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"grant_type":"refresh_token","refresh_token":refresh_token}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token",refresh_token), expires_in=d.get("expires_in"))

    def get_user_info(self):
        d = self._get(f"{DISCORD_API}/users/@me")
        return UserInfo(external_id=d["id"], name=d.get("username",""), email=d.get("email",""))

    def get_tools(self):
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p,"list_guilds","List Discord servers (guilds) the user is in.",{"type":"object","properties":{}}),
            ToolSchema(p,"list_channels","List channels in a Discord server.",{"type":"object","properties":{"guild_id":{"type":"string"}},"required":["guild_id"]}),
            ToolSchema(p,"send_message","Send a message to a Discord channel (requires bot token).",{"type":"object","properties":{"channel_id":{"type":"string"},"content":{"type":"string"}},"required":["channel_id","content"]}),
        ]

    def execute_tool(self, tool_name, arguments):
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_list_guilds(self, a):
        d = self._get(f"{DISCORD_API}/users/@me/guilds")
        return self.ok([{"id":g["id"],"name":g["name"]} for g in d])

    def _tool_list_channels(self, a):
        d = self._get(f"{DISCORD_API}/guilds/{a['guild_id']}/channels")
        return self.ok([{"id":c["id"],"name":c.get("name"),"type":c.get("type")} for c in d])

    def _tool_send_message(self, a):
        resp = requests.post(f"{DISCORD_API}/channels/{a['channel_id']}/messages", headers={**self._headers(),"Content-Type":"application/json"}, json={"content":a["content"]}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return self.ok({"id":d.get("id"),"channel_id":a["channel_id"]})
