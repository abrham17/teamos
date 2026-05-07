from decimal import Decimal
from django.utils import timezone
from django.db import models
from .models import TeamApiUsage
from billing.pricing import compute_quote

def get_team_budget_config(team_subscription) -> dict:
    """
    Returns budget, spend, and ratio for a team.
    """
    team = team_subscription.team
    plan = team_subscription.plan_key
    month_str = timezone.now().strftime("%Y-%m")
    
    # 1. Get current month spend
    current_spend = TeamApiUsage.objects.filter(
        team=team,
        billing_month=month_str
    ).aggregate(models.Sum('cost_usd'))['cost_usd__sum'] or Decimal("0.0")
    
    # 2. Determine Revenue and Budget Ratio
    # In a real system, we'd look at historical revenue.
    # Here we estimate based on plan and seat count.
    try:
        seat_count = team_subscription.metadata.get("seat_count", 5)
        usage_tier = team_subscription.metadata.get("usage_tier", "standard")
        quote = compute_quote(plan, seat_count, usage_tier)
        revenue = Decimal(str(quote.total_amount))
    except:
        # Fallbacks for free or unknown
        revenue = Decimal("0.0") if plan == "free" else Decimal("20.0")

    # Adaptive Ratio (20-40%)
    # If high usage over 3 months, we might tighten ratio to preserve margin
    # Placeholder for trend analysis
    budget_ratio = Decimal("0.30") 
    
    budget = revenue * budget_ratio
    
    # 3. Forecast month-end spend
    # (current_spend / days_passed) * total_days
    now = timezone.now()
    days_in_month = 30 # Simplified
    day_of_month = now.day or 1
    forecast_spend = (current_spend / Decimal(day_of_month)) * Decimal(days_in_month)
    
    return {
        "revenue": revenue,
        "budget": budget,
        "current_spend": current_spend,
        "forecast_spend": forecast_spend,
        "spend_ratio": float(current_spend / budget) if budget > 0 else 1.0
    }

def should_throttle(team_subscription) -> bool:
    """
    Predictive throttle. If forecast exceeds budget by 10%, start falling back to nano.
    """
    config = get_team_budget_config(team_subscription)
    if config["budget"] <= 0:
        return True # Throttle to nano if no budget
        
    # If forecast is > 110% of budget, we are trending too high
    if config["forecast_spend"] > (config["budget"] * Decimal("1.1")):
        return True
        
    return False
