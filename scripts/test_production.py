import os
import django
import time

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "teamos_project.settings.production")
django.setup()

from accounts.models import Team, User
from chat.models import ChatSession
from ingest.models import IngestJob
from ingest.pipeline import run_pipeline
from chat.views import llm_call

def test_production_features():
    print("--- 🛠️ Starting Production Feature Test ---")
    
    # 1. Get Context
    team = Team.objects.first()
    user = User.objects.first()
    if not team or not user:
        print("❌ Error: Need a Team and User in DB to test.")
        return

    print(f"Using Team: {team.name}, User: {user.email}")

    # 2. Test AI Ingestion
    print("\n[1/2] Testing AI Ingestion Pipeline...")
    job = IngestJob.objects.create(
        team=team,
        created_by=user,
        source_type="markdown",
        source_filename="test_ingest.md",
        status="pending",
        ingest_stage="queued"
    )
    test_text = "# Production Test\nThis is a test document to verify the AI ingestion pipeline on Heroku."
    
    try:
        run_pipeline(job, source_text=test_text)
        job.refresh_from_db()
        print(f"✅ Ingestion Successful! Job Status: {job.status}")
    except Exception as e:
        print(f"❌ Ingestion Failed: {str(e)}")

    # 3. Test AI Chat
    print("\n[2/2] Testing AI Chat (OpenRouter/GPT-4o)...")
    session = ChatSession.objects.create(team=team, created_by=user, title="Production Test Chat")
    messages = [
        {"role": "system", "content": "You are a production test assistant. Be brief."},
        {"role": "user", "content": "Hello! Are you running on the new production configuration?"}
    ]
    
    try:
        start = time.time()
        resp, model_used, routed_by = llm_call(
            team=team,
            operation="chat_ask",
            messages=messages,
            user=user,
            stream=False
        )
        latency = time.time() - start
        content = resp.choices[0].message.content
        print(f"✅ Chat Successful! (Latency: {latency:.2f}s)")
        print(f"🤖 Model Used: {model_used} (via {routed_by})")
        print(f"💬 Response: {content}")
    except Exception as e:
        print(f"❌ Chat Failed: {str(e)}")

    print("\n--- ✨ All Tests Completed ---")

if __name__ == "__main__":
    test_production_features()
