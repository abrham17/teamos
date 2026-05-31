# TeamOS Production Engineering Roadmap & Feature Blueprints

This document outlines the critical pre-production engineering fixes required to stabilize, secure, and optimize TeamOS, followed by detailed architectural blueprints for implementing 19 advanced agentic and collaborative features.

---

## Part 1: Critical Pre-Production Technical Fixes

### 1. TTS Rate Limiting & Quota Checks
**Issue:** `ChatTTSView` calls the paid OpenAI speech API directly for authenticated users but lacks the rate limiting and token/character quota controls implemented on `ChatQueryStreamView`. A single client could loop calls and consume the team's entire OpenAI budget.
**Fix:** Apply `_check_rate_limit()` and `check_quota()` logic to `ChatTTSView`. Add a `tts_character_quota` field to the team's billing plan.

#### Proposed Update in `backend/chat/views.py`:
```python
from teamos_project.entitlements import check_quota

class ChatTTSView(APIView):
    def post(self, request, team_id):
        # 1. Rate Limiting Check
        if not _check_rate_limit(request.user.id, "tts", limit=30):  # 30 calls per minute
            return Response({"error": "Rate limit exceeded for TTS calls."}, status=429)
            
        team = get_object_or_404(Team, id=team_id)
        text = request.data.get("text", "")
        character_count = len(text)
        
        # 2. Quota Check (using a new "tts_characters" key in the plan settings)
        quota = check_quota(team, "tts_characters", amount=character_count)
        if not quota.allowed:
            return Response({
                "error": "TTS quota exceeded.",
                "details": quota.to_details()
            }, status=403)
            
        # Proceed with original OpenAI TTS call...
```

---

### 2. Admin Role Permissions in DRF
**Issue:** `AdminUsageStatsView` performs a hand-rolled query checking `.filter(role='owner'/'admin').exists()` inside the view body. If the query raises an exception or a developer refactors the team roles structure, this validation can fail open or raise unhandled 500s.
**Fix:** Implement a robust `IsTeamAdmin` permission class using DRF standards.

#### Proposed Update in `backend/chat/permissions.py`:
```python
from rest_framework import permissions
from accounts.models import TeamMember

class IsTeamAdmin(permissions.BasePermission):
    """
    Assures the requesting user is an 'owner' or 'admin' of the team 
    specified in the URL parameter 'team_id'.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
            
        team_id = view.kwargs.get("team_id")
        if not team_id:
            return False
            
        return TeamMember.objects.filter(
            team_id=team_id,
            user=request.user,
            role__in=["owner", "admin"]
        ).exists()
```

#### Proposed Update in `backend/chat/views.py`:
```diff
-class AdminUsageStatsView(APIView):
+class AdminUsageStatsView(APIView):
+    permission_classes = [IsTeamAdmin]
+
     def get(self, request, team_id):
-        # Remove hand-rolled role checks inside view body
```

---

### 3. SSE Thread Leaks on Client Disconnect
**Issue:** When a chat client terminates the SSE stream mid-run (e.g. by closing their browser tab), Django's ASGI channel stops reading, but the worker thread in `async_event_stream` continues executing and filling `out_q` infinitely.
**Fix:** Introduce a threading `Event` for cooperative cancellation.

#### Proposed Update in `backend/chat/views.py`:
```python
import threading
from chat.agent_core import AgentCore, AgentConfig

# Inside ChatQueryStreamView.post:
cancellation_event = threading.Event()

def producer_thread_wrapper(agent_core, context_str, state, queue, cancel_evt):
    # Pass cancel_evt down into AgentCore and verify it in loop steps
    try:
        for event in agent_core.run(context_str, state, cancel_evt):
            if cancel_evt.is_set():
                break
            queue.put(event)
    finally:
        queue.put(None)  # Signal end to generator

# Modify async_event_stream() generator:
async def async_event_stream():
    try:
        while True:
            # Non-blocking fetch from queue
            item = await get_item_from_queue_async()
            if item is None:
                break
            yield item
    except asyncio.CancelledError:
        # User disconnected! Trigger cancellation event.
        cancellation_event.set()
        raise
```

Verify that `AgentCore.run()` checks `cancel_evt.is_set()` before making downstream LLM calls or starting new tool rounds.

---

### 4. N+1 Loop in Memory Cleanups
**Issue:** `background_agents.cleanup_expired_memories()` fetches all memories and deletes them one-by-one in a Python loop, triggering a database delete storm. Furthermore, `chat/tasks.py` contains a duplicate task `prune_expired_agent_memories` that already handles this efficiently.
**Fix:** Delete the duplicate task inside `background_agents.py` and direct Celery beat to execute the database-optimized task.

#### Proposed Update in Celery Beat Configurations:
Ensure `teamos_project/settings/base.py` references the single, optimized task:
```python
"prune-agent-memories": {
    "task": "chat.tasks.prune_expired_agent_memories",
    "schedule": crontab(hour=3, minute=0),  # run nightly
}
```

---

### 5. Accurate Token Counting with Tiktoken
**Issue:** Token usages are stored in database records (`ChatTokenUsage`) using `len(text) // 4`, which can deviate by 200–300% from actual usage metrics (especially in markdown, code segments, or multi-language Unicode strings).
**Fix:** Integrate `tiktoken` to count exact tokens prior to saving to database.

#### Proposed Update in `backend/chat/views.py`:
```python
import tiktoken

def estimate_tokens(text: str, model_name: str = "gpt-4") -> int:
    try:
        encoding = tiktoken.encoding_for_model(model_name)
    except KeyError:
        encoding = tiktoken.get_encoding("cl100k_base")  # fallback
    return len(encoding.encode(text))
```

Alternatively, extract token stats directly from the returned OpenAI API response mapping (`response.usage.total_tokens`).

---

### 6. Vulnerable Parameter Mass-Assignment in `update_project`
**Issue:** `update_project` copies dictionary payloads directly using `setattr(project, k, v)` and saves without sanitizing the target field keys. An API client could send `{"team_id": "malicious-id"}` or `{"created_by_id": 99}` and bypass tenancy boundaries.
**Fix:** Define an explicit whitelist of attributes that can be updated.

#### Proposed Update in `backend/planning/services.py`:
```python
UPDATABLE_PROJECT_FIELDS = {"name", "description", "status"}

def update_project(project: Project, payload: dict) -> Project:
    for key, value in payload.items():
        if key in UPDATABLE_PROJECT_FIELDS:
            setattr(project, key, value)
    project.save(update_fields=payload.keys() & UPDATABLE_PROJECT_FIELDS)
    return project
```

---

## Part 2: Product Feature Implementation Blueprints

```
├── 1. Agent Interrupt & Pause
├── 2. Tool Trace Replay UI
├── 3. Real Token Usage Dashboard
├── 4. Proactive Push Notifications
├── 5. Per-user Agent Memory Isolation
├── 6. Plan Version History & Diff
├── 7. Autonomous Agent Mode
├── 8. Shareable Plan Snapshots
├── 9. Cross-session Memory Consolidation
├── 10. Conversation Branching
├── 11. Export to Notion / Jira / Linear
├── 12. Agent Performance Analytics
├── 13. Smart Wiki Auto-tagging
├── 14. Real-time Co-editing Indicators
├── 15. Bring Your Own API Keys
├── 16. Internet-Augmented Research Mode
├── 17. Structured Data Import
├── 18. AI-assisted Code Review Summaries
└── 19. Multi-language Agent
```

---

### 1. Agent Interrupt & Pause
Provides users with the ability to pause agent execution before/after any tool call and inject adjustments or redirections.

* **Backend Model**: Add `AgentRunStatus` fields (`RUNNING`, `PAUSED`, `AWAITING_INPUT`, `COMPLETED`) to `ChatSession`.
* **State Machine**:
  - Insert a hook inside the `AgentCore` execution loop between tool execution rounds.
  - If status transitions to `PAUSED`, save `working_memory` and serialize the execution stack, then block execution (wait on Redis pub/sub channel or websocket event).
  - The client can issue a resume request containing a redirect instruction: `{"resume": true, "instruction": "Ignore Slack pings"}`.
* **Frontend UI**: Display a pause indicator in the chat bubble. Render a text entry field inside the timeline for inline guidance if the agent requests clarification or pauses.

---

### 2. Tool Trace Replay UI
Allows developers and users to view exactly which tools were invoked, their input arguments, and their outputs in a collapsible UI element.

* **Data Structure**: Leverage `ChatMessage.metadata["tool_trace"]` (which contains an array of `{"name", "arguments", "result", "ok"}`).
* **UI Component**:
  - Replace the simplified timeline with an accordion component.
  - Render a status icon for each step (e.g., checkmark for success, red warning for failure).
  - Display syntax-highlighted arguments and results in a scrollable, nested drawer, hiding long strings behind a "Show More" truncation button.

---

### 3. Real Token Usage Dashboard
An analytics dashboard for team workspace admins to track LLM costs and credit consumption by model and developer.

* **Database Schema**: Add `model_name` and `cost_estimate_usd` columns to the `ChatTokenUsage` model.
* **Analytics Aggregation**: Group records dynamically by `user_id` and `created_at` buckets.
* **Frontend UI**: Create line/bar charts showing token volume per day and dollar cost distribution per model (e.g., OpenAI vs. DeepSeek vs. Anthropic) using a charting library like Recharts.

---

### 4. Proactive Push Notifications
Alerts stakeholders about delayed deliverables, upcoming sprint milestones, and planning conflicts via email, Slack webhook, or push services.

* **Worker System**: A Celery cron worker runs daily.
* **Notification Dispatcher**:
  - Fetches task deadlines.
  - Formats HTML template payloads or Slack markdown blocks.
  - For Slack, use incoming webhooks or a Slack Bot API integration.
  - For emails, use standard Django SMTP integrations.

---

### 5. Per-user Agent Memory Isolation
Prevents context leakage between developers by scoping AI memory preferences to individual accounts while maintaining team fallback guidelines.

* **Database Migration**:
  - Add `user = models.ForeignKey(User, null=True, blank=True)` to the `AgentMemory` schema.
* **Resolution Logic**:
  - When compiling Agent Memory in `ContextBuilder.build()`:
    1. Fetch user-specific memory keys matching the team profile.
    2. Fall back to team-wide memories where no user record exists.
    3. Exclude conflicting parameters.

---

### 6. Plan Version History & Diff
A version-control system for task lists and dependency maps, letting users view modifications and revert schedule adjustments.

* **Schema**:
  - `PlanVersion(id, project, created_by, created_at, snapshot_data)` where `snapshot_data` stores tasks/milestones in JSON.
* **Diff Engine**:
  - Compute difference arrays in Python using a JSON diff algorithm.
  - Categorize mutations into `Added`, `Deleted`, and `Modified` maps.
* **Frontend UI**: A list of historical snapshots. Selecting one renders a red/green diff overview (similar to Github's PR file diff interface).

---

### 7. Autonomous Agent Mode
A daily background loop that audits workspace documentation, monitors tasks, resolves deadlocks, and coordinates project plans automatically.

* **Scheduler**: Celery Beat launches `tasks.run_autonomous_audit` nightly.
* **Audit Pipeline**:
  - Agent loads the team's Wiki graph structure and task metrics.
  - Reviews tasks for outdated timelines, stale pages, or mismatching requirements.
  - Automatically creates sub-tickets, flags conflicts, or issues markdown review alerts in the team workspace.

---

### 8. Shareable Plan Snapshots
Allows developers to share read-only, interactive Gantt/Timeline views with external clients without requiring full account registration.

* **Schema**: `ShareableLink(id, token, project, created_by, expires_at, enabled)`
* **Permissions**: Define a custom view bypass that accepts `?token=...` and skips traditional JWT/session checks.
* **Frontend UI**: An "Export/Share Link" modal. Renders a clean interface hiding chat functions and edit actions.

---

### 9. Cross-session Memory Consolidation
Condenses thousands of old, raw agent interactions into general guidelines to reduce LLM tokens and execution costs.

* **Summarization Worker**:
  - Run weekly. Fetch `AgentEpisode` entries older than 7 days.
  - Prompt a deep reasoning model (e.g. DeepSeek v4) to consolidate key learnings into workspace preference rules.
  - Update `AgentMemory` and prune processed `AgentEpisode` rows to keep the database size manageable.

---

### 10. Conversation Branching
Allows users to branch an existing chat session from a historical message to experiment with alternative decisions.

* **Backend Support**:
  - Add `parent_message = models.ForeignKey('self', null=True)` relationship to `ChatMessage`.
  - When branching, duplicate the `ChatSession` metadata but reference the parent message as the head of the new history tree.
* **UI Controls**:
  - Show a "Branch Chat" icon on hover over any previous message bubble.
  - Selecting it creates a split path and updates the UI path switcher (`Branch 1` / `Branch 2`).

---

### 11. Export to Notion / Jira / Linear
Converts planned milestones and tasks into database items in Notion, Jira, or Linear.

* **API Clients**: Provide standard integration adaptors for external task systems.
* **Unified Tooling**:
  - Build `export_tasks_to_platform(project_id, platform, auth_credentials)` task handlers.
  - Maintain a translation map that matches local attributes (title, deadline, status) to foreign system schemas.

---

### 12. Agent Performance Analytics
An monitoring interface for platform admins tracking AI tool performance, failure logs, and query counts.

* **Metrics Engine**:
  - Record execution durations and status codes on tool completion.
  - Compute daily metrics: Average Latency, Success Ratio, Failure Rate.
* **Frontend UI**: Graphical panels highlighting slow tools, error logs, and tool invocation volumes.

---

### 13. Smart Wiki Auto-tagging
Constructs a semantic knowledge graph of wiki articles automatically using NLP classification.

* **Ingest Pipeline Hook**:
  - During markdown page indexing, send page text to a fast classifier model.
  - Extract relevant tags (e.g. `DevOps`, `Database`, `Onboarding`).
  - Create standard graph edges connecting the newly tagged documents.

---

### 14. Real-time Co-editing Indicators
A presence engine notifying concurrent users editing wiki pages, avoiding overwrite conflicts.

* **WebSocket Service**:
  - Connect to Django Channels or an external Node.js socket server.
  - Broadcast cursor locations and selection states: `{"user": "John", "action": "editing", "page": "deploy-docs"}`.
* **Frontend UI**: Render colorful cursor overlays and active user avatar icons in the markdown editor sidebar.

---

### 15. Bring Your Own API Keys (BYOK)
Empowers teams to configure their own LLM providers (OpenAI, Anthropic, DeepSeek) to reduce platform billing requirements.

* **Credential Storage**: Add `openai_api_key`, `anthropic_api_key`, and `deepseek_api_key` (encrypted) to the workspace schema.
* **Routing Middleware**:
  - Modify `llm_call()` logic:
    - If the team provides their own API key, override the system key and route directly.
    - If empty, route requests using the default billing keys.

---

### 16. Internet-Augmented Research Mode
Combines public web queries with internal knowledge bases to deliver comprehensive research reports.

* **Search Orchestrator**:
  - When in research mode, query Google/Bavard and extract snippets.
  - Search matching internal wiki documents.
  - Feed both context blocks to the model to synthesize a unified markdown summary.

---

### 17. Structured Data Import
Provides a simple mapping step to load project plans from CSV sheets or spreadsheet files.

* **Data Processor**:
  - Accept file uploads and extract row arrays.
  - Present a field-matching UI (e.g., map "Task Title" to `title`, "End Date" to `end_date`).
  - Parse dates, validate entries, and bulk-create Django database records.

---

### 18. AI-assisted Code Review Summaries
Integrates GitHub pull request diffs with wiki docs to verify implementation requirements.

* **Orchestrator Workflow**:
  - Triggered by GitHub PR webhook.
  - Pull and analyze the file diff.
  - Retrieve related engineering specs or design files from the Wiki.
  - Generate a code review comment highlighting architectural conflicts or outdated wiki references.

---

### 19. Multi-language Agent
Allows global teams to query TeamOS in their preferred language while referencing an English wiki base.

* **Translation Pipeline**:
  - Detect input language (e.g., Amharic, Spanish).
  - Translate search query to English for vector search.
  - Retrieve English RAG context.
  - Instruct the LLM: *"Synthesize the final report in the user's detected language using the retrieved English context."*

---
*Production Engineering Document. TeamOS Core System. 2026.*
