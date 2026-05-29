"""Semantic entity resolution for plan mutations."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from planning.models import Milestone, Project, Task
from planning.semantic_utils import compute_semantic_key, title_key

logger = logging.getLogger(__name__)

EMBEDDING_MATCH_THRESHOLD = 0.85


@dataclass
class MatchResult:
    entity: Task | Milestone | None
    confidence: float
    method: str  # id | semantic_key | embedding | title | none


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _get_query_embedding(text: str) -> list[float] | None:
    try:
        from ingest.vectors import vector_store

        return vector_store._get_embedding(text)
    except Exception:
        logger.exception("Failed to compute embedding for reconciliation")
        return None


def resolve_task(
    project: Project,
    op: dict[str, Any],
    *,
    tasks_by_id: dict[str, Task] | None = None,
    tasks_by_semantic: dict[str, Task] | None = None,
    tasks_by_title: dict[str, Task] | None = None,
) -> MatchResult:
    tasks = list(project.tasks.all()) if tasks_by_id is None else []
    tasks_by_id = tasks_by_id or {str(t.id): t for t in tasks}
    tasks_by_semantic = tasks_by_semantic or {t.semantic_key: t for t in tasks if t.semantic_key}
    tasks_by_title = tasks_by_title or {title_key(t.title): t for t in tasks}

    eid = str(op.get("id") or op.get("task_id") or "")
    if eid and eid in tasks_by_id:
        return MatchResult(entity=tasks_by_id[eid], confidence=1.0, method="id")

    sk = op.get("semantic_key") or op.get("semanticKey")
    if not sk:
        fields = op.get("fields") or {}
        sk = compute_semantic_key(
            title=fields.get("title") or op.get("title") or "",
            capability=fields.get("capability") or op.get("capability") or "",
            subsystem=fields.get("subsystem") or op.get("subsystem") or "",
            objective=fields.get("objective") or op.get("objective") or "",
        )
    sk = str(sk).strip()
    if sk and sk in tasks_by_semantic:
        return MatchResult(entity=tasks_by_semantic[sk], confidence=0.95, method="semantic_key")

    fields = op.get("fields") or {}
    title = fields.get("title") or op.get("title") or ""
    description = fields.get("description") or op.get("description") or ""
    query_text = f"{title}\n{description}".strip()

    query_emb = _get_query_embedding(query_text) if query_text else None
    if query_emb:
        best_task: Task | None = None
        best_score = 0.0
        for task in tasks_by_id.values():
            if task.title_embedding:
                score = _cosine_similarity(query_emb, list(task.title_embedding))
                if score > best_score:
                    best_score = score
                    best_task = task
        if best_task and best_score >= EMBEDDING_MATCH_THRESHOLD:
            return MatchResult(entity=best_task, confidence=best_score, method="embedding")

    tk = title_key(title)
    if tk and tk in tasks_by_title:
        logger.warning("Task matched by title only (low confidence): %s", title)
        return MatchResult(entity=tasks_by_title[tk], confidence=0.6, method="title")

    return MatchResult(entity=None, confidence=0.0, method="none")


def resolve_milestone(
    project: Project,
    op: dict[str, Any],
    *,
    ms_by_id: dict[str, Milestone] | None = None,
    ms_by_semantic: dict[str, Milestone] | None = None,
    ms_by_title: dict[str, Milestone] | None = None,
) -> MatchResult:
    milestones = list(project.milestones.all()) if ms_by_id is None else []
    ms_by_id = ms_by_id or {str(m.id): m for m in milestones}
    ms_by_semantic = ms_by_semantic or {m.semantic_key: m for m in milestones if m.semantic_key}
    ms_by_title = ms_by_title or {title_key(m.title): m for m in milestones}

    eid = str(op.get("id") or op.get("milestone_id") or "")
    if eid and eid in ms_by_id:
        return MatchResult(entity=ms_by_id[eid], confidence=1.0, method="id")

    sk = op.get("semantic_key") or op.get("semanticKey")
    if not sk:
        fields = op.get("fields") or {}
        sk = compute_semantic_key(title=fields.get("title") or op.get("title") or "")
    sk = str(sk).strip()
    if sk and sk in ms_by_semantic:
        return MatchResult(entity=ms_by_semantic[sk], confidence=0.95, method="semantic_key")

    fields = op.get("fields") or {}
    tk = title_key(fields.get("title") or op.get("title"))
    if tk and tk in ms_by_title:
        return MatchResult(entity=ms_by_title[tk], confidence=0.6, method="title")

    return MatchResult(entity=None, confidence=0.0, method="none")


def enrich_mutations_with_resolution(project: Project, mutations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach resolved entity ids to mutations where missing."""
    tasks_by_id = {str(t.id): t for t in project.tasks.all()}
    tasks_by_semantic = {t.semantic_key: t for t in tasks_by_id.values() if t.semantic_key}
    tasks_by_title = {title_key(t.title): t for t in tasks_by_id.values()}
    ms_by_id = {str(m.id): m for m in project.milestones.all()}
    ms_by_semantic = {m.semantic_key: m for m in ms_by_id.values() if m.semantic_key}
    ms_by_title = {title_key(m.title): m for m in ms_by_id.values()}

    enriched: list[dict[str, Any]] = []
    for raw in mutations:
        op = dict(raw)
        entity_type = str(op.get("entity_type") or "task").lower()
        operation = str(op.get("op") or "").lower()

        # 1. Resolve ID if missing
        if operation in {"update", "delete"} and not op.get("id"):
            if entity_type == "milestone":
                match = resolve_milestone(project, op, ms_by_id=ms_by_id, ms_by_semantic=ms_by_semantic, ms_by_title=ms_by_title)
            else:
                match = resolve_task(
                    project, op, tasks_by_id=tasks_by_id, tasks_by_semantic=tasks_by_semantic, tasks_by_title=tasks_by_title
                )
            if match.entity:
                op["id"] = str(match.entity.id)
                op["_match_method"] = match.method
                op["_match_confidence"] = match.confidence
            elif operation == "update" and match.confidence < EMBEDDING_MATCH_THRESHOLD:
                op["_ambiguous"] = True

        # 2. Attach title/name and old_fields for display
        op_id = op.get("id") or op.get("task_id") or op.get("milestone_id")
        if op_id:
            if entity_type == "milestone":
                m_obj = ms_by_id.get(str(op_id))
                if m_obj:
                    if not op.get("title"):
                        op["title"] = m_obj.title
                    if operation == "update":
                        old_f = {}
                        for k in op.get("fields", {}).keys():
                            if hasattr(m_obj, k):
                                val = getattr(m_obj, k)
                                old_f[k] = str(val) if val is not None else ""
                        op["old_fields"] = old_f
            else:
                t_obj = tasks_by_id.get(str(op_id))
                if t_obj:
                    if not op.get("title"):
                        op["title"] = t_obj.title
                    if operation == "update":
                        old_f = {}
                        for k in op.get("fields", {}).keys():
                            if hasattr(t_obj, k):
                                val = getattr(t_obj, k)
                                old_f[k] = str(val) if val is not None else ""
                        op["old_fields"] = old_f
        elif operation == "set_dependencies":
            t_id = op.get("task_id")
            t_obj = tasks_by_id.get(str(t_id))
            if t_obj:
                op["title"] = f"Update dependencies for: {t_obj.title}"
            dep_names = []
            for dep_id in op.get("depends_on", []):
                dep_obj = tasks_by_id.get(str(dep_id))
                if dep_obj:
                    dep_names.append(dep_obj.title)
            if dep_names:
                op["dependency_titles"] = dep_names

        enriched.append(op)
    return enriched
