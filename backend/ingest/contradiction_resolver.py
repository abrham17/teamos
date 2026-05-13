"""
GitHub-style contradiction resolution for wiki knowledge conflicts.

When the agent detects contradictions between new and existing content,
this module creates structured changesets that present conflicts
side-by-side for human review.
"""

from __future__ import annotations

import json
import logging
import uuid

from ingest.models import IngestJob, WikiChangeSet
from wiki.models import WikiPage

logger = logging.getLogger(__name__)


def create_contradiction_changeset(
    job: IngestJob,
    pages: list[WikiPage],
    contradictions: list[dict],
    raw_text: str,
) -> WikiChangeSet:
    """
    Create a WikiChangeSet that presents contradictions in a GitHub
    conflict-resolution format.

    contradictions: list of dicts from the relation classifier:
    [
        {
            "existing_page_id": "...",
            "existing_page_title": "...",
            "relation_type": "contradicts",
            "confidence": 0.9,
            "reason": "Both discuss API auth but recommend different approaches",
            "contradiction_details": {
                "existing_snippet": "Use OAuth 2.0...",
                "new_snippet": "Use API keys..."
            }
        }
    ]
    """
    diff_summary = {
        "contradictions": [],
        "additions": [],
        "related_pages": [],
        "new_pages": [{"id": str(p.id), "title": p.title} for p in pages],
    }

    for c in contradictions:
        details = c.get("contradiction_details") or {}
        diff_summary["contradictions"].append({
            "existing_page_id": c.get("existing_page_id"),
            "existing_page_title": c.get("existing_page_title"),
            "confidence": c.get("confidence", 0.0),
            "reason": c.get("reason", ""),
            "existing_snippet": details.get("existing_snippet", ""),
            "new_snippet": details.get("new_snippet", ""),
            # GitHub-style conflict markers
            "conflict_block": _format_conflict_block(
                existing_snippet=details.get("existing_snippet", ""),
                new_snippet=details.get("new_snippet", ""),
                existing_title=c.get("existing_page_title", "Existing"),
            ),
        })
        diff_summary["related_pages"].append(c.get("existing_page_title"))

    # Build proposed content from all new pages
    proposed = "\n\n---\n\n".join(
        f"# {p.title}\n\n{p.content}" for p in pages
    )

    cs = WikiChangeSet.objects.create(
        job=job,
        proposed_content=proposed,
        diff_summary=diff_summary,
        status=WikiChangeSet.STATUS_PENDING,
    )

    logger.info(
        "Created contradiction changeset %s for job %s with %d conflicts",
        cs.id, job.id, len(contradictions),
    )
    return cs


def _format_conflict_block(
    existing_snippet: str,
    new_snippet: str,
    existing_title: str,
) -> str:
    """
    Format contradictions like Git merge conflicts:

    <<<<<<< EXISTING: API Security Policy
    All API endpoints must use OAuth 2.0 with JWT tokens.
    =======
    Internal APIs should use API key authentication for simplicity.
    >>>>>>> NEW CONTENT
    """
    return (
        f"<<<<<<< EXISTING: {existing_title}\n"
        f"{existing_snippet}\n"
        f"=======\n"
        f"{new_snippet}\n"
        f">>>>>>> NEW CONTENT"
    )


def get_contradiction_detail(changeset: WikiChangeSet) -> dict:
    """
    Returns structured contradiction data for the frontend to render
    a GitHub-style conflict resolution UI.
    """
    diff = changeset.diff_summary or {}
    contradictions = diff.get("contradictions", [])

    conflicts = []
    for c in contradictions:
        conflicts.append({
            "id": str(uuid.uuid4()),
            "existing_page_id": c.get("existing_page_id"),
            "existing_page_title": c.get("existing_page_title"),
            "existing_snippet": c.get("existing_snippet", ""),
            "new_snippet": c.get("new_snippet", ""),
            "reason": c.get("reason", ""),
            "confidence": c.get("confidence", 0.0),
            "conflict_block": c.get("conflict_block", ""),
            # Resolution state (updated by frontend)
            "resolution": None,  # "keep_existing" | "accept_new" | "manual_merge"
            "merged_content": None,
        })

    return {
        "changeset_id": str(changeset.id),
        "job_id": str(changeset.job_id),
        "conflict_count": len(conflicts),
        "conflicts": conflicts,
        "new_pages": diff.get("new_pages", []),
        "proposed_content": changeset.proposed_content,
    }


def resolve_contradiction(
    changeset: WikiChangeSet,
    resolutions: list[dict],
) -> None:
    """
    Apply user's conflict resolutions to the changeset.

    resolutions: list of {"conflict_id": "...", "resolution": "keep_existing" | "accept_new" | "manual_merge", "merged_content": "..."}
    """
    diff = dict(changeset.diff_summary or {})
    diff["resolutions"] = resolutions
    diff["resolved"] = True

    # Merge resolved content into proposed_content
    proposed = changeset.proposed_content or ""
    for r in resolutions:
        resolution = r.get("resolution", "")
        if resolution == "keep_existing":
            # Remove the new content block, keep existing
            new_snippet = ""
            for c in diff.get("contradictions", []):
                if c.get("id") == r.get("conflict_id") or c.get("existing_page_id") == r.get("conflict_id"):
                    new_snippet = c.get("new_snippet", "")
                    break
            if new_snippet and new_snippet in proposed:
                proposed = proposed.replace(new_snippet, "")
        elif resolution == "manual_merge":
            merged = r.get("merged_content", "")
            if merged:
                # Replace conflicting sections with merged content
                for c in diff.get("contradictions", []):
                    if c.get("id") == r.get("conflict_id") or c.get("existing_page_id") == r.get("conflict_id"):
                        old_new = c.get("new_snippet", "")
                        if old_new and old_new in proposed:
                            proposed = proposed.replace(old_new, merged)
                        break

    changeset.proposed_content = proposed
    changeset.diff_summary = diff
    changeset.save(update_fields=["proposed_content", "diff_summary", "updated_at"])
