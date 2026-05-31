import uuid
from django.utils import timezone
from django.http import JsonResponse
from billing.models import TeamSubscription

class LlmUsageMiddleware:
    """
    Middleware to enforce trial expiry and payment suspension blocks.
    Aligned with PRICING_STRATEGY.md Section 9 & 12.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "OPTIONS":
            return self.get_response(request)

        team_id = self._resolve_team_id(request)
        if team_id:
            try:
                subscription = TeamSubscription.objects.get(team_id=team_id)
                status = subscription.status
                plan = subscription.plan_key
                
                # 1. Trial Expiry Auto-Block (Section 12)
                if plan == "free" and subscription.trial_expires_at:
                    if timezone.now() > subscription.trial_expires_at:
                        if status != "trial_expired":
                            subscription.status = "trial_expired"
                            subscription.save(update_fields=["status"])
                        return JsonResponse({
                            "success": False,
                            "error": "Your 2-month free trial has ended. Your data is safe — upgrade to continue.",
                            "code": "trial_expired"
                        }, status=403)

                # 2. Suspended / Blocked Accounts (Section 9)
                if status == "suspended":
                    return JsonResponse({
                        "success": False,
                        "error": "Account suspended — update payment to restore access.",
                        "code": "account_suspended"
                    }, status=403)
                
                # 3. Grace Period Check
                # If past_due or canceled, we allow access but the router will downgrade them to nano.
                # If grace expires, the cron task sets them to 'suspended'. 
                # This middleware just double-checks the date here for safety.
                if status in ["past_due", "canceled"] and subscription.grace_expires_at:
                    if timezone.now() > subscription.grace_expires_at:
                        subscription.status = "suspended"
                        subscription.save(update_fields=["status"])
                        return JsonResponse({
                            "success": False,
                            "error": "Grace period expired. Account suspended.",
                            "code": "account_suspended"
                        }, status=403)

            except TeamSubscription.DoesNotExist:
                pass

        return self.get_response(request)

    def _resolve_team_id(self, request):
        parts = request.path.strip("/").split("/")
        
        # Skip non-team-scoped paths
        if len(parts) < 3:
            return None
        # parts[0] = "api", parts[1] = module, parts[2] = team_id (usually)
        module = parts[1] if len(parts) > 1 else ""
        if module in ("admin", "auth"):
            return None
        # Billing catalog/quote/webhook/reconcile don't carry team_id at position 2
        if module == "billing" and len(parts) >= 3 and parts[2] in ("plans", "quote", "webhook", "reconcile"):
            return None

        # The team_id is at position 2 in the standard pattern: /api/<module>/<team_id>/...
        candidate = parts[2] if len(parts) > 2 else None
        if candidate:
            try:
                uuid.UUID(str(candidate))
                return candidate
            except ValueError:
                pass
        return None

# Alias for backwards compatibility with old settings configurations
TeamStatusMiddleware = LlmUsageMiddleware
