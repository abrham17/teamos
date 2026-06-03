from dataclasses import dataclass, field
from typing import Optional, Any

@dataclass
class GuardianContext:
    acting_team_id: str
    session_id: str
    token_usage_this_run: int
    team_token_budget: int
    team_has_integrations: bool
    external_writes_enabled: bool
    human_approved_destructive: bool
    current_round: int
    project_summary: dict = field(default_factory=dict)
    recent_actions: list = field(default_factory=list)
    simulation_results: Optional[dict] = None

@dataclass
class GuardianResult:
    approved: bool
    tier: int = 1
    skipped: bool = False
    risk_score: Optional[float] = None
    issues: list[str] = field(default_factory=list)
    modifications: Optional[dict] = None
    reason: Optional[str] = None
    latency_ms: Optional[int] = None
