"""
Celery tasks for planning — async reindex to keep web dynos unblocked.
"""
from __future__ import annotations

import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    max_retries=2,
)
def reindex_project_async(self, project_id: str):
    """
    Rebuild PlanChunk rows + embeddings for a project, off the web dyno.
    Replaces all synchronous reindex_project(project) calls in views.
    """
    from .models import Project
    from .reindex import reindex_project

    try:
        project = Project.objects.get(id=project_id)
    except Project.DoesNotExist:
        logger.warning("reindex_project_async: project %s not found, skipping", project_id)
        return

    try:
        count = reindex_project(project)
        logger.info("reindex_project_async: project %s reindexed %d chunks", project_id, count)
    except Exception as exc:
        logger.exception("reindex_project_async failed for project %s", project_id)
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=3,
)
def approve_changeset_async(self, changeset_id: str, user_id: str | None = None, apply_remediation: bool = False):
    """
    Approve a changeset asynchronously to avoid Heroku 30s timeout.
    Applies mutations, reindexes project, and notifies via WebSocket.
    """
    from .models import PlanChangeSet
    from .version_services import approve_changeset
    from accounts.models import User
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync

    try:
        cs = PlanChangeSet.objects.get(id=changeset_id)
    except PlanChangeSet.DoesNotExist:
        logger.warning("approve_changeset_async: changeset %s not found, skipping", changeset_id)
        return {"status": "not_found", "changeset_id": changeset_id}

    # Idempotent: if already approved, skip
    if cs.status == "approved":
        logger.info("approve_changeset_async: changeset %s already approved", changeset_id)
        return {"status": "already_approved", "changeset_id": changeset_id}

    if cs.status != "pending":
        logger.warning("approve_changeset_async: changeset %s is not pending (status=%s)", changeset_id, cs.status)
        return {"status": "invalid_status", "changeset_id": changeset_id, "current_status": cs.status}

    try:
        user = User.objects.get(id=user_id) if user_id else None
        approve_changeset(cs, user=user)

        if apply_remediation:
            from .remediation import remediate_project
            remediate_project(team=cs.project.team, project=cs.project, apply_conflicts=True, apply_risk=False)

        # Reindex project
        reindex_project_async.delay(str(cs.project_id))

        # Notify via WebSocket
        channel_layer = get_channel_layer()
        if channel_layer:
            try:
                group_name = f"planner_{str(cs.project.team_id)}_{str(cs.project_id)}"
                async_to_sync(channel_layer.group_send)(
                    group_name,
                    {
                        "type": "planner_message",
                        "message": {
                            "type": "changeset_approved",
                            "changeset_id": str(cs.id),
                            "project_id": str(cs.project_id),
                        }
                    }
                )
            except Exception:
                logger.exception("Failed to broadcast changeset approval notification")

        logger.info("approve_changeset_async: changeset %s approved successfully", changeset_id)
        return {"status": "approved", "changeset_id": changeset_id}

    except Exception as exc:
        logger.exception("approve_changeset_async failed for changeset %s", changeset_id)
        raise


@shared_task(name="planning.tasks.autonomous_schedule_auditor", bind=True)
def autonomous_schedule_auditor(self):
    """
    Continuous Auditing Loop:
    Checks all active projects for scheduling conflicts (e.g. dependency end_date > task start_date).
    Auto-corrects dates, publishes notifications, and pushes real-time WebSocket refreshes.
    """
    from .models import Project, Task, Notification
    from accounts.models import TeamMember
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    from datetime import timedelta

    projects = Project.objects.filter(status="active")
    channel_layer = get_channel_layer()
    healed_count = 0

    for project in projects:
        tasks = Task.objects.filter(project=project).prefetch_related("dependencies")
        project_healed = False

        for task in tasks:
            if not task.start_date or not task.end_date:
                continue

            latest_dep_end = None
            for dep in task.dependencies.all():
                if dep.end_date:
                    if not latest_dep_end or dep.end_date > latest_dep_end:
                        latest_dep_end = dep.end_date

            if latest_dep_end and task.start_date < latest_dep_end:
                # Conflict detected! Auto-heal: shift task schedule forward
                planned_duration = (task.end_date - task.start_date).days
                new_start = latest_dep_end + timedelta(days=1)
                new_end = new_start + timedelta(days=planned_duration)

                task.start_date = new_start
                task.end_date = new_end
                task.save()

                healed_count += 1
                project_healed = True

                # Generate conflict healed notifications for project members
                members = project.members.all()
                for member in members:
                    Notification.objects.create(
                        user=member.user,
                        team=project.team,
                        notification_type="conflict_detected",
                        title="Conflict Self-Healed",
                        message=f"Autonomous auditor shifted '{task.title}' start to {new_start} due to dependency timeline changes.",
                        link=f"/planner?project={project.id}"
                    )

        if project_healed and channel_layer:
            # Broadcast state change to all active WebSocket listeners
            try:
                group_name = f"planner_{str(project.team.id)}_{str(project.id)}"
                async_to_sync(channel_layer.group_send)(
                    group_name,
                    {
                        "type": "planner_message",
                        "message": {
                            "type": "state_change",
                            "reason": "Autonomous schedule auditor resolved conflicts."
                        }
                    }
                )
            except Exception:
                logger.exception("Failed to broadcast schedule healer state change")

    return {"healed_conflicts": healed_count}


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    max_retries=2,
)
def sync_task_to_calendar_async(self, task_id: str):
    """Async wrapper for Google Calendar sync on task create/update."""
    from .models import Task
    from .integration_hooks import sync_task_to_calendar

    try:
        task = Task.objects.select_related("project", "assignee", "project__team").get(id=task_id)
    except Task.DoesNotExist:
        logger.warning("sync_task_to_calendar_async: task %s not found", task_id)
        return

    try:
        result = sync_task_to_calendar(task)
        if result:
            logger.info("Calendar sync for task %s: %s", task_id, result.status)
    except Exception as exc:
        logger.exception("sync_task_to_calendar_async failed for task %s", task_id)
        raise


@shared_task
def daily_overdue_notifications():
    """Scan all teams for overdue tasks/milestones and create notifications."""
    from accounts.models import Team
    from .integration_hooks import scan_overdue_and_notify

    total = {"overdue_tasks": 0, "missed_milestones": 0, "due_today": 0}
    for team in Team.objects.all():
        try:
            counts = scan_overdue_and_notify(str(team.id))
            for key in total:
                total[key] += counts.get(key, 0)
        except Exception:
            logger.exception("Overdue scan failed for team %s", team.id)

    logger.info("Daily overdue scan complete: %s", total)
    return total


@shared_task
def milestone_approach_notifications():
    """Notify project members when milestones are 3 days away."""
    from accounts.models import Team
    from .integration_hooks import scan_milestone_approaching

    total = 0
    for team in Team.objects.all():
        try:
            total += scan_milestone_approaching(str(team.id))
        except Exception:
            logger.exception("Milestone approach scan failed for team %s", team.id)

    logger.info("Milestone approach scan complete: %d milestones", total)
    return total


@shared_task
def daily_task_digest():
    """Send Gmail daily digest to users with Google connected."""
    from integrations.models import UserIntegration
    from .integration_hooks import send_daily_digest

    sent = 0
    integrations = UserIntegration.objects.filter(
        provider="google", status="connected"
    ).select_related("user")

    for integration in integrations:
        try:
            if send_daily_digest(str(integration.user_id), str(integration.user.teams.first().id)):
                sent += 1
        except Exception:
            logger.exception("Daily digest failed for user %s", integration.user_id)

    logger.info("Daily digest sent to %d users", sent)
    return sent

