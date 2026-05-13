"""Inline AI editing capabilities for the wiki."""

from dataclasses import dataclass, field
from llm_orchestrator.orchestrator import llm_call
from wiki.models import WikiPage
from planning.models import Project, Task, Milestone


@dataclass
class SuggestedLink:
    page_title: str
    page_slug: str
    relevance: str


@dataclass
class StaleSection:
    heading: str
    reason: str
    newer_source: str


def _get_page_or_none(team_id: str, page_id: str) -> WikiPage | None:
    try:
        return WikiPage.objects.get(id=page_id, team_id=team_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return None


def expand_section(team_id: str, page_id: str, section_heading: str, instructions: str = "") -> str:
    """Expand a section with more detail using wiki context."""
    page = _get_page_or_none(team_id, page_id)
    if not page:
        return ""

    # Gather related pages for context
    related = WikiPage.objects.filter(
        team_id=team_id, is_deleted=False
    ).exclude(id=page_id).values_list("title", flat=True)[:10]

    prompt = f"""Expand the section "{section_heading}" in the wiki page "{page.title}".

Current page content:
```
{page.content[:4000]}
```

Related wiki pages: {", ".join(related) if related else "None"}

Instructions: {instructions or "Add more detail, examples, and best practices."}

Output ONLY the expanded markdown for this section. Do not repeat the heading."""
    
    resp, _, _ = llm_call(system="You are a technical wiki editor. Output only markdown.", prompt=prompt)
    return resp.choices[0].message.content if resp else ""


def summarize_page(team_id: str, page_id: str) -> str:
    """Generate executive summary of a wiki page."""
    page = _get_page_or_none(team_id, page_id)
    if not page:
        return ""

    prompt = f"""Summarize this wiki page in 3-5 bullet points capturing the key information.

Title: {page.title}
Content:
```
{page.content[:6000]}
```

Output only the bullet-point summary in markdown."""
    
    resp, _, _ = llm_call(system="You are a technical summarizer. Output only markdown bullets.", prompt=prompt)
    return resp.choices[0].message.content if resp else ""


def suggest_links(team_id: str, page_id: str) -> list[SuggestedLink]:
    """Suggest [[wikilinks]] to other pages based on content."""
    page = _get_page_or_none(team_id, page_id)
    if not page:
        return []

    all_pages = list(WikiPage.objects.filter(
        team_id=team_id, is_deleted=False
    ).exclude(id=page_id).values("title", "slug"))

    if not all_pages:
        return []

    page_list = "\n".join(p["title"] for p in all_pages)

    prompt = f"""Given this wiki page content and the list of other pages, suggest which pages should be linked with [[wikilinks]].

Current page: "{page.title}"
Content:
```
{page.content[:4000]}
```

Available pages:
{page_list}

Return JSON array: [{{"page_title": "...", "relevance": "why this should be linked"}}]
Only suggest pages that are genuinely relevant. Max 5 suggestions."""
    
    resp, _, _ = llm_call(system="You are a knowledge graph curator. Return only valid JSON array.", prompt=prompt)
    
    try:
        import json
        suggestions = json.loads(resp.choices[0].message.content if resp else "[]")
        result = []
        page_map = {p["title"]: p["slug"] for p in all_pages}
        for s in suggestions:
            title = s.get("page_title", "")
            if title in page_map:
                result.append(SuggestedLink(
                    page_title=title,
                    page_slug=page_map[title],
                    relevance=s.get("relevance", "")
                ))
        return result
    except (json.JSONDecodeError, AttributeError):
        return []


def detect_stale_content(team_id: str, page_id: str) -> list[StaleSection]:
    """Identify sections that may be outdated based on newer pages."""
    page = _get_page_or_none(team_id, page_id)
    if not page:
        return []

    newer_pages = WikiPage.objects.filter(
        team_id=team_id, is_deleted=False
    ).exclude(id=page_id).order_by("-updated_at")[:5]

    if not newer_pages:
        return []

    newer_context = "\n\n".join(
        f"Page: {p.title}\nUpdated: {p.updated_at.date()}\n{p.content[:500]}"
        for p in newer_pages
    )

    prompt = f"""Compare this older wiki page against newer pages to find stale/outdated sections.

Page to check: "{page.title}" (updated: {page.updated_at.date()})
Content:
```
{page.content[:4000]}
```

Newer pages:
{newer_context}

Return JSON array: [{{"heading": "section name", "reason": "why it's stale", "newer_source": "which page has newer info"}}]
If nothing is stale, return empty array []."""
    
    resp, _, _ = llm_call(system="You are a wiki quality auditor. Return only valid JSON array.", prompt=prompt)
    
    try:
        import json
        data = json.loads(resp.choices[0].message.content if resp else "[]")
        return [StaleSection(**item) for item in data]
    except (json.JSONDecodeError, AttributeError, TypeError):
        return []


def generate_from_plan(team_id: str, project_id: str) -> str:
    """Generate comprehensive wiki documentation from a project plan."""
    try:
        project = Project.objects.get(id=project_id, team_id=team_id)
    except Project.DoesNotExist:
        return ""

    tasks = list(Task.objects.filter(project=project).values(
        "title", "description", "status", "priority", "start_date", "end_date"
    ))
    milestones = list(Milestone.objects.filter(project=project).values(
        "title", "description", "target_date", "status"
    ))

    prompt = f"""Generate a comprehensive wiki page documenting this project plan.

Project: {project.name}
Description: {project.description or "No description"}
Status: {project.status}

Tasks ({len(tasks)}):
{_format_items(tasks)}

Milestones ({len(milestones)}):
{_format_items(milestones)}

Generate a well-structured markdown wiki page with:
1. Project overview and objectives
2. Strategic roadmap with checkpoints and milestones
3. Task breakdown with priorities
4. Timeline and dependencies
5. Risk considerations

Output the full markdown page."""
    
    resp, _, _ = llm_call(system="You are a technical documentation writer. Output only markdown.", prompt=prompt)
    return resp.choices[0].message.content if resp else ""


def _format_items(items: list[dict]) -> str:
    lines = []
    for item in items:
        lines.append(f"- {item.get('title', 'Untitled')}: {item.get('status', '?')} | {item.get('priority', '?')}")
    return "\n".join(lines)
