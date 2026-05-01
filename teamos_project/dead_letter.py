from ingest.models import AsyncDeadLetter
from teamos_project.logging_utils import ops_logger


def record_dead_letter(
    *,
    task_name: str,
    error_message: str,
    trace_id: str,
    payload: dict | None = None,
    metadata: dict | None = None,
) -> AsyncDeadLetter:
    entry = AsyncDeadLetter.objects.create(
        task_name=task_name,
        trace_id=trace_id,
        error_message=(error_message or "")[:5000],
        payload=payload or {},
        metadata=metadata or {},
    )
    ops_logger.error(
        "dead_letter_recorded",
        trace_id=trace_id,
        task_name=task_name,
        dead_letter_id=str(entry.id),
        error_message=entry.error_message,
    )
    return entry
