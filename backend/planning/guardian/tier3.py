import logging
from django.utils import timezone
from .context import GuardianContext

logger = logging.getLogger(__name__)

def tier3_log(
    tool_name: str,
    tool_input: dict,
    tool_result: dict,
    context: GuardianContext
) -> None:
    """
    Called AFTER tool execution (not before).
    Never blocks. Pure audit trail.
    """
    try:
        from planning.models import GuardianAuditLog
        GuardianAuditLog.objects.create(
            team_id=context.acting_team_id,
            session_id=context.session_id,
            tool_name=tool_name,
            tool_input=tool_input,
            tool_result=tool_result,
            tier=3,
            approved=True,
            agent_round=context.current_round,
            timestamp=timezone.now()
        )
    except Exception:
        logger.exception("GuardianAuditLog tier3 write failed — non-blocking")
