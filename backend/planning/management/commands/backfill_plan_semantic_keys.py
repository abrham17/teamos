"""Backfill semantic_key on tasks/milestones and seed PlanVersion from snapshots."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from planning.models import Milestone, PlanSnapshot, PlanVersion, Project, Task
from planning.semantic_utils import compute_semantic_key
from planning.version_services import create_plan_version, snapshot_project


class Command(BaseCommand):
    help = "Backfill semantic_key fields and create initial PlanVersion rows."

    def handle(self, *args, **options):
        task_count = 0
        for task in Task.objects.filter(semantic_key="").iterator():
            task.semantic_key = compute_semantic_key(title=task.title)
            task.save(update_fields=["semantic_key"])
            task_count += 1

        ms_count = 0
        for ms in Milestone.objects.filter(semantic_key="").iterator():
            ms.semantic_key = compute_semantic_key(title=ms.title)
            ms.save(update_fields=["semantic_key"])
            ms_count += 1

        version_count = 0
        for project in Project.objects.all().iterator():
            if PlanVersion.objects.filter(project=project).exists():
                continue
            latest_snapshot = PlanSnapshot.objects.filter(project=project).order_by("-created_at").first()
            if latest_snapshot:
                PlanVersion.objects.create(
                    project=project,
                    snapshot_data=latest_snapshot.data,
                    source="auto",
                    created_by=latest_snapshot.created_by,
                )
            else:
                create_plan_version(project, source="manual")
            version_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Backfilled {task_count} tasks, {ms_count} milestones, {version_count} plan versions."
            )
        )
