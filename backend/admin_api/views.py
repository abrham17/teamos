from django.db import models
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAdminUser
from teamos_project.api_response import ok
from llm_orchestrator.models import TeamApiUsage
from billing.models import TeamSubscription
from decimal import Decimal

class AdminDashboardStatsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        month_str = timezone.now().strftime("%Y-%m")
        
        # 1. Platform-wide LLM Spend
        total_spend = TeamApiUsage.objects.filter(
            billing_month=month_str
        ).aggregate(models.Sum('cost_usd'))['cost_usd__sum'] or Decimal("0.0")
        
        # 2. MRR & Plan Distribution
        active_subs = TeamSubscription.objects.filter(status="active")
        mrr = Decimal("0.0")
        plan_distribution = {
            "free": 0,
            "team": 0,
            "pro": 0,
            "enterprise": 0
        }

        from billing.pricing import compute_quote
        for sub in active_subs:
            plan_key = sub.plan_key
            plan_distribution[plan_key] = plan_distribution.get(plan_key, 0) + 1
            
            try:
                # Calculate monthly value
                seat_count = sub.metadata.get("seat_count", 5)
                usage_tier = sub.metadata.get("usage_tier", "standard")
                quote = compute_quote(plan_key, seat_count, usage_tier)
                mrr += Decimal(str(quote.total_amount))
            except:
                pass
                
        # 3. P&L Margin
        gross_margin = mrr - total_spend
        margin_pct = (gross_margin / mrr * 100) if mrr > 0 else 0
        
        # 4. Usage by model
        usage_by_model = TeamApiUsage.objects.filter(
            billing_month=month_str
        ).values('model_used').annotate(
            total_cost=models.Sum('cost_usd'),
            total_calls=models.Count('id')
        ).order_by('-total_cost')

        return ok({
            "billing_month": month_str,
            "total_spend": total_spend,
            "total_revenue": mrr, # This is our MRR
            "mrr": mrr,
            "gross_margin": gross_margin,
            "margin_pct": margin_pct,
            "usage_by_model": list(usage_by_model),
            "plan_distribution": plan_distribution,
            "active_subscriptions": active_subs.count(),
        })

class AdminTeamUsageListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        month_str = timezone.now().strftime("%Y-%m")
        
        # Aggregate usage
        usage_data = TeamApiUsage.objects.filter(
            billing_month=month_str
        ).values('team_id').annotate(
            cost=models.Sum('cost_usd'),
            calls=models.Count('id')
        )

        team_ids = [u['team_id'] for u in usage_data]
        
        # Fetch team details and member counts
        from accounts.models import Team
        teams = Team.objects.filter(id__in=team_ids).annotate(
            member_count=models.Count('members')
        ).select_related('subscription')

        # Combine data
        usage_map = {str(u['team_id']): u for u in usage_data}
        results = []
        for team in teams:
            t_usage = usage_map.get(str(team.id), {"cost": Decimal("0.0"), "calls": 0})
            results.append({
                "id": str(team.id),
                "name": team.name,
                "plan": team.plan,
                "status": team.subscription.status if hasattr(team, 'subscription') else "unknown",
                "usage_tier": team.subscription.metadata.get("usage_tier", "standard") if hasattr(team, 'subscription') else "n/a",
                "seat_count": team.subscription.metadata.get("seat_count", 1) if hasattr(team, 'subscription') else 1,
                "member_count": team.member_count,
                "cost": float(t_usage["cost"]),
                "calls": t_usage["calls"],
                "created_at": team.created_at.isoformat(),
            })
            
        results.sort(key=lambda x: x["cost"], reverse=True)
        return ok(results)
class AdminTeamDetailView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, team_id):
        from accounts.models import Team
        try:
            team = Team.objects.annotate(
                member_count=models.Count('members')
            ).get(id=team_id)
        except Team.DoesNotExist:
            return ok({"error": "Team not found"}, status_code=404)

        month_str = timezone.now().strftime("%Y-%m")
        usage = TeamApiUsage.objects.filter(
            team_id=team_id, 
            billing_month=month_str
        ).aggregate(
            cost=models.Sum('cost_usd'),
            calls=models.Count('id')
        )

        return ok({
            "id": str(team.id),
            "name": team.name,
            "plan": team.plan,
            "status": team.subscription.status if hasattr(team, 'subscription') else "unknown",
            "member_count": team.member_count,
            "cost": usage["cost"] or Decimal("0.0"),
            "calls": usage["calls"] or 0,
            "created_at": team.created_at.isoformat(),
            "subscription_id": team.subscription.id if hasattr(team, 'subscription') else None,
        })

    def patch(self, request, team_id):
        from accounts.models import Team
        try:
            team = Team.objects.get(id=team_id)
        except Team.DoesNotExist:
            return ok({"error": "Team not found"}, status_code=404)

        status = request.data.get("status")
        plan = request.data.get("plan")

        if status and hasattr(team, 'subscription'):
            team.subscription.status = status
            team.subscription.save()
        
        if plan:
            team.plan = plan
            team.save()

        return ok({"success": True})
