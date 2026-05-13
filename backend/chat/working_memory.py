"""In-session working memory (scratchpad) for complex multi-turn tasks."""

import json
import logging
from typing import Any
from django.core.cache import cache

logger = logging.getLogger(__name__)

SCRATCHPAD_TTL = 3600  # 1 hour TTL for session scratchpad


class WorkingMemory:
    """Per-session scratchpad for the agent to track intermediate state across tool calls."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self._cache_key = f"agent_scratchpad:{session_id}"

    def _load(self) -> dict[str, Any]:
        raw = cache.get(self._cache_key)
        return json.loads(raw) if raw else {}

    def _save(self, data: dict[str, Any]):
        cache.set(self._cache_key, json.dumps(data), SCRATCHPAD_TTL)

    def note(self, key: str, value: Any):
        """Write a finding to the scratchpad."""
        data = self._load()
        data[key] = value
        self._save(data)

    def get(self, key: str) -> Any:
        """Read a specific finding."""
        return self._load().get(key)

    def append(self, key: str, item: Any):
        """Append to a list in the scratchpad."""
        data = self._load()
        if key not in data:
            data[key] = []
        data[key].append(item)
        self._save(data)

    def all(self) -> dict[str, Any]:
        """Return the full scratchpad."""
        return self._load()

    def recall_session(self) -> str:
        """Formatted scratchpad for context injection into the agent prompt."""
        data = self._load()
        if not data:
            return ""

        lines = ["## Session Working Memory\n"]
        for key, value in data.items():
            if isinstance(value, list):
                lines.append(f"**{key}**:")
                for item in value[-5:]:  # Last 5 items only
                    lines.append(f"  - {_truncate(str(item), 200)}")
            else:
                lines.append(f"- **{key}**: {_truncate(str(value), 300)}")
        lines.append("")

        return "\n".join(lines)

    def clear(self):
        """Clear the scratchpad (e.g., on session end)."""
        cache.delete(self._cache_key)

    def track_tool_call(self, tool_name: str, args: dict, result_ok: bool):
        """Track a tool call and its outcome."""
        self.append("tool_history", {
            "tool": tool_name,
            "args_summary": _truncate(str(args), 100),
            "ok": result_ok,
        })

    def track_finding(self, category: str, finding: str):
        """Track a discovered insight."""
        self.append(f"findings_{category}", finding)

    def track_decision(self, decision: str, reason: str):
        """Track a decision made during execution."""
        self.append("decisions", {"decision": decision, "reason": reason})


def _truncate(text: str, max_len: int) -> str:
    return text[:max_len] + "..." if len(text) > max_len else text
