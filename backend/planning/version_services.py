"""Plan versioning and changeset lifecycle."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from django.utils import timezone

from accounts.models import User
from planning.models import PlanChangeSet, PlanVersion, Project
from planning.serializers import ProjectDetailSerializer


def snapshot_project(project: Project) -> dict[str, Any]:
    data = ProjectDetailSerializer(project).data
    # Round-trip ensures JSONField compatibility (UUID, dates, nested M2M ids).
    return json.loads(json.dumps(data, default=str))


def create_plan_version(
    project: Project,
    *,
    user: User | None = None,
    source: str = "auto",
    parent_version: PlanVersion | None = None,
    prompt: str = "",
) -> PlanVersion:
    prompt_hash = ""
    if prompt:
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]
    return PlanVersion.objects.create(
        project=project,
        parent_version=parent_version,
        snapshot_data=snapshot_project(project),
        source=source,
        prompt_hash=prompt_hash,
        created_by=user,
    )


def create_changeset(
    project: Project,
    *,
    base_version: PlanVersion,
    mutations: list[dict[str, Any]],
    impact_summary: dict[str, Any],
    auto_applied: list[dict[str, Any]],
    pending_mutations: list[dict[str, Any]],
    user: User | None = None,
    remediation_preview: dict | None = None,
) -> PlanChangeSet:
    status = "pending" if pending_mutations else "approved"
    cs = PlanChangeSet.objects.create(
        project=project,
        base_version=base_version,
        status=status,
        mutations=mutations,
        impact_summary=impact_summary,
        auto_applied=auto_applied,
        pending_mutations=pending_mutations,
        remediation_preview=remediation_preview or {},
        created_by=user,
    )
    if not pending_mutations:
        cs.resolved_at = timezone.now()
        cs.save(update_fields=["resolved_at", "status"])
        create_plan_version(project, user=user, source="agent_applied", parent_version=base_version)
    return cs


def approve_changeset(changeset: PlanChangeSet, *, user: User | None = None) -> PlanChangeSet:
    from planning.plan_apply import apply_plan_mutations

    if changeset.status != "pending":
        raise ValueError(f"ChangeSet is not pending: {changeset.status}")

    project = changeset.project
    result = apply_plan_mutations(
        project,
        changeset.pending_mutations,
        actor=user,
        changeset=changeset,
        auto_apply_safe=True,
    )
    changeset.status = "approved"
    changeset.resolved_at = timezone.now()
    changeset.auto_applied = list(changeset.auto_applied or []) + result.get("applied", [])
    changeset.save(update_fields=["status", "resolved_at", "auto_applied"])

    create_plan_version(project, user=user, source="agent_applied", parent_version=changeset.base_version)
    return changeset


def reject_changeset(changeset: PlanChangeSet) -> PlanChangeSet:
    if changeset.status != "pending":
        raise ValueError(f"ChangeSet is not pending: {changeset.status}")
    changeset.status = "rejected"
    changeset.resolved_at = timezone.now()
    changeset.save(update_fields=["status", "resolved_at"])
    return changeset
