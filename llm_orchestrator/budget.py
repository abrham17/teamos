from django.db.models import Sum
from django.utils import timezone
from .models import TeamApiUsage
from billing.pricing import compute_quote, TEAM_PER_USER_USD, PRO_PER_USER_USD

def get_current_spend_ratio(team_subscription) -> float:
    """
    Calculates the ratio of current monthly spend to the effective budget band.
    """
    month_str = timezone.now().strftime("%Y-%m")
    
    # 1. Current Spend
    current_spend = TeamApiUsage.objects.filter(
        team=team_subscription.team,
        billing_month=month_str
    ).aggregate(total=Sum('cost_usd'))['total'] or 0.0
    
    # 2. Effective Budget
    budget = calculate_team_monthly_budget(team_subscription)
    
    if budget <= 0:
        return 1.0
        
    return float(current_spend) / budget

def calculate_team_monthly_budget(team_subscription) -> float:
    """
    Adaptive Budget Bands based on Per-User Revenue.
    """
    plan = team_subscription.plan_key
    
    # Free tier has a very small fixed cap
    if plan == "free":
        return 0.50
        
    # Calculate revenue based on seats
    seat_count = team_subscription.metadata.get("seat_count", 1)
    usage_tier = team_subscription.metadata.get("usage_tier", "standard")
    
    # Revenue is now strictly seats * multiplier
    unit_price = TEAM_PER_USER_USD if plan == "team" else PRO_PER_USER_USD
    revenue = seat_count * unit_price
    
    # Usage tier uplift adds to revenue and budget
    if usage_tier == "high":
        revenue *= 1.25

    # 1. Base Budget Ratio (The percentage of revenue we spend on API)
    # Team gets ~10% ($2 budget for 2M tokens), Pro gets ~16% ($5 budget for 5M tokens)
    base_ratio = 0.16 if plan == "pro" else 0.10
    
    # 2. Onboarding/New Team Grace
    # We allow slightly higher burn rates in the first 30 days
    days_since_creation = (timezone.now() - team_subscription.created_at).days
    if days_since_creation <= 30:
        base_ratio += 0.05 # Team 15%, Pro 21%

    return revenue * base_ratio

def get_spend_forecast(team_subscription) -> dict:
    """Predictive Budget Controller."""
    month_str = timezone.now().strftime("%Y-%m")
    now = timezone.now()
    days_in_month = 30
    days_elapsed = max(1, now.day)
    
    current_spend = TeamApiUsage.objects.filter(
        team=team_subscription.team,
        billing_month=month_str
    ).aggregate(total=Sum('cost_usd'))['total'] or 0.0
    
    projected = (float(current_spend) / days_elapsed) * days_in_month
    budget = calculate_team_monthly_budget(team_subscription)
    
    return {
        "current_spend": float(current_spend),
        "projected_spend": projected,
        "budget": budget,
        "is_over_budget": projected > budget,
        "burn_rate_daily": float(current_spend) / days_elapsed
    }
