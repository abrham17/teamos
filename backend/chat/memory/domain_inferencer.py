import json
import logging
from chat.models import AgentEpisode

logger = logging.getLogger(__name__)

DOMAIN_INFERENCE_PROMPT = """
Classify this interaction into one of these domains (or invent a new one if none fit):
- product_launch
- engineering_sprint
- bug_triage
- marketing_campaign
- research_and_analysis
- quarterly_planning
- team_onboarding
- technical_documentation
- customer_success
- data_analysis
- hiring_and_recruiting

## User Message
{user_message}

## Key Actions Taken
{key_actions}

Output JSON (no markdown formatting, just raw JSON):
{{
  "domain": "engineering_sprint",
  "confidence": 0.9,
  "sub_domain": "sprint_planning"
}}
"""

def infer_domain(episode: AgentEpisode) -> str:
    """Called when storing or analyzing an AgentEpisode to tag its domain."""
    # Fast path: check if a known keyword is in the user message
    keyword_domains = {
        "sprint": "engineering_sprint",
        "launch": "product_launch",
        "bug": "bug_triage",
        "campaign": "marketing_campaign",
        "okr": "quarterly_planning",
        "hire": "hiring_and_recruiting",
        "onboard": "team_onboarding",
        "wiki": "technical_documentation",
        "doc": "technical_documentation",
    }
    
    message_lower = episode.trigger.lower() if episode.trigger else ""
    for keyword, domain in keyword_domains.items():
        if keyword in message_lower:
            return domain
            
    # Slow path: LLM inference using llm_json_call if possible
    try:
        from llm_orchestrator.orchestrator import llm_json_call
        key_actions = [t.get("tool", t.get("name", "")) for t in episode.actions[:10]] if episode.actions else []
        prompt = DOMAIN_INFERENCE_PROMPT.format(
            user_message=episode.trigger,
            key_actions=key_actions
        )
        
        result = llm_json_call(
            team=episode.team,
            operation="domain_inference",
            messages=[{"role": "user", "content": prompt}],
            default_on_error={"domain": "research_and_analysis", "confidence": 0.5}
        )
        return result.get("domain", "research_and_analysis")
    except Exception:
        logger.exception("Domain inference LLM call failed, returning default domain")
        return "research_and_analysis"
