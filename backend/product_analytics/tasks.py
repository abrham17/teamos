from celery import shared_task

from .services import record_product_event


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    max_retries=2,
)
def emit_product_event(
    self,
    event_name: str,
    team_id: str | None = None,
    user_id: str | None = None,
    properties: dict | None = None,
):
    kwargs = {"event_name": event_name, "properties": properties or {}}
    if team_id:
        kwargs["team_id"] = team_id
    if user_id:
        kwargs["user_id"] = user_id
    record_product_event(**kwargs)
