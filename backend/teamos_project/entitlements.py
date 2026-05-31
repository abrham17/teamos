from __future__ import annotations
import logging
from dataclasses import dataclass
from typing import Any
from django.utils import timezone
from billing.models import TeamSubscription

logger = logging.getLogger(__name__)

@dataclass
class QuotaResult:
    allowed: bool
    limit: int
    current: int
    reason: str | None = None

    def to_details(self) -> dict[str, Any]:
        return {
            "limit": self.limit,
            "current": self.current,
            "reason": self.reason,
        }

def check_quota(team, operation: str, **kwargs) -> QuotaResult:
    """
    Central enforcement for plan-specific usage limits.
    """
    try:
        sub = team.subscription
    except Exception:
        # Fallback to extreme restrictive limits if no subscription found
        return QuotaResult(allowed=False, limit=0, current=0, reason="no_subscription")

    # 1. Lifecycle Checks
    if sub.status in ("trial_expired", "suspended"):
        return QuotaResult(allowed=False, limit=0, current=0, reason=sub.status)

    plan = sub.plan_key
    
    # 2. Seat Checks
    if operation in ("add_member", "seat_manage"):
        current_seats = team.members.count()
        if plan == "free":
            from django.conf import settings
            limit = getattr(settings, "FREE_TRIAL_SEAT_LIMIT", 3)
            if current_seats >= limit:
                return QuotaResult(allowed=False, limit=limit, current=current_seats, reason="seat_limit_reached")
        else:
            # Per-User Strategy: Unrestricted seats (as long as they pay for them)
            # The actual billing happens via Paddle's subscription.updated event
            return QuotaResult(allowed=True, limit=10000, current=current_seats)

    # 3. Token Consumption Checks
    if operation == "token_consume":
        # Note: We rely on the LLM Orchestrator's Continuous Cost Curve 
        # to manage token value rather than a hard hard-stop token count.
        # This prevents 403 errors and instead smoothly degrades quality.
        from llm_orchestrator.budget import get_current_spend_ratio
        ratio = get_current_spend_ratio(sub)
        
        # Hard stop only at 120% of budget to allow for some burst
        if ratio > 1.2:
             return QuotaResult(allowed=False, limit=120, current=int(ratio*100), reason="monthly_budget_exhausted")
        return QuotaResult(allowed=True, limit=120, current=int(ratio*100))

    # 4. Ingest Jobs
    if operation == "ingest_job":
        # Free has a hard cap to prevent vector storage bloat
        if plan == "free":
            limit = 10
            current = team.ingest_jobs.count()
            if current >= limit:
                return QuotaResult(allowed=False, limit=limit, current=current, reason="ingest_limit_reached")
        
        # Paid plans have generous soft limits managed by LLM budget
        return QuotaResult(allowed=True, limit=1000, current=0)

    # 5. Wiki Page Limits
    if operation == "wiki_page_create":
        if plan == "free":
            limit = 50
            current = team.pages.filter(is_deleted=False).count()
            if current >= limit:
                return QuotaResult(allowed=False, limit=limit, current=current, reason="wiki_page_limit_reached")
        return QuotaResult(allowed=True, limit=10000, current=0)

    # 6. Research Web Searches
    if operation == "research_search":
        from django.conf import settings

        tavily_key = getattr(settings, "TAVILY_API_KEY", "")
        if not tavily_key.strip():
            return QuotaResult(allowed=False, limit=0, current=0, reason="research_unconfigured")

        from research.models import TeamResearchQuota

        quota = TeamResearchQuota.objects.filter(team=team).first()
        quota_map = getattr(settings, "RESEARCH_MONTHLY_QUOTAS", {})
        default_limit = int(quota_map.get(plan, quota_map.get("free", 0)) or 0)

        if quota is None:
            if default_limit <= 0:
                return QuotaResult(allowed=False, limit=0, current=0, reason="research_limit_disabled")
            return QuotaResult(allowed=True, limit=default_limit, current=0)

        state = quota.to_state()
        limit = quota.effective_limit() or default_limit
        if limit <= 0:
            return QuotaResult(allowed=False, limit=0, current=state.current, reason="research_limit_disabled")
        if state.current >= limit:
            return QuotaResult(allowed=False, limit=limit, current=state.current, reason="research_limit_reached")
        return QuotaResult(allowed=True, limit=limit, current=state.current)

    # 7. TTS Characters Quota Checks
    if operation == "tts_characters":
        from django.conf import settings
        from django.core.cache import cache
        plan_tiers = getattr(settings, "PLAN_TIERS", {})
        tier = plan_tiers.get(plan, plan_tiers.get("free", {}))
        limit = int(tier.get("tts_character_quota", 10000))

        today = timezone.localdate()
        cache_key = f"tts_quota:{team.id}:{today.year}:{today.month}"
        current = int(cache.get(cache_key, 0))
        amount = kwargs.get("amount", 0)

        if current + amount > limit:
            return QuotaResult(allowed=False, limit=limit, current=current, reason="tts_quota_reached")

        if kwargs.get("consume", False):
            cache.set(cache_key, current + amount, 32 * 86400)  # cache for 32 days
            current += amount

        return QuotaResult(allowed=True, limit=limit, current=current)

    return QuotaResult(allowed=True, limit=-1, current=-1)

def get_team_status_banner(team) -> dict | None:
    """Returns a status object for UI banners (e.g. Trial Ending, Payment Failed)."""
    try:
        sub = team.subscription
    except Exception:
        return None

    now = timezone.now()

    if sub.status == "trial_expired":
        return {"type": "error", "title": "Trial Expired", "message": "Your 60-day trial has ended. Upgrade to preserve your team knowledge."}
    
    if sub.status == "trialing" and sub.trial_expires_at:
        days_left = (sub.trial_expires_at - now).days
        if days_left <= 7:
            return {"type": "warning", "title": "Trial Ending Soon", "message": f"Only {max(0, days_left)} days left in your free trial."}

    if sub.status == "past_due":
        return {"type": "warning", "title": "Payment Required", "message": "Your last payment failed. Your account is in a grace period."}

    if sub.status == "suspended":
        return {"type": "error", "title": "Account Suspended", "message": "Access restricted due to non-payment. Update billing to restore."}

    return None
