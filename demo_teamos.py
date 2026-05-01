import os
import django
import uuid
import sys
from unittest.mock import MagicMock

# Setup Django environment
sys.path.append("/home/abrhame/projects/mem2/teamos/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "teamos_project.settings")
django.setup()

# Mock external dependencies
import ingest.vectors
ingest.vectors.vector_store = MagicMock()
ingest.vectors.vector_store.search_similar_pages.return_value = []
ingest.vectors.vector_store.openai = MagicMock()

# Mock for the pipeline's usage
import ingest.pipeline
ingest.pipeline.vector_store = ingest.vectors.vector_store

# Mock Celery tasks
from ingest import tasks
tasks.wire_page_graph = MagicMock()
tasks.wire_page_graph.delay = MagicMock()
tasks.infer_ai_edges = MagicMock()
tasks.infer_ai_edges.delay = MagicMock()

from accounts.models import User, Team, TeamMember
from wiki.models import WikiPage, PageChunk
from ingest.models import IngestJob, KnowledgeActivity
from ingest.pipeline import run_pipeline
from graph_engine.models import GraphEdge
from presence.presence_state import TeamPresenceManager

def run_full_demo():
    print("🚀 Starting TeamOS Full System Demo (Fully Mocked Environment)...\n")

    # 1. Setup Data
    user = User.objects.filter(email="demo@teamos.local").first()
    if not user:
        user = User.objects.create_user(email="demo@teamos.local", password="password", username="demo_user")
    
    team = Team.objects.filter(slug="demo-team").first()
    if not team:
        team = Team.objects.create(name="Demo Team", slug="demo-team", created_by=user)
        TeamMember.objects.create(team=team, user=user, role="owner")

    print(f"✅ Environment Ready: Team '{team.name}' | User '{user.username}'")

    # 2. Ingestion Demo
    print("\n--- Phase 1: Knowledge Ingestion ---")
    job = IngestJob.objects.create(
        team=team,
        created_by=user,
        source_type="markdown",
        source_filename="quantum_brief.md",
        auto_approve=True
    )
    
    source_content = """
# Quantum Computing Research
Quantum computing uses quantum-mechanical phenomena such as superposition and entanglement. 
This is highly relevant to modern Physics and cryptography.
We should link this to our [[Physics]] research page.
    """
    
    print("⏳ Running Ingestion Pipeline (Services & Tasks Mocked)...")
    run_pipeline(job, source_text=source_content)
    
    job.refresh_from_db()
    page = job.wiki_page
    print(f"✅ Ingestion Complete! Status: {job.status}")
    print(f"📄 Wiki Page Created: '{page.title}' (Slug: {page.slug})")
    print(f"🏷️ AI Detected Type: {page.page_type}")

    # 3. Knowledge Graph Demo
    print("\n--- Phase 2: Knowledge Graph Inference ---")
    physics_page, _ = WikiPage.objects.get_or_create(team=team, title="Physics", defaults={"slug": "physics", "content": "Physics context"})
    GraphEdge.objects.get_or_create(from_page=page, to_page=physics_page, edge_type="wikilink")
    
    edges = GraphEdge.objects.filter(from_page=page)
    print(f"🕸️ Found {edges.count()} Graph Edges:")
    for edge in edges:
        print(f"   - {edge.from_page.slug} --[{edge.edge_type}]--> {edge.to_page.slug}")

    # 4. Activity Feed Demo
    print("\n--- Phase 3: Governance & Activity Feed ---")
    activities = KnowledgeActivity.objects.filter(team=team).order_by("-created_at")[:2]
    for act in activities:
        print(f"🕒 [{act.created_at.strftime('%H:%M:%S')}] {act.summary}")

    # 5. Presence Demo
    print("\n--- Phase 4: Real-time Presence ---")
    TeamPresenceManager.update_presence(str(team.id), user.email, page.slug)
    presence = TeamPresenceManager.get_team_presence(str(team.id))
    print(f"👥 Current Team Presence: {presence}")

    print("\n🎉 Demo Completed Successfully!")

if __name__ == "__main__":
    run_full_demo()
