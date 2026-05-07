"""
Graph traversal utilities for the agent.

Provides tools for traversing the knowledge graph to find related pages,
detect contradictions, identify prerequisites, and analyze knowledge gaps.
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque
from typing import Any

from django.db.models import Q

from graph_engine.models import GraphEdge
from wiki.models import WikiPage

logger = logging.getLogger(__name__)


def traverse_neighbors(
    page_id: str,
    team_id: str,
    *,
    max_hops: int = 2,
    relation_filter: list[str] | None = None,
    include_content: bool = False,
    max_results: int = 50,
) -> list[dict[str, Any]]:
    """
    BFS traversal from a page to find connected pages within N hops.
    Optionally filter by relation type.
    """
    try:
        start_page = WikiPage.objects.get(id=page_id, team_id=team_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return []

    visited = set()
    queue = deque([(str(start_page.id), 0)])
    results = []

    while queue and len(results) < max_results:
        current_id, depth = queue.popleft()
        if current_id in visited:
            continue
        visited.add(current_id)

        if depth > 0:  # Don't include start page in results
            try:
                page = WikiPage.objects.get(id=current_id, is_deleted=False)
                entry = {
                    "page_id": str(page.id),
                    "title": page.title,
                    "slug": page.slug,
                    "page_type": page.page_type,
                    "depth": depth,
                }
                if include_content:
                    entry["content_excerpt"] = page.content[:500]
                results.append(entry)
            except WikiPage.DoesNotExist:
                continue

        if depth >= max_hops:
            continue

        # Get outgoing edges
        edge_qs = GraphEdge.objects.filter(from_page_id=current_id)
        if relation_filter:
            edge_qs = edge_qs.filter(edge_type__in=relation_filter)

        for edge in edge_qs:
            if str(edge.to_page_id) not in visited:
                queue.append((str(edge.to_page_id), depth + 1))
                # Add edge info to the result when the target is visited
                for r in results:
                    if r["page_id"] == str(edge.to_page_id):
                        r.setdefault("edges_from_parent", []).append({
                            "type": edge.edge_type,
                            "confidence": edge.confidence,
                            "reason": edge.reason,
                        })

        # Get incoming edges
        edge_qs = GraphEdge.objects.filter(to_page_id=current_id)
        if relation_filter:
            edge_qs = edge_qs.filter(edge_type__in=relation_filter)

        for edge in edge_qs:
            if str(edge.from_page_id) not in visited:
                queue.append((str(edge.from_page_id), depth + 1))

    return results


def find_contradictions(team_id: str, page_id: str | None = None) -> list[dict[str, Any]]:
    """
    Find all contradiction edges in a team's knowledge graph.
    If page_id is given, only contradictions involving that page.
    """
    edge_qs = GraphEdge.objects.filter(
        edge_type="contradicts",
        from_page__team_id=team_id,
        from_page__is_deleted=False,
        to_page__is_deleted=False,
    ).select_related("from_page", "to_page")

    if page_id:
        edge_qs = edge_qs.filter(Q(from_page_id=page_id) | Q(to_page_id=page_id))

    return [
        {
            "edge_id": str(e.id),
            "from_page_id": str(e.from_page_id),
            "from_page_title": e.from_page.title,
            "from_page_slug": e.from_page.slug,
            "to_page_id": str(e.to_page_id),
            "to_page_title": e.to_page.title,
            "to_page_slug": e.to_page.slug,
            "confidence": e.confidence,
            "reason": e.reason,
            "metadata": e.metadata,
        }
        for e in edge_qs
    ]


def find_prerequisites(page_id: str, team_id: str) -> list[dict[str, Any]]:
    """Find all pages that are prerequisites for the given page."""
    edges = GraphEdge.objects.filter(
        from_page_id=page_id,
        edge_type__in=["prerequisite", "depends_on"],
        to_page__team_id=team_id,
        to_page__is_deleted=False,
    ).select_related("to_page")

    return [
        {
            "page_id": str(e.to_page_id),
            "title": e.to_page.title,
            "slug": e.to_page.slug,
            "relation_type": e.edge_type,
            "reason": e.reason,
        }
        for e in edges
    ]


def find_dependents(page_id: str, team_id: str) -> list[dict[str, Any]]:
    """Find all pages that depend on the given page (would be affected if it changes)."""
    edges = GraphEdge.objects.filter(
        to_page_id=page_id,
        edge_type__in=["depends_on", "extends", "implements", "prerequisite"],
        from_page__team_id=team_id,
        from_page__is_deleted=False,
    ).select_related("from_page")

    return [
        {
            "page_id": str(e.from_page_id),
            "title": e.from_page.title,
            "slug": e.from_page.slug,
            "relation_type": e.edge_type,
            "reason": e.reason,
        }
        for e in edges
    ]


def knowledge_gap_analysis(team_id: str) -> list[dict[str, Any]]:
    """
    Identify knowledge gaps:
    1. [[wikilinks]] pointing to non-existent pages
    2. Topics mentioned frequently but never documented
    3. Pages with many incoming 'depends_on' edges but shallow content
    """
    import re
    from collections import Counter

    pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)

    # Find all [[wikilink]] targets that don't exist
    pattern = re.compile(r"\[\[([^\]]+)\]\]")
    mentions = []
    for p in pages:
        mentions.extend(pattern.findall(p.content))

    mention_counts = Counter(mentions)
    existing_titles = set(pages.values_list("title", flat=True))

    orphan_concepts = [
        {"title": title, "mentions": count, "type": "missing_page"}
        for title, count in mention_counts.items()
        if title not in existing_titles and count >= 1
    ]
    orphan_concepts.sort(key=lambda x: x["mentions"], reverse=True)

    # Find pages with many dependents but very short content
    shallow_hubs = []
    for page in pages:
        dependent_count = GraphEdge.objects.filter(
            to_page=page, edge_type__in=["depends_on", "implements"]
        ).count()
        if dependent_count >= 2 and len(page.content) < 200:
            shallow_hubs.append({
                "page_id": str(page.id),
                "title": page.title,
                "slug": page.slug,
                "dependent_count": dependent_count,
                "content_length": len(page.content),
                "type": "shallow_hub",
            })

    return {
        "orphan_concepts": orphan_concepts[:20],
        "shallow_hubs": shallow_hubs,
        "total_pages": pages.count(),
        "total_edges": GraphEdge.objects.filter(
            from_page__team_id=team_id
        ).count(),
    }


def get_page_full_context(page_id: str, team_id: str) -> dict[str, Any]:
    """
    Get full neighborhood context for a page: all relations with content summaries.
    Used by the agent before making decisions.
    """
    try:
        page = WikiPage.objects.get(id=page_id, team_id=team_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return {"error": "page_not_found"}

    outgoing = GraphEdge.objects.filter(from_page=page).select_related("to_page")
    incoming = GraphEdge.objects.filter(to_page=page).select_related("from_page")

    outgoing_relations = [
        {
            "direction": "outgoing",
            "page_id": str(e.to_page_id),
            "title": e.to_page.title,
            "slug": e.to_page.slug,
            "edge_type": e.edge_type,
            "confidence": e.confidence,
            "reason": e.reason,
            "content_excerpt": e.to_page.content[:300],
        }
        for e in outgoing
    ]

    incoming_relations = [
        {
            "direction": "incoming",
            "page_id": str(e.from_page_id),
            "title": e.from_page.title,
            "slug": e.from_page.slug,
            "edge_type": e.edge_type,
            "confidence": e.confidence,
            "reason": e.reason,
            "content_excerpt": e.from_page.content[:300],
        }
        for e in incoming
    ]

    return {
        "page_id": str(page.id),
        "title": page.title,
        "slug": page.slug,
        "page_type": page.page_type,
        "content": page.content,
        "outgoing_relations": outgoing_relations,
        "incoming_relations": incoming_relations,
        "total_relations": len(outgoing_relations) + len(incoming_relations),
    }
