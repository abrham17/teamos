import random
from typing import Tuple, Dict

# Model Constants
MODEL_GPT_4O = "gpt-4o"
MODEL_GPT_4O_MINI = "gpt-4o-mini"
MODEL_GPT_4_1_NANO = "gpt-4.1-nano"

# Pricing (per 1M tokens)
MODEL_PRICING = {
    MODEL_GPT_4O: {"input": 2.50, "output": 10.00},
    MODEL_GPT_4O_MINI: {"input": 0.15, "output": 0.60},
    MODEL_GPT_4_1_NANO: {"input": 0.10, "output": 0.40},
}

# Operation Value Scores & Default Models
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
    Returns (model_name, routed_by)
    """
    plan = team_subscription.plan_key
    status = team_subscription.status
    
    # 1. Hard-block expired trials or suspended accounts
    if status in ["trial_expired", "suspended"]:
        raise ValueError(f"Subscription status '{status}' prevents LLM usage.")

    # 2. Free Tier: Always GPT-4.1-nano
    if plan == "free":
        return MODEL_GPT_4_1_NANO, "free_fixed"

    # 3. Enterprise: Always GPT-4o for user-facing, mini for background
    if plan == "enterprise":
        config = OPERATION_CONFIG.get(operation, {"priority_model": MODEL_GPT_4O})
        return config["priority_model"], "enterprise_sla"

    # 4. Team/Pro: Continuous Cost Curve
    # Calculate spend ratio (this will be improved once budget.py is built)
    # For now, we assume a placeholder or simple calculation if available.
    spend_ratio = calculate_spend_ratio(team_subscription)
    
    # Smooth weight shifting
    # GPT-4o weight = max(0, 1.0 - spend_ratio * 1.3)
    # GPT-4.1-nano weight = max(0, (spend_ratio - 0.85) * 5.0)
    
    w_4o = max(0.0, 1.0 - spend_ratio * 1.3)
    w_nano = max(0.0, (spend_ratio - 0.85) * 5.0)
    w_mini = max(0.0, 1.0 - w_4o - w_nano)
    
    # Operation-aware override
    config = OPERATION_CONFIG.get(operation, {"value_score": "medium"})
    if config["value_score"] == "high" and spend_ratio < 0.90:
        return MODEL_GPT_4O, "continuous_curve_priority"
    
    # Background ingest never uses 4o for Team/Pro to save margin
    if operation.startswith("ingest_") or operation == "template_detect":
        if spend_ratio > 0.80:
            return MODEL_GPT_4_1_NANO, "continuous_curve_background"
        return MODEL_GPT_4_1_NANO, "continuous_curve_background" # As per plan: background work runs cheap

    # Probabilistic selection
    r = random.random()
    if r < w_4o:
        return MODEL_GPT_4O, "continuous_curve"
    elif r < (w_4o + w_mini):
        return MODEL_GPT_4O_MINI, "continuous_curve"
    else:
        return MODEL_GPT_4_1_NANO, "continuous_curve"

def calculate_spend_ratio(team_subscription) -> float:
    """
    Placeholder for actual spend ratio calculation.
    Will be moved to budget.py later.
    """
    from django.db import models
    from llm_orchestrator.models import TeamApiUsage
    from django.utils import timezone
    from billing.pricing import compute_quote # We need to know the budget
    
    month_str = timezone.now().strftime("%Y-%m")
    total_spend = TeamApiUsage.objects.filter(
        team=team_subscription.team, 
        billing_month=month_str
    ).aggregate(models.Sum('cost_usd'))['cost_usd__sum'] or 0.0
    
    # Get budget for the team (30% of revenue usually)
    # This is a simplification.
    try:
        # Assuming we can get seat count from metadata or elsewhere
        seat_count = team_subscription.metadata.get("seat_count", 5)
        usage_tier = team_subscription.metadata.get("usage_tier", "standard")
        quote = compute_quote(team_subscription.plan_key, seat_count, usage_tier)
        revenue = float(quote.total_amount)
        budget = revenue * 0.30 # Base ratio
    except:
        budget = 10.0 # Default fallback budget
        
    if budget <= 0:
        return 1.0
        
    return float(total_spend) / budget
