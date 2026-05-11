"""
Ingestion Celery tasks — Phase 2 implements full pipeline.
Phase 1: only wire_page_graph is needed (called after page save).
"""
import re
import logging
from collections import Counter
from celery import shared_task
from teamos_project.dead_letter import record_dead_letter
from teamos_project.logging_utils import ops_logger
from teamos_project.trace import coalesce_trace_id
from product_analytics.services import record_first_once

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=180,
    retry_jitter=True,
    max_retries=3,
)
def wire_page_graph(self, page_id: str, trace_id: str | None = None):
    trace_id = coalesce_trace_id(trace_id, prefix="graph-wire")
    """
    Parse [[wikilinks]] from a WikiPage and create/delete GraphEdge rows.
    Called after every page create or update.
    """
    from wiki.models import WikiPage
    from graph_engine.models import GraphEdge
    from graph_engine.analytics import invalidate_team_graph_analytics_cache

    try:
        page = WikiPage.objects.get(id=page_id)
    except WikiPage.DoesNotExist:
        logger.warning(f"wire_page_graph: page {page_id} not found")
        ops_logger.warning("wire_page_graph_missing_page", trace_id=trace_id, page_id=page_id)
        return

    try:
        # Extract all [[Page Title]] references
        pattern = re.compile(r"\[\[([^\]]+)\]\]")
        linked_titles = set(pattern.findall(page.content))

        # Resolve titles to pages in the same team
        team_pages = WikiPage.objects.filter(
            team=page.team, is_deleted=False
        ).exclude(id=page.id)

        resolved = {}
        for title in linked_titles:
            match = team_pages.filter(title__iexact=title).first()
            if match:
                resolved[title] = match

        # Create new wikilink edges
        existing = set(
            GraphEdge.objects.filter(from_page=page, edge_type="wikilink")
            .values_list("to_page_id", flat=True)
        )
        for title, target in resolved.items():
            if target.id not in existing:
                GraphEdge.objects.get_or_create(
                    from_page=page,
                    to_page=target,
                    edge_type="wikilink",
                    defaults={"confidence": 1.0, "created_by": "human"},
                )

        # Delete stale wikilink edges (links removed from content)
        resolved_ids = {t.id for t in resolved.values()}
        GraphEdge.objects.filter(
            from_page=page, edge_type="wikilink"
        ).exclude(to_page_id__in=resolved_ids).delete()

        infer_ai_edges.delay(page_id, trace_id=trace_id)
        invalidate_team_graph_analytics_cache(page.team_id)
        logger.info(f"wire_page_graph: page {page.slug} → {len(resolved)} wikilink edges")
        ops_logger.info(
            "wire_page_graph_completed",
            trace_id=trace_id,
            page_id=str(page.id),
            team_id=str(page.team_id),
            wikilink_edges=len(resolved),
            task_id=getattr(self.request, "id", None),
        )
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            record_dead_letter(
                task_name="ingest.wire_page_graph",
                error_message=str(exc),
                trace_id=trace_id,
                payload={"page_id": str(page_id)},
                metadata={
                    "task_id": getattr(self.request, "id", None),
                    "retries": self.request.retries,
                    "max_retries": self.max_retries,
                },
            )
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=180,
    retry_jitter=True,
    max_retries=2,
)
def infer_ai_edges(self, page_id: str, trace_id: str | None = None):
    trace_id = coalesce_trace_id(trace_id, prefix="ai-edges")
    """
    High-fidelity AI-inferred edges using Vector Semantic Similarity.
    """
    from wiki.models import WikiPage
    from graph_engine.models import GraphEdge
    from graph_engine.analytics import invalidate_team_graph_analytics_cache
    from ingest.vectors import vector_store

    try:
        page = WikiPage.objects.get(id=page_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        ops_logger.warning("infer_ai_edges_missing_page", trace_id=trace_id, page_id=page_id)
        return

    try:
        # Use title + first chunk as query context
        query_text = f"{page.title}\n{page.content[:500]}"
        results = vector_store.search_similar_pages(page.team.id, query_text, limit=10)

        # Group by page_id and take max score
        page_scores = {}
        for res in results:
            target_page_id = res.payload.get("page_id")
            if not target_page_id or target_page_id == str(page.id):
                continue
            page_scores[target_page_id] = max(page_scores.get(target_page_id, 0), res.score)

        sorted_targets = sorted(page_scores.items(), key=lambda x: x[1], reverse=True)[:3]

        # Delete stale edges (both old ai_inferred and new semantic)
        GraphEdge.objects.filter(from_page=page, edge_type__in=["ai_inferred", "semantic"], created_by="pipeline").delete()
        
        for target_id, score in sorted_targets:
            try:
                target = WikiPage.objects.get(id=target_id)
                GraphEdge.objects.get_or_create(
                    from_page=page,
                    to_page=target,
                    edge_type="semantic",
                    defaults={"confidence": score, "created_by": "pipeline"}
                )
            except WikiPage.DoesNotExist:
                continue

        invalidate_team_graph_analytics_cache(page.team_id)
        logger.info("infer_ai_edges: page %s semantic_edges=%s", page.slug, len(sorted_targets))
        ops_logger.info(
            "infer_ai_edges_completed",
            trace_id=trace_id,
            page_id=str(page.id),
            team_id=str(page.team_id),
            semantic_edges=len(sorted_targets),
            task_id=getattr(self.request, "id", None),
        )
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            record_dead_letter(
                task_name="ingest.infer_ai_edges",
                error_message=str(exc),
                trace_id=trace_id,
                payload={"page_id": str(page_id)},
                metadata={
                    "task_id": getattr(self.request, "id", None),
                    "retries": self.request.retries,
                    "max_retries": self.max_retries,
                },
            )
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    max_retries=2,
)
def run_ingest_job(self, job_id: str, source_text: str = "", trace_id: str | None = None):
    """Execute full ingestion pipeline for a stored ingest job."""
    from ingest.models import IngestJob
    from ingest.pipeline import run_pipeline
    trace_id = coalesce_trace_id(trace_id, prefix="ingest-job")
    job = None
    try:
        job = IngestJob.objects.get(id=job_id)
        job.status = "running"
        job.ingest_stage = "extracting"
        job.ingest_stage_detail = "Job accepted by worker"
        job.error = ""
        job.save(update_fields=["status", "ingest_stage", "ingest_stage_detail", "error", "updated_at"])
        try:
            run_pipeline(job, source_text=source_text or "", trace_id=trace_id)
        finally:
            # Only remove staging file if we are finished (done or failed permanently)
            # DO NOT delete if we might retry, because the file is needed for the next attempt!
            try:
                job.refresh_from_db()
                if job.status in ("done", "failed") and job.staging_file:
                    job.staging_file.delete(save=False)
                    job.staging_file = None
                    job.save(update_fields=["staging_file", "updated_at"])
            except Exception:
                logger.exception("ingest staging cleanup failed for job %s", job_id)
        job.refresh_from_db()
        # Pipeline may leave the job in review_required (auto_approve=False); do not mark done.
        if job.status == "review_required":
            ops_logger.info(
                "run_ingest_job_review_required",
                trace_id=trace_id,
                job_id=job_id,
                team_id=str(job.team_id),
                task_id=getattr(self.request, "id", None),
            )
            return
        job.status = "done"
        job.ingest_stage = "completed"
        job.ingest_stage_detail = "Ingestion completed successfully"
        job.save(update_fields=["status", "ingest_stage", "ingest_stage_detail", "updated_at"])
        if job.team_id and job.created_by_id:
            done_count = IngestJob.objects.filter(team_id=job.team_id, status="done").count()
            if done_count == 1:
                record_first_once(
                    event_name="first_ingest_completed",
                    team=job.team,
                    user=job.created_by,
                    properties={"job_id": str(job.id), "source_type": job.source_type},
                )
        ops_logger.info(
            "run_ingest_job_completed",
            trace_id=trace_id,
            job_id=job_id,
            team_id=str(job.team_id),
            wiki_page_id=str(job.wiki_page_id) if job.wiki_page_id else None,
            task_id=getattr(self.request, "id", None),
        )
    except Exception as e:
        logger.exception(
            "Ingest job failed",
            extra={
                "job_id": job_id,
                "attempt": self.request.retries + 1 if getattr(self, "request", None) else 1,
                "max_retries": self.max_retries,
                "trace_id": trace_id,
            },
        )
        ops_logger.error(
            "run_ingest_job_failed",
            trace_id=trace_id,
            job_id=job_id,
            error=str(e),
            retries=self.request.retries if getattr(self, "request", None) else 0,
            max_retries=self.max_retries,
            task_id=getattr(self.request, "id", None),
        )
        if self.request.retries >= self.max_retries:
            record_dead_letter(
                task_name="ingest.run_ingest_job",
                error_message=str(e),
                trace_id=trace_id,
                payload={"job_id": str(job_id)},
                metadata={
                    "task_id": getattr(self.request, "id", None),
                    "retries": self.request.retries,
                    "max_retries": self.max_retries,
                },
            )
        try:
            if job is None:
                job = IngestJob.objects.get(id=job_id)
            job.error = str(e)
            # Keep running state while retries remain; mark failed only on last attempt.
            if self.request.retries >= self.max_retries:
                job.status = "failed"
                job.ingest_stage = "failed"
                job.ingest_stage_detail = "Retries exhausted"
                job.save(update_fields=["status", "ingest_stage", "ingest_stage_detail", "error", "updated_at"])
            else:
                job.status = "running"
                job.ingest_stage = "extracting"
                job.ingest_stage_detail = "Retrying ingest job"
                job.save(update_fields=["status", "ingest_stage", "ingest_stage_detail", "error", "updated_at"])
        except Exception:
            pass
        raise


@shared_task
def run_gap_analysis(team_id: str):
    """
    Identifies 'Orphan Concepts' — titles linked via [[wikilinks]] that don't exist yet.
    """
    from wiki.models import WikiPage
    
    # 1. Find all mentions in [[wikilinks]]
    pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)
    
    pattern = re.compile(r"\[\[([^\]]+)\]\]")
    mentions = []
    for p in pages:
        mentions.extend(pattern.findall(p.content))
        
    counts = Counter(mentions)
    
    # 2. Filter for titles that don't exist as pages
    existing_titles = set(pages.values_list("title", flat=True))
    orphans = []
    for title, count in counts.items():
        if title not in existing_titles and count >= 2: # Mentioned at least twice
            orphans.append({"title": title, "mentions": count})
            
    orphans.sort(key=lambda x: x["mentions"], reverse=True)
    
    # 3. Log findings
    logger.info(f"Gap Analysis for team {team_id}: Found {len(orphans)} orphan concepts.")
    return orphans


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=180,
    retry_jitter=True,
    max_retries=2,
)
def agent_react_to_page_change(self, page_id: str, event_type: str = "update", trace_id: str | None = None):
    """
    Agent reacts to any wiki page create/update:
    1. Searches for related existing pages
    2. Classifies relationships (extends, contradicts, etc.)
    3. Creates typed graph edges
    4. Injects [[wikilinks]] into the page and related pages
    5. Checks impact on active plans
    """
    trace_id = coalesce_trace_id(trace_id, prefix="agent-react")
    from wiki.models import WikiPage
    from graph_engine.models import GraphEdge
    from ingest.vectors import vector_store
    from ingest.agent_decompose import classify_relations, _inject_wikilink_if_missing
    from graph_engine.analytics import invalidate_team_graph_analytics_cache

    try:
        page = WikiPage.objects.get(id=page_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        ops_logger.warning("agent_react_missing_page", trace_id=trace_id, page_id=page_id)
        return

    try:
        # Step 1: Find related pages via vector search
        search_results = vector_store.search_similar_pages(page.team_id, page.content[:1000], limit=10)

        existing_pages = []
        for res in search_results:
            pid = res.payload.get("page_id")
            if not pid or pid == str(page.id):
                continue
            try:
                ep = WikiPage.objects.get(id=pid, is_deleted=False)
                existing_pages.append({
                    "id": str(ep.id),
                    "title": ep.title,
                    "content_excerpt": ep.content[:800],
                })
            except WikiPage.DoesNotExist:
                continue

        if not existing_pages:
            return

        # Step 2: Classify relations
        relation_result = classify_relations(page.team, page.content, page.title, existing_pages)
        relations = relation_result.get("relations", [])
        suggested_links = relation_result.get("suggested_wikilinks_in_existing", [])

        # Step 3: Create typed graph edges (skip existing ones)
        for rel in relations:
            rel_type = rel.get("relation_type", "unrelated")
            if rel_type == "unrelated":
                continue
            existing_page_id = rel.get("existing_page_id")
            if not existing_page_id:
                continue
            try:
                target_page = WikiPage.objects.get(id=existing_page_id)
                GraphEdge.objects.update_or_create(
                    from_page=page,
                    to_page=target_page,
                    edge_type=rel_type,
                    defaults={
                        "confidence": float(rel.get("confidence", 0.8)),
                        "reason": rel.get("reason", ""),
                        "created_by": "agent",
                    },
                )
            except WikiPage.DoesNotExist:
                continue

        # Step 4: Inject [[wikilinks]] into related pages
        for link in suggested_links:
            existing_page_id = link.get("existing_page_id")
            wikilink_title = link.get("wikilink_title", page.title)
            if existing_page_id:
                try:
                    ep = WikiPage.objects.get(id=existing_page_id, is_deleted=False)
                    _inject_wikilink_if_missing(ep, wikilink_title)
                except WikiPage.DoesNotExist:
                    pass

        invalidate_team_graph_analytics_cache(page.team_id)
        ops_logger.info(
            "agent_react_completed",
            trace_id=trace_id,
            page_id=str(page.id),
            relations_created=len([r for r in relations if r.get("relation_type") != "unrelated"]),
        )
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            record_dead_letter(
                task_name="ingest.agent_react_to_page_change",
                error_message=str(exc),
                trace_id=trace_id,
                payload={"page_id": page_id, "event_type": event_type},
            )
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    max_retries=1,
)
def agent_sync_wiki_to_plans(self, page_id: str, trace_id: str | None = None):
    """
    When a wiki page changes, check if any active plans are affected
    and log the impact for team awareness.
    """
    trace_id = coalesce_trace_id(trace_id, prefix="plan-sync")
    from wiki.models import WikiPage
    from planning.agent_sync import analyze_wiki_change_impact

    try:
        page = WikiPage.objects.get(id=page_id, is_deleted=False)
    except WikiPage.DoesNotExist:
        return

    try:
        impact = analyze_wiki_change_impact(str(page.id), str(page.team_id))

        if impact.get("affected_tasks"):
            from chat.agent_memory_service import set_memory

            set_memory(
                team_id=str(page.team_id),
                key=f"wiki_impact_{page.id}",
                value=impact,
                category="context",
                summary=(
                    f"Wiki page '{page.title}' changed — affects "
                    f"{len(impact['affected_tasks'])} task(s) in "
                    f"{len(impact['affected_projects'])} project(s)"
                ),
            )

        ops_logger.info(
            "agent_wiki_plan_sync_completed",
            trace_id=trace_id,
            page_id=str(page.id),
            affected_projects=len(impact.get("affected_projects", [])),
            affected_tasks=len(impact.get("affected_tasks", [])),
        )
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            record_dead_letter(
                task_name="ingest.agent_sync_wiki_to_plans",
                error_message=str(exc),
                trace_id=trace_id,
                payload={"page_id": page_id},
            )
        raise

