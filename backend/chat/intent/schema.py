from dataclasses import dataclass, field
from typing import List
from chat.multi_agent import Classification, AgentRole

@dataclass
class IntentSchema:
    intent_type: str                  # "plan/create", "plan/update", "wiki/query", etc.
    complexity: str                   # "low", "medium", "high", "very_high"
    domains: List[str] = field(default_factory=list)
    required_capabilities: List[str] = field(default_factory=list)
    parallelizable: bool = False
    estimated_rounds: int = 4
    requires_external: bool = False
    confidence: float = 1.0

@dataclass
class ClassificationResult:
    intent: IntentSchema
    layer_used: int                   # 1, 2, or 3
    similarity_score: float = None
    latency_ms: int = 0

class HybridClassification(Classification):
    def __init__(self, intent: IntentSchema, layer_used: int, similarity_score: float = None, latency_ms: int = 0):
        role_map = {
            "plan/create": AgentRole.STRATEGIC_PLANNER,
            "plan/update": AgentRole.PLAN,
            "plan/query": AgentRole.PLAN,
            "wiki/query": AgentRole.WIKI,
            "wiki/update": AgentRole.WIKI,
            "research/analyze": AgentRole.RESEARCH,
            "task/create": AgentRole.PLAN,
            "task/update": AgentRole.PLAN,
            "chat/general": AgentRole.LIGHTWEIGHT,
            "integration/action": AgentRole.PLAN,
        }
        primary_agent = role_map.get(intent.intent_type, AgentRole.LIGHTWEIGHT)
        
        depth_map = {
            "low": "lightweight",
            "medium": "standard",
            "high": "deep",
            "very_high": "deep"
        }
        reasoning_depth = depth_map.get(intent.complexity, "standard")
        
        super().__init__(
            primary_agent=primary_agent,
            confidence=intent.confidence,
            reasoning_depth=reasoning_depth
        )
        self.intent = intent
        self.layer_used = layer_used
        self.similarity_score = similarity_score
        self.latency_ms = latency_ms

