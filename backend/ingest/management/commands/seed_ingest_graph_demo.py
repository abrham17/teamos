"""
Load overlapping markdown docs via the real ingest pipeline so you can verify:
- Graph: wiki links + semantic (ingest) edges after Qdrant + infer_ai_edges
- Chat: vector citations over ingested chunks (Qdrant must be reachable)

Requires Qdrant (e.g. `docker compose up -d qdrant`). With `development` settings,
Celery runs tasks eagerly so graph wiring runs inline after each ingest.

Use the repo venv from `backend/`:

  ../venv/bin/python manage.py seed_ingest_graph_demo
  ../venv/bin/python manage.py seed_ingest_graph_demo --team-id <uuid> --email user@example.com
  ../venv/bin/python manage.py seed_ingest_graph_demo --replace
"""

from django.core.management.base import BaseCommand, CommandError

from accounts.models import Team, TeamMember, User
from graph_engine.models import GraphEdge
from ingest.models import IngestJob
from ingest.pipeline import run_pipeline
from ingest.tasks import infer_ai_edges, wire_page_graph
from wiki.models import WikiPage


DEMO_TITLES = ("Product Vision", "Engineering Roadmap", "Reliability SLOs")

DOCS: list[tuple[str, str]] = [
    (
        "product-vision.md",
        """# Product Vision

TeamOS connects wikis, ingestion, and chat over shared knowledge. Authentication
and SSO are first-class: we standardize on OAuth2 and OIDC for enterprise login.

See [[Engineering Roadmap]] for delivery milestones. Reliability themes—SLOs,
monitoring, and incident response—run through everything we ship.

Keywords: authentication, OAuth2, SSO, reliability, SLOs, monitoring.
""",
    ),
    (
        "engineering-roadmap.md",
        """# Engineering Roadmap

This quarter we ship authentication integrations (OAuth2 / OIDC) and harden SSO
flows. Uptime and SLO dashboards tie into [[Reliability SLOs]].

Strategic context lives in [[Product Vision]]. We reuse the same vocabulary:
monitoring, on-call, and error budgets across teams.
""",
    ),
    (
        "reliability-slos.md",
        """# Reliability SLOs

We define availability SLOs per service and track burn rates in monitoring tools.
On-call rotations and incident workflows are documented alongside authentication
runbooks because outages often touch login paths.

See [[Engineering Roadmap]] for what ships when. [[Product Vision]] explains why
SLOs matter for customer trust.
""",
    ),
]


class Command(BaseCommand):
    help = "Ingest three linked markdown documents to exercise graph wikilinks + semantic edges and chat RAG."

    def add_arguments(self, parser):
        parser.add_argument("--team-id", type=str, default="", help="Team UUID (default: first team in DB)")
        parser.add_argument("--email", type=str, default="", help="User email for ingest jobs (default: first team owner)")
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Delete existing demo wiki pages (by title) for this team before seeding",
        )

    def handle(self, *args, **options):
        team_id = (options.get("team_id") or "").strip()
        email = (options.get("email") or "").strip()
        replace = bool(options.get("replace"))

        if team_id:
            try:
                team = Team.objects.get(id=team_id)
            except Team.DoesNotExist as exc:
                raise CommandError(f"Team not found: {team_id}") from exc
        else:
            team = Team.objects.order_by("created_at").first()
            if not team:
                raise CommandError("No team in database. Create a user/team in the app first.")

        if email:
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist as exc:
                raise CommandError(f"User not found: {email}") from exc
        else:
            member = TeamMember.objects.filter(team=team, role__in=["owner", "editor"]).select_related("user").first()
            if not member:
                raise CommandError(f"No owner/editor on team {team.id}. Add a member or pass --email.")
            user = member.user

        if replace:
            deleted, _ = WikiPage.objects.filter(team=team, title__in=DEMO_TITLES).delete()
            self.stdout.write(self.style.WARNING(f"Removed {deleted} prior demo wiki page(s)."))

        self.stdout.write(self.style.NOTICE(f"Team: {team.name} ({team.id})"))
        self.stdout.write(self.style.NOTICE(f"Ingest jobs as: {user.email}"))

        for filename, body in DOCS:
            job = IngestJob.objects.create(
                team=team,
                created_by=user,
                source_type="markdown",
                source_filename=filename,
                auto_approve=True,
                status="pending",
                ingest_stage="queued",
                ingest_stage_detail="seed_ingest_graph_demo",
            )
            self.stdout.write(f"Running pipeline for {filename} …")
            run_pipeline(job, source_text=body)
            job.refresh_from_db()
            if job.status != "done":
                raise CommandError(f"Ingest failed for {filename}: status={job.status!r} error={job.error!r}")

        # Re-parse wikilinks for demo pages only so [[links]] resolve after all targets exist
        demo_pages = list(
            WikiPage.objects.filter(team=team, is_deleted=False, title__in=DEMO_TITLES).order_by("title")
        )
        for p in demo_pages:
            wire_page_graph.delay(str(p.id))
        for p in demo_pages:
            infer_ai_edges.delay(str(p.id))

        self.stdout.write(self.style.SUCCESS("\n--- Result ---"))
        for title in DEMO_TITLES:
            p = WikiPage.objects.filter(team=team, title=title).first()
            if p:
                self.stdout.write(f"  Page: {p.title!r} slug={p.slug} id={p.id}")
        edge_count = GraphEdge.objects.filter(from_page__team=team).count()
        self.stdout.write(self.style.SUCCESS(f"  Total outgoing graph edges (team): {edge_count}"))
        self.stdout.write(
            self.style.SUCCESS(
                "\nNext: open Graph for this team — expect cyan wiki links and purple semantic edges.\n"
                "Chat: ask e.g. “What are our authentication and SLO plans?” to pull citations from these pages.\n"
            )
        )
