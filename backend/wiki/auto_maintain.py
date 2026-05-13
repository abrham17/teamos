"""Autonomous wiki health maintenance."""

from dataclasses import dataclass, field
from llm_orchestrator.orchestrator import llm_call
from wiki.models import WikiPage


@dataclass
class Contradiction:
    page_a: str
    page_b: str
    topic: str
    summary: str
    severity: str  # "low", "medium", "high"


@dataclass
class MergeSuggestion:
    page_a: str
    page_b: str
    similarity: float
    reason: str


def detect_contradictions(team_id: str) -> list[Contradiction]:
    """Find pages that contradict each other using semantic comparison."""
    pages = list(WikiPage.objects.filter(
        team_id=team_id, is_deleted=False
    ).values("id", "title", "content"))

    if len(pages) < 2:
        return []

    # Compare recent pages against each other in batches
    contradictions = []
    recent = sorted(pages, key=lambda p: p["title"])[:20]

    for i, p1 in enumerate(recent):
        for p2 in recent[i + 1:]:
            prompt = f"""Compare these two wiki pages for contradictions or conflicting information.

Page A: "{p1['title']}"
{p1['content'][:2000]}

Page B: "{p2['title']}"
{p2['content'][:2000]}

Are there any contradictions? Return JSON:
{{"has_contradiction": true/false, "topic": "what they disagree on", "summary": "brief description", "severity": "low/medium/high"}}"""

            resp, _, _ = llm_call(
                system="You are a knowledge quality auditor. Return only valid JSON.",
                prompt=prompt
            )

            try:
                import json
                data = json.loads(resp.choices[0].message.content if resp else "{}")
                if data.get("has_contradiction"):
                    contradictions.append(Contradiction(
                        page_a=p1["title"],
                        page_b=p2["title"],
                        topic=data.get("topic", ""),
                        summary=data.get("summary", ""),
                        severity=data.get("severity", "medium"),
                    ))
            except (json.JSONDecodeError, AttributeError):
                continue

    return contradictions


def merge_duplicates(team_id: str) -> list[MergeSuggestion]:
    """Find semantically similar pages that should be merged."""
    pages = list(WikiPage.objects.filter(
        team_id=team_id, is_deleted=False
    ).values("id", "title", "content"))

    if len(pages) < 2:
        return []

    suggestions = []
    recent = sorted(pages, key=lambda p: p["title"])[:20]

    for i, p1 in enumerate(recent):
        for p2 in recent[i + 1:]:
            prompt = f"""Compare these two wiki pages. Should they be merged?

Page A: "{p1['title']}"
{p1['content'][:1500]}

Page B: "{p2['title']}"
{p2['content'][:1500]}

Return JSON:
{{"should_merge": true/false, "similarity": 0-100, "reason": "why they should or shouldn't be merged"}}"""

            resp, _, _ = llm_call(
                system="You are a wiki organization expert. Return only valid JSON.",
                prompt=prompt
            )

            try:
                import json
                data = json.loads(resp.choices[0].message.content if resp else "{}")
                if data.get("should_merge") and data.get("similarity", 0) > 70:
                    suggestions.append(MergeSuggestion(
                        page_a=p1["title"],
                        page_b=p2["title"],
                        similarity=data["similarity"],
                        reason=data.get("reason", ""),
                    ))
            except (json.JSONDecodeError, AttributeError):
                continue

    return suggestions


def update_stale_references(updated_page_id: str):
    """When a page is updated, check if other pages referencing it need updates."""
    try:
        updated_page = WikiPage.objects.get(id=updated_page_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return

    # Find pages that reference this page via wikilinks
    referencing = WikiPage.objects.filter(
        team_id=updated_page.team_id,
        is_deleted=False,
        content__contains=f"[[{updated_page.title}]]"
    ).exclude(id=updated_page_id)

    for ref_page in referencing[:5]:
        prompt = f"""A wiki page was updated. Check if this referencing page needs updates.

Updated page: "{updated_page.title}"
New content:
{updated_page.content[:2000]}

Referencing page: "{ref_page.title}"
{ref_page.content[:2000]}

Does the referencing page contain outdated information about the updated page?
Return JSON: {{"needs_update": true/false, "section": "which section", "suggestion": "what to change"}}"""

        resp, _, _ = llm_call(
            system="You are a wiki maintenance bot. Return only valid JSON.",
            prompt=prompt
        )

        try:
            import json
            data = json.loads(resp.choices[0].message.content if resp else "{}")
            if data.get("needs_update"):
                # Store as a frontmatter flag for manual review
                ref_page.frontmatter = ref_page.frontmatter or {}
                ref_page.frontmatter["stale_references"] = ref_page.frontmatter.get("stale_references", [])
                ref_page.frontmatter["stale_references"].append({
                    "source": updated_page.title,
                    "section": data.get("section", ""),
                    "suggestion": data.get("suggestion", ""),
                })
                ref_page.save(update_fields=["frontmatter"])
        except (json.JSONDecodeError, AttributeError):
            continue


def generate_index_pages(team_id: str):
    """Auto-generate category/index pages from page_type groupings."""
    pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)

    page_types = {}
    for page in pages:
        pt = page.page_type or "standard"
        if pt not in page_types:
            page_types[pt] = []
        page_types[pt].append(page)

    for page_type, type_pages in page_types.items():
        if len(type_pages) < 2:
            continue

        titles = [p.title for p in type_pages]
        prompt = f"""Generate an index page for the following wiki pages of type "{page_type}".

Pages:
{chr(10).join(f'- {t}' for t in titles)}

Create a markdown index page with:
1. A brief description of this category
2. A bullet list of all pages with one-line descriptions
3. Suggested cross-references between related pages

Output only the markdown."""

        resp, _, _ = llm_call(
            system="You are a wiki organizer. Output only markdown.",
            prompt=prompt
        )

        content = resp.choices[0].message.content if resp else ""
        if content:
            # Create or update the index page
            slug = f"index-{page_type}"
            WikiPage.objects.update_or_create(
                team_id=team_id,
                slug=slug,
                defaults={
                    "title": f"Index: {page_type.replace('_', ' ').title()}",
                    "content": content,
                    "page_type": "index",
                    "frontmatter": {"auto_generated": True, "category": page_type},
                }
            )


def compute_page_health_score(page_id: str) -> float:
    """Score a page 0-100 based on: freshness, completeness, link density, contradictions."""
    try:
        page = WikiPage.objects.get(id=page_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return 0.0

    score = 50.0  # Base score

    # Freshness: pages updated in last 30 days get bonus
    from datetime import timedelta
    from django.utils import timezone
    days_since_update = (timezone.now() - page.updated_at).days
    if days_since_update < 7:
        score += 20
    elif days_since_update < 30:
        score += 10
    elif days_since_update > 180:
        score -= 15

    # Completeness: longer content is better (within reason)
    content_len = len(page.content)
    if content_len > 5000:
        score += 15
    elif content_len > 1000:
        score += 8
    elif content_len < 200:
        score -= 20

    # Link density: count wikilinks
    import re
    link_count = len(re.findall(r"\[\[([^\]]+)\]\]", page.content))
    if link_count > 10:
        score += 15
    elif link_count > 3:
        score += 8
    elif link_count == 0 and content_len > 500:
        score -= 10

    # Backlinks: pages that link to this one
    backlink_count = WikiPage.objects.filter(
        team_id=page.team_id,
        is_deleted=False,
        content__contains=f"[[{page.title}]]"
    ).exclude(id=page_id).count()
    if backlink_count > 5:
        score += 10
    elif backlink_count > 0:
        score += 5

    return max(0.0, min(100.0, score))
