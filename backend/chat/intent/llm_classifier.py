import json
import logging
from chat.intent.schema import IntentSchema
from chat.intent.embedding_classifier import get_classifier

logger = logging.getLogger(__name__)

LLM_CLASSIFICATION_PROMPT = """
You are an intent classifier for TeamOS, an agentic workspace platform.

## User Message
{message}

## Team Context (recent activity)
{team_context}

## Intent Types
- wiki/query: Looking up knowledge base information
- wiki/update: Creating or updating wiki pages
- research/analyze: Web research, competitive analysis, data investigation
- chat/general: Conversational questions, explanations, summaries
- integration/action: Actions involving external tools (GitHub, Slack, etc.)

## Required Capabilities
Choose from: web_search, wiki_search, wiki_write,
risk_analysis, knowledge_graph, integration_github,
integration_slack, integration_jira, integration_linear, integration_notion, data_analysis

Output JSON only (no markdown code blocks, just raw JSON):
{{
  "intent_type": "plan/create",
  "complexity": "high",
  "domains": ["product", "engineering"],
  "required_capabilities": ["web_search", "plan_creation", "risk_analysis"],
  "parallelizable": true,
  "estimated_rounds": 8,
  "requires_external": false,
  "confidence": 0.91,
  "reasoning": "one sentence explanation"
}}
"""

def get_team_context(team_id: str) -> str:
    try:
        from chat.models import IntentClassificationLog
        recent_logs = IntentClassificationLog.objects.filter(team_id=team_id).order_by("-created_at")[:3]
        parts = []
        if recent_logs:
            parts.append("Recent User Intents:")
            for log in recent_logs:
                parts.append(f"  - {log.intent_type} (complexity: {log.complexity})")
        return "\n".join(parts) if parts else "No recent activity."
    except Exception:
        return "No recent activity."

def llm_classify(message: str, team) -> IntentSchema:
    from llm_orchestrator.orchestrator import llm_json_call
    
    team_context = get_team_context(str(team.id))
    prompt = LLM_CLASSIFICATION_PROMPT.format(
        message=message,
        team_context=team_context
    )
    
    default_result = {
        "intent_type": "chat/general",
        "complexity": "low",
        "domains": [],
        "required_capabilities": [],
        "parallelizable": False,
        "estimated_rounds": 2,
        "requires_external": False,
        "confidence": 0.5
    }
    
    try:
        result = llm_json_call(
            team=team,
            operation="intent_classification",
            messages=[{"role": "user", "content": prompt}],
            default_on_error=default_result
        )
    except Exception:
        logger.exception("LLM intent classification failed, using default")
        result = default_result
        
    intent = IntentSchema(
        intent_type=result.get("intent_type", "chat/general"),
        complexity=result.get("complexity", "low"),
        domains=result.get("domains", []),
        required_capabilities=result.get("required_capabilities", []),
        parallelizable=result.get("parallelizable", False),
        estimated_rounds=result.get("estimated_rounds", 2),
        requires_external=result.get("requires_external", False),
        confidence=result.get("confidence", 0.5)
    )
    
    # Feed back into embedding index if highly confident
    if intent.confidence >= 0.8:
        try:
            get_classifier().add_example(message, intent)
        except Exception:
            pass
            
    return intent
