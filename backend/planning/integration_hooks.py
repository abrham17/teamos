"""
Seamless integration hooks for the planning canvas.

These functions are called from Django signals and Celery tasks to
automatically sync planning state to external services (Google Calendar,
Slack, GitHub, Jira, Linear) and create in-app notifications.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from django.utils import timezone

logger = logging.getLogger(__name__)


def sync_task_to_calendar(task) -> dict[str, Any] | None:
    """
    When a task is assigned with dates, auto-create/update a Google Calendar
    event for the assignee. Returns the IntegrationAction or None.
    """
    from planning.models import IntegrationAction, ProjectIntegrationConfig

    if not task.assignee or not task.start_date or not task.end_date:
        return None

    try:
        config = ProjectIntegrationConfig.objects.get(project=task.project)
        if not config.auto_calendar_sync:
            return None
    except ProjectIntegrationConfig.DoesNotExist:
        return None

    existing = IntegrationAction.objects.filter(
        entity_type="task",
        entity_id=task.id,
        action="calendar_create",
    ).first()

    summary = f"[{task.project.name}] {task.title}"
    start_iso = f"{task.start_date.isoformat()}T09:00:00"
    end_iso = f"{task.end_date.isoformat()}T17:00:00"
    description = (
        f"Project: {task.project.name}\n"
        f"Status: {task.status}\n"
        f"Priority: {task.priority}\n"
        f"{task.description or ''}"
    )

    if existing and existing.status == "success" and existing.external_ref:
        from integrations.tool_executor import execute_external_tool

        result = execute_external_tool(
            str(task.assignee_id),
            "ext_google_calendar_update_event",
            {
                "event_id": existing.external_ref,
                "summary": summary,
                "start": start_iso,
                "end": end_iso,
                "description": description,
            },
        )
        if result.get("ok"):
            IntegrationAction.objects.filter(id=existing.id).update(
                action="calendar_update", status="success"
            )
        return existing

    if existing:
        return existing

    from integrations.tool_executor import execute_external_tool

    result = execute_external_tool(
        str(task.assignee_id),
        "ext_google_calendar_create_event",
        {
            "summary": summary,
            "start": start_iso,
            "end": end_iso,
            "description": description,
        },
    )

    event_id = ""
    status = "failed"
    error_msg = ""
    if result.get("ok"):
        event_id = str(result.get("result", {}).get("id", ""))
        status = "success"
    else:
        error_msg = result.get("error", "Unknown error")[:500]

    action = IntegrationAction.objects.create(
        project=task.project,
        entity_type="task",
        entity_id=task.id,
        action="calendar_create",
        provider="google",
        external_ref=event_id,
        status=status,
        error_message=error_msg,
    )
    return action


def notify_task_assigned(task, old_assignee_id=None) -> None:
    """Create an in-app notification when a task is assigned."""
    from planning.models import Notification, ProjectIntegrationConfig

    if not task.assignee:
        return
    if old_assignee_id and str(old_assignee_id) == str(task.assignee_id):
        return

    try:
        config = ProjectIntegrationConfig.objects.get(project=task.project)
        if not config.notify_on_assign:
            return
    except ProjectIntegrationConfig.DoesNotExist:
        pass

    Notification.objects.create(
        user=task.assignee,
        team=task.project.team,
        notification_type="task_assigned",
        title="Task Assigned",
        message=f'You\'ve been assigned to "{task.title}" in project "{task.project.name}".',
        link=f"/plan?project={task.project_id}",
    )


def notify_slack_status_change(task, old_status: str, new_status: str) -> None:
    """Post to Slack when a task status changes."""
    from planning.models import ProjectIntegrationConfig

    if old_status == new_status:
        return

    try:
        config = ProjectIntegrationConfig.objects.get(project=task.project)
        if not config.auto_slack_notify or not config.slack_channel:
            return
    except ProjectIntegrationConfig.DoesNotExist:
        return

    emoji_map = {
        "completed": ":white_check_mark:",
        "blocked": ":no_entry:",
        "in-progress": ":construction:",
        "todo": ":clipboard:",
    }
    emoji = emoji_map.get(new_status, ":arrows_counterclockwise:")
    text = (
        f'{emoji} *{task.title}* marked as *{new_status}*\n'
        f'Project: {task.project.name}'
    )
    if task.assignee:
        text += f' | Assignee: {task.assignee.get_full_name() or task.assignee.email}'

    from integrations.tool_executor import execute_external_tool

    created_by_id = task.created_by_id or task.project.created_by_id
    if not created_by_id:
        return

    execute_external_tool(
        str(created_by_id),
        "ext_slack_send_message",
        {"channel": config.slack_channel, "text": text},
    )


def sync_task_to_tracker(task, provider: str) -> dict[str, Any] | None:
    """
    Auto-create an issue in the configured tracker (GitHub, Jira, Linear)
    when a task is created.
    """
    from planning.models import IntegrationAction, ProjectIntegrationConfig

    try:
        config = ProjectIntegrationConfig.objects.get(project=task.project)
    except ProjectIntegrationConfig.DoesNotExist:
        return None

    existing = IntegrationAction.objects.filter(
        entity_type="task",
        entity_id=task.id,
        action=f"{provider}_issue",
    ).first()
    if existing:
        return existing

    created_by_id = task.created_by_id or task.project.created_by_id
    if not created_by_id:
        return None

    from integrations.tool_executor import execute_external_tool

    tool_name = None
    arguments = {}

    if provider == "github" and config.auto_github_issues and config.github_repo:
        parts = config.github_repo.split("/")
        if len(parts) == 2:
            tool_name = "ext_github_create_issue"
            arguments = {
                "owner": parts[0],
                "repo": parts[1],
                "title": task.title,
                "body": task.description or "",
                "labels": [f"P-{task.priority}"],
            }
    elif provider == "jira" and config.auto_jira_issues and config.jira_project_key:
        tool_name = "ext_jira_create_issue"
        arguments = {
            "project_key": config.jira_project_key,
            "summary": task.title,
            "description": task.description or "",
            "issue_type": "Task",
        }
    elif provider == "linear" and config.auto_linear_issues and config.linear_team_id:
        tool_name = "ext_linear_create_issue"
        arguments = {
            "team_id": config.linear_team_id,
            "title": task.title,
            "description": task.description or "",
        }

    if not tool_name:
        return None

    result = execute_external_tool(str(created_by_id), tool_name, arguments)

    external_ref = ""
    status = "failed"
    error_msg = ""
    if result.get("ok"):
        res_data = result.get("result", {})
        external_ref = str(res_data.get("url", "") or res_data.get("key", "") or res_data.get("id", ""))
        status = "success"
    else:
        error_msg = result.get("error", "Unknown error")[:500]

    return IntegrationAction.objects.create(
        project=task.project,
        entity_type="task",
        entity_id=task.id,
        action=f"{provider}_issue",
        provider=provider,
        external_ref=external_ref,
        status=status,
        error_message=error_msg,
    )


def scan_overdue_and_notify(team_id: str) -> dict[str, int]:
    """
    Scan all active projects for overdue tasks and missed milestones.
    Create Notification records for assignees and project members.
    """
    from planning.models import Notification, Task, Milestone, ProjectMember

    today = date.today()
    counts = {"overdue_tasks": 0, "missed_milestones": 0, "due_today": 0}

    overdue_tasks = Task.objects.filter(
        project__team_id=team_id,
        end_date__lt=today,
        status__in=["todo", "in-progress"],
    ).select_related("project", "assignee", "project__team")

    for task in overdue_tasks:
        if not task.assignee:
            continue
        already_notified = Notification.objects.filter(
            user=task.assignee,
            team_id=team_id,
            notification_type="task_overdue",
            title__contains=task.title,
            created_at__date=today,
        ).exists()
        if already_notified:
            continue

        days_overdue = (today - task.end_date).days
        Notification.objects.create(
            user=task.assignee,
            team=task.project.team,
            notification_type="task_overdue",
            title=f"Task Overdue: {task.title}",
            message=f'"{task.title}" in "{task.project.name}" is {days_overdue} day{"s" if days_overdue != 1 else ""} overdue.',
            link=f"/plan?project={task.project_id}",
        )
        counts["overdue_tasks"] += 1

    due_today_tasks = Task.objects.filter(
        project__team_id=team_id,
        end_date=today,
        status__in=["todo", "in-progress"],
    ).select_related("project", "assignee", "project__team")

    for task in due_today_tasks:
        if not task.assignee:
            continue
        already = Notification.objects.filter(
            user=task.assignee,
            team_id=team_id,
            notification_type="task_due_today",
            title__contains=task.title,
            created_at__date=today,
        ).exists()
        if already:
            continue

        Notification.objects.create(
            user=task.assignee,
            team=task.project.team,
            notification_type="task_due_today",
            title=f"Due Today: {task.title}",
            message=f'"{task.title}" in "{task.project.name}" is due today.',
            link=f"/plan?project={task.project_id}",
        )
        counts["due_today"] += 1

    missed_milestones = Milestone.objects.filter(
        project__team_id=team_id,
        target_date__lt=today,
        status="pending",
    ).select_related("project", "project__team")

    for milestone in missed_milestones:
        members = ProjectMember.objects.filter(
            project=milestone.project
        ).select_related("user")
        for member in members:
            already = Notification.objects.filter(
                user=member.user,
                team_id=team_id,
                notification_type="milestone_missed",
                title__contains=milestone.title,
                created_at__date=today,
            ).exists()
            if already:
                continue

            days_missed = (today - milestone.target_date).days
            Notification.objects.create(
                user=member.user,
                team=milestone.project.team,
                notification_type="milestone_missed",
                title=f"Milestone Missed: {milestone.title}",
                message=f'"{milestone.title}" in "{milestone.project.name}" was due {days_missed} day{"s" if days_missed != 1 else ""} ago.',
                link=f"/plan?project={milestone.project_id}",
            )
        counts["missed_milestones"] += 1

    return counts


def scan_milestone_approaching(team_id: str) -> int:
    """Notify project members when milestones are 3 days away."""
    from planning.models import Notification, Milestone, ProjectMember

    today = date.today()
    threshold = today + timedelta(days=3)
    count = 0

    approaching = Milestone.objects.filter(
        project__team_id=team_id,
        target_date__gte=today,
        target_date__lte=threshold,
        status="pending",
    ).select_related("project", "project__team")

    for milestone in approaching:
        days_until = (milestone.target_date - today).days
        members = ProjectMember.objects.filter(
            project=milestone.project
        ).select_related("user")

        for member in members:
            already = Notification.objects.filter(
                user=member.user,
                team_id=team_id,
                notification_type="milestone_approaching",
                title__contains=milestone.title,
                created_at__date=today,
            ).exists()
            if already:
                continue

            Notification.objects.create(
                user=member.user,
                team=milestone.project.team,
                notification_type="milestone_approaching",
                title=f"Milestone in {days_until} days: {milestone.title}",
                message=f'"{milestone.title}" in "{milestone.project.name}" is due in {days_until} day{"s" if days_until != 1 else ""}.',
                link=f"/plan?project={milestone.project_id}",
            )
        count += 1

    return count


def send_daily_digest(user_id: str, team_id: str) -> bool:
    """
    Send a Gmail daily digest to a user with Google connected.
    Includes today's tasks, overdue items, and upcoming milestones.
    """
    from planning.models import Task, Milestone

    today = date.today()
    tomorrow = today + timedelta(days=1)
    week_out = today + timedelta(days=7)

    tasks_today = Task.objects.filter(
        project__team_id=team_id,
        assignee_id=user_id,
        end_date=today,
        status__in=["todo", "in-progress"],
    ).select_related("project")

    overdue = Task.objects.filter(
        project__team_id=team_id,
        assignee_id=user_id,
        end_date__lt=today,
        status__in=["todo", "in-progress"],
    ).select_related("project")

    milestones_soon = Milestone.objects.filter(
        project__team_id=team_id,
        target_date__gte=tomorrow,
        target_date__lte=week_out,
        status="pending",
    ).select_related("project")

    if not tasks_today and not overdue and not milestones_soon:
        return False

    lines = [f"Your TeamOS Daily Digest — {today.strftime('%B %d, %Y')}", ""]

    if tasks_today:
        lines.append(f"Today's Tasks ({len(tasks_today)}):")
        for t in tasks_today:
            lines.append(f"  • {t.title} ({t.project.name}) — {t.status}")
        lines.append("")

    if overdue:
        lines.append(f"Overdue ({len(overdue)}):")
        for t in overdue:
            days = (today - t.end_date).days
            lines.append(f"  • {t.title} ({t.project.name}) — {days} day{'s' if days != 1 else ''} overdue")
        lines.append("")

    if milestones_soon:
        lines.append("Upcoming Milestones:")
        for m in milestones_soon:
            days = (m.target_date - today).days
            lines.append(f"  • {m.title} ({m.project.name}) — {m.target_date} ({days} days)")

    body = "\n".join(lines)

    from integrations.models import UserIntegration
    try:
        integration = UserIntegration.objects.get(
            user_id=user_id, provider="google", status="connected"
        )
    except UserIntegration.DoesNotExist:
        return False

    from integrations.tool_executor import execute_external_tool

    result = execute_external_tool(
        user_id,
        "ext_google_gmail_send_email",
        {
            "to": integration.external_email or "",
            "subject": f"Your TeamOS Daily Digest — {today.strftime('%B %d, %Y')}",
            "body": body,
        },
    )
    return result.get("ok", False)
