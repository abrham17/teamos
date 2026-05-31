# TeamOS — Deep Dive

## Executive Summary

TeamOS is a cloud-hosted team knowledge management platform that combines wiki documentation, AI-powered planning, citational chat, and knowledge graph visualization. It's designed as a modern alternative to tools like Notion, Confluence, and Obsidian, with built-in AI capabilities for intelligent content ingestion, semantic search, and strategic project planning.

**Core Philosophy:** No Git versioning, no Electron desktop app, no agentic kernel complexity. Pure web-based, cloud-native, with tiered AI capabilities based on subscription plans.

---

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 15)                   │
│                    Deployed to Vercel                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Wiki UI    │  │  Chat UI     │  │ Planner UI   │         │
│  │  (TipTap)    │  │  (RAG/SSE)   │  │  (Timeline)  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Graph UI    │  │  Ingest UI   │  │  Settings    │         │
│  │ (Cytoscape)  │  │  (Progress)  │  │  (Team Mgmt) │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (REST + SSE + WebSocket)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Django 5 + DRF)                      │
│                   Deployed to Fly.io                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Accounts   │  │     Wiki     │  │     Chat     │         │
│  │  (Clerk+All) │  │  (CRUD+RAG)  │  │ (SSE+Agent)  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Planning   │  │   Ingest     │  │  Graph Eng   │         │
│  │ (AI Planner) │  │ (Celery Jobs)│  │ (Edges+Alg)  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │    │   Qdrant     │    │    Redis     │
│  (Supabase)  │    │   (Vectors)  │    │  (Celery)    │
└──────────────┘    └──────────────┘    └──────────────┘
```

### Technology Stack

#### Frontend
- **Framework:** Next.js 15 (App Router) - Server Components, Streaming, ISR
- **UI Library:** React 19, Tailwind CSS 4, Motion (Framer Motion)
- **Editor:** TipTap (ProseMirror-based) with custom extensions
- **Graph:** Cytoscape.js for knowledge graph visualization
- **State:** Zustand (client state) + TanStack Query (server state)
- **Auth:** Clerk (frontend authentication)
- **Real-time:** Server-Sent Events (SSE) for streaming, WebSockets for presence

#### Backend
- **Framework:** Django 5 + Django REST Framework
- **Async:** Django Channels (ASGI) + Daphne server
- **Task Queue:** Celery + Redis (Upstash for production)
- **Database:** PostgreSQL with pgvector extension (Supabase)
- **Vector DB:** Qdrant Cloud for semantic search
- **Auth:** django-allauth (email + Google OAuth) + Clerk integration
- **LLM:** Groq (Llama models), OpenAI (GPT models), Anthropic (Claude)

#### Infrastructure
- **Frontend Deployment:** Vercel (Edge functions, automatic HTTPS)
- **Backend Deployment:** Fly.io (Docker containers, global deployment)
- **Database:** Supabase (managed PostgreSQL)
- **Queue:** Upstash Redis (managed Redis)
- **Storage:** Supabase Storage (S3-compatible file storage)

---

## Core Modules

### 1. Accounts & Team Management

**Purpose:** Multi-tenant team management with role-based access control.

**Key Models:**
- `User`: Extended Django user with Clerk integration, avatar URL
- `Team`: Multi-tenant workspace with plan tier (free/team/pro/enterprise)
- `TeamMember`: User-team relationships with roles (owner/editor/viewer)
- `TeamInvite`: Token-based team invitations with expiration
- `TeamAuditEvent`: Audit log for team governance

**Features:**
- Email/password registration + Google OAuth
- Clerk frontend auth with JWT httpOnly cookies
- Team soft-delete with 30-day purge window
- Invite links with 7-day expiration
- Role-based permissions (owner=all, editor=write, viewer=read)
- Audit trail for all team governance actions

**Plan Tiers:**
- `plan_auto_apply_safe`: When true, AI can auto-apply safe field updates (descriptions, metadata)
- Tiers determine: embedding model, chunk size, context window, chat model quality

---

### 2. Wiki System

**Purpose:** Interlinked documentation with rich editing and AI-powered ingestion.

**Key Models:**
- `WikiPage`: Core document with Markdown content, frontmatter, page types
- `PageChunk`: Semantic chunks with embeddings for RAG
- `PageTemplate`: Reusable templates (Decision Record, Meeting Notes, SOP)
- `WikiPage.project`: Optional link to strategic plan

**Page Types:**
- Standard, Decision Record, Meeting Notes, Project Brief, Incident Report, SOP

**Editor Features (TipTap):**
- Slash commands (`/`) for headings, tables, code blocks, callouts
- WikiLink autocomplete (`[[`) for fuzzy page linking
- Backlinks panel showing incoming references
- Frontmatter panel for metadata (tags, status, related pages)
- Auto-save with 1500ms debounce
- Math support (KaTeX), Mermaid diagrams
- Collaboration extensions (Yjs CRDT for future real-time co-editing)

**Ingestion Pipeline:**
1. **Parse:** Extract structured elements from PDF/DOCX/URL/Markdown
2. **Chunk:** Strategy based on plan tier (character/sentence/semantic boundaries)
3. **Deduplicate:** SHA-256 hash per chunk to avoid re-processing
4. **Embed:** Tier-specific embedding model (nomic/OpenAI)
5. **Auto-tag:** AI-generated topics, keywords, related pages
6. **Graph Sync:** Create AI-inferred graph edges
7. **Progress SSE:** Real-time progress updates to frontend

**Raw Source Tracking:**
- `RawSource`: Permanent storage of original ingested material
- `WikiSourceCitation`: Bidirectional mapping between wiki sections and source positions
- Enables "click to view original" functionality with precise positioning

---

### 3. Knowledge Graph

**Purpose:** Visualize semantic relationships between wiki pages.

**Key Models:**
- `GraphEdge`: Directed edges between pages with types and confidence scores

**Edge Types:**
- `wikilink`: Explicit `[[Page]]` references (confidence 1.0)
- `ai_inferred`: AI-detected semantic relationships (0.0-1.0)
- `manual`: User-created relationships
- `citation`: Chat citation links
- `semantic`: Vector similarity-based edges
- **Typed Relations:** depends_on, contradicts, extends, implements, supersedes, parent_child, prerequisite, references

**Graph Algorithms (cached in Redis, 1h TTL):**
- PageRank: Identify hub nodes (central documents)
- Louvain community detection: Cluster similar pages
- Orphan detection: Find disconnected pages

**UI Features (Cytoscape.js):**
- Click node: Right panel with title, summary, "Open in Editor"
- Double-click: Zoom to 2-hop neighborhood
- Hover edge: Tooltip with type + confidence
- Drag node onto node: Create manual edge
- Low zoom: Cluster view (Louvain regions)
- Force-directed layout with physics

**Update Mechanism:**
- Django signal on page save → Celery task → Surgical edge diff
- No full graph rebuild on every edit

---

### 4. Chat System (Citational RAG)

**Purpose:** AI-powered chat with verifiable citations from team knowledge.

**Key Models:**
- `ChatSession`: Conversation container with title
- `ChatMessage`: Individual messages with role, content, citations
- `ChatTokenUsage`: Token tracking for billing
- `AgentEpisode`: Episodic memory of agent interactions
- `AgentMemory`: Persistent key-value memory per team
- `MCPServerRegistration`: External tool server integrations

**RAG Pipeline (per-team, tier-configured):**

```
Stage 1: Query Understanding
  Free: Direct query pass-through
  Team/Pro: LLM intent classification + N query expansions

Stage 2: Hybrid Retrieval
  BM25 (keyword) + Qdrant (dense) → Reciprocal Rank Fusion (RRF) merge
  retrieve_k from plan tier, filtered by team_id

Stage 3: Re-ranking
  Free: Skip (cosine scores only)
  Team: cross-encoder/ms-marco-MiniLM-L-6-v2
  Pro: cross-encoder/ms-marco-MiniLM-L-12-v2

Stage 4: Context Assembly
  Token budget from plan tier
  Prefix each chunk: [Source: {page_title} | Section: {section}]

Stage 5: SSE Streaming
  StreamingHttpResponse → token events + citation events + done event
```

**Citation Format:**
```json
{
  "type": "citation",
  "page_slug": "auth-system",
  "page_title": "Auth System",
  "section": "JWT Tokens",
  "snippet": "...",
  "confidence": 0.94
}
```

**Agent Capabilities:**
- Universal intelligence routing: Classifies queries → routes to planner agent or RAG
- Episodic memory: Records successful/failed agent interactions for learning
- Persistent memory: Team-scoped key-value store for priorities, blockers, gaps
- MCP integration: External tools (GitHub, Slack, Jira) via Model Context Protocol

**Chat History:**
- Rolling summary compression after 6 turns
- Session list with last-updated timestamps
- Multi-turn context preservation

---

### 5. Strategic Planning Module

**Purpose:** AI-powered project planning with task management, milestones, and change tracking.

**Key Models:**
- `Project`: Strategic initiative with status, related wiki pages
- `Task`: Work items with dependencies, assignees, dates, semantic keys
- `Milestone`: Project checkpoints with target dates
- `PlanVersion`: Immutable snapshots of project state
- `PlanChangeSet`: Proposed changes with approval workflow
- `PlanEvent`: Audit log of all plan modifications
- `PlanChunk`: Embedded project chunks for RAG
- `PlanSnapshot`: Full project state snapshots
- `TaskComment`: Discussion threads on tasks
- `Notification`: Alerts for overdue tasks, missed milestones

**AI Planner Features:**
- **Create Mode:** Generate project plans from natural language descriptions
- **Manage Mode:** Update existing plans with AI-suggested changes
- **Two-Pass Task Creation:** Creates all tasks first, then resolves dependencies (fixes FK violations)
- **Date Sanitization:** Rejects dates before 2026-05-01 to prevent stale data
- **Semantic Keys:** Hash-based identifiers for tasks/milestones to survive AI rewrites
- **Human-Locked Fields:** Users can lock specific fields from AI overwrites

**ChangeSet Workflow:**
1. AI proposes mutations (create/update/delete tasks/milestones)
2. System validates against field policies
3. Safe mutations auto-applied (if `plan_auto_apply_safe=true`)
4. Pending mutations create ChangeSet for review
5. Frontend shows PlanReviewPanel with proposed changes
6. User can approve all, approve subset, or reject
7. On approval, remediation preview applied to resolve conflicts

**SSE Events for Planner:**
- `plan_version_created`: New version created
- `plan_changeset_ready`: Changeset ready for review
- `plan_mutation_pending`: Individual mutation details
- `plan_mutation_applied`: Changes auto-applied

**Daily Task Sync:**
- `day_decomposer.py`: Breaks down high-level tasks into daily subtasks
- Broadcasts project update events after daily subtask creation
- Syncs calendar and frontend in real-time

---

### 6. Ingestion System

**Purpose:** Multi-source content ingestion with AI-powered processing.

**Key Models:**
- `IngestJob`: Async job tracking with stage-based progress
- `WikiChangeSet`: "Knowledge Pull Request" for review
- `KnowledgeActivity`: Chronological log of wiki evolution
- `AsyncDeadLetter`: Failed task queue items for retry
- `RawSource`: Permanent storage of original material
- `WikiSourceCitation`: Bidirectional source-to-wiki mapping

**Supported Sources:**
- URL → `markdownify` → structured markdown
- PDF → `unstructured` → elements (Title, NarrativeText, Table, Code)
- DOCX → `unstructured` → structured elements
- Markdown → Direct import with frontmatter parsing
- YouTube → Transcript extraction with timestamps
- Images → OCR text extraction
- Code repositories → Zip file processing
- Repositories → Git clone and analysis

**Ingestion Stages:**
1. **Queued:** Job created, waiting for worker
2. **Extracting:** Parsing source into structured elements
3. **Governance:** Conflict detection, contradiction analysis
4. **Materializing:** Creating wiki page content
5. **Vectorizing:** Chunking and embedding
6. **Graph Sync:** Creating graph edges
7. **Completed:** Job finished successfully

**Governance Features:**
- Contradiction detection between new content and existing wiki
- Conflict resolution with diff summaries
- Review workflow for contentious changes
- Auto-approve option for trusted sources

**Progress Streaming:**
- SSE events for each stage completion
- Progress percentage updates
- Error reporting with stack traces

---

### 7. Graph Engine

**Purpose:** Knowledge graph computation and analysis.

**Key Models:**
- `GraphEdge`: Directed relationships between wiki pages

**Edge Types:**
- **Structural:** wikilink, citation
- **AI-Inferred:** ai_inferred, semantic
- **Manual:** user-created relationships
- **Typed Relations:** depends_on, contradicts, extends, implements, supersedes, parent_child, prerequisite, references

**Algorithms:**
- PageRank: Identify central/hub documents
- Louvain community detection: Cluster similar content
- Orphan detection: Find disconnected pages
- Centrality metrics: Betweenness, closeness, degree

**Caching:**
- Redis-based caching with 1-hour TTL
- Surgical updates on page changes (no full rebuild)

---

### 8. Billing System

**Purpose:** Subscription management and usage tracking.

**Features:**
- Plan tier management (free/team/pro/enterprise)
- Usage tracking (pages, chat messages, storage)
- Stripe integration for payments
- Usage-based billing for overages
- Invoice generation and management

---

### 9. Admin Dashboard

**Purpose:** Separate Vue.js admin interface for platform management.

**Tech Stack:**
- Vue 3 + TypeScript
- Vite build system
- Tailwind CSS
- Component-based architecture

**Features:**
- User management
- Team management
- Billing overview
- System analytics
- Configuration management

---

## Frontend Architecture

### Directory Structure

```
frontend/src/
├── app/                    # Next.js App Router
│   ├── (app)/            # Main app (authenticated)
│   │   ├── wiki/         # Wiki editor and pages
│   │   ├── chat/         # Chat interface
│   │   ├── planner/      # Strategic planning
│   │   ├── graph/        # Knowledge graph
│   │   └── settings/     # Team settings
│   ├── (auth)/           # Authentication pages
│   └── pricing/          # Pricing page
├── components/           # Reusable components
│   ├── editor/          # TipTap editor extensions
│   ├── chat/            # Chat components (PlanReviewPanel, etc.)
│   ├── wiki/            # Wiki-specific components
│   ├── graph/           # Cytoscape graph components
│   └── ui/              # Base UI components
├── features/            # Feature-specific modules
│   └── planner/        # Planning module components
│       ├── components/ # Timeline, ActivityPanel, AIPlannerOverlay
│       └── types/      # TypeScript types
├── lib/                # Utilities
│   ├── api.ts          # Typed API client
│   └── clerk-env.ts    # Clerk environment config
├── stores/             # Zustand state management
├── hooks/              # Custom React hooks
└── middleware.ts       # Next.js middleware (auth)
```

### Key Components

**Editor:**
- TipTap-based rich text editor
- Custom extensions: WikiLink, Math, Mermaid, Collaboration
- Slash command menu
- Auto-save with debouncing
- Frontmatter panel

**Chat:**
- Streaming SSE chat interface
- Citation chips with click-to-navigate
- Agent thinking pane
- PlanReviewPanel for AI plan approval
- Session management

**Planner:**
- TimelinePanel with weekly view
- ActivityPanel with date grouping
- AIPlannerOverlay for AI-powered planning
- Task/milestone CRUD
- Dependency visualization

**Graph:**
- Cytoscape.js integration
- Force-directed layout
- Node/edge styling
- Zoom/pan controls
- Cluster view

---

## Backend Architecture

### Directory Structure

```
backend/
├── accounts/          # User, Team, TeamMember, Invite
├── wiki/             # WikiPage, PageChunk, PageTemplate
├── chat/             # ChatSession, ChatMessage, Agent
├── planning/         # Project, Task, Milestone, PlanVersion
├── ingest/           # IngestJob, RawSource, WikiChangeSet
├── graph_engine/     # GraphEdge, graph algorithms
├── billing/          # Subscription, payment processing
├── presence/         # WebSocket presence system
├── llm_orchestrator/ # LLM routing and orchestration
├── export_app/       # Export functionality
├── admin_api/        # Admin API endpoints
├── product_analytics/ # Usage analytics
└── teamos_project/   # Django settings
```

### Key Backend Systems

**Django Channels (WebSockets):**
- Real-time presence (who's viewing which page)
- Live progress updates for ingestion
- SSE streaming for chat responses
- Agent event streaming

**Celery Tasks:**
- Ingestion pipeline stages
- Graph edge computation
- Email sending (invites)
- Export job processing
- Daily task decomposition

**LLM Orchestrator:**
- Model selection based on plan tier
- Prompt engineering for different use cases
- Token usage tracking
- Rate limiting
- Error handling and retries

---

## Data Models Deep Dive

### User & Team

**User:**
- UUID primary key
- Clerk user ID for SSO
- Email (unique, USERNAME_FIELD)
- Avatar URL
- Display name (first + last name or email)

**Team:**
- UUID primary key
- Name + slug
- Plan tier (free/team/pro/enterprise)
- `plan_auto_apply_safe`: AI auto-apply flag
- Soft delete with purge window
- Created by user

**TeamMember:**
- Many-to-many through table
- Role (owner/editor/viewer)
- Joined timestamp

**TeamInvite:**
- Token-based invitation
- 7-day expiration
- Send status tracking (pending/sent/failed)
- Lifecycle status (pending/accepted/expired/revoked)

### Wiki

**WikiPage:**
- UUID primary key
- Team-scoped
- Optional project link (OneToOne to planning.Project)
- Title + slug (unique per team)
- Content (Markdown)
- Raw content (original source for citations)
- Page type (standard/decision/meeting/brief/incident/sop)
- Frontmatter (JSON: tags, status, related)
- Raw file URL (S3)
- Source URL (if ingested from web)
- Soft delete flag
- Created by user
- Timestamps (created/updated)

**PageChunk:**
- UUID primary key
- Page-scoped
- Chunk index (ordering)
- Section title
- Content (chunk text)
- Content hash (SHA-256 for deduplication)
- Embedding (pgvector, 1536 dims)
- Created timestamp

**PageTemplate:**
- Team-scoped or global (is_builtin)
- Name + page type
- Default content (Markdown template)
- Default frontmatter (JSON)

### Chat

**ChatSession:**
- UUID primary key
- Team-scoped
- Created by user
- Title (default "New Chat")
- Timestamps (created/updated)

**ChatMessage:**
- UUID primary key
- Session-scoped
- Role (user/assistant/system)
- Content (text)
- Citations (JSON array)
- Metadata (JSON: mode, tool_trace)
- Created timestamp

**AgentEpisode:**
- Episodic memory for learning
- Trigger (what initiated)
- Plan (approach taken)
- Actions (tool calls)
- Outcome (success/failure metrics)
- Learnings (extracted lessons)
- Tags (semantic tags)
- Success flag
- Duration (ms)
- Embedding (for semantic recall)

**AgentMemory:**
- Persistent key-value memory per team
- Categories (priorities, blockers, gaps, decisions, contradictions, context)
- Value (JSON)
- Summary (human-readable)
- TTL (days until expiration)

**MCPServerRegistration:**
- External tool server registration
- Team-scoped
- Name + URL
- Auth token
- Capabilities (list)
- Enabled flag

### Planning

**Project:**
- UUID primary key
- Team-scoped
- Name + description
- Status (active/on-hold/completed/archived)
- Created by user
- Related wiki pages (ManyToMany)
- Timestamps (created/updated)

**Task:**
- UUID primary key
- Project-scoped
- Title + description
- Status (todo/in-progress/completed/blocked)
- Priority (low/medium/high)
- Assignee (User)
- Start/end dates
- Parent task (self-referential FK for subtasks)
- Dependencies (ManyToMany self)
- Order index
- Semantic key (hash-based identifier)
- Title embedding (pgvector)
- Human-locked fields (JSON: field → timestamp)
- Created by user
- Timestamps (created/updated)

**Milestone:**
- UUID primary key
- Project-scoped
- Title + description
- Target date
- Status (pending/reached/missed)
- Order index
- Semantic key
- Human-locked fields
- Created by user
- Timestamps (created/updated)

**PlanVersion:**
- UUID primary key
- Project-scoped
- Parent version (for version history)
- Snapshot data (JSON of full project state)
- Source (manual/agent_proposal/agent_applied/auto)
- Prompt hash (for deduplication)
- Created by user
- Created timestamp

**PlanChangeSet:**
- UUID primary key
- Project-scoped
- Base version (FK)
- Proposed version (FK, nullable)
- Status (pending/approved/rejected/partially_applied)
- Mutations (JSON array)
- Impact summary (JSON)
- Auto-applied (JSON array)
- Pending mutations (JSON array)
- Remediation preview (JSON)
- Created by user
- Timestamps (created/resolved)

**PlanEvent:**
- UUID primary key
- Project-scoped
- Entity type (task/milestone/project/dependency)
- Entity ID
- Event type (created/updated/deleted)
- Payload (JSON)
- Changeset (FK, nullable)
- Actor (User, nullable)
- Created timestamp

**PlanChunk:**
- UUID primary key
- Project-scoped
- Chunk index
- Source kind (project/task/milestone)
- Source ref ID
- Title + content
- Content hash (SHA-256)
- Embedding (pgvector)
- Created timestamp

### Graph

**GraphEdge:**
- UUID primary key
- From page (FK to WikiPage)
- To page (FK to WikiPage)
- Edge type (wikilink/ai_inferred/manual/citation/semantic/typed relations)
- Confidence (float, 0.0-1.0)
- Reason (why this relation exists)
- Metadata (JSON: extra context)
- Created by (human/pipeline/agent/user)
- Created timestamp

### Ingest

**IngestJob:**
- UUID primary key
- Team-scoped
- Created by user
- Source type (url/pdf/docx/markdown/repo/youtube/image/code_zip)
- Source URL
- Source filename
- Staging file (FileField, temporary)
- Staging data (BinaryField, Heroku workaround)
- Source metadata (JSON)
- Status (pending/running/review_required/done/failed)
- Ingest stage (queued/extracting/governance/materializing/vectorizing/graph_sync/completed/failed)
- Stage detail
- Progress percentage
- Auto-approve flag
- Raw data (extracted text)
- Chunk count
- Error message
- Wiki page (FK, nullable)
- Timestamps (created/updated)

**WikiChangeSet:**
- UUID primary key
- One-to-one with IngestJob
- Proposed content (synthesized merge)
- Diff summary (JSON: contradictions, additions)
- Status (pending/approved/rejected)
- Timestamps (created/updated)

**KnowledgeActivity:**
- UUID primary key
- Team-scoped
- User (nullable)
- Event type (ingest_merge/ingest_create/manual_edit/conflict_resolved)
- Page (FK, nullable)
- Summary
- Metadata (JSON)
- Created timestamp

**RawSource:**
- UUID primary key
- Team-scoped
- Source type
- File (FileField, permanent storage)
- Original filename
- Source URL
- Extracted text
- Structure map (JSON: page numbers, timestamps, sections)
- Source metadata (JSON)
- Ingest job (OneToOne)
- Created by user
- Created timestamp

**WikiSourceCitation:**
- UUID primary key
- Wiki page (FK)
- Raw source (FK)
- Wiki section + char range
- Source section + char range
- Source page number (for PDFs)
- Source timestamp (for YouTube)
- Created timestamp

---

## API Architecture

### REST Endpoints

**Accounts:**
- `POST /api/auth/register/` - User registration
- `POST /api/auth/login/` - User login
- `POST /api/auth/logout/` - User logout
- `GET /api/teams/` - List user's teams
- `POST /api/teams/` - Create team
- `GET /api/teams/{id}/members/` - List team members
- `POST /api/teams/{id}/invites/` - Create invite
- `POST /api/invites/{token}/accept/` - Accept invite

**Wiki:**
- `GET /api/teams/{team_id}/pages/` - List pages
- `POST /api/teams/{team_id}/pages/` - Create page
- `GET /api/teams/{team_id}/pages/{slug}/` - Get page
- `PUT /api/teams/{team_id}/pages/{slug}/` - Update page
- `DELETE /api/teams/{team_id}/pages/{slug}/` - Delete page
- `GET /api/teams/{team_id}/pages/{slug}/backlinks/` - Get backlinks
- `GET /api/teams/{team_id}/templates/` - List templates

**Chat:**
- `GET /api/teams/{team_id}/chat/sessions/` - List sessions
- `POST /api/teams/{team_id}/chat/sessions/` - Create session
- `GET /api/teams/{team_id}/chat/sessions/{id}/messages/` - Get messages
- `POST /api/teams/{team_id}/chat/stream/` - SSE streaming chat

**Planning:**
- `GET /api/teams/{team_id}/projects/` - List projects
- `POST /api/teams/{team_id}/projects/` - Create project
- `GET /api/teams/{team_id}/projects/{id}/` - Get project
- `PUT /api/teams/{team_id}/projects/{id}/` - Update project
- `GET /api/teams/{team_id}/projects/{id}/tasks/` - List tasks
- `POST /api/teams/{team_id}/projects/{id}/tasks/` - Create task
- `POST /api/teams/{team_id}/projects/{id}/planning-assist/` - AI planning (SSE)
- `POST /api/teams/{team_id}/projects/{id}/changesets/{id}/approve/` - Approve changeset
- `POST /api/teams/{team_id}/projects/{id}/changesets/{id}/reject/` - Reject changeset

**Ingest:**
- `POST /api/teams/{team_id}/ingest/` - Create ingest job
- `GET /api/teams/{team_id}/ingest/{id}/` - Get job status
- `POST /api/teams/{team_id}/ingest/{id}/approve/` - approve changeset
- `POST /api/teams/{team_id}/ingest/{id}/reject/` - Reject changeset

**Graph:**
- `GET /api/teams/{team_id}/graph/nodes/` - Get graph nodes
- `GET /api/teams/{team_id}/graph/edges/` - Get graph edges
- `POST /api/teams/{team_id}/graph/edges/` - Create manual edge
- `GET /api/teams/{team_id}/graph/algorithms/pagerank/` - Run PageRank
- `GET /api/teams/{team_id}/graph/algorithms/communities/` - Run community detection

### SSE Streaming

**Chat Streaming:**
```
GET /api/teams/{team_id}/chat/stream/

Events:
- token: Individual LLM token
- citation: Source citation with metadata
- agent_step: Agent progress update
- agent_result: Agent final result
- done: Stream complete
```

**Planning Streaming:**
```
POST /api/teams/{team_id}/projects/{id}/planning-assist/

Events:
- agent_step: Planning progress
- plan_version_created: New version created
- plan_changeset_ready: Changeset ready for review
- plan_mutation_pending: Individual mutation
- plan_mutation_applied: Changes auto-applied
- agent_result: Final result
```

**Ingestion Progress:**
```
GET /api/teams/{team_id}/ingest/{id}/stream/

Events:
- stage: Current stage (extracting/governance/materializing/vectorizing/graph_sync)
- progress: Progress percentage
- error: Error message (if failed)
- done: Job complete
```

---

## Security & Authentication

### Frontend Auth (Clerk)
- Clerk SDK for authentication UI
- JWT tokens in httpOnly cookies
- Middleware-protected routes
- Session management

### Backend Auth (django-allauth)
- Email/password authentication
- Google OAuth integration
- JWT token validation via Clerk
- User model extended with Clerk user ID
- Team-scoped permissions

### Authorization
- Role-based access control (owner/editor/viewer)
- Team-scoped data isolation
- Row-level security via query filters
- API endpoint permission checks

### Data Security
- Soft delete for teams (30-day purge window)
- Raw source permanent storage (never deleted)
- Audit logging for team governance
- Encrypted secrets for external services

---

## Deployment

### Frontend (Vercel)
- Next.js 15 with App Router
- Edge functions for API routes
- Automatic HTTPS
- CDN for static assets
- Environment variables via Vercel dashboard

### Backend (Fly.io)
- Django 5 with ASGI (Daphne)
- Docker container deployment
- Global deployment regions
- PostgreSQL via Supabase
- Redis via Upstash
- Qdrant Cloud for vectors

### Database (Supabase)
- Managed PostgreSQL 15
- pgvector extension for embeddings
- Automatic backups
- Connection pooling
- Row-level security (future)

### Queue (Upstash Redis)
- Managed Redis
- Celery broker
- Session storage
- Graph algorithm caching

---

## Performance Optimizations

### Frontend
- Next.js Server Components for initial render
- Streaming responses for chat/planning
- Image optimization via Next.js Image
- Code splitting via dynamic imports
- Zustand for efficient client state
- TanStack Query for server state caching

### Backend
- Celery for async task processing
- Redis caching for graph algorithms
- Database query optimization (select_related, prefetch_related)
- pgvector for efficient vector similarity
- SSE for real-time updates (no polling)
- Connection pooling via Django ORM

### Database
- Indexed fields (semantic_key, content_hash, etc.)
- Unique constraints for data integrity
- Foreign key indexes for join performance
- Partitioning strategy (future)

---

## Monitoring & Observability

### Logging
- Structured logging (JSON format)
- Log levels (DEBUG/INFO/WARNING/ERROR)
- Request/response logging
- Error tracking (Sentry integration planned)

### Metrics
- Token usage tracking
- Ingestion job metrics
- Chat session metrics
- API response times
- Database query performance

### Analytics
- Product analytics (team usage, feature adoption)
- User engagement metrics
- Conversion funnel tracking
- Plan tier distribution

---

## Future Roadmap

### Near Term
- Yjs CRDT real-time co-editing
- Mobile-responsive layout
- Notion/Confluence import
- Advanced search filters
- Notification system (email + in-app)

### Mid Term
- SAML/OIDC SSO
- Advanced analytics dashboard
- Custom branding
- API rate limiting
- Advanced permissions (per-page)

### Long Term
- Agentic kernel (autonomous agents)
- Offline mode (PWA)
- Desktop app (Tauri)
- Enterprise features (audit logs, compliance)
- Multi-region deployment

---

## Conclusion

TeamOS represents a modern approach to team knowledge management, combining the best of wiki systems, AI-powered search, and strategic planning. Its architecture prioritizes:

1. **Cloud-native design:** No desktop app, pure web-based
2. **AI-first approach:** Tiered AI capabilities based on subscription
3. **Developer experience:** Modern stack (Next.js, Django, React)
4. **User experience:** Real-time updates, streaming responses, intuitive UI
5. **Data integrity:** Version control, audit trails, source tracking
6. **Scalability:** Async processing, caching, CDN deployment

The platform is positioned as a compelling alternative to traditional knowledge management tools, with unique AI capabilities that go beyond simple search to provide actionable insights and strategic planning assistance.

---

## Detailed Configuration

### Django Settings (`teamos_project/settings.py`)

**Installed Apps:**
- `django.contrib.admin`, `auth`, `contenttypes`, `sessions`, `messages`, `staticfiles`
- `rest_framework`, `corsheaders`
- `accounts`, `wiki`, `ingest`, `graph_engine`, `chat`, `presence`, `export_app`, `billing`, `llm_orchestrator`, `product_analytics`, `admin_api`, `planning`

**Middleware Stack:**
- `corsheaders.middleware.CorsMiddleware`
- `django.middleware.security.SecurityMiddleware`
- `whitenoise.middleware.WhiteNoiseMiddleware`
- `django.contrib.sessions.middleware.SessionMiddleware`
- `django.middleware.common.CommonMiddleware`
- `django.middleware.csrf.CsrfViewMiddleware`
- `django.contrib.auth.middleware.AuthenticationMiddleware`
- `django.contrib.messages.middleware.MessageMiddleware`
- `django.middleware.clickjacking.XFrameOptionsMiddleware`
- `llm_orchestrator.middleware.LlmUsageMiddleware`

**Authentication:**
- Custom `CookieJWTAuthentication` class that falls back to cookie-based JWT tokens
- `AUTH_USER_MODEL = 'accounts.User'`
- REST Framework defaults to `IsAuthenticated` permission class

**Database Configuration:**
- Uses `dj_database_url` for flexible database URL configuration
- Default: SQLite for local development
- Production: PostgreSQL via Supabase
- Connection health checks enabled

**Static Files:**
- WhiteNoise for static file serving
- Compressed manifest storage for production
- Media files stored in `/media/` directory

**Plan Tiers Configuration:**
```python
PLAN_TIERS = {
    "free": {"chunk_size": 300, "chunk_overlap": 30},
    "pro": {"chunk_size": 500, "chunk_overlap": 50},
}
```

**Billing Configuration:**
- Provider: Paddle (configurable via `BILLING_PROVIDER`)
- Webhook secret for payment events
- Price IDs for team/pro/enterprise plans
- Checkout preview mode for testing

**LLM Orchestrator Config:**
- `OPENAI_ONLY = True` (OpenAI-only mode)
- `LLM_COST_BUDGET_RATIO = 0.30` (30% margin target)
- `FREE_TRIAL_DAYS = 60`
- `FREE_TRIAL_TOKEN_BUDGET = 5000`
- `FREE_TRIAL_SEAT_LIMIT = 3`
- `PAYMENT_GRACE_PERIOD_DAYS = 7`

**Celery Configuration:**
- Broker URL: Redis (configurable via `REDIS_URL`)
- Result backend: Redis
- Auto-discovery of tasks enabled

**Channels (WebSocket) Configuration:**
- Redis channel layer for WebSocket message routing
- Presence and planning WebSocket routes

**Production Security:**
- SSL redirect enabled
- Secure cookies (httpOnly, SameSite=Lax)
- XSS and content type sniffing protection
- CSRF trusted origins configuration

**CORS Configuration:**
- Configurable allowed origins via `CORS_ALLOWED_ORIGINS`
- Credentials support enabled

---

## Celery Task Architecture

### Task Categories

**Ingestion Tasks (`ingest/tasks.py`):**
- `wire_page_graph`: Parse wikilinks and create graph edges (max 3 retries)
- `infer_ai_edges`: AI-inferred semantic edges via vector similarity (max 2 retries)
- `run_ingest_job`: Full ingestion pipeline execution (max 2 retries)
- `run_gap_analysis`: Identify orphan concepts (wikilinks to non-existent pages)
- `agent_react_to_page_change`: Agent reacts to wiki changes, creates typed edges (max 2 retries)
- `agent_sync_wiki_to_plans`: Sync wiki changes to active plans (max 1 retry)

**Planning Tasks (`planning/tasks.py`):**
- `reindex_project_async`: Async project reindexing (max 2 retries)
- `autonomous_schedule_auditor`: Continuous conflict detection and auto-healing (scheduled task)

**Other Task Modules:**
- `accounts/tasks.py`: Account-related async operations
- `billing/tasks.py`: Billing and subscription tasks
- `chat/tasks.py`: Chat-related background jobs
- `product_analytics/tasks.py`: Analytics aggregation tasks

### Task Features

**Retry Strategy:**
- Exponential backoff with jitter
- Configurable max retries per task
- Dead letter queue for permanently failed tasks
- Trace ID propagation for debugging

**Dead Letter Queue:**
- `AsyncDeadLetter` model stores failed task metadata
- Includes task name, error message, payload, retry count
- Manual requeue capability via admin interface

---

## WebSocket Architecture

### Presence System (`presence/consumers.py`)

**Consumer:** `PresenceConsumer`
- Route: `ws/presence/{team_id}/`
- Features:
  - Real-time team presence tracking
  - Page-level presence (which page each user is viewing)
  - Typing indicators
  - Broadcast presence updates to all team members

**State Management:**
- `TeamPresenceManager`: In-memory presence state
- Tracks: user email, current page slug, typing status
- Broadcasts on connect, disconnect, and page changes

### Planning System (`planning/consumers.py`)

**Consumer:** `PlannerConsumer`
- Route: `ws/planning/{team_id}/{project_id}/`
- Features:
  - Real-time cursor movement broadcasting
  - Collaborative node positioning
  - State change notifications
  - Conflict resolution broadcasts

**Event Types:**
- `cursor_move`: User cursor position
- `node_move`: Collaborative node repositioning
- `state_change`: Project state updates

### ASGI Configuration (`teamos_project/asgi.py`)

**Protocol Router:**
- HTTP: Django ASGI application
- WebSocket: AuthMiddlewareStack with URLRouter

**WebSocket Routes:**
- Presence routes from `presence.routing`
- Planning routes from `planning.routing`

---

## LLM Orchestrator

### Central Gateway (`llm_orchestrator/orchestrator.py`)

**Client Pool:**
- Singleton OpenAI client pool
- Support for OpenRouter API
- Configurable base URLs and headers

**Routing Strategy:**
- `get_routed_model()`: Selects model based on subscription tier
- Routes: free_fixed, continuous_curve, grace_period_fallback, value_aware_priority, pro_background_routing, team_background_routing, cache, enterprise_sla

**Cost Tracking:**
- `TeamApiUsage` model tracks all LLM calls
- Fields: operation, model_used, input/output tokens, cost_usd, latency_ms, value_score, billing_month, routed_by
- Middleware intercepts all LLM calls for telemetry

**Features:**
- JSON mode support for structured outputs
- Streaming support for real-time responses
- Tool calling support
- Caching layer for repeated queries

---

## Agent System

### Multi-Agent Architecture (`chat/multi_agent.py`)

**Agent Roles:**
- `STRATEGIC_PLANNER`: Deep reasoning for project planning
- `LIGHTWEIGHT`: Fast lookup operations
- `RESEARCHER`: Knowledge base exploration
- `ANALYST`: Data analysis and insights

**Orchestrator:**
- Intent classification
- Agent selection based on query type
- Reasoning depth determination
- Confidence scoring

### Universal Intelligence Stream (`chat/universal_stream.py`)

**Pipeline:**
1. **Classification Phase:** Analyze intent and select agent
2. **Knowledge Retrieval:** RAG search for relevant wiki content
3. **Routing Phase:** Dispatch to appropriate agent
4. **Execution:** Agent runs with tool context
5. **Response:** Stream results via SSE

**SSE Events:**
- `status`: Progress updates
- `agent_strategy`: Agent selection details
- `citations`: Retrieved wiki citations
- `agent_step`: Agent progress
- `agent_result`: Final result
- `done`: Stream complete

### Planner Agent (`planning/agent_executor.py`)

**System Prompt:**
- TeamOS Plan Architect persona
- Wiki knowledge base integration
- Interactive questions for missing information
- Execution protocol for create/manage modes

**Tools:**
- `plan_generate_draft`: Create/update project draft
- `plan_detect_conflicts`: Identify scheduling conflicts
- `plan_risk_assessment`: Analyze project risks
- `plan_sync_wiki`: Sync to wiki pages

**Execution Protocol:**
1. Retrieve wiki context
2. Generate or update plan draft
3. Detect conflicts
4. Assess risks
5. Sync to wiki
6. Provide summary

---

## Planning Engine

### Core Engine (`planning/engine.py`)

**Two-Pass Task Creation:**
- Pass 1: Create all tasks without dependencies
- Pass 2: Resolve dependencies using index-to-task map
- Fixes FK violations from sequential creation

**Date Sanitization:**
- `_sanitize_date()`: Validates and corrects dates
- Rejects dates before 2026-05-01
- Computes defaults anchored to today

**Semantic Keys:**
- Hash-based identifiers for tasks/milestones
- Survives AI rewrites
- Used for deduplication and tracking

**Human-Locked Fields:**
- Users can lock specific fields from AI overwrites
- Stored as JSON: field → ISO timestamp
- Respected during AI updates

### ChangeSet Workflow

**Pipeline:**
1. AI proposes mutations (create/update/delete)
2. System validates against field policies
3. Safe mutations auto-applied (if `plan_auto_apply_safe=true`)
4. Pending mutations create ChangeSet for review
5. Frontend shows PlanReviewPanel
6. User approves/rejects/requests changes
7. Remediation preview applied on approval

**SSE Events:**
- `plan_version_created`: New version created
- `plan_changeset_ready`: Changeset ready for review
- `plan_mutation_pending`: Individual mutation details
- `plan_mutation_applied`: Changes auto-applied

---

## Graph Engine

### Edge Types

**Structural:**
- `wikilink`: Explicit `[[Page]]` references (confidence 1.0)
- `citation`: Chat citation links

**AI-Inferred:**
- `ai_inferred`: AI-detected relationships (0.0-1.0)
- `semantic`: Vector similarity-based edges

**Manual:**
- `manual`: User-created relationships

**Typed Relations:**
- `depends_on`, `contradicts`, `extends`, `implements`, `supersedes`, `parent_child`, `prerequisite`, `references`

### Analytics

**Algorithms:**
- PageRank: Identify hub nodes
- Louvain community detection: Cluster similar content
- Orphan detection: Find disconnected pages
- Centrality metrics: Betweenness, closeness, degree

**Caching:**
- Redis-based with 1-hour TTL
- Invalidated on page changes
- Surgical updates (no full rebuild)

---

## Billing System

### Models

**TeamSubscription:**
- One-to-one with Team
- Provider: Paddle (configurable)
- Status: trialing, trial_expired, active, past_due, suspended, canceled, incomplete
- Plan key: free, team, pro, enterprise
- Trial and grace period tracking

**BillingWebhookEvent:**
- Idempotent webhook processing
- Provider, event_id, event_type
- Payload storage
- Processing status tracking

### Integration

**Paddle Integration:**
- Checkout API for subscription creation
- Webhook for payment events
- Price ID configuration per plan
- Sandbox mode for testing

---

## Admin Dashboard

### Tech Stack

**Frontend:**
- Vue 3 + TypeScript
- Vite build system
- Tailwind CSS 4
- Shadcn UI components
- Recharts for analytics
- Clerk for authentication

**Dependencies:**
- `@base-ui/react`: Base UI components
- `@clerk/clerk-react`: Authentication
- `date-fns`: Date utilities
- `lucide-react`: Icons
- `recharts`: Charts
- `sonner`: Toast notifications

### Features

- User management
- Team management
- Billing overview
- System analytics
- Configuration management

---

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)

**Jobs:**

**Changes Detection:**
- Detects changes in backend, frontend, docs
- Outputs change flags for conditional job execution

**Backend:**
- Python 3.11
- Install dependencies
- Migration check (`makemigrations --check --dry-run`)
- Run tests (`manage.py test`)

**Frontend:**
- Node 20
- Install dependencies
- Run lint
- Run typecheck
- Run tests (if present)

**Docs Contract:**
- Python 3.11
- Validate docs contracts
- Validate branch protection contract

### Branch Protection

**Required Checks:**
- `backend`
- `frontend`
- `docs-contract`

**Configuration Script:**
- `scripts/configure_branch_protection.sh`
- `scripts/validate_branch_protection_contract.py`

---

## Deployment

### Docker Configuration

**Backend Dockerfile:**
- Base: Python 3.11-slim
- System dependencies: build-essential, libpq-dev, git
- Python dependencies from requirements.txt
- Static file collection
- ASGI server: Daphne
- Entrypoint script for migrations

**Docker Compose:**
- PostgreSQL 15-alpine
- Redis 7-alpine
- Qdrant latest
- Backend service (Daphne)
- Worker service (Celery)
- Frontend service (Next.js)
- Health checks for all services
- Volume persistence for data

### Procfile

**Root Procfile:**
```
web: PYTHONPATH=backend daphne -b 0.0.0.0 -p $PORT teamos_project.asgi:application
worker: PYTHONPATH=backend celery -A teamos_project worker --concurrency=4 -l info
release: PYTHONPATH=backend python manage.py migrate
```

**Backend Procfile:**
```
web: daphne -b 0.0.0.0 -p $PORT teamos_project.asgi:application
worker: celery -A teamos_project worker --concurrency=4 -l info
release: python manage.py migrate
```

### Environment Variables

**Required:**
- `DJANGO_SECRET_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `OPENAI_API_KEY` or `OPENROUTER_API_KEY`

**Optional:**
- `DEBUG`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- Billing configuration (Paddle)

---

## Testing

### Test Coverage

**Backend Tests:**
- `accounts/tests.py`: User, Team, authentication
- `wiki/tests.py`: Wiki pages, chunks, templates
- `chat/tests.py`: Chat sessions, messages, agents
- `planning/tests.py`: Projects, tasks, milestones, changesets
- `ingest/tests.py`: Ingestion pipeline, vectors
- `graph_engine/tests.py`: Graph edges, analytics
- `billing/tests.py`: Subscriptions, webhooks
- `llm_orchestrator/tests.py`: LLM routing, cost tracking
- `product_analytics/tests.py`: Analytics events
- `export_app/tests.py`: Export functionality
- `presence/tests.py`: WebSocket presence
- `admin_api/tests.py`: Admin API endpoints

**Frontend Tests:**
- Vitest for unit tests
- ESLint for linting
- TypeScript for type checking

---

## Management Commands

### Planning Commands

**backfill_plan_semantic_keys:**
- Backfills semantic keys for existing tasks and milestones
- Computes hash-based identifiers from titles
- Ensures consistency across the database

---

## Documentation

### Core Documentation Files

- `TEAMOS_PLAN.md`: Implementation plan
- `API_CONTRACT.md`: API specification
- `PRICING_STRATEGY.md`: Pricing details
- `DEPLOYMENT_GUIDE.md`: Deployment instructions
- `FULL_SYSTEM_AUDIT.md`: System audit
- `UNIMPLEMENTED_ITEMS.md`: Feature backlog

### Module Documentation

- `wiki_system.md`: Wiki module details
- `chat_system.md`: Chat system details
- `knowledge_graph.md`: Graph engine details
- `ingestion_module.md`: Ingestion pipeline
- `management_system.md`: Management features
- `advanced_ai.md`: AI capabilities
- `platform_ops.md`: Operations guide
- `export_system.md`: Export functionality
- `governance_workflow.md`: Governance processes

### Planning Documents

- `PROJECT_PLANNING_PREPARATION.md`: Planning preparation
- `FUNCTIONAL_EXCELLENCE_PLAN.md`: Functional excellence
- `AGENTIC_SYSTEM_IMPROVEMENT_PLAN.md`: Agent improvements
- `AGENT_CENTRIC_TRANSFORMATION.md`: Agent transformation
- `GRAPH_PHASE2_IMPLEMENTATION_PLAN.md`: Graph phase 2
- `INGESTION_PHASE2_IMPLEMENTATION_PLAN.md`: Ingestion phase 2
- `UI_REDESIGN_PLAN.md`: UI redesign
- `ADMIN_DASHBOARD_PLAN.md`: Admin dashboard

### Integration Documentation

- `CLERK_DJANGO_TEAMOS_IMPLEMENTATION.md`: Clerk integration
- `BILLING_PROVIDER_DECISION_ETHIOPIA.md`: Billing provider decision

### Docs Directory

- `docs/LOCAL_AND_DOCKER.md`: Local development setup
- `docs/PRODUCTION_DEV_ONLY_STRIPPING.md`: Production configuration
- `docs/INGEST_OSS.md`: OSS ingestion tools
- `docs/PROJECT_PLANNER_GEMINI_INTEGRATION.md`: Gemini integration
- `docs/capability-matrix.md`: Capability matrix
- `docs/product-analytics-events.md`: Analytics events

---

## Frontend Configuration

### Next.js Configuration

**Next.js 15:**
- App Router
- Server Components
- Streaming support
- Edge functions

**Middleware:**
- Clerk authentication
- Protected routes
- Public routes: `/`, `/login`, `/register`, `/accept-invite`

### Root Layout

**Providers:**
- `ClerkProvider`: Authentication
- `ThemeProvider`: Theme management
- `ToastProvider`: Toast notifications
- `PaddleProvider`: Billing integration

**Fonts:**
- Geist Sans (variable)
- Geist Mono (variable)

**Theme Script:**
- Inline script to prevent theme flash
- Reads from localStorage
- Sets `data-theme` attribute

### App Structure

**Authenticated Routes (`(app)/`):**
- `wiki/`: Wiki editor and pages
- `chat/`: Chat interface
- `plan/`: Strategic planning
- `graph/`: Knowledge graph
- `ingest/`: Ingestion panel
- `settings/`: Team settings
- `analytics/`: Analytics dashboard
- `onboarding/`: Onboarding flow
- `user-management/`: User management

**Public Routes:**
- Landing page
- Pricing page
- Privacy policy
- Terms of service
- Refund policy

---

## Component Architecture

### Editor Components

**TipTap Extensions:**
- WikiLink: `[[wikilink]]` autocomplete
- Math: KaTeX math support
- Mermaid: Diagram rendering
- Collaboration: Yjs CRDT for real-time editing
- Placeholder: Empty state handling
- Table: Rich table editing

### Chat Components

**PlanReviewPanel:**
- Shared review component
- Mutation summary display
- Approve/reject/revise actions
- Plan preview with diff
- SSE event integration

**AgentThinkingPane:**
- Agent progress display
- Tool execution timeline
- Reasoning visualization

### Planner Components

**TimelinePanel:**
- Weekly timeline view
- Subtask filtering
- Dependency visualization
- Date range calculation
- Show/hide subtasks toggle

**ActivityPanel:**
- Card-based layout
- Date grouping
- Activity type filters
- Glassmorphism styling
- Expandable cards

**AIPlannerOverlay:**
- AI-powered planning interface
- PlanReviewPanel integration
- SSE streaming
- Interactive questions

**ConflictPanel:**
- Scheduling conflict display
- Severity badges
- Comparative timeline
- AI resolution trigger

### Graph Components

**Cytoscape Integration:**
- Force-directed layout
- Node/edge styling
- Zoom/pan controls
- Cluster view
- Manual edge creation

---

## API Endpoints

### Accounts API

- `POST /api/auth/register/` - User registration
- `POST /api/auth/login/` - User login
- `POST /api/auth/logout/` - User logout
- `GET /api/teams/` - List user's teams
- `POST /api/teams/` - Create team
- `GET /api/teams/{id}/members/` - List team members
- `POST /api/teams/{id}/invites/` - Create invite
- `POST /api/invites/{token}/accept/` - Accept invite

### Wiki API

- `GET /api/teams/{team_id}/pages/` - List pages
- `POST /api/teams/{team_id}/pages/` - Create page
- `GET /api/teams/{team_id}/pages/{slug}/` - Get page
- `PUT /api/teams/{team_id}/pages/{slug}/` - Update page
- `DELETE /api/teams/{team_id}/pages/{slug}/` - Delete page
- `GET /api/teams/{team_id}/pages/{slug}/backlinks/` - Get backlinks
- `GET /api/teams/{team_id}/templates/` - List templates

### Chat API

- `GET /api/teams/{team_id}/capabilities/` - Get chat capabilities
- `GET /api/teams/{team_id}/tts/` - Text-to-speech
- `GET /api/teams/{team_id}/sessions/` - List sessions
- `POST /api/teams/{team_id}/sessions/` - Create session
- `GET /api/teams/{team_id}/sessions/{id}/` - Get session
- `POST /api/teams/{team_id}/sessions/{id}/query/` - Stream chat query
- `GET /api/teams/{team_id}/usage-stats/` - Usage statistics
- `GET /api/teams/{team_id}/alerts/` - Proactive alerts

### Planning API

- `GET /api/teams/{team_id}/projects/` - List projects
- `POST /api/teams/{team_id}/projects/` - Create project
- `GET /api/teams/{team_id}/projects/{id}/` - Get project
- `PUT /api/teams/{team_id}/projects/{id}/` - Update project
- `POST /api/teams/{team_id}/projects/{id}/remediate/` - Remediate project
- `GET /api/teams/{team_id}/projects/{id}/tasks/` - List tasks
- `POST /api/teams/{team_id}/projects/{id}/tasks/` - Create task
- `GET /api/teams/{team_id}/projects/{id}/tasks/{id}/` - Get task
- `GET /api/teams/{team_id}/projects/{id}/milestones/` - List milestones
- `POST /api/teams/{team_id}/projects/{id}/milestones/` - Create milestone
- `GET /api/teams/{team_id}/calendar/feed/` - Calendar feed
- `POST /api/teams/{team_id}/assist/` - Planning assist
- `POST /api/teams/{team_id}/assist/stream/` - Planning assist stream
- `GET /api/teams/{team_id}/activity/` - Activity log
- `GET /api/teams/{team_id}/conflicts/` - List conflicts
- `POST /api/teams/{team_id}/projects/{id}/conflicts/resolve/` - Resolve conflicts
- `GET /api/teams/{team_id}/projects/{id}/risk/` - Risk assessment
- `POST /api/teams/{team_id}/projects/{id}/risk/resolve/proposal/` - Risk resolution proposal
- `POST /api/teams/{team_id}/projects/{id}/risk/resolve/apply/` - Apply risk resolution
- `GET /api/teams/{team_id}/projects/{id}/snapshots/` - List snapshots
- `POST /api/teams/{team_id}/projects/{id}/snapshots/{id}/restore/` - Restore snapshot
- `GET /api/teams/{team_id}/projects/{id}/versions/` - List versions
- `POST /api/teams/{team_id}/projects/{id}/versions/{id}/restore/` - Restore version
- `GET /api/teams/{team_id}/projects/{id}/changesets/` - List changesets
- `GET /api/teams/{team_id}/projects/{id}/changesets/{id}/` - Get changeset
- `POST /api/teams/{team_id}/projects/{id}/changesets/{id}/approve/` - Approve changeset
- `POST /api/teams/{team_id}/projects/{id}/changesets/{id}/reject/` - Reject changeset
- `GET /api/teams/{team_id}/overdue/` - List overdue items
- `GET /api/teams/{team_id}/notifications/` - List notifications
- `GET /api/teams/{team_id}/projects/{id}/tasks/{id}/comments/` - List task comments
- `POST /api/teams/{team_id}/projects/{id}/tasks/{id}/decompose-daily/` - Decompose to daily tasks

### Ingest API

- `POST /api/teams/{team_id}/ingest/` - Create ingest job
- `GET /api/teams/{team_id}/ingest/{id}/` - Get job status
- `POST /api/teams/{team_id}/ingest/{id}/approve/` - Approve changeset
- `POST /api/teams/{team_id}/ingest/{id}/reject/` - Reject changeset

### Graph API

- `GET /api/teams/{team_id}/graph/nodes/` - Get graph nodes
- `GET /api/teams/{team_id}/graph/edges/` - Get graph edges
- `POST /api/teams/{team_id}/graph/edges/` - Create manual edge
- `GET /api/teams/{team_id}/graph/algorithms/pagerank/` - Run PageRank
- `GET /api/teams/{team_id}/graph/algorithms/communities/` - Run community detection

### Export API

- `POST /api/teams/{team_id}/export/` - Create export job

### Billing API

- Webhook endpoints for payment events
- Subscription management

### Analytics API

- Usage analytics endpoints
- Product analytics events

### Admin API

- Platform administration endpoints

---

## SSE Streaming Patterns

### Chat Streaming

**Endpoint:** `POST /api/teams/{team_id}/sessions/{id}/query/`

**Events:**
- `token`: Individual LLM token
- `citation`: Source citation with metadata
- `agent_step`: Agent progress update
- `agent_result`: Agent final result
- `done`: Stream complete

### Planning Streaming

**Endpoint:** `POST /api/teams/{team_id}/assist/stream/`

**Events:**
- `agent_step`: Planning progress
- `plan_version_created`: New version created
- `plan_changeset_ready`: Changeset ready for review
- `plan_mutation_pending`: Individual mutation
- `plan_mutation_applied`: Changes auto-applied
- `agent_result`: Final result

### Ingestion Progress

**Endpoint:** `GET /api/teams/{team_id}/ingest/{id}/stream/`

**Events:**
- `stage`: Current stage
- `progress`: Progress percentage
- `error`: Error message
- `done`: Job complete

---

## Security Considerations

### Authentication Flow

1. **Frontend:** Clerk handles authentication UI
2. **Token Storage:** JWT in httpOnly cookies
3. **Backend:** Custom `CookieJWTAuthentication` validates tokens
4. **Middleware:** Clerk middleware protects routes

### Authorization

- Role-based access control (owner/editor/viewer)
- Team-scoped data isolation
- Row-level security via query filters
- API endpoint permission checks

### Data Protection

- Soft delete for teams (30-day purge window)
- Raw source permanent storage
- Audit logging for governance
- Encrypted secrets for external services

### Production Security

- SSL redirect enabled
- Secure cookies (httpOnly, SameSite=Lax)
- XSS and content type sniffing protection
- CSRF protection
- CORS configuration

---

## Performance Optimization Strategies

### Frontend

- Next.js Server Components for initial render
- Streaming responses for chat/planning
- Image optimization via Next.js Image
- Code splitting via dynamic imports
- Zustand for efficient client state
- TanStack Query for server state caching
- Virtual scrolling for large lists

### Backend

- Celery for async task processing
- Redis caching for graph algorithms
- Database query optimization (select_related, prefetch_related)
- pgvector for efficient vector similarity
- SSE for real-time updates (no polling)
- Connection pooling via Django ORM
- Dead letter queue for failed tasks

### Database

- Indexed fields (semantic_key, content_hash, etc.)
- Unique constraints for data integrity
- Foreign key indexes for join performance
- Query optimization via Django ORM
- Connection pooling

---

## Monitoring & Observability

### Logging

- Structured logging (JSON format)
- Log levels (DEBUG/INFO/WARNING/ERROR)
- Request/response logging
- Error tracking (Sentry integration planned)
- Trace ID propagation across async tasks

### Metrics

- Token usage tracking
- Ingestion job metrics
- Chat session metrics
- API response times
- Database query performance
- LLM cost tracking
- Task retry rates

### Analytics

- Product analytics (team usage, feature adoption)
- User engagement metrics
- Conversion funnel tracking
- Plan tier distribution
- First-time user events

---

## Development Workflow

### Local Development

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Docker Compose:**
```bash
docker-compose up -d
```

### Testing

**Backend:**
```bash
cd backend
python manage.py test
```

**Frontend:**
```bash
cd frontend
npm run lint
npm run typecheck
npm run test
```

### Migrations

**Create migrations:**
```bash
cd backend
python manage.py makemigrations
```

**Check migrations:**
```bash
python manage.py makemigrations --check --dry-run
```

**Apply migrations:**
```bash
python manage.py migrate
```

---

## Known Limitations & Future Work

### Current Limitations

- No real-time co-editing (Yjs integration planned)
- No mobile-optimized layout
- No Notion/Confluence import
- No SAML/OIDC SSO
- No offline mode (PWA)
- No desktop app (Tauri)

### Planned Enhancements

**Near Term:**
- Yjs CRDT real-time co-editing
- Mobile-responsive layout
- Notion/Confluence import
- Advanced search filters
- Notification system (email + in-app)

**Mid Term:**
- SAML/OIDC SSO
- Advanced analytics dashboard
- Custom branding
- API rate limiting
- Advanced permissions (per-page)

**Long Term:**
- Agentic kernel (autonomous agents)
- Offline mode (PWA)
- Desktop app (Tauri)
- Enterprise features (audit logs, compliance)
- Multi-region deployment

---

## Conclusion

TeamOS represents a comprehensive, modern approach to team knowledge management. The system combines:

1. **Cloud-native architecture** with no desktop dependency
2. **AI-first approach** with tiered capabilities based on subscription
3. **Modern tech stack** (Next.js 15, Django 5, React 19)
4. **Real-time collaboration** via WebSockets and SSE
5. **Data integrity** through versioning, audit trails, and source tracking
6. **Scalability** via async processing, caching, and CDN deployment

The platform is positioned as a compelling alternative to traditional knowledge management tools, with unique AI capabilities that go beyond simple search to provide actionable insights, strategic planning assistance, and intelligent content synthesis.
