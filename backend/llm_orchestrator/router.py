import random
from typing import Tuple, Dict
from django.utils import timezone

# Model Constants
# OpenRouter model IDs — DeepSeek V4 family (July 2026 deprecation of legacy aliases)
# Legacy aliases (deepseek-chat → v4-flash, deepseek-reasoner → v4-pro) work until Jul 24 2026.
MODEL_DEEPSEEK_FLASH = "deepseek/deepseek-v4-flash"     # DeepSeek V4 Flash — 284B MoE, fast & cheap
MODEL_DEEPSEEK_PRO   = "deepseek/deepseek-v4-pro"       # DeepSeek V4 Pro   — 1.6T MoE, full reasoning (R1-class)
MODEL_DEEPSEEK_MINI  = "deepseek/deepseek-v4-flash"     # alias for fallback clarity
MODEL_GPT_4O         = "openai/gpt-4o"                  # emergency fallback only — avoid using
MODEL_GPT_4O_MINI    = "deepseek/deepseek-v4-flash"     # redirect → DS Flash to avoid GPT costs
MODEL_GPT_4_1_NANO   = "deepseek/deepseek-v4-flash"     # redirect → DS Flash

# Pricing (per 1M tokens) — DeepSeek V4 rates, May 2026
# V4 Pro: 75% permanent discount applied. Cache-hit rates shown for reference.
MODEL_PRICING = {
    MODEL_DEEPSEEK_FLASH: {"input": 0.10, "output": 0.20, "input_cached": 0.0028},   # V4 Flash
    MODEL_DEEPSEEK_PRO:   {"input": 0.435, "output": 0.87, "input_cached": 0.0145},  # V4 Pro (discounted)
    MODEL_GPT_4O:         {"input": 2.50, "output": 10.00},                           # emergency only
}

# Operation Value Scores & Priority Models (Section 5)
OPERATION_CONFIG = {
    "chat_ask": {"value_score": "medium", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4O_MINI},
    "chat_agent": {"value_score": "high", "priority_model": MODEL_DEEPSEEK_PRO, "fallback": MODEL_DEEPSEEK_FLASH},
    "research_agent": {"value_score": "high", "priority_model": MODEL_DEEPSEEK_PRO, "fallback": MODEL_DEEPSEEK_FLASH},
    "plan_generate": {"value_score": "high", "priority_model": MODEL_DEEPSEEK_PRO, "fallback": MODEL_DEEPSEEK_FLASH},
    "ingest_decompose": {"value_score": "high", "priority_model": MODEL_DEEPSEEK_PRO, "fallback": MODEL_DEEPSEEK_FLASH},
    "ingest_decompose_outline": {"value_score": "high", "priority_model": MODEL_DEEPSEEK_PRO, "fallback": MODEL_DEEPSEEK_FLASH},
    "ingest_relate": {"value_score": "low", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4_1_NANO},
    "ingest_governance": {"value_score": "low", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4_1_NANO},
    "template_detect": {"value_score": "low", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4_1_NANO},
    # RAG auxiliary steps — cheap models to preserve budget
    "query_expansion": {"value_score": "low", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4_1_NANO},
    "hyde_generation": {"value_score": "low", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4_1_NANO},
    # User-facing wiki features — higher value
    "wiki_autocomplete": {"value_score": "medium", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4O_MINI},
    "wiki_ai_assist": {"value_score": "medium", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4O_MINI},
    # Planning agent operations
    "plan_risk_assess": {"value_score": "medium", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4_1_NANO},
    "plan_conflict_resolve": {"value_score": "medium", "priority_model": MODEL_DEEPSEEK_FLASH, "fallback": MODEL_GPT_4_1_NANO},
}

def get_routed_model(team_subscription, operation: str) -> Tuple[str, str]:
    """
    Continuous Cost Curve Routing optimized for DeepSeek Flash + Pro.
    """
    plan = team_subscription.plan_key
    status = team_subscription.status
    
    # 1. Blocking Checks
    if status in ["trial_expired", "suspended"]:
        raise ValueError(f"Subscription status '{status}' prevents LLM usage.")

    # 2. Free Tier: Always DeepSeek Flash
    if plan == "free":
        return MODEL_DEEPSEEK_FLASH, "free_fixed"

    # 3. Grace Period Check
    if status in ["past_due", "canceled"] and team_subscription.grace_expires_at:
        if timezone.now() < team_subscription.grace_expires_at:
            # Downgrade to Flash during grace period to save costs
            return MODEL_DEEPSEEK_FLASH, "grace_period_fallback"

    # 4. Continuous Cost Curve Calculation
    spend_ratio = calculate_spend_ratio(team_subscription)
    
    # Logic for Team ($15) vs Pro ($20)
    if plan == "pro":
        # PRO PRIVILEGES:
        # - Higher spend_ratio threshold before shifting to Flash
        # - Never shifts to nano/mini (floor is Flash)
        w_pro = max(0.0, 1.0 - spend_ratio * 1.1)
        w_flash = 1.0 - w_pro
        w_mini = 0.0
    else:
        # TEAM STANDARD:
        w_pro = max(0.0, 1.0 - spend_ratio * 1.5)
        w_mini = max(0.0, (spend_ratio - 0.80) * 5.0)
        w_flash = max(0.0, 1.0 - w_pro - w_mini)

    # 5. Operation-Aware Overrides
    config = OPERATION_CONFIG.get(operation, {"value_score": "medium"})
    
    # If High Value (Chat/Plan) and not totally over budget, stick to priority_model
    if config["value_score"] == "high" and spend_ratio < 0.95:
        return config.get("priority_model", MODEL_DEEPSEEK_PRO), "value_aware_priority"
    
    # Background work routing
    if operation.startswith("ingest_") or operation == "template_detect":
        if plan == "pro":
            return MODEL_DEEPSEEK_FLASH, "pro_background_routing"
        
        if spend_ratio > 0.60:
            return MODEL_DEEPSEEK_FLASH, "team_background_routing_budget"
        return MODEL_DEEPSEEK_FLASH, "team_background_routing"

    # 6. Probabilistic Selection (for remaining cases)
    r = random.random()
    if r < w_pro:
        return config.get("priority_model", MODEL_DEEPSEEK_PRO), "continuous_curve"
    elif r < (w_pro + w_flash):
        return config.get("fallback", MODEL_DEEPSEEK_FLASH), "continuous_curve"
    else:
        return MODEL_GPT_4O_MINI, "continuous_curve"

def calculate_spend_ratio(team_subscription) -> float:
    from .budget import get_current_spend_ratio
    return get_current_spend_ratio(team_subscription)
