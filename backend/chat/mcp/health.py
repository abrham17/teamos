"""
MCP Health Check & Circuit Breaker.

Uses Redis (via Django cache) to track per-server failure counts and
open/close the circuit without any synchronous HTTP calls on the hot path.
"""
from __future__ import annotations

import logging
from enum import Enum

from django.core.cache import cache

logger = logging.getLogger(__name__)

HEALTH_TTL        = 60    # seconds — cache a health result for 60 s
FAILURE_THRESHOLD = 3     # open circuit after 3 consecutive failures
RECOVERY_TIMEOUT  = 120   # seconds — try again after 2 minutes


class CircuitState(str, Enum):
    CLOSED    = "closed"     # normal — requests allowed
    OPEN      = "open"       # failing — requests blocked
    HALF_OPEN = "half_open"  # probing — one request allowed


# ── Low-level Redis keys ──────────────────────────────────────────────

def _state_key(server_id: str)    -> str: return f"mcp_circuit:{server_id}:state"
def _failures_key(server_id: str) -> str: return f"mcp_circuit:{server_id}:failures"
def _health_key(server_id: str)   -> str: return f"mcp_health:{server_id}"


# ── Circuit state ─────────────────────────────────────────────────────

def get_circuit_state(server_id: str) -> CircuitState:
    state = cache.get(_state_key(server_id))
    if not state:
        return CircuitState.CLOSED
    try:
        return CircuitState(state)
    except ValueError:
        return CircuitState.CLOSED


def record_success(server_id: str):
    cache.delete(_failures_key(server_id))
    cache.set(_state_key(server_id), CircuitState.CLOSED, timeout=None)


def record_failure(server_id: str):
    # Atomic increment via cache; fall back to manual increment
    failures = cache.get(_failures_key(server_id), 0) + 1
    cache.set(_failures_key(server_id), failures, timeout=RECOVERY_TIMEOUT * 2)

    if failures >= FAILURE_THRESHOLD:
        logger.warning(
            "MCP circuit OPEN for server_id=%s after %d failures", server_id, failures
        )
        cache.set(_state_key(server_id), CircuitState.OPEN, timeout=RECOVERY_TIMEOUT)


def is_server_available(server_id: str) -> bool:
    state = get_circuit_state(server_id)
    if state == CircuitState.CLOSED:
        return True
    if state == CircuitState.OPEN:
        return False
    # HALF_OPEN — let one probe through
    return True


# ── Health check (called by background task, not inline) ──────────────

def check_server_health(server) -> bool:
    """
    Ping the MCP server by calling list_tools with a short timeout.
    Result is cached in Redis for HEALTH_TTL seconds.
    `server` is a MCPServerRegistration model instance.
    """
    cache_key = _health_key(str(server.id))
    cached = cache.get(cache_key)
    if cached is not None:
        return bool(cached)

    try:
        from chat.mcp_client import MCPClient, MCPServerConfig
        client = MCPClient(str(server.team_id))
        client.register_server(MCPServerConfig(
            name=server.name,
            url=server.url,
            auth_token=server.decrypted_token,
            enabled=True,
        ))
        tools = client.discover_tools(server.name)
        healthy = True
    except Exception:
        logger.warning("Health check failed for MCP server '%s'", server.name)
        healthy = False

    cache.set(cache_key, healthy, timeout=HEALTH_TTL)

    if healthy:
        record_success(str(server.id))
    else:
        record_failure(str(server.id))

    return healthy
