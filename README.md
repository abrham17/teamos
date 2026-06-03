# TeamOS — The Agentic Operating System for Teams

**TeamOS is an AI-native workspace where knowledge, planning, and autonomous agents converge on an infinite canvas.** It ingests your documents, builds a semantic knowledge graph, and orchestrates specialist AI agents that research, plan, write, and execute — all through a streaming conversational interface with real-time multiplayer collaboration.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 15)                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ Wiki │ │ Plan │ │Graph │ │ Chat │ │Ingest│ │ ⚙️    │        │
│  │ (md) │ │(canv)│ │(cyto)│ │(sse) │ │(file)│ │Settings│       │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘        │
│     │        │        │        │        │        │               │
│  Zustand  Clerk Auth  WebSocket  SSE Events  Canvas API          │
└─────┼────────┼────────┼────────┼────────┼────────┼───────────────┘
      │        │        │        │        │        │
┌─────┴────────┴────────┴────────┴────────┴────────┴───────────────┐
│                     BACKEND (Django REST)                         │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Accounts │  │  Wiki    │  │ Planning │  │   Chat   │         │
│  │ auth/    │  │ pages/   │  │ projects │  │ sessions │         │
│  │ teams/   │  │ search/  │  │ canvas/  │  │ stream/  │         │
│  │ invites  │  │ graph/   │  │ tasks/   │  │ tools/   │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       │             │             │             │                 │
│  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐         │
│  │  Billing │  │Ingest +  │  │Planning  │  │ Agent    │         │
│  │ Paddle   │  │Vectors   │  │ Engine   │  │ Core     │         │
│  │ plans/   │  │(Qdrant)  │  │ 6-stage  │  │ multi-   │         │
│  │ webhooks │  │pipeline  │  │ pipeline │  │ agent    │         │
│  └─────────┘  └──────────┘  └──────────┘  └────┬─────┘         │
│                                                 │                 │
│  ┌──────────────────────────────────────────────┴──────┐        │
│  │              LLM Orchestrator                       │        │
│  │  Model Router (cost-curve)  │  Telemetry  │ Budget  │        │
│  └──────────────────────────────┬──────────────────────┘        │
│                                 │                                 │
│  ┌──────────────────────────────┴──────────────────────┐        │
│  │         Integrations (11 Providers)                 │        │
│  │  GitHub│Slack│Google│Jira│Linear│Notion│Discord│... │        │
│  └────────────────────────────────────────────────────┘        │
│                                                                    │
│  PostgreSQL+pgvector  │  Redis  │  Qdrant  │  Celery  │  Channels │
└────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15.5 (App Router), React 19, TypeScript |
| **State** | Zustand (`useWikiStore`) |
| **Styling** | Tailwind CSS 4, custom dark/light theme via CSS variables |
| **Auth** | Clerk (JWT, cookie-based) |
| **Real-time** | Django Channels (WebSocket), Yjs (wiki collaboration) |
| **Editor** | Tiptap (rich text), Yjs (CRDT sync) |
| **Graph** | Cytoscape.js |
| **Backend** | Django 6.0, Django REST Framework |
| **Database** | PostgreSQL + pgvector extension |
| **Vector Store** | Qdrant (ingest), pgvector (plan chunks, memory) |
| **Cache/Queue** | Redis (Celery broker, Channels layer, working memory) |
| **Async Tasks** | Celery |
| **LLM** | DeepSeek V4 Flash (284B MoE) + DeepSeek V4 Pro (1.6T MoE) via OpenRouter |
| **Billing** | Paddle |
| **Icons** | Lucide React |

---

## Backend — Django Apps

### `accounts/` — Identity & Team Management
Custom User model (UUID PK, email-based), Team with plan tiers (free/team/pro/enterprise), TeamMember with RBAC roles (owner/editor/viewer), TeamInvite with token-based acceptance, TeamAuditEvent for full audit trails. Clerk integration for social login. JWT cookie-based authentication via `CookieJWTAuthentication`.

### `planning/` — Project Management & AI Planning
The most complex app. Models: `Project`, `Task` (with self-referencing dependencies and parent-child trees), `Milestone`, `ProjectMember`, `PlanVersion` (immutable version history), `PlanChangeSet` ("pull request" for plan mutations with auto/manual split), `PlanEvent` (full audit trail), `PlanChunk` (semantic chunks with pgvector embeddings for RAG), `PlanSnapshot` (full state snapshots), `TaskComment`, `Notification` (10 types), `CanvasLayout` (infinite canvas nodes/edges/viewport as JSON), `CanvasTemplate` (reusable layouts), `IntegrationAction` (external tool sync audit), `ProjectIntegrationConfig` (per-project sync toggles for calendar/slack/github/jira/linear).

35+ REST endpoints covering: project/task/milestone CRUD, calendar feed, AI assist (streaming SSE + non-streaming), activity feed, conflict detection/resolution, risk assessment/remediation, overdue checks, version/snapshot management, changeset review/approval workflow, canvas layout (GET/PUT/PATCH with auto-generate from project data), entity search, AI canvas generation, template CRUD and application, integration config.

### `chat/` — AI Agent & Conversation
Multi-mode conversational AI with session management. Models: `ChatSession`, `ChatMessage` (stores mode + tool trace metadata), `ChatTokenUsage`, `AgentEpisode` (episodic memory with pgvector embedding), `AgentMemory` (persistent key-value store with TTL), `MCPServerRegistration` (external MCP tool servers with encrypted auth).

The **Universal Intelligence Stream** (`universal_stream.py`) orchestrates: intent classification → RAG retrieval → specialist agent routing → tool execution → streaming SSE response. Four modes: Ask (RAG lookup), Agent (tool-calling), Plan (strategic planning engine), Research (web search + ingest). The `AgentCore` engine runs multi-round execution with parallel tool calls, self-reflection, inner planning, episodic memory, and word-sized streaming.

### `integrations/` — OAuth Provider Platform
User-level OAuth connections to 11 external services: **GitHub** (10 tools: repos, issues, PRs, code search), **GitLab**, **Slack** (7 tools: messages, channels, reactions), **Discord**, **Google** (Calendar + Gmail + Drive), **Jira** (4 tools), **Linear** (6 tools), **Trello**, **Notion** (6 tools), **Dropbox**, **HubSpot**. All tools are dynamically registered with OpenAI-compatible function schemas, prefixed `ext_<provider>_`, and made available to the chat agent at runtime. Tokens encrypted via Fernet (AES). Full audit trail via `ToolExecutionLog`.

### `ingest/` — Document Ingestion Pipeline
Multi-stage pipeline for ingesting documents (URLs, PDFs, DOCX, images via OCR, YouTube, code zips, markdown) into the wiki with AI governance. Stages: queued → extracting → governance (AI review, contradiction detection) → materializing (WikiPage CRUD) → vectorizing (Qdrant) → graph sync (WikiLink edges). Models: `IngestJob`, `WikiChangeSet` (knowledge PR), `KnowledgeActivity`, `AsyncDeadLetter`, `RawSource` (immutable originals), `WikiSourceCitation` (granular text provenance).

### `wiki/` — Knowledge Base
Rich Markdown wiki with semantic vector chunks (`PageChunk` + pgvector embeddings), page types (decision, meeting, brief, incident, SOP), backlinks, unlinked mentions, page templates, AI-assisted writing, contradiction resolution, image upload, and semantic search.

### `graph_engine/` — Knowledge Graph
Builds a typed knowledge graph from wiki pages with 16 edge types (`wikilink`, `ai_inferred`, `depends_on`, `contradicts`, `extends`, `implements`, `supersedes`, `parent_child`, `prerequisite`, `references`, etc.). Analytics: page rank, community clustering, hubs, orphans. Used by the agent for semantic reasoning during research and planning.

### `llm_orchestrator/` — Central LLM Gateway
Singleton OpenAI/OpenRouter client with **continuous cost-curve routing**: dynamically shifts between DeepSeek Flash (cheap) and DeepSeek Pro (reasoning) based on plan tier, spend ratio, and operation priority. Semantic caching (15-min TTL for deterministic calls). `LlmUsageMiddleware` (blocks expired trials). `llm_call()` is the single entry point for all AI calls across the entire backend.

### `billing/` — Subscription & Payments
Paddle integration with server-side quote validation. Models: `TeamSubscription` (state machine: trialing → active → past_due → suspended → canceled), `BillingWebhookEvent` (idempotent processing). Plan catalog, checkout sessions, webhook receiver, reconciliation.

### `research/` — Web Research
Tavily API integration for web search with per-team monthly quotas (plan-dependent). Used by the chat's research mode.

### `product_analytics/` — Funnel & Product Analytics
Event tracking (workspace created, first page, first ingest, first chat, invites, upgrades) with idempotent `record_first_once()`. Weekly cohort analysis, team-level quantitative stats dashboards.

### `export_app/` — Data Export
Export wiki as ZIP (all pages + graph metadata + source files) or individual pages as Markdown.

### `presence/` — Real-Time Collaboration
WebSocket-based presence tracking via Django Channels (who is viewing which page, typing status). In-memory state via Redis channel layer — no database models.

### `admin_api/` — Admin Dashboard
Staff-only: platform LLM spend, MRR, P&L margin, team usage, trial management, cost forecasting, system health (PostgreSQL/Redis/Qdrant/Celery), alerts (overdue tasks, expiring trials, delinquent accounts).

---

## Frontend — Pages

### `/wiki` — Wiki Editor (`MarkdownWorkspace`)
Full Tiptap editor with Yjs real-time collaboration, frontmatter metadata panel, backlinks panel, raw source viewer, publish review flow, citation handling, AI autocomplete, image upload, presence indicators. Sidebar with page tree navigation.

### `/plan` — Project Planner (`PlannerWorkspace`)
**9 integrated views** accessed via horizontal tabs:
- **Canvas** (default) — Infinite canvas with 6 node types (task, milestone, member, wiki, trigger, output), drag-to-create edges, Ctrl+click multi-select, group/ungroup (Ctrl+G), right-click context menu, node resize handles, minimap, AI generation from prompt bar, save/load templates, JSON export/import, touch gestures (pan/pinch-zoom/double-tap), undo/redo (30-level stack), drag-from-drawers, entity linking
- **Overview** — Project dashboard with progress, active sprints, risk score
- **Board** — Kanban (todo/in-progress/completed/blocked)
- **Calendar** — Task/milestone calendar with event creation
- **Timeline** — Gantt-style timeline view
- **Team** — Per-member workload and role management
- **Workload** — Cross-member capacity analysis
- **History** — Version/snapshot timeline with restore
- **Activity** — Recent actions feed

AI architect overlay with SSE streaming: multi-stage pipeline (research → synthesize → decompose → critique → finalize), interactive clarifying questions, parallel strategy generation, dependency inference, adaptive scheduling. Changeset review and approval workflow. Real-time multiplayer cursors via WebSocket.

### `/graph` — Knowledge Graph (`GraphPage`)
Cytoscape.js rendering of the typed knowledge graph with node search, layout controls, edge type filtering, hover previews, node inspector panel, and smooth anime.js entrance animations.

### `/chat` — AI Chat (`ChatInterface`)
Streaming agent chat with four modes (Ask/Agent/Plan/Research). SSE events rendered as: thinking blocks (collapsible reasoning), agent activity timeline, tool call visualization, citation lists, source links. Proactive suggestions and alerts. Voice input mode. MCP server registration and sync.

### `/ingest` — Knowledge Ingestion
File upload (PDF, DOCX, images, code zips, markdown) and URL ingestion with integration source search (GitHub repos, Notion pages, Google Drive files, Slack messages).

### `/integrations` — OAuth Connections
Connect/disconnect 11 external providers with status indicators and per-project integration configuration.

### `/analytics` — Workspace Analytics
Team-level stats: docs processed, wiki pages created, projects count, 14-day token usage, weekly funnel metrics.

### `/settings` — Account Settings
7 tabs: Profile, Billing (plan display + subscription management), Teams, Integrations, Notifications, API tokens, Danger zone.

---

## The Agentic World — How Agents Orchestrate

### The Universal Intelligence Pipeline

Every chat message goes through a single entry point that orchestrates multiple specialist agents:

```
User Message
    │
    ▼
┌─────────────────────┐
│ 1. Classification   │  O(1) regex match (~70% of messages)
│    (rule + LLM)     │  → LLM classification for ambiguous cases
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 2. RAG Retrieval    │  Hybrid semantic+keyword search
│  (wiki + plan)      │  Query expansion + HyDE
│                     │  Graph expansion from high-score hits
│                     │  Context budgeting (14K token limit)
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Specialist Routing                                       │
│                                                              │
│  LIGHTWEIGHT  │  WIKI AGENT  │  PLAN AGENT  │  STRATEGIC   │  RESEARCH │  ANALYST
│  (no tools)   │  knowledge   │  tasks &     │   PLANNER    │  external │  data
│  fast RAG     │  management  │  milestones  │   full 6-    │  web      │  analysis
│  answer       │  graph ops   │  conflicts   │   stage      │  search   │  memory
│               │              │              │   pipeline   │           │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│ 4. Agent Core Loop  │  Multi-round execution (max 10 rounds)
│                     │  Parallel tool calls (ThreadPool, 4 workers)
│                     │  Self-reflection after each round
│                     │  Replan / retry on failure
│                     │  Streaming SSE events
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 5. Episodic Memory  │  Store interaction outcome
│                     │  Trigger retrospective learning
│                     │  Update behavioral directives
└─────────────────────┘
```

### The Tool Ecosystem

Agents have 53+ built-in tools across three sources:

| Source | Examples | How Connected |
|--------|----------|---------------|
| **Internal** | `wiki_search_pages`, `plan_create_task`, `graph_add_edge`, `memory_store` | Always available |
| **OAuth Integrations** | `ext_github_create_issue`, `ext_slack_send_message`, `ext_google_create_calendar_event` | Connected per-user via OAuth |
| **MCP Servers** | `mcp_my_server_my_tool` | Registered per-team, any URL |

Tools support **idempotency keys** (Redis-based, 5-min TTL) to prevent duplicate mutations on retries. All tool calls are audited via `ToolExecutionLog`.

### The Strategic Planning Engine (6-Stage Pipeline)

When a user says "create a product launch plan", here's what happens:

1. **RESEARCH** — Multi-query expansion + HyDE search across the wiki, graph traversal from high-confidence hits, knowledge gap analysis, team expertise mapping
2. **SYNTHESIZE** — LLM derives domain/sub-domain taxonomy, expert persona, task vocabulary, constraints, seed tasks, dependency patterns (cached per prompt hash)
3. **DECOMPOSE & DRAFT** — Two strategies generated in parallel via ThreadPool:
   - **Fast-track**: maximum concurrency, aggressive timelines
   - **Risk-mitigated**: QA gates, buffer time, stability focus
4. **CRITIQUE & SELECT** — LLM portfolio-director evaluates both strategies (scoring 0-100), selects optimal, justifies decision
5. **FINALIZE** — Dependency inference (keyword heuristics + domain patterns + graph-based + temporal ordering), adaptive scheduling (team velocity-based with buffer factors)
6. **DB MUTATION** — Atomic transaction: create project → create tasks (two-pass for dependency resolution) → create milestones → assign members → detect/resolve conflicts → assess risk → sync wiki → reindex embeddings

### Self-Reflection & Learning

- **Heuristic reflection** (fast, no LLM): rule-based checks on tool results — quota/permission errors → replan, timeouts → retry once, not found → retry with different params
- **LLM reflection** (for critical tools or failed heuristics): fast LLM call to evaluate outcome and decide: continue / retry / replan
- **Episodic memory**: every interaction stored as `AgentEpisode` with 1536-dim pgvector embedding, recalled for similar future situations via cosine distance
- **Retrospective learning loop**: Celery task analyzes failed/complex episodes, extracts root cause and guideline updates, stored as behavioral directives (LRU cached, max 20, 7-day TTL) injected into future system prompts

### Canvas AI Integration

The canvas has its own AI pipeline (`CanvasAIAssistView`): sends project context + current canvas state + user prompt to LLM, returns structured nodes/edges JSON that's applied directly to the canvas. The canvas prompt bar also triggers the full planning engine for deep workflow generation.

### Background Agents (Celery Beat)

| Task | Schedule | Purpose |
|------|----------|---------|
| `daily_health_check_all_teams` | 6:00 AM | Check overdue items, approaching milestones, stale wiki pages, scheduling conflicts |
| `weekly_retrospective_all_teams` | Monday 8:00 AM | Generate weekly performance summary, persist to wiki |
| `daily_overdue_notifications` | 8:00 AM | Scan all teams for overdue tasks/milestones, create notifications |
| `milestone_approach_notifications` | 8:30 AM | Notify when milestones are within 3 days |
| `daily_task_digest` | 7:00 AM | Send Gmail daily digest to users with Google connected |
| `autonomous_schedule_auditor` | Every 2 hours | Check active projects for dependency date conflicts, auto-heal schedules |
| `prune_expired_agent_memories` | 3:30 AM | Remove expired TTL memory records |

---

## Payments

TeamOS uses **Paddle** for subscription billing with server-side quote validation to prevent client-side price manipulation.

**Plan Tiers:**
| Tier | Price | LLM Model | Chat Model | Context Tokens | RAG Retrieval | Query Expansions | TTS Quota |
|------|-------|-----------|------------|----------------|---------------|------------------|-----------|
| Free | $0 | Flash | 4K | 2,000 | 5 | 0 | 10K chars |
| Team | $ | Pro | 6K | 6,000 | 20 | 3 | 50K |
| Pro | $ | Pro | 12K | 16,000 | 50 | 5 | 250K |

**Flow:** Catalog → Quote calculator → Checkout session (server-side validation) → Paddle payment → Webhook (idempotent `event_id` dedup) → Subscription state machine updates → Entitlements enforced by middleware.

**Quota enforcement** (`entitlements.py`): seats, ingest jobs, wiki pages, token budget, exports, research searches — all checked per plan tier.

---

## Getting Started

```bash
# Clone
git clone https://github.com/abrham17/teamos.git
cd teamos

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Frontend
cd frontend
npm install
npm run dev
```

Set environment variables: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `QDRANT_URL`, `TAVILY_API_KEY`, `CLERK_ISSUER`, `PADDLE_WEBHOOK_SECRET`, and others as defined in `backend/teamos_project/settings/base.py`.

---

## License

Proprietary. All rights reserved.
