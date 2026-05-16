"""
Hybrid wiki page search for agent tools and chat RAG (semantic + keyword).
"""

from __future__ import annotations

import logging
from typing import Any

from django.db.models import Q

from ingest.vectors import vector_store
from wiki.models import WikiPage

logger = logging.getLogger(__name__)

_SNIPPET_MAX = 280
_KEYWORD_SCORE = 0.55
_SEMANTIC_WEIGHT = 1.0
_KEYWORD_WEIGHT = 0.85
_BOTH_BOOST = 0.12
_RESOLVE_MIN_SCORE = 0.35
_RESOLVE_MIN_GAP = 0.08


def expand_search_queries(user_message: str, team) -> list[str]:
    """
    Original query plus optional LLM query expansion and HyDE (same strategy as chat RAG).
    """
    from llm_orchestrator.orchestrator import llm_call, llm_json_call

    search_queries = [(user_message or "").strip()]
    if not search_queries[0] or team is None:
        return [q for q in search_queries if q]

    try:
        expansion_prompt = (
            f"Given the user query: '{user_message}', generate 3 diverse search queries that capture the underlying "
            f"intent and semantic meaning, even if they use different words. "
            f"Return as a simple JSON list of strings."
        )
        expanded = llm_json_call(
            team=team,
            operation="query_expansion",
            messages=[{"role": "user", "content": expansion_prompt}],
            default_on_error=[],
        )
        if isinstance(expanded, list):
            search_queries.extend(str(x).strip() for x in expanded[:3] if x)

        hyde_prompt = (
            f"Write a short, professional paragraph that would perfectly answer the query: '{user_message}'. "
            f"Focus on factual, relevant technical or team information."
        )
        hyde_resp, _, _ = llm_call(
            team=team,
            operation="hyde_generation",
            messages=[{"role": "user", "content": hyde_prompt}],
        )
        hyde_answer = hyde_resp.choices[0].message.content if hyde_resp and hyde_resp.choices else None
        if hyde_answer:
            search_queries.append(hyde_answer.strip())
    except Exception:
        logger.warning("Query expansion/HyDE failed, using original query only.")

    seen: set[str] = set()
    out: list[str] = []
    for q in search_queries:
        if q and q not in seen:
            seen.add(q)
            out.append(q)
    return out


def _truncate_snippet(text: str, max_len: int = _SNIPPET_MAX) -> str:
    s = (text or "").replace("\n", " ").strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 3] + "..."


def _keyword_hits(team_id: str, query: str, limit: int) -> dict[str, dict[str, Any]]:
    """Title/content substring matches keyed by page id."""
    q = (query or "").strip()
    if not q:
        return {}

    qs = WikiPage.objects.filter(team_id=team_id, is_deleted=False).filter(
        Q(title__icontains=q) | Q(content__icontains=q) | Q(slug__icontains=q)
    )[:limit]

    hits: dict[str, dict[str, Any]] = {}
    for p in qs:
        snippet = _truncate_snippet(p.content or p.title)
        hits[str(p.id)] = {
            "id": str(p.id),
            "title": p.title,
            "slug": p.slug,
            "page_type": p.page_type,
            "score": _KEYWORD_SCORE,
            "snippet": snippet,
            "match": "keyword",
            "page": p,
        }
    return hits


def _semantic_hits(
    team_id: str,
    query: str,
    limit: int,
    *,
    team=None,
    expand: bool = False,
) -> dict[str, dict[str, Any]]:
    """Vector chunk search aggregated to best chunk per wiki page."""
    queries = expand_search_queries(query, team) if expand and team else [query]
    per_page: dict[str, dict[str, Any]] = {}

    chunk_limit = max(limit * 3, 15)
    for q in queries:
        if not (q or "").strip():
            continue
        try:
            results = vector_store.search_similar_pages(team_id, q, limit=chunk_limit)
        except Exception:
            logger.exception("semantic wiki search failed team_id=%s", team_id)
            continue

        for res in results:
            payload = res.payload or {}
            if payload.get("source_type") == "plan":
                continue
            page_id = payload.get("page_id")
            if not page_id:
                continue
            score = float(getattr(res, "score", 0) or 0)
            snippet = _truncate_snippet(payload.get("content") or "")
            existing = per_page.get(page_id)
            if existing is None or score > existing["score"]:
                per_page[page_id] = {
                    "id": page_id,
                    "title": payload.get("page_title") or "Untitled",
                    "slug": payload.get("slug") or "",
                    "page_type": None,
                    "score": score * _SEMANTIC_WEIGHT,
                    "snippet": snippet,
                    "match": "semantic",
                    "page": None,
                }

    if not per_page:
        return {}

    pages = {
        str(p.id): p
        for p in WikiPage.objects.filter(
            id__in=list(per_page.keys()), team_id=team_id, is_deleted=False
        )
    }
    for page_id, hit in per_page.items():
        page = pages.get(page_id)
        if not page:
            del per_page[page_id]
            continue
        hit["title"] = page.title
        hit["slug"] = page.slug
        hit["page_type"] = page.page_type
        hit["page"] = page

    return per_page


def search_wiki_pages(
    team_id: str,
    query: str,
    *,
    limit: int = 15,
    mode: str = "hybrid",
    expand_queries: bool = False,
    team=None,
) -> list[dict[str, Any]]:
    """
    Search team wiki pages. mode: hybrid | semantic | keyword.
    Returns list of dicts (id, title, slug, page_type, score, snippet, match) sorted by score.
    """
    q = (query or "").strip()
    if not q:
        return []

    limit = min(max(int(limit or 15), 1), 30)
    mode = (mode or "hybrid").lower()
    if mode not in ("hybrid", "semantic", "keyword"):
        mode = "hybrid"

    merged: dict[str, dict[str, Any]] = {}

    if mode in ("hybrid", "keyword"):
        for pid, hit in _keyword_hits(team_id, q, limit).items():
            merged[pid] = hit

    if mode in ("hybrid", "semantic"):
        for pid, hit in _semantic_hits(
            team_id, q, limit, team=team if expand_queries else None, expand=expand_queries
        ).items():
            if pid in merged:
                kw = merged[pid]
                kw["score"] = max(kw["score"], hit["score"]) + _BOTH_BOOST
                kw["snippet"] = hit["snippet"] or kw["snippet"]
                kw["match"] = "both"
            else:
                merged[pid] = hit

    rows = list(merged.values())
    rows.sort(key=lambda r: (-r["score"], r["title"]))
    out: list[dict[str, Any]] = []
    for r in rows[:limit]:
        out.append(
            {
                "id": r["id"],
                "title": r["title"],
                "slug": r["slug"],
                "page_type": r["page_type"],
                "score": round(float(r["score"]), 4),
                "snippet": r["snippet"],
                "match": r["match"],
            }
        )
    return out


def resolve_wiki_page(
    team_id: str,
    query: str,
    *,
    team=None,
    limit: int = 5,
    expand_queries: bool = False,
) -> tuple[WikiPage | None, list[dict[str, Any]], str | None]:
    """
    Pick a single page from a natural-language query.
    Returns (page, candidates, error_code).
    """
    candidates = search_wiki_pages(
        team_id,
        query,
        limit=limit,
        mode="hybrid",
        expand_queries=expand_queries,
        team=team if expand_queries else None,
    )
    if not candidates:
        return None, [], "wiki_page_not_found"

    top = candidates[0]
    second_score = candidates[1]["score"] if len(candidates) > 1 else 0.0
    if top["score"] < _RESOLVE_MIN_SCORE:
        return None, candidates, "wiki_resolve_low_confidence"
    if len(candidates) > 1 and (top["score"] - second_score) < _RESOLVE_MIN_GAP:
        return None, candidates, "wiki_resolve_ambiguous"

    try:
        page = WikiPage.objects.get(id=top["id"], team_id=team_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return None, candidates, "wiki_page_not_found"
    return page, candidates, None
