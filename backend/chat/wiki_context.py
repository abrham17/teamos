"""
Team wiki catalog / overview context for chat (metadata + inventory queries).
"""

from __future__ import annotations

import re

from django.db.models import Count

from wiki.models import WikiPage

# Meta questions about the wiki as a whole (not topic-specific RAG).
_CATALOG_INTENT_RE = re.compile(
    r"(?:"
    r"knowledge\s*base|"
    r"(?:my|our|the)\s+wiki|"
    r"wiki(?:'s|s)?\s+(?:have|contain|include|cover|about|overview|inventory|catalog|list)|"
    r"what(?:'s| is| are)\s+(?:in|on)\s+(?:my|our|the)\s+wiki|"
    r"what\s+do\s+(?:i|we)\s+have\s+(?:in|on)\s+(?:the\s+)?wiki|"
    r"(?:list|show|describe|explain|summarize|overview)\s+(?:all\s+)?(?:my|our|the\s+)?(?:wiki|pages|documents|knowledge)|"
    r"how\s+many\s+(?:wiki\s+)?pages|"
    r"what\s+pages\s+(?:do\s+we|are\s+there)|"
    r"team\s+knowledge|"
    r"indexed\s+knowledge|"
    r"what(?:'s| is)\s+in\s+(?:the\s+)?(?:knowledge\s+base|kb)"
    r")",
    re.IGNORECASE,
)


def is_catalog_intent(message: str) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    if _CATALOG_INTENT_RE.search(text):
        return True
    # Short vague prompts
    lower = text.lower()
    if len(text) < 80 and any(
        p in lower
        for p in (
            "my wiki",
            "our wiki",
            "knowledge base",
            "what do we have",
            "what do i have",
            "all pages",
            "wiki pages",
        )
    ):
        return True
    return False


def build_team_wiki_overview(team_id: str, *, max_listed: int = 150) -> str:
    """
    Structured catalog of team wiki pages for LLM context (titles, types, summaries).
    """
    qs = WikiPage.objects.filter(team_id=team_id, is_deleted=False)
    total = qs.count()
    if total == 0:
        return "TEAM WIKI CATALOG: No wiki pages exist yet for this team."

    type_counts = dict(
        qs.values("page_type")
        .annotate(n=Count("id"))
        .values_list("page_type", "n")
    )

    lines = [
        f"TEAM WIKI CATALOG — {total} page(s) total.",
        f"Breakdown by page_type: {type_counts}",
        "",
        "Pages (newest first; title | page_type | slug | summary):",
    ]

    for page in qs.order_by("-updated_at")[:max_listed]:
        fm = page.frontmatter if isinstance(page.frontmatter, dict) else {}
        summary = (fm.get("ingest_summary") or page.summary or "").replace("\n", " ").strip()
        if len(summary) > 220:
            summary = summary[:217] + "..."
        lines.append(f"- {page.title} | {page.page_type or 'standard'} | {page.slug} | {summary}")

    if total > max_listed:
        lines.append(f"... and {total - max_listed} more page(s) not listed here.")

    try:
        from ingest.models import RawSource, WikiSourceCitation

        raw_n = RawSource.objects.filter(team_id=team_id).count()
        cit_n = WikiSourceCitation.objects.filter(wiki_page__team_id=team_id).count()
        lines.append("")
        lines.append(f"Ingested raw sources: {raw_n}. Source citations on wiki pages: {cit_n}.")
    except Exception:
        pass

    try:
        from graph_engine.models import GraphEdge

        edge_n = GraphEdge.objects.filter(from_page__team_id=team_id).count()
        lines.append(f"Knowledge graph edges: {edge_n}.")
    except Exception:
        pass

    return "\n".join(lines)


def merge_chat_context(
    *,
    user_message: str,
    rag_context: str,
    team_id: str,
    max_chars: int,
) -> str:
    """
    Combine wiki catalog (for meta queries) with semantic RAG excerpts within max_chars.
    """
    rag_context = (rag_context or "").strip()
    catalog = ""
    if is_catalog_intent(user_message):
        catalog = build_team_wiki_overview(team_id).strip()

    if not catalog and not rag_context:
        return ""

    if not catalog:
        return rag_context[:max_chars]

    if not rag_context:
        return catalog[:max_chars]

    header_cat = "=== TEAM WIKI CATALOG (titles, types, metadata) ===\n"
    header_rag = "\n\n=== RELEVANT CONTENT EXCERPTS (semantic search) ===\n"
    overhead = len(header_cat) + len(header_rag)

    # Reserve at least 35% of budget for catalog on meta queries; 20% otherwise.
    catalog_ratio = 0.45 if is_catalog_intent(user_message) else 0.22
    catalog_budget = min(len(catalog), int(max_chars * catalog_ratio))
    rag_budget = max(0, max_chars - overhead - catalog_budget)

    cat_part = catalog[:catalog_budget]
    rag_part = rag_context[:rag_budget]

    combined = header_cat + cat_part + header_rag + rag_part
    if len(combined) > max_chars:
        combined = combined[:max_chars]
    return combined
