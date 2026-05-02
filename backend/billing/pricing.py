"""
Server-side pricing for Team / Pro / Enterprise.

Pro monthly total is clamped to USD 100–300. Enterprise is always strictly above Pro's cap.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

USAGE_TIER_CHOICES = ("low", "standard", "high")

# Relative uplift applied to the seat-scaled base before Pro clamp (and feeds Enterprise).
USAGE_UPLIFT: dict[str, float] = {
    "low": 0.0,
    "standard": 0.12,
    "high": 0.28,
}

TEAM_SEAT_MIN = 1
TEAM_SEAT_MAX = 25
PRO_SEAT_MIN = 5
PRO_SEAT_MAX = 100
ENT_SEAT_MIN = 10
ENT_SEAT_MAX = 250

PRO_USD_MIN = 100
PRO_USD_MAX = 300
ENTERPRISE_USD_FLOOR = 355


@dataclass(frozen=True)
class PriceQuote:
    plan_key: str
    seat_count: int
    usage_tier: str
    monthly_total_usd: float
    monthly_total_cents: int
    variant_key: str
    breakdown: list[dict[str, Any]]

    def as_dict(self) -> dict[str, Any]:
        return {
            "plan_key": self.plan_key,
            "seat_count": self.seat_count,
            "usage_tier": self.usage_tier,
            "monthly_total_usd": round(self.monthly_total_usd, 2),
            "monthly_total_cents": self.monthly_total_cents,
            "variant_key": self.variant_key,
            "breakdown": self.breakdown,
        }


def _clamp_seats(plan_key: str, seat_count: int) -> int:
    s = max(1, int(seat_count))
    if plan_key == "team":
        return min(max(s, TEAM_SEAT_MIN), TEAM_SEAT_MAX)
    if plan_key == "pro":
        return min(max(s, PRO_SEAT_MIN), PRO_SEAT_MAX)
    if plan_key == "enterprise":
        return min(max(s, ENT_SEAT_MIN), ENT_SEAT_MAX)
    raise ValueError(f"Unsupported plan_key: {plan_key}")


def _normalize_usage_tier(usage_tier: str) -> str:
    t = (usage_tier or "standard").strip().lower()
    if t not in USAGE_UPLIFT:
        raise ValueError(f"usage_tier must be one of {USAGE_TIER_CHOICES}")
    return t


def _variant_key(plan_key: str, seats: int, usage_tier: str) -> str:
    return f"{plan_key}_s{seats}_u{usage_tier}"


def compute_quote(*, plan_key: str, seat_count: int, usage_tier: str) -> PriceQuote:
    """
    Compute a single monthly price. All checkout flows must re-run this server-side.
    """
    pk = (plan_key or "").strip().lower()
    if pk not in ("team", "pro", "enterprise"):
        raise ValueError("plan_key must be team, pro, or enterprise")
    usage = _normalize_usage_tier(usage_tier)
    seats = _clamp_seats(pk, seat_count)
    uplift = USAGE_UPLIFT[usage]

    breakdown: list[dict[str, Any]] = []

    if pk == "team":
        base = 39.0
        per_seat = 2.25
        raw = base + seats * per_seat
        monthly = min(max(raw, 29.0), 95.0)
        breakdown.append({"label": "Team base", "usd": round(base, 2)})
        breakdown.append({"label": f"Seats × {seats}", "usd": round(seats * per_seat, 2)})
        breakdown.append({"label": "Adjusted to Team band", "usd": round(monthly, 2)})
    elif pk == "pro":
        base = 72.0
        per_seat = 2.15
        seat_component = seats * per_seat
        subtotal = base + seat_component
        subtotal *= 1.0 + uplift
        monthly = max(PRO_USD_MIN, min(PRO_USD_MAX, round(subtotal, 2)))
        breakdown.append({"label": "Pro base", "usd": round(base, 2)})
        breakdown.append({"label": f"Seat scale ({seats} seats)", "usd": round(seat_component, 2)})
        breakdown.append({"label": f"Usage tier ({usage})", "usd": round(uplift * 100, 1), "unit": "percent_uplift"})
        breakdown.append({"label": "Clamped to Pro band (100–300)", "usd": monthly})
    else:
        # Enterprise: scale beyond Pro, never below ENTERPRISE_USD_FLOOR, no 300 cap
        base = 120.0
        per_seat = 3.4
        seat_component = seats * per_seat
        subtotal = base + seat_component
        subtotal *= 1.0 + uplift
        pro_analog = max(PRO_USD_MIN, min(PRO_USD_MAX, round((72.0 + seats * 2.15) * (1.0 + uplift), 2)))
        monthly = max(ENTERPRISE_USD_FLOOR, round(subtotal * 1.22, 2), round(pro_analog * 1.28, 2))
        breakdown.append({"label": "Enterprise base", "usd": round(base, 2)})
        breakdown.append({"label": f"Seat scale ({seats} seats)", "usd": round(seat_component, 2)})
        breakdown.append({"label": f"Usage tier ({usage})", "usd": round(uplift * 100, 1), "unit": "percent_uplift"})
        breakdown.append({"label": "Enterprise multiplier vs Pro analog", "usd": monthly})

    cents = int(round(monthly * 100))
    return PriceQuote(
        plan_key=pk,
        seat_count=seats,
        usage_tier=usage,
        monthly_total_usd=float(monthly),
        monthly_total_cents=cents,
        variant_key=_variant_key(pk, seats, usage),
        breakdown=breakdown,
    )


def public_plan_catalog() -> dict[str, Any]:
    """Marketing + UI catalog (no secrets)."""
    return {
        "currency": "USD",
        "cadence": "per_team_per_month",
        "usage_tiers": [
            {"id": "low", "label": "Light AI & ingest", "description": "Best for mostly wiki + light chat."},
            {"id": "standard", "label": "Standard", "description": "Typical daily copilot + ingest usage."},
            {"id": "high", "label": "Heavy", "description": "High-volume chat, large ingest, many automations."},
        ],
        "plans": [
            {
                "key": "free",
                "name": "Free",
                "price_label": "$0",
                "min_price_usd": 0,
                "max_price_usd": 0,
                "seat_default": 5,
                "seat_min": 1,
                "seat_max": 5,
                "trial_days": 0,
                "features": [
                    "1 team, up to 5 members",
                    "Wiki, graph, chat & citations",
                    "Limited ingest & AI usage",
                    "Community support",
                ],
            },
            {
                "key": "team",
                "name": "Team",
                "price_label": "From $29 / mo",
                "min_price_usd": 29,
                "max_price_usd": 95,
                "seat_default": 8,
                "seat_min": TEAM_SEAT_MIN,
                "seat_max": TEAM_SEAT_MAX,
                "trial_days": 14,
                "features": [
                    "Up to 25 members (plan limits)",
                    "Higher ingest & job queue priority",
                    "Graph analytics & exports",
                    "Email support",
                ],
            },
            {
                "key": "pro",
                "name": "Pro",
                "price_label": f"${PRO_USD_MIN}–${PRO_USD_MAX} / mo",
                "min_price_usd": PRO_USD_MIN,
                "max_price_usd": PRO_USD_MAX,
                "seat_default": 12,
                "seat_min": PRO_SEAT_MIN,
                "seat_max": PRO_SEAT_MAX,
                "trial_days": 14,
                "features": [
                    "Scaled members & usage (see quote)",
                    "Top AI & pipeline limits for your tier",
                    "Audit-friendly exports",
                    "Priority support & onboarding",
                ],
            },
            {
                "key": "enterprise",
                "name": "Enterprise",
                "price_label": f"From ${ENTERPRISE_USD_FLOOR} / mo",
                "min_price_usd": ENTERPRISE_USD_FLOOR,
                "max_price_usd": None,
                "seat_default": 25,
                "seat_min": ENT_SEAT_MIN,
                "seat_max": ENT_SEAT_MAX,
                "trial_days": 14,
                "features": [
                    "Above Pro caps — list price scales with seats & usage",
                    "Security review & procurement-friendly terms (contact)",
                    "Dedicated success & SLAs available",
                    "Invoice / Paddle where enabled",
                ],
            },
        ],
        "disclaimer": "Totals are computed server-side from seats and usage tier; Paddle shows the final charge at checkout.",
    }


def assert_quote_matches_request(*, quote: PriceQuote, plan_key: str, seat_count: int, usage_tier: str) -> None:
    """Raise ValueError if client params do not match canonical quote (anti-tamper)."""
    expected = compute_quote(plan_key=plan_key, seat_count=seat_count, usage_tier=usage_tier)
    if (
        expected.variant_key != quote.variant_key
        or expected.monthly_total_cents != quote.monthly_total_cents
        or expected.plan_key != quote.plan_key
    ):
        raise ValueError("Quote does not match server pricing for the given parameters.")
