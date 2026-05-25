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

