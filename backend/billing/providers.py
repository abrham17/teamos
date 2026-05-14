import hashlib
import hmac
import json
import logging
import time
from datetime import timezone as dt_timezone
from dataclasses import dataclass
from urllib.parse import quote as urlquote

import requests
from django.conf import settings
from django.utils import timezone

from accounts.models import Team
from billing.models import TeamSubscription
from billing.pricing import PriceQuote

logger = logging.getLogger(__name__)


class BillingError(Exception):
    pass


@dataclass
class CheckoutSession:
    checkout_url: str
    external_checkout_id: str


def _canonical_team_plan(plan_key: str) -> str | None:
    raw = (plan_key or "").strip().lower()
    for k in ("enterprise", "pro", "team", "free"):
        if raw == k or raw.startswith(f"{k}_"):
            return k
    return None


def _apply_team_plan_from_subscription(subscription: TeamSubscription) -> None:
    if subscription.status != "active":
        return
    canonical = _canonical_team_plan(subscription.plan_key)
    if canonical and canonical in dict(Team.PLAN_CHOICES):
        Team.objects.filter(id=subscription.team_id).update(plan=canonical)


class BaseBillingProvider:
    provider_name = "base"

    def create_checkout_session(
        self,
        *,
        team,
        plan_key: str,
        success_url: str,
        cancel_url: str,
        quote: PriceQuote | None = None,
    ) -> CheckoutSession:
        raise NotImplementedError

    def verify_and_parse_webhook(self, *, headers, body_bytes: bytes) -> dict:
        raise NotImplementedError

    def sync_subscription_state(self, *, event: dict) -> TeamSubscription | None:
        raise NotImplementedError


def _paddle_price_id_for_plan(plan_key: str) -> str:
    mapping = {
        "team": getattr(settings, "PADDLE_PRICE_ID_TEAM", "") or "",
        "pro": getattr(settings, "PADDLE_PRICE_ID_PRO", "") or "",
    }
    return mapping.get(plan_key, "")


def _paddle_create_transaction_live(
    *,
    team,
    plan_key: str,
    success_url: str,
    cancel_url: str,
    quote: PriceQuote,
) -> CheckoutSession | None:
    api_key = (getattr(settings, "PADDLE_API_KEY", None) or "").strip()
    price_id = _paddle_price_id_for_plan(plan_key)
    base = (getattr(settings, "PADDLE_API_BASE", None) or "https://sandbox-api.paddle.com").rstrip("/")
    if not api_key or not price_id:
        return None

    url = f"{base}/transactions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict = {
        "items": [{"price_id": price_id, "quantity": 1}],
        "custom_data": {
            "team_id": str(team.id),
            "plan_key": plan_key,
            "variant_key": quote.variant_key,
            "seat_count": str(quote.seat_count),
            "usage_tier": quote.usage_tier,
            "monthly_total_cents": str(quote.monthly_total_cents),
        },
    }
    # Paddle Billing: optional checkout settings for redirect after payment
    checkout_obj: dict = {"url": success_url}
    preview = (getattr(settings, "PADDLE_CHECKOUT_PREVIEW", None) or "").strip()
    if preview:
        checkout_obj["preview"] = True
    body["checkout"] = checkout_obj

    try:
        resp = requests.post(url, headers=headers, json=body, timeout=30)
    except requests.RequestException as exc:
        logger.warning("paddle_transaction_request_failed", extra={"error": str(exc)})
        return None

    if resp.status_code >= 400:
        logger.warning(
            "paddle_transaction_http_error",
            extra={"status": resp.status_code, "body": resp.text[:500]},
        )
        return None

    try:
        payload = resp.json()
    except json.JSONDecodeError:
        logger.warning("paddle_transaction_invalid_json", extra={"text": resp.text[:200]})
        return None

    data = payload.get("data") or payload
    checkout = data.get("checkout") if isinstance(data, dict) else None
    checkout_url = ""
    external_id = ""
    if isinstance(checkout, dict):
        checkout_url = (checkout.get("url") or "").strip()
    if not checkout_url and isinstance(data, dict):
        checkout_url = (data.get("checkout_url") or "").strip()
    if isinstance(data, dict):
        external_id = str(data.get("id") or data.get("transaction_id") or "")

    if not checkout_url:
        logger.warning("paddle_transaction_missing_checkout_url", extra={"payload_keys": list(payload.keys())})
        return None

    return CheckoutSession(checkout_url=checkout_url, external_checkout_id=external_id or f"pdl_{team.id}_{quote.variant_key}")


class PaddleBillingProvider(BaseBillingProvider):
    provider_name = "paddle"

    def create_checkout_session(
        self,
        *,
        team,
        plan_key: str,
        success_url: str,
        cancel_url: str,
        quote: PriceQuote | None = None,
    ) -> CheckoutSession:
        if quote is None:
            from billing.pricing import compute_quote

            quote = compute_quote(plan_key=plan_key, seat_count=10, usage_tier="standard")

        live = _paddle_create_transaction_live(
            team=team,
            plan_key=plan_key,
            success_url=success_url,
            cancel_url=cancel_url,
            quote=quote,
        )
        if live:
            return live

        checkout_id = f"pdl_{team.id}_{quote.variant_key}"
        sep = "&" if "?" in success_url else "?"
        checkout_url = (
            f"{success_url}{sep}billing_provider=paddle&checkout_id={checkout_id}"
            f"&plan={plan_key}&variant={quote.variant_key}&cancel_url={urlquote(cancel_url, safe='')}"
        )
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
        custom_data = data.get("custom_data") or {}
        
        # Team ID is usually in custom_data for Paddle transactions
        team_id = custom_data.get("team_id") or data.get("team_id")
        if not team_id:
            logger.warning("paddle_sync_missing_team_id", extra={"event_id": event.get("id")})
            return None
            
        subscription, _ = TeamSubscription.objects.get_or_create(team_id=team_id, defaults={"provider": "paddle"})
        prev_status = subscription.status
        
        subscription.external_customer_id = str(data.get("customer_id") or subscription.external_customer_id)
        subscription.external_subscription_id = str(data.get("subscription_id") or subscription.external_subscription_id)
        
        # Plan details
        subscription.plan_key = str(custom_data.get("plan_key") or data.get("plan_key") or subscription.plan_key)
        subscription.status = str(data.get("status") or subscription.status)
        
        period_end = data.get("current_period_end")
        if period_end:
            try:
                subscription.current_period_end = timezone.datetime.fromisoformat(
                    str(period_end).replace("Z", "+00:00"),
                )
            except ValueError:
                pass
                
        # Sync Metadata (Seats, Usage Tier)
        metadata = subscription.metadata or {}
        metadata.update({
            "seat_count": int(custom_data.get("seat_count", metadata.get("seat_count", 1))),
            "usage_tier": str(custom_data.get("usage_tier", metadata.get("usage_tier", "standard"))),
            "last_event_type": event.get("type"),
            "variant_key": custom_data.get("variant_key")
        })
        subscription.metadata = metadata
        
        subscription.save()
        _apply_team_plan_from_subscription(subscription)
        
        if subscription.status == "active" and prev_status != "active":
            record_first_once(
                event_name="subscription_started",
                team=subscription.team,
                properties={
                    "provider": "paddle", 
                    "plan_key": subscription.plan_key,
                    "seat_count": metadata.get("seat_count")
                },
            )
        return subscription


class StripeBillingProvider(BaseBillingProvider):
    provider_name = "stripe"

    def create_checkout_session(
        self,
        *,
        team,
        plan_key: str,
        success_url: str,
        cancel_url: str,
        quote: PriceQuote | None = None,
    ) -> CheckoutSession:
        if quote is None:
            from billing.pricing import compute_quote

            quote = compute_quote(plan_key=plan_key, seat_count=10, usage_tier="standard")
        checkout_id = f"strp_{team.id}_{quote.variant_key}"
        sep = "&" if "?" in success_url else "?"
        checkout_url = (
            f"{success_url}{sep}billing_provider=stripe&checkout_id={checkout_id}"
            f"&plan={plan_key}&variant={quote.variant_key}"
        )
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
        _apply_team_plan_from_subscription(subscription)
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
