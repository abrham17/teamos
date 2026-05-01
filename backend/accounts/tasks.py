from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from accounts.models import TeamInvite, TeamAuditEvent


@shared_task
def send_team_invite_email(invite_id: str):
    try:
        invite = TeamInvite.objects.select_related("team", "created_by").get(id=invite_id)
    except TeamInvite.DoesNotExist:
        return

    frontend_url = getattr(settings, "FRONTEND_URL", "").rstrip("/")
    accept_url = f"{frontend_url}/accept-invite?token={invite.token}" if frontend_url else str(invite.token)
    subject = f"You are invited to join {invite.team.name} on TeamOS"
    body = (
        f"Hi,\n\n"
        f"{invite.created_by.email} invited you to join team '{invite.team.name}' as {invite.role}.\n\n"
        f"Accept invite: {accept_url}\n\n"
        f"This invite expires at: {invite.expires_at.isoformat()}\n"
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
