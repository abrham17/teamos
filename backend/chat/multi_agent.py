"""Multi-agent orchestration — specialist agents with smart routing."""

import re
from dataclasses import dataclass, field
from functools import lru_cache
from enum import Enum

logger = __import__("logging").getLogger(__name__)


class AgentRole(Enum):
    WIKI = "wiki"
    LIGHTWEIGHT = "lightweight"  # Quick RAG lookup
    RESEARCH = "research"  # External web research


@dataclass
class Classification:
    primary_agent: AgentRole
    requires_multiple: bool = False
    subtasks: list[tuple[AgentRole, str]] = field(default_factory=list)
    confidence: float = 1.0
    reasoning_depth: str = "standard"


SPECIALIST_SYSTEM_PROMPTS = {
    AgentRole.WIKI: (
        "You are the WikiAgent — a knowledge management specialist. "
        "Your expertise: wiki page creation/editing, knowledge organization, "
        "page quality assessment, linking strategy, content structuring. "
        "Use wiki_* and graph_* tools. Focus on knowledge accuracy and organization."
    ),
    AgentRole.LIGHTWEIGHT: (
        "You are a Lightweight Assistant. You provide quick, accurate answers from existing knowledge "
        "without using complex tools or planning loops. Focus on speed and directness."
    ),
    AgentRole.RESEARCH: (
        "You are the ResearchAgent specialist for TeamOS. "
        "Your core duty is to investigate external technical, market, legal, and current-event questions. "
        "Search aggressively, read source pages when needed, synthesize objectively, and cite every external source with markdown links. "
        "If the user explicitly asks to save findings, use research_save_to_wiki after producing a concise, source-backed markdown summary."
    ),
}

SPECIALIST_TOOLS = {
    AgentRole.WIKI: [
        "wiki_search_pages", "wiki_list_pages", "wiki_team_overview",
        "wiki_read_full_page", "wiki_create_page",
        "wiki_update_page", "wiki_delete_page",
        "graph_add_edge", "graph_remove_edge", "graph_traverse_neighbors",
        "graph_add_typed_relation", "knowledge_gap_analysis",
    ],
    AgentRole.LIGHTWEIGHT: [],
    AgentRole.RESEARCH: [
        "web_search",
        "web_read_page",
        "research_save_to_wiki",
    ],
}


# ── Fast keyword patterns for instant classification ──────────
_WIKI_PATTERNS = re.compile(
    r"\b(wiki|create\s+a?\s*page|write\s+a?\s*page|edit\s+page|update\s+page"
    r"|document|knowledge\s+base|link\s+pages|graph\s+edge)\b",
    re.IGNORECASE,
)
_RESEARCH_PATTERNS = re.compile(
    r"\b("
    r"latest|current|today|recent|web|website|search the web|research|market\s+size|compare|comparison|"
    r"regulation|legal|law|standard|specification|benchmark|competitor|news|external source|source-backed"
    r")\b",
    re.IGNORECASE,
)


class AgentOrchestrator:
    """Routes complex requests across specialist agents."""

    def __init__(self, team_id: str, user_id: str):
        self.team_id = team_id
        self.user_id = user_id

    def _fast_classify(self, message: str) -> Classification | None:
        """Rule-based instant classification for obvious intents."""
        if _WIKI_PATTERNS.search(message):
            return Classification(
                primary_agent=AgentRole.WIKI,
                reasoning_depth="standard",
                confidence=0.88,
            )
        if _RESEARCH_PATTERNS.search(message):
            return Classification(
                primary_agent=AgentRole.RESEARCH,
                reasoning_depth="standard",
                confidence=0.84,
            )
        # Short simple questions → lightweight
        if len(message.split()) < 8 and "?" in message:
            return Classification(
                primary_agent=AgentRole.LIGHTWEIGHT,
                reasoning_depth="lightweight",
                confidence=0.82,
            )
        return None

    def get_system_prompt(self, role: AgentRole) -> str:
        return SPECIALIST_SYSTEM_PROMPTS.get(role, SPECIALIST_SYSTEM_PROMPTS[AgentRole.LIGHTWEIGHT])

    def get_tools(self, role: AgentRole) -> list[str]:
        return SPECIALIST_TOOLS.get(role, [])


@lru_cache(maxsize=256)
def get_orchestrator(team_id: str, user_id: str) -> AgentOrchestrator:
    return AgentOrchestrator(team_id, user_id)
