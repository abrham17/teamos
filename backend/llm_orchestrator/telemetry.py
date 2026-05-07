from decimal import Decimal
from django.utils import timezone
from .models import TeamApiUsage
from .router import MODEL_PRICING

def log_api_usage(team, user, operation, model_used, input_tokens, output_tokens, latency_ms, routed_by):
    """
    Calculates cost and logs the usage record.
    """
    pricing = MODEL_PRICING.get(model_used, {"input": 0, "output": 0})
    
    # Cost = (tokens / 1,000,000) * price_per_1M
    input_cost = (Decimal(input_tokens) / Decimal(1_000_000)) * Decimal(pricing["input"])
    output_cost = (Decimal(output_tokens) / Decimal(1_000_000)) * Decimal(pricing["output"])
    total_cost = input_cost + output_cost
    
    month_str = timezone.now().strftime("%Y-%m")
    
    # Determine value score based on operation (could be imported from router config)
    from .router import OPERATION_CONFIG
    value_score = OPERATION_CONFIG.get(operation, {}).get("value_score", "medium")
    
    usage = TeamApiUsage.objects.create(
        team=team,
        user=user,
        operation=operation,
        model_used=model_used,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=total_cost,
        latency_ms=latency_ms,
        value_score=value_score,
        billing_month=month_str,
        routed_by=routed_by
    )
    return usage
