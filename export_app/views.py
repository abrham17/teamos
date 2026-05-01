import io
import json
import zipfile
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from accounts.models import TeamMember
from wiki.models import WikiPage
from graph_engine.models import GraphEdge


def get_membership(user, team_id):
    try:
        return TeamMember.objects.get(user=user, team_id=team_id)
    except TeamMember.DoesNotExist:
        return None


class ExportWikiView(APIView):
    """Export the entire wiki as a ZIP containing Markdown files + _graph.json"""
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
            
        pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)
        edges = GraphEdge.objects.filter(from_page__team_id=team_id, to_page__team_id=team_id)

        # Build graph JSON
        graph_data = {
            "nodes": [{"id": str(p.id), "slug": p.slug, "title": p.title, "type": p.page_type} for p in pages],
            "edges": [{"source": str(e.from_page_id), "target": str(e.to_page_id), "type": e.edge_type} for e in edges]
        }

        # Create ZIP in memory
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as z:
            # Add all pages
            for page in pages:
                # Add YAML frontmatter
                frontmatter_str = "---\n"
                frontmatter_str += f"title: {page.title}\n"
                frontmatter_str += f"slug: {page.slug}\n"
                frontmatter_str += f"type: {page.page_type}\n"
                if page.frontmatter:
                    for k, v in page.frontmatter.items():
                        frontmatter_str += f"{k}: {v}\n"
                frontmatter_str += "---\n\n"
                
                content = frontmatter_str + page.content
                z.writestr(f"pages/{page.slug}.md", content)
            
            # Add graph
            z.writestr("_graph.json", json.dumps(graph_data, indent=2))

        buffer.seek(0)
        response = HttpResponse(buffer.getvalue(), content_type="application/zip")
        response['Content-Disposition'] = f'attachment; filename="teamos_export_{m.team.slug}.zip"'
        return response


class ExportPageView(APIView):
    """Export a single page as Markdown"""
    def get(self, request, team_id, slug):
        m = get_membership(request.user, team_id)
        if not m:
            return Response(status=403)
            
        try:
            page = WikiPage.objects.get(team_id=team_id, slug=slug, is_deleted=False)
        except WikiPage.DoesNotExist:
            return Response(status=404)

        frontmatter_str = "---\n"
        frontmatter_str += f"title: {page.title}\n"
        frontmatter_str += f"type: {page.page_type}\n"
        if page.frontmatter:
            for k, v in page.frontmatter.items():
                frontmatter_str += f"{k}: {v}\n"
        frontmatter_str += "---\n\n"
        
        content = frontmatter_str + page.content

        response = HttpResponse(content, content_type="text/markdown")
        response['Content-Disposition'] = f'attachment; filename="{page.slug}.md"'
        return response
