import re
from django.utils.text import slugify
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from accounts.models import TeamMember
from .models import WikiPage, PageTemplate
from .serializers import (
    WikiPageListSerializer, WikiPageDetailSerializer,
    WikiPageCreateSerializer, PageTemplateSerializer,
)


def get_membership(user, team_id):
    try:
        return TeamMember.objects.get(user=user, team_id=team_id)
    except TeamMember.DoesNotExist:
        return None


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
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)
        # full-text search
        q = request.query_params.get("q")
        if q:
            pages = pages.filter(Q(title__icontains=q) | Q(content__icontains=q))
        # filter by type
        page_type = request.query_params.get("type")
        if page_type:
            pages = pages.filter(page_type=page_type)
        return Response(WikiPageListSerializer(pages, many=True).data)

    def post(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m or m.role == "viewer":
            return Response(status=403)
        s = WikiPageCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        slug = unique_slug(m.team, s.validated_data["title"])
        page = WikiPage.objects.create(
            team=m.team,
            slug=slug,
            created_by=request.user,
            **s.validated_data,
        )
        # trigger graph wiring async
        from ingest.tasks import wire_page_graph
        wire_page_graph.delay(str(page.id))
        return Response(WikiPageDetailSerializer(page).data, status=201)


class WikiPageDetailView(APIView):
    def _get(self, request, team_id, slug):
        m = get_membership(request.user, team_id)
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
            return Response(status=403)
        if page is None:
            return Response(status=404)
        return Response(WikiPageDetailSerializer(page).data)

    def put(self, request, team_id, slug):
        page, m = self._get(request, team_id, slug)
        if m is None:
            return Response(status=403)
        if page is None:
            return Response(status=404)
        if m.role == "viewer":
            return Response(status=403)
        page.title = request.data.get("title", page.title)
        page.content = request.data.get("content", page.content)
        page.page_type = request.data.get("page_type", page.page_type)
        page.frontmatter = request.data.get("frontmatter", page.frontmatter)
        if request.data.get("title") and request.data["title"] != page.title:
            page.slug = unique_slug(page.team, request.data["title"], exclude_id=page.id)
        page.save()
        # re-wire graph after content update
        from ingest.tasks import wire_page_graph
        wire_page_graph.delay(str(page.id))
        return Response(WikiPageDetailSerializer(page).data)

    def delete(self, request, team_id, slug):
        page, m = self._get(request, team_id, slug)
        if m is None:
            return Response(status=403)
        if page is None:
            return Response(status=404)
        if m.role == "viewer":
            return Response(status=403)
        page.is_deleted = True
        page.save()
        # remove from graph
        from graph_engine.models import GraphEdge
        GraphEdge.objects.filter(from_page=page).delete()
        GraphEdge.objects.filter(to_page=page).delete()
        return Response(status=204)


class WikiBacklinksView(APIView):
    """Pages that link TO this page."""
    def get(self, request, team_id, slug):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        try:
            page = WikiPage.objects.get(team_id=team_id, slug=slug, is_deleted=False)
        except WikiPage.DoesNotExist:
            return Response(status=404)

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
        return Response(result)


class WikiUnlinkedMentionsView(APIView):
    """Pages that mention this page's title but don't have a [[wikilink]]."""
    def get(self, request, team_id, slug):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        try:
            page = WikiPage.objects.get(team_id=team_id, slug=slug, is_deleted=False)
        except WikiPage.DoesNotExist:
            return Response(status=404)

        # pages that contain the title as plain text but NOT as [[title]]
        mentioning = WikiPage.objects.filter(
            team_id=team_id, is_deleted=False,
            content__icontains=page.title
        ).exclude(id=page.id).exclude(
            content__icontains=f"[[{page.title}]]"
        )
        result = [{"page_id": str(p.id), "page_title": p.title, "page_slug": p.slug} for p in mentioning]
        return Response(result)


class WikiSearchView(APIView):
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        q = request.query_params.get("q", "")
        if not q:
            return Response([])
        pages = WikiPage.objects.filter(
            team_id=team_id, is_deleted=False
        ).filter(Q(title__icontains=q) | Q(content__icontains=q))[:20]
        return Response(WikiPageListSerializer(pages, many=True).data)


class WikiRecentView(APIView):
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)[:10]
        return Response(WikiPageListSerializer(pages, many=True).data)


class PageTemplateListView(APIView):
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        templates = PageTemplate.objects.filter(
            Q(is_builtin=True) | Q(team_id=team_id)
        )
        return Response(PageTemplateSerializer(templates, many=True).data)
