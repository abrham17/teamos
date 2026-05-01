import hashlib
import hmac
import json
import time
from datetime import timezone as dt_timezone
from dataclasses import dataclass

from django.conf import settings
from django.utils import timezone

from billing.models import TeamSubscription


class BillingError(Exception):
    pass


@dataclass
class CheckoutSession:
    checkout_url: str
    external_checkout_id: str


class BaseBillingProvider:
    provider_name = "base"

    def create_checkout_session(self, *, team, plan_key: str, success_url: str, cancel_url: str) -> CheckoutSession:
        raise NotImplementedError

    def verify_and_parse_webhook(self, *, headers, body_bytes: bytes) -> dict:
        raise NotImplementedError

    def sync_subscription_state(self, *, event: dict) -> TeamSubscription | None:
        raise NotImplementedError


class PaddleBillingProvider(BaseBillingProvider):
    provider_name = "paddle"

    def create_checkout_session(self, *, team, plan_key: str, success_url: str, cancel_url: str) -> CheckoutSession:
        # Adapter boundary ready for Paddle API integration.
        checkout_id = f"pdl_{team.id}_{plan_key}"
        checkout_url = f"{success_url}?billing_provider=paddle&checkout_id={checkout_id}&plan={plan_key}"
        return CheckoutSession(checkout_url=checkout_url, external_checkout_id=checkout_id)

    def verify_and_parse_webhook(self, *, headers, body_bytes: bytes) -> dict:
        secret = getattr(settings, "PADDLE_WEBHOOK_SECRET", "") or getattr(settings, "BILLING_WEBHOOK_SECRET", "")
        signature = headers.get("Paddle-Signature", "")
        timestamp_raw = headers.get("Paddle-Timestamp", "")
        if not secret or not signature or not timestamp_raw:
            raise BillingError("Missing Paddle webhook signature headers.")
        try:
            timestamp = int(timestamp_raw)
        except ValueError as exc:
            raise BillingError("Invalid Paddle webhook timestamp.") from exc

        tolerance = int(getattr(settings, "PADDLE_WEBHOOK_TOLERANCE_SECONDS", 300))
        now = int(time.time())
        if abs(now - timestamp) > tolerance:
            raise BillingError("Paddle webhook timestamp outside tolerance.")

        signed_payload = f"{timestamp}:{body_bytes.decode('utf-8')}".encode("utf-8")
        digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(digest, signature):
            raise BillingError("Invalid Paddle webhook signature.")

        payload = json.loads(body_bytes.decode("utf-8"))
        event_id = str(payload.get("id") or "")
        event_type = str(payload.get("type") or "")
        if not event_id or not event_type:
            raise BillingError("Webhook payload missing id/type.")
        return payload

    def sync_subscription_state(self, *, event: dict) -> TeamSubscription | None:
        from product_analytics.services import record_first_once

        data = event.get("data") or {}
        team_id = data.get("team_id")
        if not team_id:
            return None
        subscription, _ = TeamSubscription.objects.get_or_create(team_id=team_id, defaults={"provider": "paddle"})
        prev_status = subscription.status
        subscription.external_customer_id = str(data.get("customer_id") or subscription.external_customer_id)
        subscription.external_subscription_id = str(data.get("subscription_id") or subscription.external_subscription_id)
        subscription.plan_key = str(data.get("plan_key") or subscription.plan_key)
        subscription.status = str(data.get("status") or subscription.status)
        period_end = data.get("current_period_end")
        if period_end:
            subscription.current_period_end = timezone.datetime.fromisoformat(period_end)
        subscription.metadata = {"event_type": event.get("type")}
        subscription.save()
        if subscription.status == "active" and prev_status != "active":
            record_first_once(
                event_name="subscription_started",
                team=subscription.team,
                properties={"provider": "paddle", "plan_key": subscription.plan_key},
            )
        return subscription


class StripeBillingProvider(BaseBillingProvider):
    provider_name = "stripe"

    def create_checkout_session(self, *, team, plan_key: str, success_url: str, cancel_url: str) -> CheckoutSession:
        # Adapter boundary ready for Stripe checkout session creation.
        checkout_id = f"strp_{team.id}_{plan_key}"
        checkout_url = f"{success_url}?billing_provider=stripe&checkout_id={checkout_id}&plan={plan_key}"
        return CheckoutSession(checkout_url=checkout_url, external_checkout_id=checkout_id)

    def verify_and_parse_webhook(self, *, headers, body_bytes: bytes) -> dict:
        secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "") or getattr(settings, "BILLING_WEBHOOK_SECRET", "")
        signature = headers.get("Stripe-Signature", "")
        if not secret or not signature:
            raise BillingError("Missing Stripe webhook signature.")

        digest = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(digest, signature):
            raise BillingError("Invalid Stripe webhook signature.")

        payload = json.loads(body_bytes.decode("utf-8"))
        event_id = str(payload.get("id") or "")
        event_type = str(payload.get("type") or "")
        if not event_id or not event_type:
            raise BillingError("Webhook payload missing id/type.")
        return payload

    def sync_subscription_state(self, *, event: dict) -> TeamSubscription | None:
        from product_analytics.services import record_first_once

        data = event.get("data") or {}
        obj = data.get("object") or {}
        metadata = obj.get("metadata") or {}
        team_id = metadata.get("team_id") or obj.get("client_reference_id")
        if not team_id:
            return None
        subscription, _ = TeamSubscription.objects.get_or_create(team_id=team_id, defaults={"provider": "stripe"})
        prev_status = subscription.status
        customer_id = obj.get("customer")
        subscription_id = obj.get("subscription") or obj.get("id")
        subscription.external_customer_id = str(customer_id or subscription.external_customer_id)
        subscription.external_subscription_id = str(subscription_id or subscription.external_subscription_id)
        subscription.plan_key = str(metadata.get("plan_key") or subscription.plan_key)
        status = obj.get("status")
        if status:
            subscription.status = str(status)
        period_end = obj.get("current_period_end")
        if period_end:
            subscription.current_period_end = timezone.datetime.fromtimestamp(int(period_end), tz=dt_timezone.utc)
        subscription.metadata = {"event_type": event.get("type"), "provider_payload": obj}
        subscription.save()
        if subscription.status == "active" and prev_status != "active":
            record_first_once(
                event_name="subscription_started",
                team=subscription.team,
                properties={"provider": "stripe", "plan_key": subscription.plan_key},
            )
        return subscription


def get_billing_provider(provider_name: str | None = None) -> BaseBillingProvider:
    name = (provider_name or getattr(settings, "BILLING_PROVIDER", "paddle")).lower().strip()
    if name == "paddle":
        return PaddleBillingProvider()
    if name == "stripe":
        return StripeBillingProvider()
    raise BillingError(f"Unsupported billing provider: {name}")
