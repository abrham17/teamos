from celery import shared_task
from django.utils import timezone

from teamos_project.dead_letter import record_dead_letter
from teamos_project.logging_utils import ops_logger
from teamos_project.trace import coalesce_trace_id

from .models import BillingWebhookEvent
from .providers import get_billing_provider


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
)
def reconcile_pending_billing_webhooks(self, trace_id: str | None = None, batch_size: int = 50):
    trace_id = coalesce_trace_id(trace_id, prefix="billing-reconcile")
    pending = list(
        BillingWebhookEvent.objects.filter(processed=False).order_by("created_at")[: max(int(batch_size), 1)]
    )
    processed_count = 0
    failed_count = 0

    for event in pending:
        try:
            provider = get_billing_provider(event.provider)
            provider.sync_subscription_state(event=event.payload or {})
            event.processed = True
            event.processed_at = timezone.now()
            event.error = ""
            event.save(update_fields=["processed", "processed_at", "error"])
            processed_count += 1
        except Exception as exc:  # pragma: no cover - protects long-running job loop
            failed_count += 1
            event.error = str(exc)
            event.save(update_fields=["error"])
            ops_logger.error(
                "billing_webhook_reconcile_failed",
                trace_id=trace_id,
                provider=event.provider,
                event_id=event.event_id,
                error=str(exc),
            )

    ops_logger.info(
        "billing_webhook_reconcile_completed",
        trace_id=trace_id,
        processed_count=processed_count,
        failed_count=failed_count,
        batch_size=batch_size,
        task_id=getattr(self.request, "id", None),
    )

    if failed_count > 0 and self.request.retries >= self.max_retries:
        record_dead_letter(
            task_name="billing.reconcile_pending_billing_webhooks",
            error_message=f"Failed to reconcile {failed_count} billing webhook events.",
            trace_id=trace_id,
            payload={"batch_size": batch_size},
            metadata={
                "processed_count": processed_count,
                "failed_count": failed_count,
                "task_id": getattr(self.request, "id", None),
                "retries": self.request.retries,
                "max_retries": self.max_retries,
            },
        )
    if failed_count > 0:
        raise RuntimeError("Some billing webhooks failed reconciliation.")

    return {"processed_count": processed_count, "failed_count": failed_count}
