from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.models import TeamMember
from teamos_project.api_response import fail, ok

from .models import BillingWebhookEvent
from .providers import BillingError, get_billing_provider
from .tasks import reconcile_pending_billing_webhooks


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

        provider = get_billing_provider()
        session = provider.create_checkout_session(
            team=membership.team,
            plan_key=plan_key,
            success_url=success_url,
            cancel_url=cancel_url,
        )
        return ok(
            {
                "provider": provider.provider_name,
                "checkout_url": session.checkout_url,
                "external_checkout_id": session.external_checkout_id,
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
