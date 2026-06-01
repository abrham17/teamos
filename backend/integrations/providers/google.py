"""Google Workspace OAuth provider – Drive, Gmail, Docs, Calendar."""
from __future__ import annotations
import base64, os
from email.mime.text import MIMEText
from typing import Any
from urllib.parse import urlencode
import requests
from .base import ExternalToolProvider, ToolSchema, TokenData, UserInfo

_CLIENT_ID = lambda: os.environ.get("GOOGLE_CLIENT_ID", "")
_CLIENT_SECRET = lambda: os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleProvider(ExternalToolProvider):
    PROVIDER_KEY = "google"
    DISPLAY_NAME = "Google Workspace"
    SCOPES = [
        "openid", "email", "profile",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/calendar",
    ]
    SUPPORTS_REFRESH = True

    @classmethod
    def get_auth_url(cls, state, redirect_uri, extra_scopes=None):
        scopes = cls.SCOPES + (extra_scopes or [])
        return f"{GOOGLE_AUTH_URL}?{urlencode({'client_id': _CLIENT_ID(), 'redirect_uri': redirect_uri, 'response_type': 'code', 'scope': ' '.join(scopes), 'state': state, 'access_type': 'offline', 'prompt': 'consent'})}"

    @classmethod
    def exchange_code(cls, code, redirect_uri, code_verifier=""):
        resp = requests.post(GOOGLE_TOKEN_URL, data={"code": code, "client_id": _CLIENT_ID(), "client_secret": _CLIENT_SECRET(), "redirect_uri": redirect_uri, "grant_type": "authorization_code"}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=d.get("refresh_token", ""), expires_in=d.get("expires_in"), scopes=d.get("scope", "").split())

    @classmethod
    def refresh_token_data(cls, refresh_token):
        resp = requests.post(GOOGLE_TOKEN_URL, data={"refresh_token": refresh_token, "client_id": _CLIENT_ID(), "client_secret": _CLIENT_SECRET(), "grant_type": "refresh_token"}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return TokenData(access_token=d["access_token"], refresh_token=refresh_token, expires_in=d.get("expires_in"))

    def get_user_info(self):
        d = self._get("https://openidconnect.googleapis.com/v1/userinfo")
        return UserInfo(external_id=d.get("sub", ""), name=d.get("name", ""), email=d.get("email", ""))

    def get_tools(self):
        p = self.PROVIDER_KEY
        return [
            ToolSchema(p, "drive_search_files", "Search files in Google Drive.", {"type": "object", "properties": {"query": {"type": "string"}, "page_size": {"type": "integer", "default": 20}}, "required": ["query"]}),
            ToolSchema(p, "drive_create_folder", "Create a folder in Google Drive.", {"type": "object", "properties": {"name": {"type": "string"}, "parent_id": {"type": "string"}}, "required": ["name"]}),
            ToolSchema(p, "gmail_list_messages", "List recent Gmail emails.", {"type": "object", "properties": {"max_results": {"type": "integer", "default": 10}, "query": {"type": "string"}}}),
            ToolSchema(p, "gmail_send_email", "Send an email via Gmail.", {"type": "object", "properties": {"to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}}, "required": ["to", "subject", "body"]}),
            ToolSchema(p, "docs_create_document", "Create a new Google Doc.", {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}}, "required": ["title"]}),
            ToolSchema(p, "docs_get_document", "Read a Google Doc's content.", {"type": "object", "properties": {"document_id": {"type": "string"}}, "required": ["document_id"]}),
            ToolSchema(p, "calendar_list_events", "List upcoming Google Calendar events.", {"type": "object", "properties": {"max_results": {"type": "integer", "default": 10}, "calendar_id": {"type": "string", "default": "primary"}}}),
            ToolSchema(p, "calendar_create_event", "Create a Google Calendar event.", {"type": "object", "properties": {"summary": {"type": "string"}, "start": {"type": "string"}, "end": {"type": "string"}, "description": {"type": "string"}, "attendees": {"type": "array", "items": {"type": "string"}}}, "required": ["summary", "start", "end"]}),
            ToolSchema(p, "calendar_update_event", "Update an existing Google Calendar event.", {"type": "object", "properties": {"event_id": {"type": "string"}, "summary": {"type": "string"}, "start": {"type": "string"}, "end": {"type": "string"}, "description": {"type": "string"}}, "required": ["event_id"]}),
            ToolSchema(p, "calendar_delete_event", "Delete a Google Calendar event.", {"type": "object", "properties": {"event_id": {"type": "string"}}, "required": ["event_id"]}),
        ]

    def execute_tool(self, tool_name, arguments):
        try:
            return getattr(self, f"_tool_{tool_name}")(arguments)
        except AttributeError:
            return self.err(f"Unknown tool: {tool_name}")
        except Exception as e:
            return self.err(str(e))

    def _tool_drive_search_files(self, a):
        d = self._get("https://www.googleapis.com/drive/v3/files", {"q": a["query"], "pageSize": a.get("page_size", 20), "fields": "files(id,name,mimeType,webViewLink)"})
        return self.ok([{"id": f["id"], "name": f["name"], "url": f.get("webViewLink")} for f in d.get("files", [])])

    def _tool_drive_create_folder(self, a):
        payload = {"name": a["name"], "mimeType": "application/vnd.google-apps.folder"}
        if a.get("parent_id"):
            payload["parents"] = [a["parent_id"]]
        resp = requests.post("https://www.googleapis.com/drive/v3/files", headers=self._headers(), json=payload, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return self.ok({"id": d["id"], "name": d["name"]})

    def _tool_gmail_list_messages(self, a):
        params = {"maxResults": a.get("max_results", 10)}
        if a.get("query"):
            params["q"] = a["query"]
        d = self._get("https://gmail.googleapis.com/gmail/v1/users/me/messages", params)
        results = []
        for m in d.get("messages", [])[:5]:
            det = self._get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{m['id']}", {"format": "metadata", "metadataHeaders": "Subject,From,Date"})
            hdrs = {h["name"]: h["value"] for h in det.get("payload", {}).get("headers", [])}
            results.append({"id": m["id"], "subject": hdrs.get("Subject"), "from": hdrs.get("From"), "date": hdrs.get("Date")})
        return self.ok(results)

    def _tool_gmail_send_email(self, a):
        msg = MIMEText(a["body"])
        msg["to"] = a["to"]
        msg["subject"] = a["subject"]
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        resp = requests.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", headers=self._headers(), json={"raw": raw}, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return self.ok({"id": d.get("id")})

    def _tool_docs_create_document(self, a):
        resp = requests.post("https://docs.googleapis.com/v1/documents", headers=self._headers(), json={"title": a["title"]}, timeout=15)
        resp.raise_for_status()
        doc = resp.json()
        doc_id = doc["documentId"]
        if a.get("content"):
            requests.post(f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate", headers=self._headers(), json={"requests": [{"insertText": {"location": {"index": 1}, "text": a["content"]}}]}, timeout=15)
        return self.ok({"id": doc_id, "url": f"https://docs.google.com/document/d/{doc_id}"})

    def _tool_docs_get_document(self, a):
        d = self._get(f"https://docs.googleapis.com/v1/documents/{a['document_id']}")
        text = "".join(pe.get("textRun", {}).get("content", "") for elem in d.get("body", {}).get("content", []) for pe in elem.get("paragraph", {}).get("elements", []))
        return self.ok({"id": a["document_id"], "title": d.get("title"), "content": text[:6000]})

    def _tool_calendar_list_events(self, a):
        from django.utils import timezone as tz
        d = self._get(f"https://www.googleapis.com/calendar/v3/calendars/{a.get('calendar_id','primary')}/events", {"maxResults": a.get("max_results", 10), "singleEvents": True, "orderBy": "startTime", "timeMin": tz.now().isoformat()})
        return self.ok([{"id": e["id"], "summary": e.get("summary"), "start": e.get("start", {}).get("dateTime", e.get("start", {}).get("date"))} for e in d.get("items", [])])

    def _tool_calendar_create_event(self, a):
        event = {"summary": a["summary"], "start": {"dateTime": a["start"]}, "end": {"dateTime": a["end"]}}
        if a.get("description"):
            event["description"] = a["description"]
        if a.get("attendees"):
            event["attendees"] = [{"email": e} for e in a["attendees"]]
        resp = requests.post("https://www.googleapis.com/calendar/v3/calendars/primary/events", headers=self._headers(), json=event, timeout=15)
        resp.raise_for_status()
        d = resp.json()
        return self.ok({"id": d["id"], "url": d.get("htmlLink")})

    def _tool_calendar_update_event(self, a):
        event = {}
        if a.get("summary"):
            event["summary"] = a["summary"]
        if a.get("start"):
            event["start"] = {"dateTime": a["start"]}
        if a.get("end"):
            event["end"] = {"dateTime": a["end"]}
        if a.get("description"):
            event["description"] = a["description"]
        resp = requests.put(
            f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{a['event_id']}",
            headers=self._headers(), json=event, timeout=15,
        )
        resp.raise_for_status()
        d = resp.json()
        return self.ok({"id": d["id"], "url": d.get("htmlLink")})

    def _tool_calendar_delete_event(self, a):
        resp = requests.delete(
            f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{a['event_id']}",
            headers=self._headers(), timeout=15,
        )
        resp.raise_for_status()
        return self.ok({"deleted": True, "event_id": a["event_id"]})
