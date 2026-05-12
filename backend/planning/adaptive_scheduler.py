"""
Adaptive Scheduler.

Adjusts plan timelines based on actual team velocity, calculated from
historical task completion data. Stretches or compresses estimated dates
so plans reflect how fast the team actually works.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from django.db.models import Avg, F, ExpressionWrapper, DurationField
from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass
class VelocityMetrics:
    """Team velocity statistics."""
    avg_days_per_task: float
    avg_days_by_priority: dict[str, float]  # priority -> avg_days
    variance_days: float
    sample_size: int
    confidence: float  # 0-1, higher = more data

    @property
    def buffer_factor(self) -> float:
        """Buffer multiplier based on variance. More variance = more buffer."""
        if self.confidence < 0.3:
            return 1.5  # Low confidence, add 50% buffer
        if self.variance_days > 5:
            return 1.3
        if self.variance_days > 2:
            return 1.15
        return 1.0


def calculate_team_velocity(team_id: str) -> VelocityMetrics:
    """
    Analyze historical task completion rates for a team.

    Looks at completed tasks in the last 90 days and calculates
    average time from creation to completion.
    """
    from planning.models import Task

    cutoff = timezone.now() - timedelta(days=90)

    completed = Task.objects.filter(
        project__team_id=team_id,
        status="completed",
        updated_at__gte=cutoff,
    ).annotate(
        duration=ExpressionWrapper(
            F("updated_at") - F("created_at"),
            output_field=DurationField(),
        )
    )

    sample_size = completed.count()

    if sample_size < 3:
        return VelocityMetrics(
            avg_days_per_task=3.0,  # Default assumption
            avg_days_by_priority={"high": 2.0, "medium": 3.0, "low": 5.0},
            variance_days=2.0,
            sample_size=sample_size,
            confidence=0.1,
        )

    # Overall average
    avg_result = completed.aggregate(avg_duration=Avg("duration"))
    avg_duration = avg_result["avg_duration"]
    avg_days = avg_duration.total_seconds() / 86400 if avg_duration else 3.0

    # Per-priority averages
    priority_avgs: dict[str, float] = {}
    for priority in ["high", "medium", "low"]:
        p_result = completed.filter(priority=priority).aggregate(avg_duration=Avg("duration"))
        p_duration = p_result.get("avg_duration")
        priority_avgs[priority] = (p_duration.total_seconds() / 86400) if p_duration else avg_days

    # Variance calculation
    durations = []
    for t in completed[:50]:
        if hasattr(t, "duration") and t.duration:
            durations.append(t.duration.total_seconds() / 86400)

    variance = 0.0
    if len(durations) > 1:
        mean = sum(durations) / len(durations)
        variance = sum((d - mean) ** 2 for d in durations) / (len(durations) - 1)
        variance = variance ** 0.5  # standard deviation

    confidence = min(1.0, sample_size / 30)  # Full confidence at 30+ samples

    return VelocityMetrics(
        avg_days_per_task=avg_days,
        avg_days_by_priority=priority_avgs,
        variance_days=variance,
        sample_size=sample_size,
        confidence=confidence,
    )


def adjust_schedule(tasks: list[dict[str, Any]], team_id: str) -> list[dict[str, Any]]:
    """
    Adjust task dates based on team velocity.

    For tasks without dates: assign dates based on order and velocity.
    For tasks with dates: stretch/compress based on velocity vs. estimate.
    """
    if not tasks:
        return tasks

    velocity = calculate_team_velocity(team_id)

    today = datetime.now().date()
    current_date = today + timedelta(days=1)  # Start tomorrow

    for i, task in enumerate(tasks):
        priority = task.get("priority", "medium").lower()
        est_days = velocity.avg_days_by_priority.get(priority, velocity.avg_days_per_task)
        est_days = max(1, est_days * velocity.buffer_factor)

        start = task.get("startDate") or task.get("start_date")
        end = task.get("endDate") or task.get("end_date")

        if not start:
            # Assign start based on dependency chain or sequence
            deps = task.get("_inferred_deps", [])
            if deps:
                # Start after latest dependency ends
                latest_dep_end = current_date
                for dep_idx in deps:
                    if dep_idx < len(tasks):
                        dep_end = tasks[dep_idx].get("endDate") or tasks[dep_idx].get("end_date")
                        if dep_end:
                            try:
                                dep_end_date = datetime.strptime(str(dep_end), "%Y-%m-%d").date()
                                if dep_end_date > latest_dep_end:
                                    latest_dep_end = dep_end_date
                            except (ValueError, TypeError):
                                pass
                task["startDate"] = str(latest_dep_end + timedelta(days=1))
            else:
                task["startDate"] = str(current_date)

        if not end:
            try:
                start_date = datetime.strptime(str(task["startDate"]), "%Y-%m-%d").date()
            except (ValueError, TypeError, KeyError):
                start_date = current_date

            end_date = start_date + timedelta(days=int(est_days))
            task["endDate"] = str(end_date)
            current_date = end_date
        else:
            # Validate existing estimate vs velocity
            try:
                start_date = datetime.strptime(str(task.get("startDate", start)), "%Y-%m-%d").date()
                end_date = datetime.strptime(str(end), "%Y-%m-%d").date()
                planned_days = (end_date - start_date).days

                if planned_days < est_days * 0.5:
                    # Unrealistically short — extend
                    new_end = start_date + timedelta(days=int(est_days))
                    task["endDate"] = str(new_end)
                    task["_schedule_note"] = f"Extended from {planned_days}d to {int(est_days)}d based on team velocity"
                elif planned_days > est_days * 3:
                    # Unrealistically long — compress slightly
                    compressed = int(est_days * 2)
                    new_end = start_date + timedelta(days=compressed)
                    task["endDate"] = str(new_end)
                    task["_schedule_note"] = f"Compressed from {planned_days}d to {compressed}d based on team velocity"

                current_date = max(current_date, datetime.strptime(task["endDate"], "%Y-%m-%d").date())
            except (ValueError, TypeError):
                pass

    return tasks
