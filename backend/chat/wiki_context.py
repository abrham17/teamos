"""
Team wiki catalog / overview context for chat (metadata + inventory queries).
"""

from __future__ import annotations

from django.db.models import Count

from wiki.models import WikiPage


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
