"""
MCPRegistry — validates and indexes MCP tool schemas at registration time.

All tools discovered from MCP servers pass through here before being
handed to any agent. Validation happens once (at register), not at call time.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Internal tool names that MCP tools must not shadow
INTERNAL_TOOL_NAMES = {
    "wiki_search_pages", "wiki_list_pages", "wiki_team_overview",
    "wiki_read_full_page", "wiki_create_page", "wiki_update_page", "wiki_delete_page",
    "graph_add_edge", "graph_remove_edge", "graph_traverse_neighbors",
    "graph_add_typed_relation", "knowledge_gap_analysis",
    "plan_search", "plan_read_entity", "plan_list_projects",
    "plan_create_project", "plan_update_project", "plan_delete_project",
    "plan_create_task", "plan_update_task", "plan_delete_task",
    "plan_create_milestone", "plan_update_milestone",
    "plan_detect_conflicts", "plan_sync_wiki", "plan_risk_assessment",
    "plan_resolve_conflicts", "plan_generate_risk_resolution",
    "plan_apply_risk_resolution", "plan_resolve_risk", "plan_check_overdue",
    "memory_search", "memory_store", "memory_delete",
    "web_search", "web_read_page", "research_save_to_wiki",
    "plan_get_analytics", "wiki_get_analytics",
}

_HIGH_RISK = {"delete", "drop", "truncate", "destroy", "remove", "purge",
              "execute", "run", "deploy", "publish", "send", "post", "write",
              "create", "insert", "update", "modify", "patch"}
_LOW_RISK  = {"get", "list", "fetch", "read", "query", "search", "find",
              "describe", "show", "view", "inspect"}
_EXT_WRITE = {"send", "email", "slack", "github", "post", "webhook",
              "database", "filesystem", "write file", "deploy"}
_DESTRUCTIVE = {"delete", "drop", "truncate", "destroy", "purge", "remove"}


@dataclass
class MCPToolDefinition:
    server_id: str
    server_name: str
    tool_name: str
    prefixed_name: str
    description: str
    parameters_schema: dict
    is_destructive: bool
    is_external_write: bool
    risk_level: str       # "low" | "medium" | "high"
    team_id: str


@dataclass
class _RegistrationResult:
    ok: bool
    prefixed_name: str = ""
    error: str = ""


class MCPRegistry:
    """
    In-memory registry of validated MCP tools.
    One instance per Django process; rebuilt from DB on startup.
    """

    def __init__(self):
        self._tools: dict[str, MCPToolDefinition] = {}  # prefixed_name → definition

    # ── Public API ────────────────────────────────────────────────────

    def register_server(self, server) -> list[str]:
        """
        Fetch the server's tool list, validate schemas, and index all tools.
        `server` is a MCPServerRegistration model instance.
        Returns list of successfully registered prefixed tool names.
        """
        tools_raw = self._fetch_server_tools(server)
        registered, errors = [], []

        for tool_raw in tools_raw:
            res = self._validate_and_register(tool_raw, server)
            if res.ok:
                registered.append(res.prefixed_name)
            else:
                errors.append(res.error)

        if errors:
            logger.warning(
                "MCP registration errors for server '%s': %s", server.name, errors
            )
            try:
                from chat.models import MCPRegistrationEvent
                MCPRegistrationEvent.objects.create(
                    server=server,
                    event_type="validation_errors",
                    details={"errors": errors},
                )
            except Exception:
                pass

        logger.info(
            "MCPRegistry: registered %d tools from server '%s'",
            len(registered), server.name,
        )
        return registered

    def unregister_server(self, server_id: str):
        to_remove = [k for k, v in self._tools.items() if v.server_id == server_id]
        for k in to_remove:
            del self._tools[k]

    def get_tools_for_team(self, team_id: str) -> list[MCPToolDefinition]:
        return [t for t in self._tools.values() if t.team_id == team_id]

    def get_tool(self, prefixed_name: str) -> Optional[MCPToolDefinition]:
        return self._tools.get(prefixed_name)

    def load_all_from_db(self):
        """Called once at startup to warm the registry from DB."""
        try:
            from chat.models import MCPServerRegistration
            for server in MCPServerRegistration.objects.filter(enabled=True):
                try:
                    self.register_server(server)
                except Exception:
                    logger.exception("Failed to register MCP server '%s' from DB", server.name)
        except Exception:
            logger.exception("MCPRegistry.load_all_from_db failed")

    # ── Internal ──────────────────────────────────────────────────────

    def _fetch_server_tools(self, server) -> list[dict]:
        """Use the existing MCPClient to list tools from the server."""
        try:
            from chat.mcp_client import MCPClient, MCPServerConfig
            client = MCPClient(str(server.team_id))
            client.register_server(MCPServerConfig(
                name=server.name,
                url=server.url,
                auth_token=server.decrypted_token,
                enabled=True,
            ))
            mcp_tools = client.discover_tools(server.name)
            # Convert MCPTool dataclasses to raw dicts expected by _validate_and_register
            return [
                {
                    "name": t.name,
                    "description": t.description,
                    "inputSchema": t.input_schema,
                }
                for t in mcp_tools
            ]
        except Exception:
            logger.exception("Failed to fetch tools from MCP server '%s'", server.name)
            return []

    def _validate_and_register(self, tool_raw: dict, server) -> _RegistrationResult:
        tool_name = tool_raw.get("name", "").strip()
        if not tool_name:
            return _RegistrationResult(ok=False, error="Tool has no name")

        prefixed = f"mcp_{server.name}_{tool_name}"

        # Rule 1: No shadowing internal tools
        if tool_name in INTERNAL_TOOL_NAMES or prefixed in INTERNAL_TOOL_NAMES:
            return _RegistrationResult(
                ok=False,
                error=f"Tool '{tool_name}' shadows an internal tool — rejected",
            )

        # Rule 2: Valid JSON-schema (must have 'properties')
        params = tool_raw.get("inputSchema") or tool_raw.get("parameters", {})
        if not isinstance(params, dict) or "properties" not in params:
            # Allow empty parameter schemas (tools with no args)
            if params != {} and params:
                return _RegistrationResult(
                    ok=False,
                    error=f"Tool '{tool_name}' has malformed parameter schema",
                )
            params = {"type": "object", "properties": {}}

        # Rule 3: Non-trivial description
        description = tool_raw.get("description", "").strip()
        if len(description) < 5:
            return _RegistrationResult(
                ok=False,
                error=f"Tool '{tool_name}' has missing or too-short description",
            )

        combined = (tool_name + " " + description).lower()
        risk = server.risk_level_override if hasattr(server, "risk_level_override") and server.risk_level_override else self._infer_risk(combined)

        definition = MCPToolDefinition(
            server_id=str(server.id),
            server_name=server.name,
            tool_name=tool_name,
            prefixed_name=prefixed,
            description=description,
            parameters_schema=params,
            is_destructive=any(s in combined for s in _DESTRUCTIVE),
            is_external_write=any(s in combined for s in _EXT_WRITE),
            risk_level=risk,
            team_id=str(server.team_id),
        )
        self._tools[prefixed] = definition
        return _RegistrationResult(ok=True, prefixed_name=prefixed)

    def _infer_risk(self, combined: str) -> str:
        if any(s in combined for s in _HIGH_RISK):
            return "high"
        if any(s in combined for s in _LOW_RISK):
            return "low"
        return "medium"


# ── Module-level singleton ────────────────────────────────────────────
_registry: Optional[MCPRegistry] = None


def get_mcp_registry() -> MCPRegistry:
    global _registry
    if _registry is None:
        _registry = MCPRegistry()
        _registry.load_all_from_db()
    return _registry
