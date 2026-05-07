from django.utils import timezone
from django.http import JsonResponse
from billing.models import TeamSubscription
from teamos_project.api_response import fail

class TeamStatusMiddleware:
    """
    Middleware to block requests for teams with expired trials or suspended subscriptions.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # We only care about team-scoped API requests
        # Usually these have 'team_id' in the URL or resolved by other middleware
        
        # Check if we have a resolved team_membership (from IsTeamMember or similar)
        # Or check the URL pattern
        
        team_id = self._resolve_team_id(request)
        if team_id:
            try:
                subscription = TeamSubscription.objects.get(team_id=team_id)
                status = subscription.status
                
                # 1. Trial Expiry Check
                if status == "trialing" and subscription.trial_expires_at:
                    if timezone.now() > subscription.trial_expires_at:
                        subscription.status = "trial_expired"
                        subscription.save(update_fields=["status"])
                        status = "trial_expired"

                # 2. Block Logic
                if status == "trial_expired":
                    return JsonResponse({
                        "success": False,
                        "error": "Trial expired. Please upgrade to continue.",
                        "code": "trial_expired"
                    }, status=403)
                
                if status == "suspended":
                    return JsonResponse({
                        "success": False,
                        "error": "Account suspended. Please update payment to restore access.",
                        "code": "account_suspended"
                    }, status=403)

                # 3. Grace Period Check
                # If past_due or canceled but within 7 days, they are still allowed (handled by router to downgrade to nano)
                if status in ["past_due", "canceled"] and subscription.grace_expires_at:
                    if timezone.now() > subscription.grace_expires_at:
                        subscription.status = "suspended"
                        subscription.save(update_fields=["status"])
                        return JsonResponse({
                            "success": False,
                            "error": "Grace period expired. Account suspended.",
                            "code": "grace_period_expired"
                        }, status=403)

            except TeamSubscription.DoesNotExist:
                pass

        return self.get_response(request)

    def _resolve_team_id(self, request):
        # Implementation depends on how URL kwargs are parsed
        # This is a bit tricky in middleware before view resolution
        # But we can look at path
        parts = request.path.strip("/").split("/")
        # Assume URLs like /api/wiki/<team_id>/...
        if len(parts) >= 3 and parts[0] == "api":
            return parts[2]
        return None
