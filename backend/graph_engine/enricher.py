"""Automatically discovers and adds edges based on content analysis."""

import logging
from llm_orchestrator.orchestrator import llm_call
from graph_engine.models import GraphEdge
from wiki.models import WikiPage

logger = logging.getLogger(__name__)

ALLOWED_EDGE_TYPES = {"related", "depends_on", "prerequisite", "contradicts", "extends", "manual"}


def enrich_on_page_save(page: WikiPage):
    """After a page is saved, discover new edges to other pages."""
    team_id = str(page.team_id)

    # Find candidate pages to link to
    candidates = WikiPage.objects.filter(
        team_id=team_id, is_deleted=False
    ).exclude(id=page.id)[:20]

    if not candidates:
        return

    candidate_list = "\n".join(
        f"- {c.title}: {c.content[:300]}"
        for c in candidates
    )

    prompt = f"""Analyze this wiki page and determine which other pages it should be linked to.

Current page: "{page.title}"
{page.content[:3000]}

Candidate pages:
{candidate_list}

For each page that has a meaningful relationship, return:
[{{"page_title": "...", "edge_type": "related|depends_on|prerequisite|extends|contradicts", "reason": "why"}}]

Only include genuinely related pages. Max 5 suggestions."""

    resp, _, _ = llm_call(
        system="You are a knowledge graph curator. Return only valid JSON array.",
        prompt=prompt
    )

    try:
        import json
        suggestions = json.loads(resp.choices[0].message.content if resp else "[]")
    except (json.JSONDecodeError, AttributeError):
        return

    title_to_id = {c.title: str(c.id) for c in candidates}

    created = 0
    for s in suggestions:
        target_title = s.get("page_title", "")
        target_id = title_to_id.get(target_title)
        if not target_id:
            continue

        edge_type = s.get("edge_type", "related")
        if edge_type not in ALLOWED_EDGE_TYPES:
            edge_type = "related"

        # Check if edge already exists
        exists = GraphEdge.objects.filter(
            from_page_id=page.id,
            to_page_id=target_id,
            edge_type=edge_type,
        ).exists()

        if not exists:
            GraphEdge.objects.create(
                from_page=page,
                to_page_id=target_id,
                edge_type=edge_type,
                metadata={"reason": s.get("reason", ""), "auto": True},
            )
            created += 1

    if created:
        logger.info("Auto-enriched %d edges for page '%s'", created, page.title)


def periodic_global_enrichment(team_id: str):
    """Scheduled: re-scan all pages for missed connections."""
    pages = list(WikiPage.objects.filter(team_id=team_id, is_deleted=False))

    if len(pages) < 2:
        return

    # Process in batches to avoid overwhelming the LLM
    batch_size = 5
    total_created = 0

    for i in range(0, len(pages), batch_size):
        batch = pages[i:i + batch_size]
        for page in batch:
            try:
                enrich_on_page_save(page)
                total_created += 1
            except Exception as e:
                logger.error("Enrichment failed for page '%s': %s", page.title, e)

    logger.info("Global enrichment complete for team %s", team_id)
    return total_created
