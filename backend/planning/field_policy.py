"""Field-level ownership rules for AI vs human plan mutations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any


@dataclass(frozen=True)
class FieldRule:
    ai_editable: bool = True
    requires_approval: bool = False
    approval_if_date_delta_days: int | None = None


TASK_FIELD_POLICY: dict[str, FieldRule] = {
    "title": FieldRule(ai_editable=True, requires_approval=True),
    "description": FieldRule(ai_editable=True, requires_approval=False),
    "status": FieldRule(ai_editable=False, requires_approval=True),
    "priority": FieldRule(ai_editable=False, requires_approval=True),
    "assignee_id": FieldRule(ai_editable=False, requires_approval=True),
    "start_date": FieldRule(ai_editable=True, requires_approval=False, approval_if_date_delta_days=3),
    "end_date": FieldRule(ai_editable=True, requires_approval=False, approval_if_date_delta_days=3),
    "order_index": FieldRule(ai_editable=True, requires_approval=False),
    "parent_task_id": FieldRule(ai_editable=False, requires_approval=True),
}

MILESTONE_FIELD_POLICY: dict[str, FieldRule] = {
    "title": FieldRule(ai_editable=True, requires_approval=True),
    "description": FieldRule(ai_editable=True, requires_approval=False),
    "status": FieldRule(ai_editable=False, requires_approval=True),
    "target_date": FieldRule(ai_editable=True, requires_approval=False, approval_if_date_delta_days=3),
    "order_index": FieldRule(ai_editable=True, requires_approval=False),
}

PROJECT_FIELD_POLICY: dict[str, FieldRule] = {
    "name": FieldRule(ai_editable=False, requires_approval=True),
    "description": FieldRule(ai_editable=True, requires_approval=False),
    "status": FieldRule(ai_editable=False, requires_approval=True),
}

DESTRUCTIVE_OPS = frozenset({"delete", "set_dependencies", "create"})


def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _date_delta_days(old: date | None, new: date | None) -> int:
    if old is None or new is None:
        return 0 if old == new else 999
    return abs((new - old).days)


def field_requires_approval(
    entity_type: str,
    field_name: str,
    *,
    old_value: Any = None,
    new_value: Any = None,
    human_locked_fields: dict | None = None,
) -> bool:
    if human_locked_fields and field_name in human_locked_fields:
        return True

    policy_map = {
        "task": TASK_FIELD_POLICY,
        "milestone": MILESTONE_FIELD_POLICY,
        "project": PROJECT_FIELD_POLICY,
    }.get(entity_type, {})
    rule = policy_map.get(field_name)
    if not rule:
        return True
    if not rule.ai_editable or rule.requires_approval:
        return True
    if rule.approval_if_date_delta_days is not None:
        delta = _date_delta_days(_parse_date(old_value), _parse_date(new_value))
        if delta > rule.approval_if_date_delta_days:
            return True
    return False


def split_mutation_fields(
    entity_type: str,
    fields: dict[str, Any],
    *,
    existing_entity: Any | None = None,
    auto_apply_safe: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return (auto_apply_fields, approval_required_fields)."""
    if not auto_apply_safe:
        return {}, dict(fields)

    auto_fields: dict[str, Any] = {}
    pending_fields: dict[str, Any] = {}
    locks = getattr(existing_entity, "human_locked_fields", None) or {}

    for key, value in fields.items():
        old_val = getattr(existing_entity, key, None) if existing_entity and hasattr(existing_entity, key) else None
        if field_requires_approval(
            entity_type,
            key,
            old_value=old_val,
            new_value=value,
            human_locked_fields=locks,
        ):
            pending_fields[key] = value
        else:
            auto_fields[key] = value
    return auto_fields, pending_fields


def mutation_requires_approval(op: dict[str, Any], existing_entity: Any | None = None) -> bool:
    operation = str(op.get("op") or "").lower()
    if operation in DESTRUCTIVE_OPS:
        return True
    if operation == "update_project":
        fields = op.get("fields") or {}
        for key in fields:
            if field_requires_approval("project", key, new_value=fields[key]):
                return True
        return False
    entity_type = str(op.get("entity_type") or "task").lower()
    fields = op.get("fields") or {}
    if operation == "update" and fields:
        _, pending = split_mutation_fields(
            entity_type, fields, existing_entity=existing_entity, auto_apply_safe=True
        )
        return bool(pending)
    return True
