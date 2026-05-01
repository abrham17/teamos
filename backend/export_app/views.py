import io
import json
import zipfile
from django.http import HttpResponse
from rest_framework.views import APIView
from accounts.models import TeamMember
from wiki.models import WikiPage
from graph_engine.models import GraphEdge
from teamos_project.api_response import fail
from teamos_project.entitlements import check_quota
from .models import ExportEvent

def get_membership(user, team_id):
    try:
        return TeamMember.objects.get(user=user, team_id=team_id)
    except TeamMember.DoesNotExist:
        return None

class ExportWikiView(APIView):
    """
    Export the entire wiki as a ZIP containing:
    - /pages/*.md (Markdown + YAML Frontmatter)
    - /sources/*.txt (Raw data used for grounding)
    - _graph.json (Nodes and Edges for portability)
    - metadata.json (Team information)
    """
    def get(self, request, team_id):
        m = get_membership(request.user, team_id)
        if not m:
            return fail("Forbidden.", status_code=403, code="forbidden")
        if m.role not in ("owner", "editor"):
            return fail(
                "Owner or editor role required for export.",
                status_code=403,
                code="export_role_forbidden",
            )
        quota = check_quota(m.team, "export_job_create")
        if not quota.allowed:
            return fail(
                "Plan limit reached for exports.",
                status_code=402,
                code="plan_limit_exceeded",
                details=quota.to_details(),
            )
            
        pages = WikiPage.objects.filter(team_id=team_id, is_deleted=False)
        edges = GraphEdge.objects.filter(from_page__team_id=team_id, to_page__team_id=team_id)

        # Build graph JSON
        graph_data = {
            "nodes": [{"id": str(p.id), "slug": p.slug, "title": p.title, "type": p.page_type} for p in pages],
            "edges": [{"source": str(e.from_page_id), "target": str(e.to_page_id), "type": e.edge_type, "confidence": e.confidence} for e in edges]
        }

        # Build metadata JSON
        meta_data = {
            "team_name": m.team.name,
            "team_slug": m.team.slug,
            "exported_at": str(pages.first().updated_at if pages.exists() else ""),
            "page_count": pages.count(),
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

                # Add raw source data if it exists (for grounding portability)
                if page.raw_content:
                    z.writestr(f"sources/{page.slug}_raw.txt", page.raw_content)
            
            # Add graph and metadata
            z.writestr("_graph.json", json.dumps(graph_data, indent=2))
            z.writestr("metadata.json", json.dumps(meta_data, indent=2))

        buffer.seek(0)
        ExportEvent.objects.create(
            team=m.team,
            user=request.user,
            export_type="wiki_zip",
            metadata={"page_count": pages.count()},
        )
        response = HttpResponse(buffer.getvalue(), content_type="application/zip")
        response['Content-Disposition'] = f'attachment; filename="teamos_export_{m.team.slug}.zip"'
        return response


class ExportPageView(APIView):
    """Export a single page as Markdown"""
    def get(self, request, team_id, slug):
        m = get_membership(request.user, team_id)
        if not m:
            return fail("Forbidden.", status_code=403, code="forbidden")
        if m.role not in ("owner", "editor"):
            return fail(
                "Owner or editor role required for export.",
                status_code=403,
                code="export_role_forbidden",
            )
            
        try:
            page = WikiPage.objects.get(team_id=team_id, slug=slug, is_deleted=False)
        except WikiPage.DoesNotExist:
            return fail("Wiki page not found.", status_code=404, code="wiki_page_not_found")
        quota = check_quota(m.team, "export_job_create")
        if not quota.allowed:
            return fail(
                "Plan limit reached for exports.",
                status_code=402,
                code="plan_limit_exceeded",
                details=quota.to_details(),
            )

        frontmatter_str = "---\n"
        frontmatter_str += f"title: {page.title}\n"
        frontmatter_str += f"type: {page.page_type}\n"
        if page.frontmatter:
            for k, v in page.frontmatter.items():
                frontmatter_str += f"{k}: {v}\n"
        frontmatter_str += "---\n\n"
        
        content = frontmatter_str + page.content
        ExportEvent.objects.create(
            team=m.team,
            user=request.user,
            export_type="page_markdown",
            metadata={"page_id": str(page.id), "page_slug": page.slug},
        )

        response = HttpResponse(content, content_type="text/markdown")
        response['Content-Disposition'] = f'attachment; filename="{page.slug}.md"'
        return response
