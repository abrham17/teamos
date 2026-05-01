import hashlib
import hmac
import json
import time
from unittest.mock import patch

from django.conf import settings
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Team, TeamMember, User
from billing.models import BillingWebhookEvent, TeamSubscription
from billing.tasks import reconcile_pending_billing_webhooks
from product_analytics.models import ProductEvent


@override_settings(
    BILLING_PROVIDER="paddle",
    PADDLE_WEBHOOK_SECRET="test-secret",
    PADDLE_WEBHOOK_TOLERANCE_SECONDS=300,
)
class BillingApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="billing-owner",
            email="billing-owner@example.com",
            password="test-password",
        )
        self.viewer = User.objects.create_user(
            username="billing-viewer",
            email="billing-viewer@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Billing Team", slug="billing-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")
        TeamMember.objects.create(team=self.team, user=self.viewer, role="viewer")

    def _signature(self, payload: dict, timestamp: int) -> str:
        body = json.dumps(payload).encode("utf-8")
        signed_payload = f"{timestamp}:{body.decode('utf-8')}".encode("utf-8")
        return hmac.new(b"test-secret", signed_payload, hashlib.sha256).hexdigest()

    def test_owner_can_create_checkout_session(self):
        self.client.force_authenticate(user=self.owner)
        url = f"/api/billing/{self.team.id}/checkout-session/"
        res = self.client.post(
            url,
            {
                "plan_key": "team",
                "success_url": "https://app.example.com/billing/success",
                "cancel_url": "https://app.example.com/billing/cancel",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["provider"], "paddle")

    def test_webhook_idempotent_processing(self):
        payload = {
            "id": "evt_123",
            "type": "subscription.updated",
            "data": {
                "team_id": str(self.team.id),
                "subscription_id": "sub_123",
                "customer_id": "cus_123",
                "status": "active",
                "plan_key": "team",
            },
        }
        ts = int(time.time())
        body = json.dumps(payload).encode("utf-8")
        signature = self._signature(payload, ts)
        url = "/api/billing/webhook/paddle/"

        first = self.client.post(
            url,
            data=body,
            content_type="application/json",
            HTTP_PADDLE_SIGNATURE=signature,
            HTTP_PADDLE_TIMESTAMP=str(ts),
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertTrue(first.data["success"])
        self.assertTrue(BillingWebhookEvent.objects.get(provider="paddle", event_id="evt_123").processed)
        self.assertEqual(TeamSubscription.objects.filter(team=self.team).count(), 1)

        second = self.client.post(
            url,
            data=body,
            content_type="application/json",
            HTTP_PADDLE_SIGNATURE=signature,
            HTTP_PADDLE_TIMESTAMP=str(ts),
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data["success"])
        self.assertTrue(second.data["data"]["already_processed"])
        self.assertEqual(TeamSubscription.objects.filter(team=self.team).count(), 1)
        self.assertTrue(ProductEvent.objects.filter(team=self.team, event_name="subscription_started").exists())

    def test_webhook_rejects_invalid_signature(self):
        payload = {"id": "evt_bad", "type": "subscription.updated", "data": {"team_id": str(self.team.id)}}
        url = "/api/billing/webhook/paddle/"
        res = self.client.post(
            url,
            data=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
            HTTP_PADDLE_SIGNATURE="invalid",
            HTTP_PADDLE_TIMESTAMP=str(int(time.time())),
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "invalid_billing_webhook")

    def test_webhook_rejects_stale_timestamp(self):
        payload = {"id": "evt_stale", "type": "subscription.updated", "data": {"team_id": str(self.team.id)}}
        stale_ts = int(time.time()) - 1000
        signature = self._signature(payload, stale_ts)
        url = "/api/billing/webhook/paddle/"
        res = self.client.post(
            url,
            data=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
            HTTP_PADDLE_SIGNATURE=signature,
            HTTP_PADDLE_TIMESTAMP=str(stale_ts),
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data["success"])
        self.assertEqual(res.data["error"]["code"], "invalid_billing_webhook")


@override_settings(BILLING_PROVIDER="stripe", STRIPE_WEBHOOK_SECRET="stripe-secret")
class StripeBillingApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="stripe-owner",
            email="stripe-owner@example.com",
            password="test-password",
        )
        self.team = Team.objects.create(name="Stripe Team", slug="stripe-team", created_by=self.owner)
        TeamMember.objects.create(team=self.team, user=self.owner, role="owner")

    def test_owner_can_create_checkout_session_with_stripe_provider(self):
        self.client.force_authenticate(user=self.owner)
        url = f"/api/billing/{self.team.id}/checkout-session/"
        res = self.client.post(
            url,
            {
                "plan_key": "pro",
                "success_url": "https://app.example.com/billing/success",
                "cancel_url": "https://app.example.com/billing/cancel",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["provider"], "stripe")

    def test_stripe_webhook_updates_subscription_state(self):
        payload = {
            "id": "evt_stripe_123",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "id": "sub_stripe_123",
                    "customer": "cus_stripe_123",
                    "status": "active",
                    "current_period_end": 1893456000,
                    "metadata": {
                        "team_id": str(self.team.id),
                        "plan_key": "team",
                    },
                }
            },
        }
        body = json.dumps(payload).encode("utf-8")
        signature = hmac.new(b"stripe-secret", body, hashlib.sha256).hexdigest()
        url = "/api/billing/webhook/stripe/"
        res = self.client.post(
            url,
            data=body,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE=signature,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        sub = TeamSubscription.objects.get(team=self.team)
        self.assertEqual(sub.provider, "stripe")
        self.assertEqual(sub.plan_key, "team")
        self.assertEqual(sub.status, "active")
        self.assertTrue(ProductEvent.objects.filter(team=self.team, event_name="subscription_started").exists())


@override_settings(BILLING_PROVIDER="paddle", PADDLE_WEBHOOK_SECRET="test-secret")
class BillingReconcileTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="billing-admin",
            email="billing-admin@example.com",
            password="test-password",
            is_staff=True,
        )
        self.team = Team.objects.create(name="Recon Team", slug="recon-team", created_by=self.admin)
        TeamMember.objects.create(team=self.team, user=self.admin, role="owner")

    def test_reconcile_task_processes_pending_events(self):
        BillingWebhookEvent.objects.create(
            provider="paddle",
            event_id="evt_pending_1",
            event_type="subscription.updated",
            payload={
                "id": "evt_pending_1",
                "type": "subscription.updated",
                "data": {
                    "team_id": str(self.team.id),
                    "subscription_id": "sub_pending_1",
                    "customer_id": "cus_pending_1",
                    "status": "active",
                    "plan_key": "team",
                },
            },
            processed=False,
        )
        result = reconcile_pending_billing_webhooks.apply(kwargs={"batch_size": 10}).get()
        self.assertEqual(result["processed_count"], 1)
        self.assertEqual(result["failed_count"], 0)
        event = BillingWebhookEvent.objects.get(event_id="evt_pending_1")
        self.assertTrue(event.processed)
        self.assertEqual(TeamSubscription.objects.filter(team=self.team).count(), 1)

    def test_staff_can_queue_reconcile_job(self):
        self.client.force_authenticate(user=self.admin)
        with patch("billing.views.reconcile_pending_billing_webhooks.delay") as mocked_delay:
            mocked_delay.return_value.id = "task-123"
            res = self.client.post("/api/billing/reconcile/", {}, format="json")
            self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
            self.assertTrue(res.data["success"])
            self.assertTrue(res.data["data"]["queued"])
            self.assertEqual(res.data["data"]["task_id"], "task-123")
            mocked_delay.assert_called_once()

    def test_celery_beat_schedule_includes_billing_reconcile(self):
        schedule = settings.CELERY_BEAT_SCHEDULE.get("billing-reconcile-pending-webhooks")
        self.assertIsNotNone(schedule)
        self.assertEqual(schedule["task"], "billing.tasks.reconcile_pending_billing_webhooks")
        self.assertEqual(schedule["kwargs"]["batch_size"], 50)
