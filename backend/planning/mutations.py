"""Plan mutation schema, validation, and impact analysis."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from planning.field_policy import mutation_requires_approval
from planning.models import Milestone, Project, Task


@dataclass
class MutationValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    impact_summary: dict[str, Any] = field(default_factory=dict)


def normalize_op(raw: dict[str, Any]) -> dict[str, Any]:
    op = dict(raw)
    op["op"] = str(op.get("op") or "").lower()
    op["entity_type"] = str(op.get("entity_type") or "task").lower()
    if op["op"] == "set_dependencies":
        op["entity_type"] = "dependency"
    return op


def _task_ids(project: Project) -> set[str]:
    return {str(t.id) for t in project.tasks.all()}


def _detect_dependency_cycle(project: Project, proposed_edges: list[tuple[str, str]]) -> list[str]:
    """DFS cycle detection on task dependency graph including proposed edges."""
    graph: dict[str, list[str]] = {tid: [] for tid in _task_ids(project)}
    for task in project.tasks.prefetch_related("dependencies").all():
        graph[str(task.id)] = [str(d.id) for d in task.dependencies.all()]

    for downstream, upstream in proposed_edges:
        if downstream in graph:
            if upstream not in graph[downstream]:
                graph[downstream].append(upstream)

    errors: list[str] = []
    visiting: set[str] = set()
    visited: set[str] = set()

    def dfs(node: str, stack: list[str]) -> None:
        if node in visiting:
            errors.append(f"Dependency cycle detected involving task {node}")
            return
        if node in visited:
            return
        visiting.add(node)
        for dep in graph.get(node, []):
            dfs(dep, stack + [dep])
        visiting.remove(node)
        visited.add(node)

    for node in graph:
        dfs(node, [])
    return errors


def compute_impact_summary(project: Project, mutations: list[dict[str, Any]]) -> dict[str, Any]:
    task_ids = set()
    milestone_ids = set()
    dep_changes = 0
    destructive = 0
    creates = 0

    for op in mutations:
        operation = op.get("op")
        if operation == "delete":
            destructive += 1
        elif operation == "create":
            creates += 1
        elif operation == "set_dependencies":
            dep_changes += 1
        eid = op.get("id") or op.get("task_id")
        if eid:
            if op.get("entity_type") == "milestone":
                milestone_ids.add(str(eid))
            else:
                task_ids.add(str(eid))

    return {
        "task_count": len(task_ids),
        "milestone_count": len(milestone_ids),
        "dependency_changes": dep_changes,
        "destructive_ops": destructive,
        "create_ops": creates,
        "total_ops": len(mutations),
    }


def validate_mutations(project: Project, raw_mutations: list[dict[str, Any]]) -> MutationValidationResult:
    errors: list[str] = []
    warnings: list[str] = []
    mutations = [normalize_op(m) for m in raw_mutations if isinstance(m, dict)]

    known_task_ids = _task_ids(project)
    known_ms_ids = {str(m.id) for m in project.milestones.all()}
    proposed_dep_edges: list[tuple[str, str]] = []

    for idx, op in enumerate(mutations):
        operation = op.get("op")
        if operation not in {
            "create",
            "update",
            "delete",
            "set_dependencies",
            "update_project",
        }:
            errors.append(f"Mutation {idx}: unsupported op '{operation}'")
            continue

        entity_type = op.get("entity_type")
        eid = str(op.get("id") or op.get("task_id") or op.get("milestone_id") or "")

        if operation in {"update", "delete"} and entity_type == "task" and eid and eid not in known_task_ids:
            errors.append(f"Mutation {idx}: unknown task id {eid}")
        if operation in {"update", "delete"} and entity_type == "milestone" and eid and eid not in known_ms_ids:
            errors.append(f"Mutation {idx}: unknown milestone id {eid}")

        if operation == "set_dependencies":
            task_id = str(op.get("task_id") or op.get("id") or "")
            depends_on = [str(d) for d in (op.get("depends_on") or op.get("dependency_ids") or [])]
            if task_id and task_id not in known_task_ids:
                errors.append(f"Mutation {idx}: unknown task id {task_id} for dependencies")
            for dep_id in depends_on:
                if dep_id not in known_task_ids:
                    errors.append(f"Mutation {idx}: unknown dependency target {dep_id}")
                if dep_id == task_id:
                    errors.append(f"Mutation {idx}: task cannot depend on itself")
            for dep_id in depends_on:
                proposed_dep_edges.append((task_id, dep_id))

        if operation == "create" and not (op.get("fields") or op.get("semantic_key")):
            warnings.append(f"Mutation {idx}: create without fields or semantic_key")

    cycle_errors = _detect_dependency_cycle(project, proposed_dep_edges)
    errors.extend(cycle_errors)

    impact = compute_impact_summary(project, mutations)
    tasks_by_id = {str(t.id): t for t in project.tasks.all()}
    ms_by_id = {str(m.id): m for m in project.milestones.all()}
    auto_count = 0
    pending_count = 0
    for m in mutations:
        existing = None
        eid = str(m.get("id") or "")
        if m.get("entity_type") == "milestone":
            existing = ms_by_id.get(eid)
        else:
            existing = tasks_by_id.get(eid)
        if mutation_requires_approval(m, existing_entity=existing):
            pending_count += 1
        else:
            auto_count += 1
    impact["auto_apply_count"] = auto_count
    impact["pending_approval_count"] = pending_count

    return MutationValidationResult(
        ok=not errors,
        errors=errors,
        warnings=warnings,
        impact_summary=impact,
    )


def split_mutations_by_policy(
    project: Project,
    mutations: list[dict[str, Any]],
    *,
    auto_apply_safe: bool = True,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    auto_ops: list[dict[str, Any]] = []
    pending_ops: list[dict[str, Any]] = []

    tasks_by_id = {str(t.id): t for t in project.tasks.all()}
    ms_by_id = {str(m.id): m for m in project.milestones.all()}

    for raw in mutations:
        op = normalize_op(raw)
        entity_type = op.get("entity_type")
        eid = str(op.get("id") or "")
        existing = tasks_by_id.get(eid) if entity_type == "task" else ms_by_id.get(eid)

        if not auto_apply_safe or mutation_requires_approval(op, existing_entity=existing):
            if op.get("op") == "update" and auto_apply_safe:
                fields = op.get("fields") or {}
                from planning.field_policy import split_mutation_fields

                auto_fields, pending_fields = split_mutation_fields(
                    entity_type, fields, existing_entity=existing, auto_apply_safe=True
                )
                if auto_fields:
                    auto_ops.append({**op, "fields": auto_fields})
                if pending_fields:
                    pending_ops.append({**op, "fields": pending_fields})
            else:
                pending_ops.append(op)
            continue

        auto_ops.append(op)

    return auto_ops, pending_ops
