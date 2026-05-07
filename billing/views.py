from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from accounts.models import TeamMember
from teamos_project.api_response import fail, ok

from .models import BillingWebhookEvent, TeamSubscription
from .pricing import compute_quote, public_plan_catalog
from .providers import BillingError, get_billing_provider
from .tasks import reconcile_pending_billing_webhooks


class BillingPlansCatalogView(APIView):
    """Public marketing catalog — prices derived from same module as checkout quotes."""

    permission_classes = [AllowAny]

    def get(self, request):
        return ok(public_plan_catalog())


class BillingQuoteView(APIView):
    """Public quote for home page / calculators (no team required)."""

    permission_classes = [AllowAny]

    def post(self, request):
        try:
            seat_raw = request.data.get("seat_count", 10)
            seat_count = int(seat_raw) if seat_raw is not None else 10
        except (TypeError, ValueError):
            return fail("seat_count must be an integer.", status_code=400, code="invalid_quote_params")
        plan_key = (request.data.get("plan_key") or "").strip()
        usage_tier = (request.data.get("usage_tier") or "standard").strip()
        try:
            quote = compute_quote(plan_key=plan_key, seat_count=seat_count, usage_tier=usage_tier)
        except ValueError as exc:
            return fail(str(exc), status_code=400, code="invalid_quote_params")
        return ok(quote.as_dict())


class CreateCheckoutSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, team_id):
        membership = TeamMember.objects.filter(team_id=team_id, user=request.user).select_related("team").first()
        if not membership or membership.role != "owner":
            return fail("Only owners can manage billing.", status_code=403, code="owner_required")

        plan_key = (request.data.get("plan_key") or "").strip()
        success_url = (request.data.get("success_url") or "").strip()
        cancel_url = (request.data.get("cancel_url") or "").strip()
        if not plan_key or not success_url or not cancel_url:
            return fail(
                "plan_key, success_url, and cancel_url are required.",
                status_code=400,
                code="billing_checkout_params_required",
            )

        if plan_key not in ("team", "pro", "enterprise"):
            return fail("plan_key must be team, pro, or enterprise.", status_code=400, code="invalid_plan_key")

        try:
            seat_raw = request.data.get("seat_count")
            if seat_raw is None:
                catalog = public_plan_catalog()
                defaults = {p["key"]: p["seat_default"] for p in catalog["plans"]}
                seat_count = int(defaults.get(plan_key, 10))
            else:
                seat_count = int(seat_raw)
        except (TypeError, ValueError):
            return fail("seat_count must be an integer.", status_code=400, code="invalid_checkout_params")

        usage_tier = (request.data.get("usage_tier") or "standard").strip()
        try:
            quote = compute_quote(plan_key=plan_key, seat_count=seat_count, usage_tier=usage_tier)
        except ValueError as exc:
            return fail(str(exc), status_code=400, code="invalid_checkout_params")

        client_cents = request.data.get("monthly_total_cents")
        if client_cents is not None:
            try:
                client_cents_int = int(client_cents)
            except (TypeError, ValueError):
                return fail("monthly_total_cents must be an integer.", status_code=400, code="invalid_checkout_params")
            if client_cents_int != quote.monthly_total_cents:
                return fail(
                    "Quoted amount does not match server pricing; refresh and try again.",
                    status_code=400,
                    code="quote_mismatch",
                )

        provider = get_billing_provider()
        session = provider.create_checkout_session(
            team=membership.team,
            plan_key=plan_key,
            success_url=success_url,
            cancel_url=cancel_url,
            quote=quote,
        )
        return ok(
            {
                "provider": provider.provider_name,
                "checkout_url": session.checkout_url,
                "external_checkout_id": session.external_checkout_id,
                "quote": quote.as_dict(),
            },
            status_code=201,
        )


class BillingWebhookView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request, provider_name):
        try:
            provider = get_billing_provider(provider_name)
            event = provider.verify_and_parse_webhook(headers=request.headers, body_bytes=request.body)
        except BillingError as exc:
            return fail(str(exc), status_code=400, code="invalid_billing_webhook")

        event_id = str(event.get("id"))
        event_type = str(event.get("type"))
        webhook_event, created = BillingWebhookEvent.objects.get_or_create(
            provider=provider.provider_name,
            event_id=event_id,
            defaults={"event_type": event_type, "payload": event},
        )
        if not created and webhook_event.processed:
            return ok({"already_processed": True})

        webhook_event.event_type = event_type
        webhook_event.payload = event
        try:
            provider.sync_subscription_state(event=event)
            webhook_event.processed = True
            webhook_event.processed_at = timezone.now()
            webhook_event.error = ""
            webhook_event.save(update_fields=["event_type", "payload", "processed", "processed_at", "error"])
        except Exception as exc:  # pragma: no cover - guarded flow for provider failures
            webhook_event.error = str(exc)
            webhook_event.save(update_fields=["event_type", "payload", "error"])
            return fail("Failed to process billing webhook.", status_code=500, code="billing_webhook_processing_failed")

        return ok({"processed": True})


class BillingReconcileView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_staff:
            return fail("Admin access required.", status_code=403, code="admin_required")

        trace_id = request.headers.get("X-Trace-Id") or request.headers.get("X-Request-Id")
        task = reconcile_pending_billing_webhooks.delay(trace_id=trace_id)
        return ok({"queued": True, "task_id": task.id}, status_code=202)

class TeamSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, team_id):
        membership = TeamMember.objects.filter(team_id=team_id, user=request.user).first()
        if not membership:
            return fail("Not a member of this team.", status_code=403)

        sub = TeamSubscription.objects.filter(team_id=team_id).first()
        if not sub:
            # Return a "free" virtual subscription if none exists in DB
            return ok({
                "plan_key": "free",
                "status": "active",
                "provider": "none",
                "trial_expires_at": None,
                "current_period_end": None,
            })

        return ok({
            "plan_key": sub.plan_key,
            "status": sub.status,
            "provider": sub.provider,
            "external_subscription_id": sub.external_subscription_id,
            "current_period_end": sub.current_period_end,
            "trial_expires_at": sub.trial_expires_at,
            "grace_expires_at": sub.grace_expires_at,
        })
