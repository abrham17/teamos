"""Registry of all supported OAuth providers."""
from __future__ import annotations
from integrations.providers.github import GitHubProvider
from integrations.providers.notion import NotionProvider
from integrations.providers.slack import SlackProvider
from integrations.providers.google import GoogleProvider
from integrations.providers.discord import DiscordProvider
from integrations.providers.jira import JiraProvider
from integrations.providers.linear import LinearProvider
from integrations.providers.trello import TrelloProvider
from integrations.providers.dropbox import DropboxProvider
from integrations.providers.gitlab import GitLabProvider
from integrations.providers.hubspot import HubSpotProvider
from integrations.providers.base import ExternalToolProvider

PROVIDER_REGISTRY: dict[str, type[ExternalToolProvider]] = {
    "github": GitHubProvider,
    "notion": NotionProvider,
    "slack": SlackProvider,
    "google": GoogleProvider,
    "discord": DiscordProvider,
    "jira": JiraProvider,
    "linear": LinearProvider,
    "trello": TrelloProvider,
    "dropbox": DropboxProvider,
    "gitlab": GitLabProvider,
    "hubspot": HubSpotProvider,
}

PROVIDER_META = {
    "github":   {"display_name": "GitHub",             "category": "development",    "color": "#24292e", "icon": "github"},
    "gitlab":   {"display_name": "GitLab",             "category": "development",    "color": "#fc6d26", "icon": "gitlab"},
    "notion":   {"display_name": "Notion",             "category": "knowledge",      "color": "#000000", "icon": "notion"},
    "slack":    {"display_name": "Slack",              "category": "communication",  "color": "#4a154b", "icon": "slack"},
    "google":   {"display_name": "Google Workspace",   "category": "productivity",   "color": "#4285f4", "icon": "google"},
    "discord":  {"display_name": "Discord",            "category": "communication",  "color": "#5865f2", "icon": "discord"},
    "jira":     {"display_name": "Jira",               "category": "project",        "color": "#0052cc", "icon": "jira"},
    "linear":   {"display_name": "Linear",             "category": "project",        "color": "#5e6ad2", "icon": "linear"},
    "trello":   {"display_name": "Trello",             "category": "project",        "color": "#0079bf", "icon": "trello"},
    "dropbox":  {"display_name": "Dropbox",            "category": "storage",        "color": "#0061fe", "icon": "dropbox"},
    "hubspot":  {"display_name": "HubSpot",            "category": "crm",            "color": "#ff7a59", "icon": "hubspot"},
}


def get_provider_class(provider_key: str) -> type[ExternalToolProvider] | None:
    return PROVIDER_REGISTRY.get(provider_key)


def get_provider_instance(provider_key: str, access_token: str, refresh_token: str = "", extra: dict | None = None) -> ExternalToolProvider | None:
    cls = get_provider_class(provider_key)
    if cls is None:
        return None
    return cls(access_token=access_token, refresh_token=refresh_token, extra=extra or {})


def list_providers() -> list[dict]:
    result = []
    for key, cls in PROVIDER_REGISTRY.items():
        meta = PROVIDER_META.get(key, {})
        result.append({
            "key": key,
            "display_name": meta.get("display_name", cls.DISPLAY_NAME),
            "category": meta.get("category", "other"),
            "color": meta.get("color", "#6b7280"),
            "icon": meta.get("icon", key),
            "scopes": cls.SCOPES,
            "supports_refresh": cls.SUPPORTS_REFRESH,
        })
    return result
