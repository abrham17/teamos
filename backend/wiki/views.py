import re
import json
import logging
from django.utils.text import slugify
from django.db.models import Q
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsTeamMember, CanEditWiki
from teamos_project.api_response import ok, fail
from teamos_project.entitlements import check_quota
from teamos_project.trace import get_request_trace_id
from product_analytics.services import record_first_once
from .models import WikiPage, PageTemplate
from ingest.models import IngestJob, WikiChangeSet
from ingest.serializers import IngestJobSerializer
from ingest.pipeline import approve_wiki_changeset, reject_wiki_changeset, run_pipeline
from .serializers import (
    WikiPageListSerializer,
    WikiPageDetailSerializer,
    WikiPageCreateSerializer,
    PageTemplateSerializer,
    WikiChangeSetSerializer,
)
from llm_orchestrator.orchestrator import llm_call
from django.conf import settings

logger = logging.getLogger(__name__)


def unique_slug(team, title, exclude_id=None):
    base = slugify(title) or "page"
    slug = base
    n = 1
    qs = WikiPage.objects.filter(team=team, slug=slug)
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    while qs.exists():
        slug = f"{base}-{n}"; n += 1
        qs = WikiPage.objects.filter(team=team, slug=slug)
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
    return slug


class WikiPageListView(APIView):
    permission_classes = [IsAuthenticated, CanEditWiki]

    def get(self, request, team_id):
        pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)
        # full-text search
        q = request.query_params.get("q")
        if q:
            pages = pages.filter(Q(title__icontains=q) | Q(content__icontains=q))
        # filter by type
        page_type = request.query_params.get("type")
        if page_type:
            pages = pages.filter(page_type=page_type)
        return ok(WikiPageListSerializer(pages, many=True).data)

    def post(self, request, team_id):
        s = WikiPageCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        membership = request.team_membership
        quota = check_quota(membership.team, "wiki_page_create")
        if not quota.allowed:
            return fail(
                "Plan limit reached for wiki pages.",
                status_code=402,
                code="plan_limit_exceeded",
                details=quota.to_details(),
            )
        slug = unique_slug(membership.team, s.validated_data["title"])
        page = WikiPage.objects.create(
            team=membership.team,
            slug=slug,
            created_by=request.user,
            **s.validated_data,
        )
        if WikiPage.objects.filter(team=membership.team, is_deleted=False).count() == 1:
            record_first_once(
                event_name="first_page_created",
                team=membership.team,
                user=request.user,
                properties={"page_id": str(page.id), "page_slug": page.slug},
            )
        trace_id = get_request_trace_id(request)
        try:
            from wiki.services.reindex import reindex_wiki_page

            reindex_wiki_page(page, trace_id=trace_id, queue_graph=True)
        except Exception:
            logger.exception(
                "Failed to reindex wiki page after creation",
                extra={"team_id": str(membership.team_id), "page_id": str(page.id), "trace_id": trace_id},
            )
        return ok(WikiPageDetailSerializer(page).data, status_code=201)


class WikiPageDetailView(APIView):
    permission_classes = [IsAuthenticated, CanEditWiki]

    def _get(self, request, team_id, slug):
        m = request.team_membership
        if not m:
            return None, None
        try:
            page = WikiPage.objects.get(team_id=team_id, slug=slug, is_deleted=False)
            return page, m
        except WikiPage.DoesNotExist:
            return None, m

    def get(self, request, team_id, slug):
        page, m = self._get(request, team_id, slug)
        if m is None:
            return fail("Forbidden.", status_code=403, code="forbidden")
        if page is None:
            return fail("Wiki page not found.", status_code=404, code="wiki_page_not_found")
        return ok(WikiPageDetailSerializer(page).data)

    def put(self, request, team_id, slug):
        page, m = self._get(request, team_id, slug)
        if m is None:
            return fail("Forbidden.", status_code=403, code="forbidden")
        if page is None:
            return fail("Wiki page not found.", status_code=404, code="wiki_page_not_found")
        new_title = request.data.get("title", page.title)
        old_title = page.title
        page.title = new_title
        page.content = request.data.get("content", page.content)
        page.page_type = request.data.get("page_type", page.page_type)
        page.frontmatter = request.data.get("frontmatter", page.frontmatter)
        if request.data.get("title") and new_title != old_title:
            page.slug = unique_slug(page.team, new_title, exclude_id=page.id)
        page.save()
        trace_id = get_request_trace_id(request)
        try:
            from wiki.services.reindex import reindex_wiki_page

            reindex_wiki_page(page, trace_id=trace_id, queue_graph=True)
        except Exception:
            logger.exception(
                "Failed to reindex wiki page after update",
                extra={"team_id": str(page.team_id), "page_id": str(page.id), "trace_id": trace_id},
            )
        return ok(WikiPageDetailSerializer(page).data)

    def delete(self, request, team_id, slug):
        page, m = self._get(request, team_id, slug)
        if m is None:
            return fail("Forbidden.", status_code=403, code="forbidden")
        if page is None:
            return fail("Wiki page not found.", status_code=404, code="wiki_page_not_found")
        page.is_deleted = True
        page.save()
        # remove from graph
        from graph_engine.models import GraphEdge
        GraphEdge.objects.filter(from_page=page).delete()
        GraphEdge.objects.filter(to_page=page).delete()
        return Response(status=204)


class WikiBacklinksView(APIView):
    """Pages that link TO this page."""
    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id, slug):
        try:
            page = WikiPage.objects.get(team_id=team_id, slug=slug, is_deleted=False)
        except WikiPage.DoesNotExist:
            return fail("Wiki page not found.", status_code=404, code="wiki_page_not_found")

        from graph_engine.models import GraphEdge
        edges = GraphEdge.objects.filter(to_page=page).select_related("from_page")
        result = []
        for e in edges:
            fp = e.from_page
            # find snippet context around the wikilink
            pattern = re.compile(r".{0,80}\[\[" + re.escape(page.title) + r"\]\].{0,80}", re.IGNORECASE)
            match = pattern.search(fp.content)
            snippet = match.group(0) if match else fp.summary
            result.append({
                "page_id": str(fp.id),
                "page_title": fp.title,
                "page_slug": fp.slug,
                "edge_type": e.edge_type,
                "snippet": snippet,
            })
        return ok(result)


class WikiUnlinkedMentionsView(APIView):
    """Pages that mention this page's title but don't have a [[wikilink]]."""
    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id, slug):
        try:
            page = WikiPage.objects.get(team_id=team_id, slug=slug, is_deleted=False)
        except WikiPage.DoesNotExist:
            return fail("Wiki page not found.", status_code=404, code="wiki_page_not_found")

        # pages that contain the title as plain text but NOT as [[title]]
        mentioning = WikiPage.objects.filter(
            team_id=team_id, is_deleted=False,
            content__icontains=page.title
        ).exclude(id=page.id).exclude(
            content__icontains=f"[[{page.title}]]"
        )
        result = [{"page_id": str(p.id), "page_title": p.title, "page_slug": p.slug} for p in mentioning]
        return ok(result)


class WikiSearchView(APIView):
    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        q = request.query_params.get("q", "")
        if not q:
            return ok([])
        pages = WikiPage.objects.filter(
            team_id=team_id, is_deleted=False
        ).filter(Q(title__icontains=q) | Q(content__icontains=q))[:20]
        return ok(WikiPageListSerializer(pages, many=True).data)


class WikiRecentView(APIView):
    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)[:10]
        return ok(WikiPageListSerializer(pages, many=True).data)


class PageTemplateListView(APIView):
    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        templates = PageTemplate.objects.filter(
            Q(is_builtin=True) | Q(team_id=team_id)
        )
        return ok(PageTemplateSerializer(templates, many=True).data)


class WikiPagePublishView(APIView):
    """
    POST /api/wiki/:team_id/pages/:slug/publish/
    Runs ingest-style governance on the current page body (sync). ``auto_approve`` in JSON body
    controls whether a WikiChangeSet is created for manual review.
    """

    permission_classes = [IsAuthenticated, CanEditWiki]

    def post(self, request, team_id, slug):
        try:
            page = WikiPage.objects.get(team_id=team_id, slug=slug, is_deleted=False)
        except WikiPage.DoesNotExist:
            return fail("Wiki page not found.", status_code=404, code="wiki_page_not_found")

        raw_auto = request.data.get("auto_approve", True)
        if isinstance(raw_auto, str):
            auto_approve = raw_auto.strip().lower() in ("1", "true", "yes", "on")
        else:
            auto_approve = bool(raw_auto)

        # Allow passing content directly in the publish request (for unsaved changes),
        # but do not mutate the persisted page until publish is approved/completed.
        requested_content = request.data.get("content")
        baseline_content = page.content or ""
        publish_content = requested_content if requested_content is not None else baseline_content
        logger.info(
            "Publish attempt for %s: content_in_request=%s, baseline_content_len=%d",
            slug,
            requested_content is not None,
            len(baseline_content),
        )

        if not (publish_content or "").strip():
            logger.warning(f"Publish failed for {slug}: Content is empty.")
            return fail(
                "Cannot publish an empty page. Please add some content first.",
                status_code=400,
                code="empty_content"
            )

        job = IngestJob.objects.create(
            team=page.team,
            created_by=request.user,
            source_type="markdown",
            source_filename=f"{page.slug}.md",
            wiki_page=page,
            auto_approve=auto_approve,
            status="pending",
            ingest_stage="queued",
            ingest_stage_detail="Wiki publish",
            source_metadata={
                "publish_baseline_content": baseline_content,
                "publish_candidate_content": publish_content,
            },
        )
        trace_id = get_request_trace_id(request)
        try:
            run_pipeline(job, source_text=publish_content or "", trace_id=trace_id)
        except Exception as e:
            logger.exception("Wiki publish pipeline failed")
            job.refresh_from_db()
            job.status = "failed"
            job.error = str(e)
            job.ingest_stage = "failed"
            job.ingest_stage_detail = str(e)[:200]
            job.save(update_fields=["status", "error", "ingest_stage", "ingest_stage_detail", "updated_at"])
            return fail("Publish failed.", status_code=500, code="publish_failed", details={"error": str(e)})

        job.refresh_from_db()
        if job.status == "review_required":
            cs = getattr(job, "changeset", None)
            payload = {
                "mode": "review_required",
                "job": IngestJobSerializer(job).data,
                "changeset": WikiChangeSetSerializer(cs).data if cs else None,
            }
            return ok(payload)
        return ok({"mode": "completed", "job": IngestJobSerializer(job).data})


class WikiPendingChangeSetListView(APIView):
    """GET /api/wiki/:team_id/changesets/pending/"""

    permission_classes = [IsAuthenticated, CanEditWiki]

    def get(self, request, team_id):
        qs = (
            WikiChangeSet.objects.filter(
                job__team_id=team_id,
                status=WikiChangeSet.STATUS_PENDING,
                job__status="review_required",
            )
            .select_related("job", "job__wiki_page")
            .order_by("-created_at")[:50]
        )
        return ok(WikiChangeSetSerializer(qs, many=True).data)


class WikiChangeSetApproveView(APIView):
    """POST /api/wiki/:team_id/changesets/:changeset_id/approve/"""

    permission_classes = [IsAuthenticated, CanEditWiki]

    def post(self, request, team_id, changeset_id):
        try:
            cs = WikiChangeSet.objects.select_related("job", "job__wiki_page").get(
                id=changeset_id, job__team_id=team_id, status=WikiChangeSet.STATUS_PENDING
            )
        except WikiChangeSet.DoesNotExist:
            return fail("Change set not found.", status_code=404, code="changeset_not_found")

        trace_id = get_request_trace_id(request)
        try:
            page = approve_wiki_changeset(cs, trace_id=trace_id)
        except ValueError as e:
            return fail(str(e), status_code=400, code="changeset_invalid_state")
        except Exception:
            logger.exception("Approve changeset failed")
            return fail("Could not apply change set.", status_code=500, code="changeset_apply_failed")

        return ok(WikiPageDetailSerializer(page).data)


class WikiChangeSetRejectView(APIView):
    """POST /api/wiki/:team_id/changesets/:changeset_id/reject/"""

    permission_classes = [IsAuthenticated, CanEditWiki]

    def post(self, request, team_id, changeset_id):
        try:
            cs = WikiChangeSet.objects.select_related("job").get(
                id=changeset_id, job__team_id=team_id, status=WikiChangeSet.STATUS_PENDING
            )
        except WikiChangeSet.DoesNotExist:
            return fail("Change set not found.", status_code=404, code="changeset_not_found")

        try:
            reject_wiki_changeset(cs)
        except ValueError as e:
            return fail(str(e), status_code=400, code="changeset_invalid_state")

        return ok({"status": "rejected", "job_id": str(cs.job_id)})


class RawSourceListView(APIView):
    """GET /api/wiki/:team_id/raw-sources/ — list raw sources for the team."""

    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id):
        from ingest.models import RawSource

        sources = RawSource.objects.filter(team_id=team_id).order_by("-created_at")[:50]
        data = [
            {
                "id": str(s.id),
                "source_type": s.source_type,
                "original_filename": s.original_filename,
                "source_url": s.source_url,
                "created_at": s.created_at.isoformat(),
                "has_file": bool(s.file),
                "text_length": len(s.extracted_text),
                "ingest_job_id": str(s.ingest_job_id) if s.ingest_job_id else None,
            }
            for s in sources
        ]
        return ok(data)


class RawSourceDetailView(APIView):
    """GET /api/wiki/:team_id/raw-sources/:source_id/ — get raw source content and structure."""

    permission_classes = [IsAuthenticated, IsTeamMember]

    def get(self, request, team_id, source_id):
        from ingest.models import RawSource, WikiSourceCitation

        try:
            source = RawSource.objects.get(id=source_id, team_id=team_id)
        except RawSource.DoesNotExist:
            return fail("Raw source not found.", status_code=404, code="source_not_found")

        # Get pages citing this source
        citations = WikiSourceCitation.objects.filter(raw_source=source).select_related("wiki_page")
        file_url = source.file.url if source.file else None
        if file_url and file_url.startswith("/"):
            file_url = request.build_absolute_uri(file_url)
        logger.info(
            "Raw source detail served: source_id=%s storage_backend=%s has_file=%s absolute_file_url=%s",
            source_id,
            settings.STORAGES.get("default", {}).get("BACKEND", "unknown"),
            bool(source.file),
            bool(file_url and (file_url.startswith("http://") or file_url.startswith("https://"))),
        )

        data = {
            "id": str(source.id),
            "source_type": source.source_type,
            "original_filename": source.original_filename,
            "source_url": source.source_url,
            "extracted_text": source.extracted_text,
            "structure_map": source.structure_map,
            "has_file": bool(source.file),
            "file_url": file_url,
            "created_at": source.created_at.isoformat(),
            "citing_pages": [
                {
                    "page_id": str(c.wiki_page_id),
                    "page_title": c.wiki_page.title,
                    "page_slug": c.wiki_page.slug,
                    "wiki_section": c.wiki_section,
                    "source_char_start": c.source_char_start,
                    "source_char_end": c.source_char_end,
                    "source_page_number": c.source_page_number,
                    "source_timestamp": c.source_timestamp,
                }
                for c in citations
            ],
        }
        return ok(data)


class ContradictionResolutionView(APIView):
    """
    GET  /api/wiki/:team_id/contradictions/:changeset_id/ — get contradictions for resolution
    POST /api/wiki/:team_id/contradictions/:changeset_id/ — submit resolutions
    """

    permission_classes = [IsAuthenticated, CanEditWiki]

    def get(self, request, team_id, changeset_id):
        from ingest.contradiction_resolver import get_contradiction_detail

        try:
            cs = WikiChangeSet.objects.get(
                id=changeset_id, job__team_id=team_id, status=WikiChangeSet.STATUS_PENDING
            )
        except WikiChangeSet.DoesNotExist:
            return fail("Changeset not found.", status_code=404, code="changeset_not_found")

        detail = get_contradiction_detail(cs)
        return ok(detail)

    def post(self, request, team_id, changeset_id):
        from ingest.contradiction_resolver import resolve_contradiction

        try:
            cs = WikiChangeSet.objects.get(
                id=changeset_id, job__team_id=team_id, status=WikiChangeSet.STATUS_PENDING
            )
        except WikiChangeSet.DoesNotExist:
            return fail("Changeset not found.", status_code=404, code="changeset_not_found")

        resolutions = request.data.get("resolutions", [])
        if not resolutions:
            return fail("Resolutions required.", status_code=400, code="resolutions_required")

        resolve_contradiction(cs, resolutions)

        # After resolution, approve the changeset
        try:
            approve_wiki_changeset(cs)
        except ValueError as e:
            return fail(str(e), status_code=400, code="changeset_approve_failed")

        return ok({"status": "resolved", "changeset_id": str(cs.id)})


class WikiImageUploadView(APIView):
    """POST /api/wiki/:team_id/upload-image/ — Upload an image and get a URL."""
    permission_classes = [IsAuthenticated, CanEditWiki]

    def post(self, request, team_id):
        import os
        file_obj = request.FILES.get('file')
        if not file_obj:
            return fail("No file uploaded.", status_code=400, code="no_file")
        
        # Check if it's an image
        if not file_obj.content_type.startswith('image/'):
            return fail("File must be an image.", status_code=400, code="invalid_file_type")

        # Save the file
        from django.core.files.storage import default_storage
        import uuid
        
        ext = os.path.splitext(file_obj.name)[1]
        filename = f"wiki_images/{team_id}/{uuid.uuid4()}{ext}"
        path = default_storage.save(filename, file_obj)
        url = default_storage.url(path)
        
        return ok({"url": url})


class WikiAutocompleteView(APIView):
    """
    POST /api/wiki/:team_id/autocomplete/
    Streams an AI response directly for inline document autocomplete ("Notion AI" style).
    Body: { "prompt": "...", "context_before": "...", "context_after": "..." }
    """
    permission_classes = [IsAuthenticated, CanEditWiki]

    def post(self, request, team_id):
        prompt = request.data.get("prompt", "").strip()
        context_before = request.data.get("context_before", "")
        context_after = request.data.get("context_after", "")

        if not prompt:
            return fail("Prompt is required.", status_code=400, code="prompt_required")

        membership = request.team_membership
        quota = check_quota(membership.team, "token_consume")
        if not quota.allowed:
            return fail("Plan token limit reached.", status_code=402, code="plan_limit_exceeded")

        system_instruction = (
            "You are a sophisticated AI writing assistant integrated directly into a collaborative Markdown editor. "
            "Your task is to fulfill the user's prompt based on the context of the document they are currently writing.\n\n"
            "Document Context Before Cursor:\n"
            f"```\n{context_before[-2000:]}\n```\n\n"
            "Document Context After Cursor:\n"
            f"```\n{context_after[:2000]}\n```\n\n"
            "CRITICAL RULES:\n"
            "1. ONLY output the exact text to be inserted at the cursor position. Do NOT include pleasantries, explanations, or 'Here is the text:' prefixes.\n"
            "2. Output must be in proper GitHub Flavored Markdown (if applicable).\n"
            "3. Seamlessly match the tone, style, and formatting of the surrounding text."
        )

        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": prompt}
        ]

        def event_stream():
            try:
                stream, model_used, routed_by = llm_call(
                    team=membership.team,
                    operation="wiki_autocomplete",
                    messages=messages,
                    user=request.user,
                    stream=True
                )
                
                for chunk in stream:
                    token = chunk.choices[0].delta.content or ""
                    if token:
                        yield f"event: chunk\ndata: {json.dumps({'token': token})}\n\n"
                
                yield f"event: done\ndata: {json.dumps({'status': 'done'})}\n\n"
            except Exception as e:
                logger.error("Autocomplete stream failed: %s", e)
                yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class WikiAIAssistView(APIView):
    """POST /api/wiki/:team_id/ai-assist/
    AI-powered wiki operations: expand, summarize, suggest-links, detect-stale, from-plan.
    Body: { "action": "expand|summarize|suggest-links|detect-stale|from-plan", "page_id": "...", ... }
    """
    permission_classes = [IsAuthenticated, CanEditWiki]

    def post(self, request, team_id):
        from .ai_assist import (
            expand_section, summarize_page, suggest_links,
            detect_stale_content, generate_from_plan
        )

        action = request.data.get("action", "").strip()
        page_id = request.data.get("page_id", "").strip()

        if not action:
            return fail("Action is required.", status_code=400, code="action_required")

        membership = request.team_membership
        quota = check_quota(membership.team, "token_consume")
        if not quota.allowed:
            return fail("Plan token limit reached.", status_code=402, code="plan_limit_exceeded")

        try:
            if action == "expand":
                if not page_id:
                    return fail("page_id required.", status_code=400)
                section = request.data.get("section", "")
                instructions = request.data.get("instructions", "")
                result = expand_section(team_id, page_id, section, instructions)
                return ok({"content": result})

            elif action == "summarize":
                if not page_id:
                    return fail("page_id required.", status_code=400)
                result = summarize_page(team_id, page_id)
                return ok({"content": result})

            elif action == "suggest-links":
                if not page_id:
                    return fail("page_id required.", status_code=400)
                suggestions = suggest_links(team_id, page_id)
                return ok({"suggestions": [s.__dict__ for s in suggestions]})

            elif action == "detect-stale":
                if not page_id:
                    return fail("page_id required.", status_code=400)
                stale = detect_stale_content(team_id, page_id)
                return ok({"stale_sections": [s.__dict__ for s in stale]})

            elif action == "from-plan":
                project_id = request.data.get("project_id", "").strip()
                if not project_id:
                    return fail("project_id required.", status_code=400)
                result = generate_from_plan(team_id, project_id)
                return ok({"content": result})

            else:
                return fail(f"Unknown action: {action}", status_code=400)

        except Exception as e:
            logger.error("Wiki AI assist failed: %s", e)
            return fail(str(e), status_code=500)

