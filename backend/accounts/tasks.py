from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from accounts.models import TeamInvite, TeamAuditEvent
from teamos_project.dead_letter import record_dead_letter
from teamos_project.logging_utils import ops_logger
from teamos_project.trace import coalesce_trace_id


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=3,
)
def send_team_invite_email(self, invite_id: str, trace_id: str | None = None):
    trace_id = coalesce_trace_id(trace_id, prefix="invite-email")
    try:
        invite = TeamInvite.objects.select_related("team", "created_by").get(id=invite_id)
    except TeamInvite.DoesNotExist:
        ops_logger.warning(
            "invite_email_missing_invite",
            trace_id=trace_id,
            invite_id=invite_id,
            task_id=getattr(self.request, "id", None),
        )
        return

    frontend_url = getattr(settings, "FRONTEND_URL", "").rstrip("/")
    accept_url = f"{frontend_url}/accept-invite?token={invite.token}" if frontend_url else str(invite.token)
    
    # Get sender identity
    from accounts.models import TeamMember
    sender_membership = TeamMember.objects.filter(team=invite.team, user=invite.created_by).first()
    sender_role = sender_membership.role.title() if sender_membership else "Member"
    sender_name = invite.created_by.display_name
    team_name = invite.team.name

    subject = f"{sender_name} invited you to join {team_name} on TeamOS"
    body = (
        f"Hi,\n\n"
        f"{sender_name} ({sender_role}) from team '{team_name}' has invited you to join them on TeamOS as an {invite.role.title()}.\n\n"
        f"Click the link below to accept the invitation and start collaborating:\n"
        f"{accept_url}\n\n"
        f"This invitation will expire in 7 days (on {invite.expires_at.strftime('%Y-%m-%d')}).\n\n"
        f"Best regards,\n"
        f"The TeamOS Bot"
    )

    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@teamos.local"),
            recipient_list=[invite.invitee_email],
            fail_silently=False,
        )
        invite.send_status = "sent"
        invite.sent_at = timezone.now()
        invite.save(update_fields=["send_status", "sent_at"])
        TeamAuditEvent.objects.create(
            team=invite.team,
            actor=invite.created_by,
            event_type="invite_sent",
            metadata={"invite_id": str(invite.id), "invitee_email": invite.invitee_email},
        )
        ops_logger.info(
            "invite_email_sent",
            trace_id=trace_id,
            invite_id=str(invite.id),
            team_id=str(invite.team_id),
            recipient=invite.invitee_email,
            task_id=getattr(self.request, "id", None),
        )
    except Exception as exc:
        invite.send_status = "failed"
        invite.save(update_fields=["send_status"])
        TeamAuditEvent.objects.create(
            team=invite.team,
            actor=invite.created_by,
            event_type="invite_send_failed",
            metadata={
                "invite_id": str(invite.id),
                "invitee_email": invite.invitee_email,
                "error": str(exc),
            },
        )
        ops_logger.error(
            "invite_email_send_failed",
            trace_id=trace_id,
            invite_id=str(invite.id),
            team_id=str(invite.team_id),
            recipient=invite.invitee_email,
            error=str(exc),
            task_id=getattr(self.request, "id", None),
            retries=self.request.retries if getattr(self, "request", None) else 0,
            max_retries=self.max_retries,
        )
        if self.request.retries >= self.max_retries:
            record_dead_letter(
                task_name="accounts.send_team_invite_email",
                error_message=str(exc),
                trace_id=trace_id,
                payload={"invite_id": str(invite_id)},
                metadata={
                    "team_id": str(invite.team_id),
                    "task_id": getattr(self.request, "id", None),
                    "retries": self.request.retries,
                    "max_retries": self.max_retries,
                },
            )
        raise


@shared_task(bind=True, max_retries=0)
def purge_soft_deleted_team(self, team_id: str, trace_id: str | None = None):
    trace_id = coalesce_trace_id(trace_id, prefix="team-purge")
    from accounts.models import Team

    team = Team.objects.filter(id=team_id).first()
    if not team:
        return
    if not team.is_deleted:
        return
    if team.purge_after and timezone.now() < team.purge_after:
        return

    TeamAuditEvent.objects.create(
        team=team,
        actor=None,
        event_type="team_hard_deleted",
        metadata={"team_id": str(team.id), "team_name": team.name},
    )
    ops_logger.info("team_hard_deleted", trace_id=trace_id, team_id=str(team.id), team_name=team.name)
    team.delete()
