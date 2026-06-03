"""Enhanced intent schema for crew routing decisions."""
from dataclasses import dataclass, field
from typing import List


@dataclass
class IntentSchema:
    intent_type: str                        # "plan/create", "research/analyze", "wiki/update", etc.
    complexity: str                         # "low", "medium", "high", "very_high"
    domains: List[str] = field(default_factory=list)   # ["product", "engineering", "marketing"]
    required_capabilities: List[str] = field(default_factory=list)  # ["web_search", "plan_creation", ...]
    parallelizable: bool = False            # Can sub-tasks run in parallel?
    estimated_rounds: int = 4              # Expected agent loop depth
    requires_external: bool = False        # Needs OAuth integrations?
    confidence: float = 1.0               # 0.0 - 1.0


@dataclass
class AgentRoleSpec:
    role: str
    priority: int
    runs_parallel: bool = False
    depends_on: List[str] = field(default_factory=list)
    instructions: str = ""


@dataclass
class CrewComposition:
    crew: List[AgentRoleSpec]
    supervisor_instructions: str
    estimated_total_rounds: int = 8
