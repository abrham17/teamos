"""Export all provider classes for easy import."""
from integrations.providers.base import ExternalToolProvider, ToolSchema, TokenData, UserInfo
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

__all__ = [
    "ExternalToolProvider", "ToolSchema", "TokenData", "UserInfo",
    "GitHubProvider", "NotionProvider", "SlackProvider", "GoogleProvider",
    "DiscordProvider", "JiraProvider", "LinearProvider", "TrelloProvider",
    "DropboxProvider", "GitLabProvider", "HubSpotProvider",
]
