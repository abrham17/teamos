"""Apply validated plan mutations with event sourcing."""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

from accounts.models import User
from planning.models import Milestone, PlanChangeSet, PlanEvent, Project, Task
from planning.mutations import normalize_op
from planning.reconciliation import resolve_milestone, resolve_task
from planning.semantic_utils import compute_semantic_key, entity_text_for_embedding
from planning.services import (
    broadcast_project_update,
    create_milestone,
    create_task,
    delete_milestone,
    delete_task,
    patch_milestone,
    patch_task,
    record_plan_event,
    update_project,
)

logger = logging.getLogger(__name__)


def _maybe_embed_task(task: Task) -> None:
    text = entity_text_for_embedding(task.title, task.description)
    if not text:
        return
    try:
        from ingest.vectors import vector_store

        emb = vector_store._get_embedding(text)
        if emb:
            task.title_embedding = emb
            task.save(update_fields=["title_embedding"])
    except Exception:
        logger.exception("Failed to embed task %s", task.id)


def apply_plan_mutations(
    project: Project,
    mutations: list[dict[str, Any]],
    *,
    actor: User | None = None,
    changeset: PlanChangeSet | None = None,
    auto_apply_safe: bool = True,
) -> dict[str, Any]:
    applied: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    errors: list[str] = []

    with transaction.atomic():
        for raw in mutations:
            op = normalize_op(raw)
            try:
                result = _apply_single(project, op, actor=actor, changeset=changeset)
                if result:
                    applied.append(result)
                else:
                    skipped.append(op)
            except Exception as exc:
                logger.exception("Failed to apply mutation %s", op)
                errors.append(str(exc))
                skipped.append(op)

    if applied:
        broadcast_project_update(project, "plan_mutations_applied")

    return {"applied": applied, "skipped": skipped, "errors": errors}


def _apply_single(
    project: Project,
    op: dict[str, Any],
    *,
    actor: User | None,
    changeset: PlanChangeSet | None,
) -> dict[str, Any] | None:
    operation = op.get("op")
    entity_type = op.get("entity_type")

    if operation == "update_project":
        fields = op.get("fields") or {}
        if fields:
            update_project(project, fields)
            record_plan_event(
                project=project,
                entity_type="project",
                entity_id=project.id,
                event_type="project_updated",
                payload=fields,
                changeset=changeset,
                actor=actor,
            )
        return {"op": operation, "entity_id": str(project.id)}

    if operation == "create":
        fields = dict(op.get("fields") or {})
        sk = op.get("semantic_key") or op.get("semanticKey") or compute_semantic_key(
            title=fields.get("title", "Untitled")
        )
        fields["semantic_key"] = sk
        if entity_type == "milestone":
            milestone = create_milestone(project=project, user=actor, payload=fields)
            record_plan_event(
                project=project,
                entity_type="milestone",
                entity_id=milestone.id,
                event_type="milestone_created",
                payload=fields,
                changeset=changeset,
                actor=actor,
            )
            return {"op": operation, "entity_type": "milestone", "entity_id": str(milestone.id)}
        deps = fields.pop("dependency_ids", None) or op.get("depends_on")
        task = create_task(project=project, user=actor, payload=fields)
        if deps:
            task.dependencies.set([d for d in deps if d])
        _maybe_embed_task(task)
        record_plan_event(
            project=project,
            entity_type="task",
            entity_id=task.id,
            event_type="task_created",
            payload=fields,
            changeset=changeset,
            actor=actor,
        )
        return {"op": operation, "entity_type": "task", "entity_id": str(task.id)}

    if operation == "delete":
        if entity_type == "milestone":
            match = resolve_milestone(project, op)
            if not match.entity:
                return None
            eid = match.entity.id
            delete_milestone(match.entity)
            record_plan_event(
                project=project,
                entity_type="milestone",
                entity_id=eid,
                event_type="milestone_deleted",
                payload={"id": str(eid)},
                changeset=changeset,
                actor=actor,
            )
            return {"op": operation, "entity_type": "milestone", "entity_id": str(eid)}
        match = resolve_task(project, op)
        if not match.entity:
            return None
        eid = match.entity.id
        delete_task(match.entity)
        record_plan_event(
            project=project,
            entity_type="task",
            entity_id=eid,
            event_type="task_deleted",
            payload={"id": str(eid)},
            changeset=changeset,
            actor=actor,
        )
        return {"op": operation, "entity_type": "task", "entity_id": str(eid)}

    if operation == "set_dependencies":
        task_id = str(op.get("task_id") or op.get("id") or "")
        depends_on = [str(d) for d in (op.get("depends_on") or op.get("dependency_ids") or [])]
        task = Task.objects.filter(project=project, id=task_id).first()
        if not task:
            return None
        task.dependencies.set(depends_on)
        record_plan_event(
            project=project,
            entity_type="dependency",
            entity_id=task.id,
            event_type="dependency_changed",
            payload={"task_id": task_id, "depends_on": depends_on},
            changeset=changeset,
            actor=actor,
        )
        return {"op": operation, "entity_id": task_id, "depends_on": depends_on}

    if operation == "update":
        fields = dict(op.get("fields") or {})
        if entity_type == "milestone":
            match = resolve_milestone(project, op)
            if not match.entity:
                return None
            patch_milestone(match.entity, fields, actor=actor, respect_locks=True)
            record_plan_event(
                project=project,
                entity_type="milestone",
                entity_id=match.entity.id,
                event_type="milestone_updated",
                payload=fields,
                changeset=changeset,
                actor=actor,
            )
            return {"op": operation, "entity_type": "milestone", "entity_id": str(match.entity.id)}
        match = resolve_task(project, op)
        if not match.entity:
            return None
        patch_task(match.entity, fields, actor=actor, respect_locks=True)
        if "title" in fields or "description" in fields:
            _maybe_embed_task(match.entity)
        record_plan_event(
            project=project,
            entity_type="task",
            entity_id=match.entity.id,
            event_type="task_updated",
            payload=fields,
            changeset=changeset,
            actor=actor,
        )
        return {"op": operation, "entity_type": "task", "entity_id": str(match.entity.id)}

    return None
