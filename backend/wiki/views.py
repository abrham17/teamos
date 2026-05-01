import re
import logging
from django.utils.text import slugify
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsTeamMember, CanEditWiki
from teamos_project.api_response import ok, fail
from teamos_project.entitlements import check_quota
from teamos_project.trace import get_request_trace_id
from product_analytics.services import record_first_once
from .models import WikiPage, PageTemplate
from .serializers import (
    WikiPageListSerializer, WikiPageDetailSerializer,
    WikiPageCreateSerializer, PageTemplateSerializer,
)

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
        # trigger graph wiring async
        from ingest.tasks import wire_page_graph
        trace_id = get_request_trace_id(request)
        try:
            wire_page_graph.delay(str(page.id), trace_id=trace_id)
        except Exception:
            # Keep user-facing write path resilient if broker/workers are temporarily unavailable.
            logger.exception(
                "Failed to queue graph wiring after wiki page creation",
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
        # re-wire graph after content update
        from ingest.tasks import wire_page_graph
        trace_id = get_request_trace_id(request)
        try:
            wire_page_graph.delay(str(page.id), trace_id=trace_id)
        except Exception:
            logger.exception(
                "Failed to queue graph wiring after wiki page update",
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
