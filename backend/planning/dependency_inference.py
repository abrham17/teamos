"""
Automatic Dependency Inference.

Infers task dependencies from:
1. Wiki graph relationships (if tasks reference pages connected by depends_on/prerequisite edges)
2. Semantic similarity of task descriptions (tasks about similar topics likely have ordering)
3. Keyword heuristics (e.g. "deploy" depends on "build", "test" depends on "implement")

Also performs topological sort and critical path calculation.
"""

from __future__ import annotations

import logging
from typing import Any

from django.db.models import Q

logger = logging.getLogger(__name__)


# ── Keyword-based heuristic dependency patterns ───────────────────────

DEPENDENCY_PATTERNS: list[tuple[list[str], list[str]]] = [
    # (downstream_keywords, upstream_keywords) — downstream depends on upstream
    (["deploy", "release", "ship", "launch"], ["test", "build", "implement", "develop"]),
    (["test", "qa", "verify", "validate"], ["implement", "build", "develop", "create"]),
    (["implement", "build", "develop"], ["design", "plan", "architect", "spec"]),
    (["document", "wiki", "write docs"], ["implement", "build", "complete"]),
    (["review", "approve"], ["draft", "create", "write", "implement"]),
    (["integrate", "merge"], ["implement", "build", "develop"]),
    (["monitor", "observe"], ["deploy", "launch", "release"]),
    (["optimize", "refactor"], ["implement", "build", "measure"]),
    (["migrate", "transition"], ["plan", "backup", "prepare"]),
]


def infer_dependencies(
    tasks: list[dict[str, Any]],
    team_id: str,
    domain_patterns: list[tuple[list[str], list[str]]] | None = None,
) -> list[dict[str, Any]]:
    """
    Infer dependency_ids for tasks that don't already have them.

    Applies four strategies:
    1. Graph-based (wiki page relationships)
    2. Global keyword heuristic (common SDLC patterns)
    3. Domain-specific keyword patterns (passed in from DomainContext)
    4. Temporal ordering (start dates imply sequence)

    Returns the same task list with dependency_ids populated.
    """
    if not tasks:
        return tasks

    # Index tasks by position
    task_indices = {i: t for i, t in enumerate(tasks)}

    # Strategy 1: Graph-based dependencies
    graph_deps = _infer_from_graph(tasks, team_id)

    # Strategy 2: Global keyword heuristic
    keyword_deps = _infer_from_keywords(tasks, extra_patterns=domain_patterns)

    # Strategy 3: Temporal (start_date of one = end_date of another)
    temporal_deps = _infer_from_temporal(tasks)

    # Merge all inferred dependencies
    all_deps: dict[int, set[int]] = {}
    for dep_set in [graph_deps, keyword_deps, temporal_deps]:
        for downstream_idx, upstream_indices in dep_set.items():
            if downstream_idx not in all_deps:
                all_deps[downstream_idx] = set()
            all_deps[downstream_idx].update(upstream_indices)

    # Remove self-dependencies and cycles
    all_deps = _remove_cycles(all_deps, len(tasks))

    # Apply to tasks
    for idx, upstream_set in all_deps.items():
        if upstream_set and not tasks[idx].get("dependency_ids"):
            # Use task indices as temporary IDs (will be mapped to real IDs after creation)
            tasks[idx]["_inferred_deps"] = sorted(upstream_set)
            # Mark the dependency count for the frontend
            tasks[idx]["inferred_dependency_count"] = len(upstream_set)

    # Topological sort to ensure correct ordering
    sorted_indices = _topological_sort(all_deps, len(tasks))
    if sorted_indices:
        tasks = [tasks[i] for i in sorted_indices]
        # Update order_index
        for i, t in enumerate(tasks):
            t["order_index"] = i

    return tasks


def _infer_from_graph(tasks: list[dict[str, Any]], team_id: str) -> dict[int, set[int]]:
    """Infer dependencies from wiki graph edges between referenced pages."""
    deps: dict[int, set[int]] = {}

    try:
        from graph_engine.models import GraphEdge
        from wiki.models import WikiPage

        # Collect wiki references per task
        task_pages: dict[int, set[str]] = {}
        for idx, t in enumerate(tasks):
            refs = set()
            wiki_refs = t.get("wikiReferences", [])
            if wiki_refs:
                for ref in wiki_refs:
                    refs.add(ref.strip().strip("[]"))
            # Also check description for [[wikilinks]]
            desc = t.get("description", "")
            import re
            links = re.findall(r"\[\[([^\]]+)\]\]", desc)
            refs.update(links)
            if refs:
                task_pages[idx] = refs

        if not task_pages:
            return deps

        # Get page IDs for all referenced titles
        all_titles = set()
        for titles in task_pages.values():
            all_titles.update(titles)

        title_to_id: dict[str, str] = {}
        if all_titles:
            pages = WikiPage.objects.filter(
                team_id=team_id, title__in=list(all_titles), is_deleted=False
            )
            for p in pages:
                title_to_id[p.title] = str(p.id)

        # Check for dependency edges between pages
        for down_idx, down_titles in task_pages.items():
            down_page_ids = {title_to_id[t] for t in down_titles if t in title_to_id}
            if not down_page_ids:
                continue

            for up_idx, up_titles in task_pages.items():
                if up_idx == down_idx:
                    continue
                up_page_ids = {title_to_id[t] for t in up_titles if t in title_to_id}
                if not up_page_ids:
                    continue

                # Check if any downstream page depends_on any upstream page
                has_dep = GraphEdge.objects.filter(
                    from_page_id__in=down_page_ids,
                    to_page_id__in=up_page_ids,
                    edge_type__in=["depends_on", "prerequisite", "implements"],
                ).exists()

                if has_dep:
                    if down_idx not in deps:
                        deps[down_idx] = set()
                    deps[down_idx].add(up_idx)

    except Exception:
        logger.exception("Graph-based dependency inference failed")

    return deps


def _infer_from_keywords(
    tasks: list[dict[str, Any]],
    extra_patterns: list[tuple[list[str], list[str]]] | None = None,
) -> dict[int, set[int]]:
    """Infer dependencies from keyword patterns in task titles."""
    deps: dict[int, set[int]] = {}
    patterns = list(DEPENDENCY_PATTERNS)
    if extra_patterns:
        patterns.extend(extra_patterns)

    for downstream_keywords, upstream_keywords in patterns:
        downstream_tasks = []
        upstream_tasks = []

        for idx, t in enumerate(tasks):
            title_lower = t.get("title", "").lower()
            if any(kw in title_lower for kw in downstream_keywords):
                downstream_tasks.append(idx)
            if any(kw in title_lower for kw in upstream_keywords):
                upstream_tasks.append(idx)

        # Each downstream depends on all matching upstreams
        for down_idx in downstream_tasks:
            for up_idx in upstream_tasks:
                if down_idx != up_idx:
                    if down_idx not in deps:
                        deps[down_idx] = set()
                    deps[down_idx].add(up_idx)

    return deps


def _infer_from_temporal(tasks: list[dict[str, Any]]) -> dict[int, set[int]]:
    """Infer dependencies from date relationships."""
    deps: dict[int, set[int]] = {}

    for i, t1 in enumerate(tasks):
        start = t1.get("startDate") or t1.get("start_date")
        if not start:
            continue

        for j, t2 in enumerate(tasks):
            if i == j:
                continue
            end = t2.get("endDate") or t2.get("end_date")
            if not end:
                continue

            # If t1 starts exactly when t2 ends, t1 depends on t2
            if start == end:
                if i not in deps:
                    deps[i] = set()
                deps[i].add(j)

    return deps


def _remove_cycles(deps: dict[int, set[int]], n: int) -> dict[int, set[int]]:
    """Remove cycles using DFS — drop back edges."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * n
    safe_deps: dict[int, set[int]] = {k: set(v) for k, v in deps.items()}

    def dfs(node: int, path: set[int]):
        color[node] = GRAY
        for dep in list(safe_deps.get(node, [])):
            if color[dep] == GRAY:
                # Back edge → cycle, remove it
                safe_deps[node].discard(dep)
            elif color[dep] == WHITE:
                dfs(dep, path | {node})
        color[node] = BLACK

    for i in range(n):
        if color[i] == WHITE:
            dfs(i, set())

    return safe_deps


def _topological_sort(deps: dict[int, set[int]], n: int) -> list[int]:
    """Kahn's algorithm for topological sort. Returns sorted indices or empty if cycle."""
    in_degree = [0] * n
    adj: dict[int, list[int]] = {i: [] for i in range(n)}

    for downstream, upstreams in deps.items():
        for upstream in upstreams:
            adj[upstream].append(downstream)
            in_degree[downstream] += 1

    queue = [i for i in range(n) if in_degree[i] == 0]
    result = []

    while queue:
        # Pick the one with smallest original index for stability
        queue.sort()
        node = queue.pop(0)
        result.append(node)

        for neighbor in adj.get(node, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != n:
        # Cycle detected, return original order
        return list(range(n))

    return result
