"""Event-driven agent triggers for planning changes."""

import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from planning.models import Task, Milestone

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Task)
def on_task_status_change(sender, instance, created, **kwargs):
    """React to task status changes."""
    if created:
        return

    team_id = str(instance.project.team_id)

    if instance.status == "blocked":
        logger.info("Task '%s' blocked — consider blocker analysis", instance.title)
        from chat.background_agents import daily_team_health_check
        daily_team_health_check.delay(team_id)

    if instance.status == "completed":
        _check_milestone_completion(instance.project_id)


def _check_milestone_completion(project_id: str):
    """Check if all tasks for a milestone are done."""
    from planning.models import Project
    try:
        project = Project.objects.get(id=project_id)
    except Project.DoesNotExist:
        return

    milestones = Milestone.objects.filter(project=project, status="pending")
    for milestone in milestones:
        # Check if all tasks before this milestone are completed
        tasks_before = Task.objects.filter(
            project=project,
            end_date__lte=milestone.target_date,
        )
        if tasks_before.exists() and not tasks_before.exclude(status="completed").exists():
            milestone.status = "reached"
            milestone.save(update_fields=["status"])
            logger.info("Milestone '%s' auto-reached", milestone.title)
