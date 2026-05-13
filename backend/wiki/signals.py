"""Wiki change event handlers for plan synchronization."""

import json
import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from wiki.models import WikiPage
from planning.models import Task, Project

logger = logging.getLogger(__name__)


@receiver(post_save, sender=WikiPage)
def on_wiki_page_saved(sender, instance, created, **kwargs):
    """After a wiki page is saved, check for plan impacts."""
    if instance.is_deleted:
        return

    team_id = str(instance.team_id)

    try:
        # When a new page is created, scan active plans for tasks that should reference it
        if created:
            _scan_plans_for_new_page(instance, team_id)

        # When a page is updated, check if active tasks referencing it need attention
        if not created:
            _check_affected_tasks(instance, team_id)
    except Exception:
        # Never break WikiPage.save() (e.g. ingest worker, admin); log and continue.
        logger.exception(
            "Wiki post_save handler failed for page id=%s title=%s",
            getattr(instance, "pk", None),
            getattr(instance, "title", ""),
        )


@receiver(post_delete, sender=WikiPage)
def on_wiki_page_deleted(sender, instance, **kwargs):
    """When a wiki page is deleted, flag orphaned plan tasks."""
    team_id = str(instance.team_id)

    affected = Task.objects.filter(
        project__team_id=team_id,
        description__contains=f"[[{instance.title}]]",
        status__in=["todo", "in-progress"],
    )

    for task in affected:
        task.frontmatter = task.frontmatter or {}
        task.frontmatter["orphaned_references"] = task.frontmatter.get("orphaned_references", [])
        task.frontmatter["orphaned_references"].append({
            "wiki_page": instance.title,
            "deleted_at": str(instance.updated_at),
        })
        task.save(update_fields=["frontmatter"])

    if affected.exists():
        logger.info(
            "Wiki page '%s' deleted — flagged %d orphaned tasks",
            instance.title, affected.count()
        )


def _scan_plans_for_new_page(page: WikiPage, team_id: str):
    """Check if any active project tasks should reference this new page."""
    # Materialize before further filters: Django forbids .filter() after [:50].
    active_tasks = list(
        Task.objects.filter(
            project__team_id=team_id,
            status__in=["todo", "in-progress"],
        ).select_related("project")[:50]
    )

    if not active_tasks:
        return

    task_list = "\n".join(
        f"- [{t.project.name}] {t.title}: {t.description[:200] if t.description else 'No description'}"
        for t in active_tasks
    )

    from llm_orchestrator.orchestrator import llm_call

    prompt = f"""A new wiki page was created. Check if any active tasks should reference it.

New page: "{page.title}"
Content:
{page.content[:2000]}

Active tasks:
{task_list}

Return JSON array of task titles that should reference this page:
[{{"task_title": "...", "reason": "why"}}]
If none, return []."""

    try:
        resp, _, _ = llm_call(
            team=page.team,
            operation="wiki_plan_linker",
            messages=[
                {
                    "role": "system",
                    "content": "You are a project-wiki linker. Return only valid JSON array.",
                },
                {"role": "user", "content": prompt},
            ],
            user=page.created_by,
            temperature=0.3,
        )
    except Exception:
        logger.exception("wiki_plan_linker LLM call failed for page %s", page.title)
        return

    try:
        raw = (
            resp.choices[0].message.content
            if resp and resp.choices
            else "[]"
        )
        raw = raw.strip()
        raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        matches = json.loads(raw)
        if not isinstance(matches, list):
            logger.warning(
                "wiki_plan_linker expected a JSON array for page %s, got %s",
                page.title,
                type(matches).__name__,
            )
            return
        by_title = {t.title: t for t in active_tasks}
        for match in matches:
            task_title = match.get("task_title", "")
            task = by_title.get(task_title)
            if task:
                task.description = (task.description or "") + f"\n\n📄 See: [[{page.title}]]"
                task.save(update_fields=["description"])
    except (json.JSONDecodeError, AttributeError):
        pass


def _check_affected_tasks(page: WikiPage, team_id: str):
    """When a page is updated, notify if active tasks reference it."""
    affected = Task.objects.filter(
        project__team_id=team_id,
        description__contains=f"[[{page.title}]]",
        status__in=["todo", "in-progress"],
    )

    if affected.exists():
        for task in affected:
            task.frontmatter = task.frontmatter or {}
            task.frontmatter["wiki_updates"] = task.frontmatter.get("wiki_updates", [])
            task.frontmatter["wiki_updates"].append({
                "page": page.title,
                "updated_at": str(page.updated_at),
            })
            task.save(update_fields=["frontmatter"])

        logger.info(
            "Wiki page '%s' updated — notified %d affected tasks",
            page.title, affected.count()
        )
