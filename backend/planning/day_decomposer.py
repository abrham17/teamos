import logging
from datetime import timedelta, datetime
from django.db import transaction
from django.utils import timezone
from .models import Task, Project
from llm_orchestrator.orchestrator import llm_json_call

logger = logging.getLogger(__name__)

def decompose_task_daily(team_id: str, project_id: str, task_id: str, user) -> list[Task]:
    """
    Decompose a large task spanning multiple days into day-by-day individual sub-tasks
    scheduled sequentially across its date range.
    """
    # 1. Fetch main task
    try:
        main_task = Task.objects.get(project__team_id=team_id, project_id=project_id, id=task_id)
    except Task.DoesNotExist:
        raise ValueError("Task not found.")

    if not main_task.start_date or not main_task.end_date:
        raise ValueError("Main task must have both start_date and end_date to decompose daily.")

    start_date = main_task.start_date
    end_date = main_task.end_date

    # 2. Generate date range list
    days_count = (end_date - start_date).days + 1
    if days_count < 1:
        raise ValueError("Invalid task date range.")
    if days_count > 14:
        raise ValueError("Daily decomposition is capped at 14 days to prevent plan bloat.")

    dates = [start_date + timedelta(days=i) for i in range(days_count)]

    # 3. Call LLM to generate daily objectives
    dates_str = [d.strftime("%Y-%m-%d") for d in dates]
    prompt = (
        "You are the TeamOS Day-by-Day Task Decomposer.\n"
        "Your goal is to break down a main project task into highly specific daily sub-tasks.\n"
        "Generate exactly ONE sub-task title and description for each calendar day listed below.\n\n"
        f"Main Task: {main_task.title}\n"
        f"Description: {main_task.description or 'No description provided.'}\n"
        f"Assigned Dates: {dates_str[0]} to {dates_str[-1]} ({days_count} days total)\n"
        f"Specific dates to decompose: {', '.join(dates_str)}\n\n"
        "RULES:\n"
        "- Sub-tasks must be sequentially progressive (Day 1 sets up Day 2, etc.).\n"
        "- Task titles must be highly technical and specific, not generic.\n"
        "- Make sure to generate exactly one sub-task per date.\n\n"
        "Return JSON only in this format:\n"
        "{\n"
        "  \"subtasks\": [\n"
        "    { \"title\": \"Day 1: ...\", \"description\": \"...\", \"date\": \"YYYY-MM-DD\" },\n"
        "    ...\n"
        "  ]\n"
        "}"
    )

    try:
        result = llm_json_call(
            team=main_task.project.team,
            operation="day_decompose",
            messages=[{"role": "user", "content": prompt}],
            default_on_error={"subtasks": []}
        )
    except Exception as e:
        logger.exception("Failed to call LLM for daily task decomposition")
        raise ValueError(f"Decomposition LLM call failed: {str(e)}")

    subtasks_data = result.get("subtasks", [])
    created_subtasks = []

    # 4. Atomic database creations
    with transaction.atomic():
        # Clear existing daily sub-tasks to prevent duplication if re-decomposing
        Task.objects.filter(parent_task=main_task).delete()

        for idx, item in enumerate(subtasks_data):
            try:
                task_date_str = item.get("date")
                task_date = datetime.strptime(task_date_str, "%Y-%m-%d").date()
            except (ValueError, TypeError):
                # Fallback to list index date if LLM returned bad format
                task_date = dates[min(idx, len(dates) - 1)]

            subtask = Task.objects.create(
                project=main_task.project,
                title=item.get("title", f"Daily Objective - {task_date}"),
                description=item.get("description", ""),
                status="todo",
                priority=main_task.priority,
                assignee=main_task.assignee,
                start_date=task_date,
                end_date=task_date,
                parent_task=main_task,
                order_index=main_task.order_index * 100 + idx,
                created_by=user
            )
            created_subtasks.append(subtask)

    return created_subtasks
