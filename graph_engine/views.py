import re
from rest_framework.views import APIView
from rest_framework.response import Response
from accounts.models import TeamMember
from wiki.models import WikiPage
from .models import GraphEdge


def get_membership(user, team_id):
    try:
        return TeamMember.objects.get(user=user, team_id=team_id)
    except TeamMember.DoesNotExist:
        return None


class GraphView(APIView):
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)

        pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False).only(
            "id", "title", "slug", "page_type", "updated_at", "content"
        )
        nodes = [
            {
                "id": str(p.id),
                "title": p.title,
                "slug": p.slug,
                "type": p.page_type,
                "summary": p.summary,
                "updated_at": p.updated_at.isoformat(),
            }
            for p in pages
        ]

        page_ids = {p.id for p in pages}
        edges_qs = GraphEdge.objects.filter(
            from_page_id__in=page_ids, to_page_id__in=page_ids
        )
        edges = [
            {
                "id": str(e.id),
                "from": str(e.from_page_id),
                "to": str(e.to_page_id),
                "type": e.edge_type,
                "confidence": e.confidence,
            }
            for e in edges_qs
        ]
        return Response({"nodes": nodes, "edges": edges})


class GraphNodeView(APIView):
    def get(self, request, team_id, page_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        try:
            page = WikiPage.objects.get(id=page_id, team_id=team_id, is_deleted=False)
        except WikiPage.DoesNotExist:
            return Response(status=404)

        neighbors = []
        for e in GraphEdge.objects.filter(from_page=page).select_related("to_page"):
            neighbors.append({"page_id": str(e.to_page_id), "title": e.to_page.title,
                               "slug": e.to_page.slug, "direction": "out", "type": e.edge_type})
        for e in GraphEdge.objects.filter(to_page=page).select_related("from_page"):
            neighbors.append({"page_id": str(e.from_page_id), "title": e.from_page.title,
                               "slug": e.from_page.slug, "direction": "in", "type": e.edge_type})
        return Response({
            "id": str(page.id), "title": page.title, "slug": page.slug,
            "type": page.page_type, "summary": page.summary,
            "frontmatter": page.frontmatter, "neighbors": neighbors,
        })


class GraphHubsView(APIView):
    """Pages with most incoming edges (simple PageRank proxy)."""
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        from django.db.models import Count
        hubs = (
            GraphEdge.objects
            .filter(to_page__team_id=team_id, to_page__is_deleted=False)
            .values("to_page_id", "to_page__title", "to_page__slug")
            .annotate(in_degree=Count("id"))
            .order_by("-in_degree")[:10]
        )
        return Response(list(hubs))


class GraphOrphansView(APIView):
    """Pages with zero graph edges."""
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
        all_pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)
        connected = set(
            GraphEdge.objects.filter(from_page__team_id=team_id)
            .values_list("from_page_id", flat=True)
        ) | set(
            GraphEdge.objects.filter(to_page__team_id=team_id)
            .values_list("to_page_id", flat=True)
        )
        orphans = [p for p in all_pages if p.id not in connected]
        return Response([{"id": str(p.id), "title": p.title, "slug": p.slug} for p in orphans])


class GraphEdgeCreateView(APIView):
    def post(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m or m.role == "viewer":
            return Response(status=403)
        from_id = request.data.get("from_page_id")
        to_id = request.data.get("to_page_id")
        edge_type = request.data.get("edge_type", "manual")
        try:
            fp = WikiPage.objects.get(id=from_id, team_id=team_id)
            tp = WikiPage.objects.get(id=to_id, team_id=team_id)
        except WikiPage.DoesNotExist:
            return Response(status=404)
        edge, _ = GraphEdge.objects.get_or_create(
            from_page=fp, to_page=tp, edge_type=edge_type,
            defaults={"confidence": 1.0, "created_by": "user"},
        )
        return Response({"id": str(edge.id)}, status=201)

    def delete(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m or m.role == "viewer":
            return Response(status=403)
        edge_id = request.data.get("edge_id")
        GraphEdge.objects.filter(id=edge_id, from_page__team_id=team_id).delete()
        return Response(status=204)
