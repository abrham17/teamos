from dataclasses import dataclass, asdict
from typing import Any

TEAM_PER_USER_USD = 20.00
PRO_PER_USER_USD = 30.00

@dataclass(frozen=True)
class PriceQuote:
    plan_key: str
    seat_count: int
    usage_tier: str
    monthly_total_usd: float
    monthly_total_cents: int
    variant_key: str
    breakdown: list[dict[str, Any]]

    def as_dict(self):
        return asdict(self)


def compute_quote(*, plan_key: str, seat_count: int, usage_tier: str = "standard") -> PriceQuote:
    """
    Strict Per-User Pricing:
    Team: $20/user
    Pro: $30/user
    """
    pk = (plan_key or "").strip().lower()
    if pk not in ("team", "pro"):
        # We fallback to team if they try to quote free or enterprise (which is removed)
        pk = "team"
    
    usage = "standard" # Locked to standard internally
    uplift = 0.0
    
    # Seats are now unrestricted (clamped only to 1 for safety)
    seats = max(1, seat_count)
    
    base_per_user = TEAM_PER_USER_USD if pk == "team" else PRO_PER_USER_USD
    
    # Calculate total
    # Total = (Seats * PricePerUser)
    subtotal = seats * base_per_user
    total = subtotal
    
    breakdown = [
        {"label": f"{pk.title()} Plan Base", "usd": base_per_user, "unit": "per_user"},
        {"label": f"Team Scale ({seats} seats)", "usd": round(subtotal, 2)},
    ]

    cents = int(round(total * 100))
    
    return PriceQuote(
        plan_key=pk,
        seat_count=seats,
        usage_tier=usage,
        monthly_total_usd=float(total),
        monthly_total_cents=cents,
        variant_key=f"{pk}_{seats}_{usage}",
        breakdown=breakdown
    )


def public_plan_catalog() -> dict[str, Any]:
    """Marketing + UI catalog for Per-User Pricing."""
    return {
        "currency": "USD",
        "cadence": "per_user_per_month",
        "usage_tiers": [],
        "plans": [
            {
                "key": "free",
                "name": "Free Trial",
                "price_label": "$0",
                "seat_min": 1,
                "seat_max": 3,
                "trial_days": 60,
                "features": ["1 User Only", "Basic Wiki", "Local Knowledge Processing", "Standard Intelligence Engine"],
            },
            {
                "key": "team",
                "name": "Team",
                "price_label": f"${TEAM_PER_USER_USD}/user",
                "seat_min": 1,
                "seat_max": 1000,
                "features": [
                    "Unrestricted members",
                    "High-performance routing",
                    "Continuous cost curve",
                    "Email support",
                ],
            },
            {
                "key": "pro",
                "name": "Pro",
                "price_label": f"${PRO_PER_USER_USD}/user",
                "seat_min": 1,
                "seat_max": 5000,
                "features": [
                    "Unrestricted members",
                    "Advanced Agentic Engine",
                    "Priority Architecture",
                    "Priority support",
                ],
            },
        ],
        "disclaimer": "Strictly per-user billing. No base fees or hidden minimums.",
    }
