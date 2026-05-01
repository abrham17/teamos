from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from django.core.cache import cache

from wiki.models import WikiPage
from graph_engine.models import GraphEdge


CACHE_KEY_TEMPLATE = "graph:analytics:team:{team_id}"
CACHE_TTL_SECONDS = 3600


def _build_graph(team_id):
    pages = list(
        WikiPage.objects.filter(team_id=team_id, is_deleted=False).only("id", "title", "slug")
    )
    page_ids = [p.id for p in pages]
    edges = list(
        GraphEdge.objects.filter(from_page_id__in=page_ids, to_page_id__in=page_ids).only(
            "from_page_id", "to_page_id", "edge_type", "confidence"
        )
    )
    return pages, edges


def _compute_pagerank(page_ids, edges, iterations: int = 20, damping: float = 0.85):
    if not page_ids:
        return {}

    n = len(page_ids)
    rank = {pid: 1.0 / n for pid in page_ids}
    out_links = defaultdict(list)
    for e in edges:
        out_links[e.from_page_id].append(e.to_page_id)

    for _ in range(iterations):
        next_rank = {pid: (1.0 - damping) / n for pid in page_ids}
        dangling_mass = 0.0
        for pid in page_ids:
            outgoing = out_links.get(pid, [])
            if not outgoing:
                dangling_mass += rank[pid]
                continue
            share = rank[pid] / len(outgoing)
            for to_pid in outgoing:
                next_rank[to_pid] += damping * share

        if dangling_mass:
            redistribute = damping * dangling_mass / n
            for pid in page_ids:
                next_rank[pid] += redistribute
        rank = next_rank

    return rank


def _compute_clusters(page_ids, edges):
    adjacency = {pid: set() for pid in page_ids}
    for e in edges:
        adjacency[e.from_page_id].add(e.to_page_id)
        adjacency[e.to_page_id].add(e.from_page_id)

    cluster_map = {}
    cluster_sizes = {}
    seen = set()
    cluster_idx = 0

    for pid in page_ids:
        if pid in seen:
            continue
        cluster_idx += 1
        cid = f"cluster-{cluster_idx}"
        q = deque([pid])
        size = 0
        while q:
            cur = q.popleft()
            if cur in seen:
                continue
            seen.add(cur)
            cluster_map[cur] = cid
            size += 1
            for nxt in adjacency.get(cur, []):
                if nxt not in seen:
                    q.append(nxt)
        cluster_sizes[cid] = size

    return cluster_map, cluster_sizes


def compute_team_graph_analytics(team_id) -> dict[str, Any]:
    pages, edges = _build_graph(team_id)
    page_ids = [p.id for p in pages]
    title_by_id = {p.id: p.title for p in pages}
    slug_by_id = {p.id: p.slug for p in pages}

    page_rank = _compute_pagerank(page_ids, edges)
    cluster_map, cluster_sizes = _compute_clusters(page_ids, edges)

    connected_ids = {e.from_page_id for e in edges} | {e.to_page_id for e in edges}
    orphan_ids = [pid for pid in page_ids if pid not in connected_ids]

    hubs = sorted(page_rank.items(), key=lambda kv: kv[1], reverse=True)[:10]
    hub_payload = [
        {
            "to_page_id": str(pid),
            "to_page__title": title_by_id.get(pid, ""),
            "to_page__slug": slug_by_id.get(pid, ""),
            "score": score,
        }
        for pid, score in hubs
    ]

    orphan_payload = [
        {"id": str(pid), "title": title_by_id.get(pid, ""), "slug": slug_by_id.get(pid, "")}
        for pid in orphan_ids
    ]

    return {
        "page_rank": {str(pid): score for pid, score in page_rank.items()},
        "clusters": {str(pid): cluster for pid, cluster in cluster_map.items()},
        "cluster_sizes": cluster_sizes,
        "hubs": hub_payload,
        "orphans": orphan_payload,
        "node_count": len(page_ids),
        "edge_count": len(edges),
    }


def get_team_graph_analytics(team_id, force: bool = False) -> dict[str, Any]:
    key = CACHE_KEY_TEMPLATE.format(team_id=team_id)
    if not force:
        cached = cache.get(key)
        if cached is not None:
            return cached
    computed = compute_team_graph_analytics(team_id)
    cache.set(key, computed, CACHE_TTL_SECONDS)
    return computed


def invalidate_team_graph_analytics_cache(team_id):
    key = CACHE_KEY_TEMPLATE.format(team_id=team_id)
    cache.delete(key)
