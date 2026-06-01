"""Event-driven agent triggers for planning changes."""

import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from planning.models import Task, Milestone

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Task)
def _capture_task_pre_state(sender, instance, **kwargs):
    """Stash pre-save state on the instance for post_save comparison."""
    if instance.pk:
        try:
            old = Task.objects.get(pk=instance.pk)
            instance._pre_assignee_id = old.assignee_id
            instance._pre_status = old.status
            instance._pre_start_date = old.start_date
            instance._pre_end_date = old.end_date
        except Task.DoesNotExist:
            instance._pre_assignee_id = None
            instance._pre_status = None
            instance._pre_start_date = None
            instance._pre_end_date = None
    else:
        instance._pre_assignee_id = None
        instance._pre_status = None
        instance._pre_start_date = None
        instance._pre_end_date = None


@receiver(post_save, sender=Task)
def on_task_save(sender, instance, created, **kwargs):
    """React to task creation and updates — integration hooks + existing logic."""
    team_id = str(instance.project.team_id)

    if created:
        from planning.integration_hooks import notify_task_assigned, sync_task_to_tracker
        from planning.models import ProjectIntegrationConfig

        notify_task_assigned(instance)

        try:
            config = ProjectIntegrationConfig.objects.get(project=instance.project)
            if config.auto_github_issues:
                sync_task_to_tracker(instance, "github")
            if config.auto_jira_issues:
                sync_task_to_tracker(instance, "jira")
            if config.auto_linear_issues:
                sync_task_to_tracker(instance, "linear")
        except ProjectIntegrationConfig.DoesNotExist:
            pass

        from planning.tasks import sync_task_to_calendar_async
        sync_task_to_calendar_async.delay(str(instance.id))
        return

    old_assignee_id = getattr(instance, "_pre_assignee_id", None)
    old_status = getattr(instance, "_pre_status", None)
    old_start = getattr(instance, "_pre_start_date", None)
    old_end = getattr(instance, "_pre_end_date", None)

    assignee_changed = old_assignee_id != instance.assignee_id
    status_changed = old_status and old_status != instance.status
    dates_changed = old_start != instance.start_date or old_end != instance.end_date

    if assignee_changed:
        from planning.integration_hooks import notify_task_assigned
        notify_task_assigned(instance, old_assignee_id=old_assignee_id)

    if assignee_changed or dates_changed:
        from planning.tasks import sync_task_to_calendar_async
        sync_task_to_calendar_async.delay(str(instance.id))

    if status_changed:
        from planning.integration_hooks import notify_slack_status_change
        notify_slack_status_change(instance, old_status, instance.status)

    if instance.status == "blocked":
        logger.info("Task '%s' blocked — consider blocker analysis", instance.title)
        from chat.background_agents import daily_team_health_check
        daily_team_health_check.delay(team_id)

    if instance.status == "completed":
        _check_milestone_completion(instance.project_id)


@receiver(post_save, sender=Milestone)
def on_milestone_save(sender, instance, created, **kwargs):
    """React to milestone creation/updates."""
    if created:
        from planning.models import ProjectIntegrationConfig, ProjectMember, Notification

        try:
            config = ProjectIntegrationConfig.objects.get(project=instance.project)
            if config.notify_on_milestone and instance.target_date:
                members = ProjectMember.objects.filter(
                    project=instance.project
                ).select_related("user")
                for member in members:
                    Notification.objects.create(
                        user=member.user,
                        team=instance.project.team,
                        notification_type="milestone_approaching",
                        title=f"New Milestone: {instance.title}",
                        message=f'Milestone "{instance.title}" added to "{instance.project.name}"'
                                + (f', target date: {instance.target_date}' if instance.target_date else ''),
                        link=f"/plan?project={instance.project_id}",
                    )
        except ProjectIntegrationConfig.DoesNotExist:
            pass


def _check_milestone_completion(project_id: str):
    """Check if all tasks for a milestone are done."""
    from planning.models import Project, Notification, ProjectMember
    try:
        project = Project.objects.get(id=project_id)
    except Project.DoesNotExist:
        return

    milestones = Milestone.objects.filter(project=project, status="pending")
    for milestone in milestones:
        tasks_before = Task.objects.filter(
            project=project,
            end_date__lte=milestone.target_date,
        )
        if tasks_before.exists() and not tasks_before.exclude(status="completed").exists():
            milestone.status = "reached"
            milestone.save(update_fields=["status"])
            logger.info("Milestone '%s' auto-reached", milestone.title)

            members = ProjectMember.objects.filter(project=project).select_related("user")
            for member in members:
                Notification.objects.create(
                    user=member.user,
                    team=project.team,
                    notification_type="milestone_reached",
                    title=f"Milestone Reached: {milestone.title}",
                    message=f'"{milestone.title}" in "{project.name}" has been reached.',
                    link=f"/plan?project={project_id}",
                )
