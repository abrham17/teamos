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


def expand_search_queries(user_message: str, team, max_expansions: int = 3) -> list[str]:
    """
    Original query plus optional LLM query expansion and HyDE (same strategy as chat RAG).
    ``max_expansions`` caps the number of LLM-generated query variants (0 = no expansion).
    """
    from llm_orchestrator.orchestrator import llm_call, llm_json_call

    search_queries = [(user_message or "").strip()]
    if not search_queries[0] or team is None or max_expansions < 1:
        return [q for q in search_queries if q]

    try:
        expansion_prompt = (
            f"Given the user query: '{user_message}', generate {max_expansions} diverse search queries "
            f"that capture the underlying intent and semantic meaning, even if they use different words. "
            f"Return as a simple JSON list of strings."
        )
        expanded = llm_json_call(
            team=team,
            operation="query_expansion",
            messages=[{"role": "user", "content": expansion_prompt}],
            default_on_error=[],
        )
        if isinstance(expanded, list):
            search_queries.extend(str(x).strip() for x in expanded[:max_expansions] if x)

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


def _get_tier_config(team_obj) -> dict:
    """Read PLAN_TIERS config for the team's plan tier, with sensible fallbacks."""
    from django.conf import settings
    plan_tiers = getattr(settings, "PLAN_TIERS", {})
    plan = getattr(team_obj, "plan", "free") if team_obj else "free"
    tier = plan_tiers.get(plan, plan_tiers.get("free", {}))
    return {
        "retrieve_k": tier.get("retrieve_k", 10),
        "context_tokens": tier.get("context_tokens", 2000),
        "query_expansions": tier.get("query_expansions", 0),
        "reranker": tier.get("reranker"),
        "rerank_k": tier.get("rerank_k", 3),
        "rate_limit_per_minute": tier.get("rate_limit_per_minute", 20),
    }


def _retrieve_wiki_citations(team_id, user_message: str, team_obj=None) -> tuple[list, str]:
    """
    Multi-query expansion → Vector search → wiki + plan citation payloads.
    Generates multiple variations of the query to ensure deep semantic coverage.
    Tier-gated by the team's plan (free/team/pro).
    """
    from django.conf import settings

    tier_cfg = _get_tier_config(team_obj)

    # Tier-gated: retrieve_k from PLAN_TIERS, falling back to env default
    limit = tier_cfg["retrieve_k"]
    # Tier-gated: context budget from PLAN_TIERS (chars ~ 4 * tokens)
    max_chars = tier_cfg["context_tokens"] * 4

    search_queries = (
        expand_search_queries(user_message, team_obj, max_expansions=tier_cfg["query_expansions"])
        if team_obj
        else [(user_message or "").strip()]
    )
    search_queries = [q for q in search_queries if q]
    if not search_queries:
        search_queries = [(user_message or "").strip()]

    all_results = []
    seen_ids = set()

    try:
        for q in search_queries:
            # Fetch more for broader coverage, then we'll deduplicate
            results = vector_store.search_similar_pages(team_id, q, limit=limit)
            for res in results:
                if res.id not in seen_ids:
                    all_results.append(res)
                    seen_ids.add(res.id)
    except Exception:
        logger.exception("Wiki citation search failed (team_id=%s)", team_id)
        return [], ""

    # Sort all expanded results by score
    all_results.sort(key=lambda x: x.score, reverse=True)
    results = all_results[:limit]

    # Cross-encoder reranking for team/pro tiers
    reranker_model_name = tier_cfg.get("reranker")
    if reranker_model_name and len(results) > 1:
        try:
            from sentence_transformers import CrossEncoder
            reranker = CrossEncoder(reranker_model_name)
            pairs = [(user_message, (res.payload or {}).get("content", "")) for res in results]
            rerank_scores = reranker.predict(pairs, show_progress_bar=False)
            for i, score in enumerate(rerank_scores):
                results[i].rerank_score = float(score)
            results.sort(key=lambda x: getattr(x, "rerank_score", 0.0), reverse=True)
            # After reranking, only keep top-k for team/pro
            rerank_k = tier_cfg.get("rerank_k", limit)
            if rerank_k and rerank_k < len(results):
                results = results[:rerank_k]
        except Exception:
            logger.warning("Cross-encoder reranking failed, using vector scores only.")

    citations = []
    context_blocks = []
    for res in results:
        payload = res.payload or {}
        source_type = payload.get("source_type") or "wiki"
        snippet = payload.get("content", "")
        chunk_id = payload.get("chunk_id")

        if source_type == "plan":
            project_id = payload.get("project_id")
            project_name = payload.get("project_name", "Untitled Project")
            source_kind = payload.get("source_kind", "project")
            source_ref_id = payload.get("source_ref_id")
            title = payload.get("title") or f"{source_kind.title()} — {project_name}"

            citations.append(
                {
                    "source": "plan",
                    "project_id": project_id,
                    "project_name": project_name,
                    "source_kind": source_kind,
                    "source_ref_id": source_ref_id,
                    "title": title,
                    "snippet": snippet[:200],
                    "score": float(res.score),
                    "chunk_id": chunk_id,
                }
            )
            context_blocks.append(
                f"SOURCE: {title} (Plan: {project_name})\nCONTENT: {snippet}"
            )
            continue

        page_id = payload.get("page_id")
        title = payload.get("page_title", "Untitled")
        anchor_hint = payload.get("section_title") or payload.get("heading") or payload.get("section") or ""
        slug = "unknown"
        try:
            if page_id:
                p = WikiPage.objects.only("slug").get(id=page_id)
                slug = p.slug
        except Exception:
            pass

        citations.append(
            {
                "source": "wiki",
                "page_id": page_id,
                "page_title": title,
                "page_slug": slug,
                "snippet": snippet[:200],
                "score": float(res.score),
                "chunk_id": chunk_id,
                "anchor_hint": anchor_hint,
            }
        )
        context_blocks.append(f"SOURCE: {title}\nCONTENT: {snippet}")

    # Drop lowest-ranked tail chunks until under character budget (results are best-first).
    while context_blocks:
        candidate = "\n\n".join(context_blocks)
        if len(candidate) <= max_chars:
            break
        if len(context_blocks) > 1:
            context_blocks.pop()
            citations.pop()
        else:
            block = context_blocks[0]
            sep = "\nCONTENT: "
            idx = block.find(sep)
            if idx == -1:
                context_blocks[0] = block[:max_chars]
            else:
                head = block[: idx + len(sep)]
                body = block[idx + len(sep) :]
                keep = max(0, max_chars - len(head))
                context_blocks[0] = head + body[:keep]
                citations[0]["snippet"] = body[: min(200, keep)]
            break

    context_str = "\n\n".join(context_blocks)
    if len(context_str) > max_chars:
        context_str = context_str[:max_chars]

    return citations, context_str
