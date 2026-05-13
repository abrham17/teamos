"""Path-based reasoning over the knowledge graph."""

from dataclasses import dataclass, field
from collections import deque
from llm_orchestrator.orchestrator import llm_call
from graph_engine.models import GraphEdge
from wiki.models import WikiPage


@dataclass
class Prerequisite:
    page_title: str
    reason: str
    depth: int


@dataclass
class CausalChain:
    path: list[str]
    explanation: str


def _get_page_title(page_id: str, team_id: str) -> str:
    try:
        return WikiPage.objects.get(id=page_id, team_id=team_id, is_deleted=False).title
    except WikiPage.DoesNotExist:
        return page_id


def explain_connection(team_id: str, page_a_id: str, page_b_id: str) -> str:
    """Find and explain the shortest path between two concepts."""
    title_a = _get_page_title(page_a_id, team_id)
    title_b = _get_page_title(page_b_id, team_id)

    path = _shortest_path(team_id, page_a_id, page_b_id)
    if not path:
        return f"No connection found between '{title_a}' and '{title_b}'."

    path_titles = [_get_page_title(pid, team_id) for pid in path]
    path_str = " → ".join(path_titles)

    prompt = f"""Explain how these wiki pages are connected through the knowledge graph.

Path: {path_str}

Explain the relationship chain in 2-3 sentences. What does each step in the path represent?"""

    resp, _, _ = llm_call(
        system="You explain knowledge graph connections clearly and concisely.",
        prompt=prompt
    )
    return resp.choices[0].message.content if resp else f"Path: {path_str}"


def find_prerequisites(team_id: str, page_id: str, max_depth: int = 3) -> list[Prerequisite]:
    """Traverse depends_on + prerequisite edges to build a learning path."""
    prerequisites = []
    visited = {page_id}
    queue = deque([(page_id, 0)])

    while queue and len(prerequisites) < 10:
        current, depth = queue.popleft()
        if depth >= max_depth:
            continue

        # Find incoming prerequisite/depends_on edges
        edges = GraphEdge.objects.filter(
            to_page_id=current,
            edge_type__in=["depends_on", "prerequisite"],
        ).select_related("from_page")

        for edge in edges:
            if edge.from_page_id not in visited:
                visited.add(edge.from_page_id)
                reason = edge.metadata.get("reason", "") if edge.metadata else ""
                prerequisites.append(Prerequisite(
                    page_title=edge.from_page.title,
                    reason=reason,
                    depth=depth + 1,
                ))
                queue.append((edge.from_page_id, depth + 1))

    return prerequisites


def causal_chain(team_id: str, from_page_id: str, to_page_id: str) -> CausalChain | None:
    """Find causal/dependency chains between concepts."""
    path = _shortest_path(team_id, from_page_id, to_page_id)
    if not path:
        return None

    path_titles = [_get_page_title(pid, team_id) for pid in path]

    prompt = f"""Analyze this knowledge graph path for causal relationships.

Path: {' → '.join(path_titles)}

Is there a causal chain here? Does A cause or enable B, which causes or enables C?
Explain the causal relationship in one paragraph."""

    resp, _, _ = llm_call(
        system="You analyze causal relationships in knowledge graphs.",
        prompt=prompt
    )

    return CausalChain(
        path=path_titles,
        explanation=resp.choices[0].message.content if resp else "No causal explanation available.",
    )


def detect_cycles(team_id: str) -> list[list[str]]:
    """Find circular dependencies that may indicate contradictions."""
    edges = GraphEdge.objects.filter(
        from_page__team_id=team_id,
        edge_type__in=["depends_on", "prerequisite"],
    ).values("from_page_id", "to_page_id")

    # Build adjacency list
    adj: dict[str, list[str]] = {}
    for edge in edges:
        fid = str(edge["from_page_id"])
        tid = str(edge["to_page_id"])
        if fid not in adj:
            adj[fid] = []
        adj[fid].append(tid)

    cycles = []
    visited = set()
    rec_stack = set()

    def dfs(node: str, path: list[str]):
        visited.add(node)
        rec_stack.add(node)
        path.append(node)

        for neighbor in adj.get(node, []):
            if neighbor not in visited:
                dfs(neighbor, path)
            elif neighbor in rec_stack:
                # Found a cycle
                cycle_start = path.index(neighbor)
                cycle = path[cycle_start:] + [neighbor]
                cycles.append([_get_page_title(n, team_id) for n in cycle])

        path.pop()
        rec_stack.discard(node)

    for node in adj:
        if node not in visited:
            dfs(node, [])

    return cycles


def _shortest_path(team_id: str, from_id: str, to_id: str) -> list[str] | None:
    """BFS to find shortest path between two pages."""
    if from_id == to_id:
        return [from_id]

    edges = GraphEdge.objects.filter(
        from_page__team_id=team_id,
    ).values("from_page_id", "to_page_id")

    adj: dict[str, list[str]] = {}
    for edge in edges:
        fid = str(edge["from_page_id"])
        tid = str(edge["to_page_id"])
        if fid not in adj:
            adj[fid] = []
        adj[fid].append(tid)
        # Undirected for path finding
        if tid not in adj:
            adj[tid] = []
        adj[tid].append(fid)

    queue = deque([[from_id]])
    visited = {from_id}

    while queue:
        path = queue.popleft()
        node = path[-1]

        for neighbor in adj.get(node, []):
            if neighbor == to_id:
                return path + [to_id]
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(path + [neighbor])

    return None
