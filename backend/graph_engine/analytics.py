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
            "from_page_id", "to_page_id", "edge_type", "confidence", "created_at"
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
    import random
    
    adjacency = {pid: set() for pid in page_ids}
    for e in edges:
        adjacency[e.from_page_id].add(e.to_page_id)
        adjacency[e.to_page_id].add(e.from_page_id)

    # Label Propagation Algorithm (LPA) for Community Detection
    labels = {pid: f"cluster-{i}" for i, pid in enumerate(page_ids)}
    
    for _ in range(10): # max 10 iterations
        changed = False
        nodes = list(page_ids)
        random.shuffle(nodes)
        
        for pid in nodes:
            neighbors = adjacency[pid]
            if not neighbors:
                continue
            
            # Find most frequent label among neighbors
            label_counts = defaultdict(int)
            for nxt in neighbors:
                label_counts[labels[nxt]] += 1
                
            max_count = max(label_counts.values())
            best_labels = [lbl for lbl, count in label_counts.items() if count == max_count]
            
            new_label = random.choice(best_labels)
            if labels[pid] != new_label:
                labels[pid] = new_label
                changed = True
                
        if not changed:
            break

    cluster_map = labels
    cluster_sizes = defaultdict(int)
    for pid, cid in cluster_map.items():
        cluster_sizes[cid] += 1

    return cluster_map, dict(cluster_sizes)


def _apply_mode_edges(edges, mode: str):
    from django.utils import timezone
    now = timezone.now()
    
    filtered = []
    for e in edges:
        # Calculate time decay
        age_days = (now - e.created_at).days if e.created_at else 0
        decay = max(0.3, 1.0 - (age_days / 365.0) * 0.5)
        e.confidence = float(e.confidence or 1.0) * decay
        
        if mode == "advanced":
            if e.edge_type in ("wikilink", "manual"):
                filtered.append(e)
            elif e.edge_type in ("semantic", "ai_inferred") and e.confidence >= 0.55:
                filtered.append(e)
        else:
            filtered.append(e)
            
    return filtered


def compute_team_graph_analytics(team_id, mode: str = "simple") -> dict[str, Any]:
    pages, edges = _build_graph(team_id)
    analytics_mode = "advanced" if mode == "advanced" else "simple"
    edges_for_analytics = _apply_mode_edges(edges, analytics_mode)
    page_ids = [p.id for p in pages]
    title_by_id = {p.id: p.title for p in pages}
    slug_by_id = {p.id: p.slug for p in pages}

    page_rank = _compute_pagerank(page_ids, edges_for_analytics)
    cluster_map, cluster_sizes = _compute_clusters(page_ids, edges_for_analytics)

    connected_ids = {e.from_page_id for e in edges_for_analytics} | {e.to_page_id for e in edges_for_analytics}
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
        "edge_count": len(edges_for_analytics),
        "analytics_mode": analytics_mode,
        "available_modes": ["simple", "advanced"],
    }


def get_team_graph_analytics(team_id, force: bool = False, mode: str = "simple") -> dict[str, Any]:
    analytics_mode = "advanced" if mode == "advanced" else "simple"
    key = f"{CACHE_KEY_TEMPLATE.format(team_id=team_id)}:mode:{analytics_mode}"
    if not force:
        cached = cache.get(key)
        if cached is not None:
            return cached
    computed = compute_team_graph_analytics(team_id, mode=analytics_mode)
    cache.set(key, computed, CACHE_TTL_SECONDS)
    return computed


def invalidate_team_graph_analytics_cache(team_id):
    for mode in ("simple", "advanced"):
        cache.delete(f"{CACHE_KEY_TEMPLATE.format(team_id=team_id)}:mode:{mode}")
