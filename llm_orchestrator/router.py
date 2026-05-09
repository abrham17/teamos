import random
from typing import Tuple, Dict
from django.utils import timezone

# Model Constants
MODEL_GPT_4O = "gpt-4o"
MODEL_GPT_4O_MINI = "gpt-4o-mini"
MODEL_GPT_4_1_NANO = "gpt-4.1-nano"

# Pricing (per 1M tokens) - Reference May 2026
MODEL_PRICING = {
    MODEL_GPT_4O: {"input": 2.50, "output": 10.00},
    MODEL_GPT_4O_MINI: {"input": 0.15, "output": 0.60},
    MODEL_GPT_4_1_NANO: {"input": 0.10, "output": 0.40},
}

# Operation Value Scores & Priority Models (Section 5)
OPERATION_CONFIG = {
    "chat_ask": {"value_score": "medium", "priority_model": MODEL_GPT_4O, "fallback": MODEL_GPT_4O_MINI},
    "chat_agent": {"value_score": "high", "priority_model": MODEL_GPT_4O, "fallback": MODEL_GPT_4O_MINI},
    "plan_generate": {"value_score": "high", "priority_model": MODEL_GPT_4O, "fallback": MODEL_GPT_4O_MINI},
    "ingest_decompose": {"value_score": "medium", "priority_model": MODEL_GPT_4O_MINI, "fallback": MODEL_GPT_4_1_NANO},
    "ingest_relate": {"value_score": "low", "priority_model": MODEL_GPT_4_1_NANO, "fallback": MODEL_GPT_4_1_NANO},
    "ingest_governance": {"value_score": "low", "priority_model": MODEL_GPT_4_1_NANO, "fallback": MODEL_GPT_4_1_NANO},
    "template_detect": {"value_score": "low", "priority_model": MODEL_GPT_4_1_NANO, "fallback": MODEL_GPT_4_1_NANO},
}

def get_routed_model(team_subscription, operation: str) -> Tuple[str, str]:
    """
    Continuous Cost Curve Routing.
    """
    plan = team_subscription.plan_key
    status = team_subscription.status
    
    # 1. Blocking Checks
    if status in ["trial_expired", "suspended"]:
        raise ValueError(f"Subscription status '{status}' prevents LLM usage.")

    # 2. Free Tier: Always GPT-4.1-nano
    if plan == "free":
        return MODEL_GPT_4_1_NANO, "free_fixed"

    # 3. Grace Period Check
    if status in ["past_due", "canceled"] and team_subscription.grace_expires_at:
        if timezone.now() < team_subscription.grace_expires_at:
            # Downgrade to nano during grace period to save costs
            return MODEL_GPT_4_1_NANO, "grace_period_fallback"

    # 4. Continuous Cost Curve Calculation
    spend_ratio = calculate_spend_ratio(team_subscription)
    
    # Logic for Team ($15) vs Pro ($20)
    if plan == "pro":
        # PRO PRIVILEGES:
        # - Higher spend_ratio threshold before shifting to mini
        # - Never shifts to Nano (floor is Mini)
        w_4o = max(0.0, 1.0 - spend_ratio * 1.1) # Less aggressive weight reduction
        w_mini = 1.0 - w_4o
        w_nano = 0.0
    else:
        # TEAM STANDARD:
        w_4o = max(0.0, 1.0 - spend_ratio * 1.5) # Standard reduction
        w_nano = max(0.0, (spend_ratio - 0.80) * 5.0) # Standard nano floor
        w_mini = max(0.0, 1.0 - w_4o - w_nano)

    # 5. Operation-Aware Overrides
    config = OPERATION_CONFIG.get(operation, {"value_score": "medium"})
    
    # If High Value (Chat/Plan) and not totally over budget, stick to 4o
    if config["value_score"] == "high" and spend_ratio < 0.95:
        # Pro users get 4o almost always for high-value tasks
        return MODEL_GPT_4O, "value_aware_priority"
    
    # Background work routing
    if operation.startswith("ingest_") or operation == "template_detect":
        # Pro never uses nano for background work either (for better relation accuracy)
        if plan == "pro":
            return MODEL_GPT_4O_MINI, "pro_background_routing"
        
        if spend_ratio > 0.60:
            return MODEL_GPT_4_1_NANO, "team_background_routing"
        return MODEL_GPT_4O_MINI, "team_background_routing"

    # 6. Probabilistic Selection (for remaining cases)
    r = random.random()
    if r < w_4o:
        return MODEL_GPT_4O, "continuous_curve"
    elif r < (w_4o + w_mini):
        return MODEL_GPT_4O_MINI, "continuous_curve"
    else:
        return MODEL_GPT_4_1_NANO, "continuous_curve"

def calculate_spend_ratio(team_subscription) -> float:
    from .budget import get_current_spend_ratio
    return get_current_spend_ratio(team_subscription)
