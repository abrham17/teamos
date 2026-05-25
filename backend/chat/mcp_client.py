"""
Model Context Protocol (MCP) Client for TeamOS.

Connects to external MCP-compatible tool servers (GitHub, Slack, Jira, etc.)
and exposes their tools as first-class TeamOS agent tools.

Architecture:
  - MCPServerConfig: per-team registration of external MCP servers
  - MCPClient: discovers tools + executes calls against registered servers
  - Tool schemas from MCP servers are merged into the agent's tool list
  - Tool execution is routed through execute_tool() transparently
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)

MCP_TOOL_CACHE_TTL = 300  # 5 minutes
MCP_CALL_TIMEOUT = 15  # seconds


@dataclass
class MCPServerConfig:
    """Configuration for a registered MCP server."""
    name: str
    url: str
    auth_token: str | None = None
    auth_header: str = "Authorization"
    capabilities: list[str] = field(default_factory=list)
    enabled: bool = True
    max_retries: int = 1


@dataclass
class MCPTool:
    """A tool discovered from an MCP server."""
    server_name: str
    name: str
    description: str
    input_schema: dict[str, Any]

    def to_openai_schema(self) -> dict[str, Any]:
        """Convert to OpenAI function-calling tool schema."""
        return {
            "type": "function",
            "function": {
                "name": f"mcp_{self.server_name}_{self.name}",
                "description": f"[{self.server_name}] {self.description}",
                "parameters": self.input_schema,
            },
        }


class MCPClient:
    """
    Manages connections to external MCP tool servers.

    Usage:
        client = get_mcp_client(team_id)
        tools = client.discover_all_tools()  # merged into agent tool list
        result = client.call_tool("github", "create_issue", {...})
    """

    def __init__(self, team_id: str):
        self.team_id = team_id
        self._servers: dict[str, MCPServerConfig] = {}

    def register_server(self, config: MCPServerConfig) -> None:
        """Register an MCP server for this team."""
        self._servers[config.name] = config
        # Invalidate tool cache on registration change
        cache.delete(f"mcp_tools:{self.team_id}:{config.name}")

    def unregister_server(self, name: str) -> bool:
        """Remove an MCP server registration."""
        if name in self._servers:
            del self._servers[name]
            cache.delete(f"mcp_tools:{self.team_id}:{name}")
            return True
        return False

    def list_servers(self) -> list[dict[str, Any]]:
        """List all registered servers with status."""
        return [
            {
                "name": s.name,
                "url": s.url,
                "enabled": s.enabled,
                "capabilities": s.capabilities,
            }
            for s in self._servers.values()
        ]

    # ── Tool Discovery ────────────────────────────────────────────────

    def discover_tools(self, server_name: str) -> list[MCPTool]:
        """Fetch tool schemas from a single MCP server (cached)."""
        server = self._servers.get(server_name)
        if not server or not server.enabled:
            return []

        cache_key = f"mcp_tools:{self.team_id}:{server_name}"
        cached = cache.get(cache_key)
        if cached:
            return [MCPTool(**t) for t in cached]

        try:
            headers = {"Content-Type": "application/json"}
            if server.auth_token:
                headers[server.auth_header] = f"Bearer {server.auth_token}"

            resp = requests.post(
                f"{server.url.rstrip('/')}/tools/list",
                headers=headers,
                json={"method": "tools/list"},
                timeout=MCP_CALL_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()

            tools = []
            for tool_def in data.get("tools", []):
                tools.append(MCPTool(
                    server_name=server_name,
                    name=tool_def["name"],
                    description=tool_def.get("description", ""),
                    input_schema=tool_def.get("inputSchema", {}),
                ))

            # Cache serialised tool defs
            cache.set(
                cache_key,
                [{"server_name": t.server_name, "name": t.name,
                  "description": t.description, "input_schema": t.input_schema}
                 for t in tools],
                timeout=MCP_TOOL_CACHE_TTL,
            )
            return tools

        except Exception:
            logger.exception("MCP tool discovery failed for %s", server_name)
            return []

    def discover_all_tools(self) -> list[MCPTool]:
        """Discover tools from all registered servers."""
        all_tools: list[MCPTool] = []
        for name in self._servers:
            all_tools.extend(self.discover_tools(name))
        return all_tools

    def get_openai_schemas(self) -> list[dict[str, Any]]:
        """Get all MCP tools as OpenAI function-calling schemas."""
        return [t.to_openai_schema() for t in self.discover_all_tools()]

    # ── Tool Execution ────────────────────────────────────────────────

    def call_tool(
        self,
        server_name: str,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a tool call against an MCP server."""
        server = self._servers.get(server_name)
        if not server:
            return {"ok": False, "error": f"MCP server '{server_name}' not registered"}
        if not server.enabled:
            return {"ok": False, "error": f"MCP server '{server_name}' is disabled"}

        headers = {"Content-Type": "application/json"}
        if server.auth_token:
            headers[server.auth_header] = f"Bearer {server.auth_token}"

        last_err = None
        for attempt in range(server.max_retries + 1):
            try:
                start = time.time()
                resp = requests.post(
                    f"{server.url.rstrip('/')}/tools/call",
                    headers=headers,
                    json={
                        "method": "tools/call",
                        "params": {
                            "name": tool_name,
                            "arguments": arguments,
                        },
                    },
                    timeout=MCP_CALL_TIMEOUT,
                )
                latency_ms = int((time.time() - start) * 1000)

                if resp.status_code >= 400:
                    return {
                        "ok": False,
                        "error": f"MCP server returned {resp.status_code}: {resp.text[:300]}",
                        "latency_ms": latency_ms,
                    }

                result = resp.json()
                content = result.get("content", [])

                # MCP returns content as a list of {type, text} blocks
                text_parts = [
                    c.get("text", "")
                    for c in content
                    if isinstance(c, dict) and c.get("type") == "text"
                ]

                return {
                    "ok": not result.get("isError", False),
                    "result": "\n".join(text_parts) if text_parts else result,
                    "latency_ms": latency_ms,
                    "server": server_name,
                }

            except requests.Timeout:
                last_err = f"MCP server '{server_name}' timed out"
                logger.warning("MCP call timeout (attempt %d): %s/%s",
                               attempt + 1, server_name, tool_name)
            except Exception as e:
                last_err = str(e)
                logger.exception("MCP call failed (attempt %d): %s/%s",
                                 attempt + 1, server_name, tool_name)

        return {"ok": False, "error": last_err or "MCP call failed"}

    def route_tool_call(
        self,
        full_tool_name: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Route an mcp_* prefixed tool call to the correct server.

        Returns None if this isn't an MCP tool (so the caller can
        fall through to internal tools).
        """
        if not full_tool_name.startswith("mcp_"):
            return None

        # Parse: mcp_{server_name}_{tool_name}
        parts = full_tool_name[4:].split("_", 1)
        if len(parts) != 2:
            return {"ok": False, "error": f"Invalid MCP tool name: {full_tool_name}"}

        server_name, tool_name = parts
        return self.call_tool(server_name, tool_name, arguments)


# ── Per-team MCP client cache ─────────────────────────────────────────
_mcp_clients: dict[str, MCPClient] = {}


def get_mcp_client(team_id: str) -> MCPClient:
    """Get or create an MCPClient for a team.

    In production, server registrations would be loaded from the DB
    (MCPServerRegistration model) on first access.
    """
    if team_id not in _mcp_clients:
        client = MCPClient(team_id)
        # Load registered servers from DB
        try:
            from chat.models import MCPServerRegistration
            for reg in MCPServerRegistration.objects.filter(
                team_id=team_id, enabled=True
            ):
                client.register_server(MCPServerConfig(
                    name=reg.name,
                    url=reg.url,
                    auth_token=reg.auth_token,
                    capabilities=reg.capabilities or [],
                    enabled=reg.enabled,
                ))
        except Exception:
            # Model might not exist yet (pre-migration)
            pass
        _mcp_clients[team_id] = client
    return _mcp_clients[team_id]
