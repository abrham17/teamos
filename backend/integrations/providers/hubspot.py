"""HubSpot OAuth provider."""
from __future__ import annotations
import os
from urllib.parse import urlencode
import requests
from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

_CLIENT_ID = lambda: os.environ.get("HUBSPOT_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("HUBSPOT_CLIENT_SECRET", "")
HS_API = "https://api.hubapi.com"

class HubSpotProvider(ExternalToolProvider):
    PROVIDER_KEY = "hubspot"
    DISPLAY_NAME = "HubSpot"
    SCOPES = ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.deals.read"]
    SUPPORTS_REFRESH = True

    @classmethod
    def get_auth_url(cls, state, redirect_uri, extra_scopes=None):
        scopes = cls.SCOPES + (extra_scopes or [])
        return f"https://app.hubspot.com/oauth/authorize?{urlencode({'client_id':_CLIENT_ID(),'redirect_uri':redirect_uri,'scope':' '.join(scopes),'state':state})}"

    @classmethod
    def exchange_code(cls, code, redirect_uri, code_verifier=""):
        resp = requests.post("https://api.hubapi.com/oauth/v1/token", data={"grant_type":"authorization_code","client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"redirect_uri":redirect_uri,"code":code}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token",""), expires_in=d.get("expires_in"))

    @classmethod
    def refresh_token_data(cls, refresh_token):
        resp = requests.post("https://api.hubapi.com/oauth/v1/token", data={"grant_type":"refresh_token","client_id":_CLIENT_ID(),"client_secret":_CLIENT_SECRET(),"refresh_token":refresh_token}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token",refresh_token), expires_in=d.get("expires_in"))

    def get_user_info(self):
        d = self._get(f"{HS_API}/oauth/v1/access-tokens/{self.access_token}")
        return UserInfo(external_id=str(d.get("user_id","")), name=d.get("user",""), email=d.get("user",""))

    def get_tools(self):
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p,"search_contacts","Search HubSpot contacts.",{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer","default":20}},"required":["query"]}),
            ToolSchema(p,"create_contact","Create a HubSpot contact.",{"type":"object","properties":{"email":{"type":"string"},"first_name":{"type":"string"},"last_name":{"type":"string"},"phone":{"type":"string"}},"required":["email"]}),
            ToolSchema(p,"update_contact","Update a HubSpot contact by ID.",{"type":"object","properties":{"contact_id":{"type":"string"},"properties":{"type":"object"}},"required":["contact_id","properties"]}),
        ]

    def execute_tool(self, tool_name, arguments):
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_search_contacts(self, a):
        resp = requests.post(f"{HS_API}/crm/v3/objects/contacts/search", headers=self._headers(), json={"query":a["query"],"limit":a.get("limit",20),"properties":["email","firstname","lastname","phone"]}, timeout=15)
        resp.raise_for_status()
        results = resp.json().get("results",[])
        return self.ok([{"id":r["id"],"email":r["properties"].get("email"),"name":f"{r['properties'].get('firstname','')} {r['properties'].get('lastname','')}".strip()} for r in results])

    def _tool_create_contact(self, a):
        props = {"email":a["email"]}
        if a.get("first_name"): props["firstname"] = a["first_name"]
        if a.get("last_name"): props["lastname"] = a["last_name"]
        if a.get("phone"): props["phone"] = a["phone"]
        resp = requests.post(f"{HS_API}/crm/v3/objects/contacts", headers=self._headers(), json={"properties":props}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return self.ok({"id":d["id"],"email":a["email"]})

    def _tool_update_contact(self, a):
        resp = requests.patch(f"{HS_API}/crm/v3/objects/contacts/{a['contact_id']}", headers=self._headers(), json={"properties":a["properties"]}, timeout=15)
        resp.raise_for_status()
        return self.ok({"id":a["contact_id"],"updated":True})
