# TeamOS — Implementation Plan
> Cloud-hosted team knowledge wiki. No Electron. No Git versioning. No agentic kernel.

---

## The Six Modules

| # | Module | Description |
|---|--------|-------------|
| 1 | **Ingestion** | URL / PDF / DOCX / Markdown → chunked, embedded, stored |
| 2 | **Interlinked Wiki** | TipTap editor, `[[wikilinks]]`, backlinks, frontmatter, templates, **Create/Open markdown workspace** |
| 3 | **Knowledge Graph** | Cytoscape.js graph, event-driven edge updates, AI-inferred edges |
| 4 | **Team Chat (Citational)** | Streaming RAG chat with inline clickable citations + session history |
| 5 | **Team Management** | Email + Google OAuth, owner/editor/viewer roles, invite links, presence |
| 6 | **Export** | Single page `.md`, multi-page `.zip`, full wiki + `_graph.json` |

**Cut:** Git branching, agentic kernel, kanban, Electron, offline mode.

---

## Tech Stack

- **Frontend:** Next.js 15 App Router → Vercel
- **Backend:** Django 5 + DRF + Django Channels (ASGI) → Fly.io
- **DB:** PostgreSQL (Supabase)
- **Vectors:** Qdrant Cloud
- **Files:** Supabase Storage (S3-compatible)
- **Queue:** Celery + Upstash Redis
- **Auth:** django-allauth (email + Google OAuth)
- **Editor:** TipTap (ProseMirror, MIT)
- **Graph:** Cytoscape.js
- **State:** Zustand + TanStack Query
- **CSS:** Vanilla CSS custom properties (no Tailwind)

---

## Tiered Models & Chunking Strategy

Plans determine chunking depth, context window, and model quality at every stage.

### Free Plan
- **Embedding model:** `nomic-embed-text` (local, free)
- **Chunk size:** 300 tokens, 30-token overlap, character-boundary splitting
- **Chunks per query:** top-5 retrieved, top-3 after rerank
- **Context window:** 2,000 tokens max
- **Chat model:** `llama-3.1-8b-instant` (Groq, free tier)
- **Query understanding:** single LLM call, no multi-query expansion
- **Re-ranker:** none (cosine similarity only)

### Team Plan ($20/user/month)
- **Embedding model:** `text-embedding-3-small` (OpenAI, 1536 dims)
- **Chunk size:** 512 tokens, 64-token overlap, sentence-boundary splitting (spaCy)
- **Chunks per query:** top-20 retrieved, top-8 after rerank
- **Context window:** 6,000 tokens max
- **Chat model:** `llama-3.3-70b-versatile` (Groq) or `gpt-4o-mini` (OpenAI)
- **Query understanding:** LLM intent classification + 3 query expansions (multi-query)
- **Re-ranker:** cross-encoder `ms-marco-MiniLM-L-6-v2` on top-20

### Pro Plan ($40/user/month)
- **Embedding model:** `text-embedding-3-large` (OpenAI, 3072 dims)
- **Chunk size:** 1024 tokens, 128-token overlap, semantic boundary splitting (embedding cosine drop)
- **Chunks per query:** top-50 retrieved, top-12 after rerank
- **Context window:** 16,000 tokens max
- **Chat model:** `claude-3-5-sonnet` (Anthropic) or `gpt-4o` (OpenAI)
- **Query understanding:** LLM intent + 5 query expansions + named entity extraction → metadata filters
- **Re-ranker:** cross-encoder `ms-marco-MiniLM-L-12-v2` (larger model) on top-50

### Implementation: `PlanTier` config object (backend)
```python
PLAN_TIERS = {
    "free": {
        "embed_model": "nomic-embed-text",
        "chunk_size": 300, "chunk_overlap": 30,
        "chunking_strategy": "character",
        "retrieve_k": 5, "rerank_k": 3,
        "context_tokens": 2000,
        "chat_model": "llama-3.1-8b-instant",
        "query_expansions": 0,
        "reranker": None,
    },
    "team": {
        "embed_model": "text-embedding-3-small",
        "chunk_size": 512, "chunk_overlap": 64,
        "chunking_strategy": "sentence",
        "retrieve_k": 20, "rerank_k": 8,
        "context_tokens": 6000,
        "chat_model": "llama-3.3-70b-versatile",
        "query_expansions": 3,
        "reranker": "cross-encoder/ms-marco-MiniLM-L-6-v2",
    },
    "pro": {
        "embed_model": "text-embedding-3-large",
        "chunk_size": 1024, "chunk_overlap": 128,
        "chunking_strategy": "semantic",
        "retrieve_k": 50, "rerank_k": 12,
        "context_tokens": 16000,
        "chat_model": "claude-3-5-sonnet-20241022",
        "query_expansions": 5,
        "reranker": "cross-encoder/ms-marco-MiniLM-L-12-v2",
    },
}
```

---

## Markdown Workspace (Create + Open) — Like mem-desktop, Advanced

Modeled on `MarkdownWorkspace.tsx` + `OpenMarkdown.tsx` from mem-desktop, but enhanced.

### Create Mode (`/wiki/new`)
- **Blank page:** title input → TipTap editor opens immediately
- **From template picker:** Decision Record, Meeting Notes, Project Brief, Incident Report, SOP
- **From ingestion:** paste URL or upload file → ingests AND creates a linked wiki page automatically
- **Import `.md` file:** drag-drop or file picker → parses frontmatter, creates page, triggers ingestion pipeline

### Open Mode — Command-K Style Picker
- `⌘K` or "Open page" button → floating fullscreen modal (like mem-desktop `OpenMarkdown`)
- Real-time fuzzy search across: title, slug, tags, content summary
- Shows: title, last-updated date, page type badge, tag chips
- Keyboard nav: `↑↓` to move, `Enter` to open, `Esc` to close
- "Create new →" hint appears when no results match search query
- Sections: **Recent** (last 10 opened) | **All Pages** (full list)

### Editor Features (TipTap, beyond mem-desktop)
- **Slash commands** (`/`): Heading 1/2/3, Table, Code block, Callout, Divider, Image, WikiLink
- **WikiLink autocomplete** (`[[`): fuzzy picker of all team pages → creates `[[Page Title]]` chips
- **Backlinks panel** (right sidebar): who links here + surrounding context snippet
- **Frontmatter panel** (collapsible top): type, status, tags, related pages as form fields
- **Auto-save** 1500ms debounce (same pattern as mem-desktop)
- **Read-only viewer mode** for Viewer-role members
- **Source file button**: download original ingested PDF/URL snapshot
- **Ingest-from-editor**: `⌘I` opens ingest panel inside the editor sidebar

---

## Ingestion Pipeline

### Sources
- Paste URL → fetch → `markdownify`
- Upload PDF/DOCX → `unstructured` → structured elements (Title, NarrativeText, Table, Code)
- Write/import `.md` directly in the editor

### Steps (Celery async)
1. **Parse** → structural elements (never split tables or code blocks)
2. **Chunk** → strategy from `PLAN_TIERS[team.plan]`
3. **Deduplicate** → SHA-256 hash per chunk, skip if exists
4. **Embed** → model from `PLAN_TIERS[team.plan]` → push to Qdrant `team_{id}`
5. **Auto-tag** → Groq llama-3.1-8b structured call: `topic, keywords[5], related_pages[]`
6. **Graph wiring** → create `GraphEdge(ai_inferred)` rows for related pages
7. **Progress SSE** → each stage emits to user's WebSocket room

---

## Knowledge Graph

- **Nodes:** `WikiPage` rows (id, title, type, summary, updated_at)
- **Edges:** `GraphEdge` table — types: `wikilink` (confidence 1.0), `ai_inferred` (0.0–1.0), `manual`
- **Updates:** Django signal on page save → Celery task → surgical edge diff (no full rebuild)
- **Algorithms (background, cached Redis 1h):** PageRank (hub nodes), Louvain community detection (cluster colors), orphan detection
- **UI (Cytoscape.js):**
  - Click node → right panel: title, summary, "Open in Editor"
  - Double-click → zoom to 2-hop neighborhood
  - Hover edge → tooltip: type + confidence
  - Drag node onto node → creates manual edge
  - Low zoom → cluster view (Louvain regions)

---

## Chat RAG Pipeline

Per-team, uses `PLAN_TIERS[team.plan]` for every stage:

```
Stage 1: Query Understanding
  Free: direct query pass-through
  Team/Pro: LLM intent classification + N query expansions

Stage 2: Hybrid Retrieval (BM25 + Qdrant dense) → RRF merge
  retrieve_k from plan tier, always filtered by team_id

Stage 3: Re-ranking
  Free: skip (cosine scores only)
  Team: cross-encoder/ms-marco-MiniLM-L-6-v2
  Pro:  cross-encoder/ms-marco-MiniLM-L-12-v2

Stage 4: Context Assembly
  Token budget from plan tier
  Prefix each chunk: [Source: {page_title} | Section: {section}]

Stage 5: SSE Streaming
  StreamingHttpResponse → token events + citation events + done event
```

**Citation format streamed:**
```json
{"type": "citation", "page_slug": "auth-system", "page_title": "Auth System",
 "section": "JWT Tokens", "snippet": "...", "confidence": 0.94}
```
Click citation chip → navigate to `/wiki/auth-system#jwt-tokens`

**Chat history:** `ChatSession` → `ChatMessage[]`, rolling summary compression after 6 turns.

---

## Team Management

- **Auth:** email/password + Google OAuth (django-allauth), JWT in httpOnly cookies
- **Roles:** Owner (all), Editor (write/ingest), Viewer (read + chat only)
- **Invites:** token-based link, 7-day expiry
- **Presence:** Django Channels WebSocket → avatar dots on page list (who's on which page)
- **No Git, no branching, no agent approvals**

---

## Export

| Option | Output |
|--------|--------|
| Current page | `.md` download |
| Selected pages | `.zip` of `.md` files |
| Full wiki | `.zip` with `_graph.json` (nodes + edges, `[[wikilinks]]` preserved) |

---

## Project Structure

```
teamos/
├── frontend/          # Next.js 15 App Router → Vercel
│   └── src/
│       ├── app/(auth)/            # login, register, accept-invite
│       ├── app/(app)/             # main app (requires auth)
│       │   ├── wiki/              # editor + create + open workspace
│       │   ├── graph/             # Cytoscape graph page
│       │   ├── chat/              # chat sessions
│       │   ├── ingest/            # ingestion panel
│       │   ├── settings/          # team + members
│       │   └── export/            # export panel
│       ├── components/
│       │   ├── editor/            # TipTap + extensions + WikiLink + toolbar
│       │   ├── wiki-open/         # OpenMarkdown command-k picker
│       │   ├── graph/             # Cytoscape + node panel
│       │   ├── chat/              # chat panel + citations
│       │   ├── ingest/            # ingest form + SSE progress
│       │   ├── sidebar/           # page tree + presence
│       │   ├── command/           # ⌘K palette (cmdk)
│       │   └── ui/                # Button, Card, Modal, Badge, Toggle
│       ├── stores/                # Zustand: wiki, chat, graph, team, ingest
│       ├── hooks/                 # useSSE, useWebSocket, useExport
│       ├── lib/api.ts             # typed fetch client
│       └── css/                   # tokens.css, layout.css, components.css
│
├── backend/           # Django 5 + DRF + Channels → Fly.io
│   ├── teamos/        # project settings (base/dev/prod) + asgi.py
│   └── apps/
│       ├── accounts/  # User, Team, TeamMember, Invite + auth views
│       ├── wiki/      # WikiPage, PageChunk, PageTemplate + views
│       ├── graph/     # GraphEdge + graph views
│       ├── chat/      # ChatSession, ChatMessage + SSE stream view
│       ├── ingest/    # IngestJob + Celery tasks
│       ├── export/    # ExportJob + zip Celery tasks
│       └── presence/  # Channels WebSocket consumer
│
└── docker-compose.yml # postgres + redis + qdrant + backend + celery
```

---

## Build Phases

### Phase 1 — Foundation (Days 1–10)
Auth, team creation, wiki CRUD, TipTap editor, deployments.
- Django project + PostgreSQL + all models (accounts, wiki)
- django-allauth: email + Google OAuth, JWT httpOnly cookies
- Team + invite flow
- WikiPage CRUD endpoints
- Next.js app shell + sidebar
- TipTap editor wired to API (create/open/save)
- **Markdown workspace:** create mode (blank + template) + open mode (⌘K fuzzy picker)
- Vercel + Fly.io deployments

### Phase 2 — Ingestion + Graph (Days 11–20)
- Qdrant Cloud + Celery + Redis wired
- Ingestion pipeline with tiered chunking (`PLAN_TIERS`)
- URL + PDF/DOCX ingestion via `unstructured`
- SHA-256 dedup
- SSE progress to frontend
- `GraphEdge` model + wikilink parser (Django signal → Celery)
- AI edge extraction (Groq)
- Cytoscape.js graph viewer
- WikiLink TipTap extension (`[[...]]` autocomplete)
- Backlinks panel in editor

### Phase 3 — Chat + Citations + History (Days 21–30)
- ChatSession + ChatMessage models
- Tiered RAG pipeline (BM25 + Qdrant + RRF + optional rerank)
- SSE streaming response
- Citation chips (clickable → scroll to section)
- Chat session list + history
- Multi-turn memory compression

### Phase 4 — Export + Polish + Launch (Days 31–40)
- Export: single page, multi-page zip, full wiki + `_graph.json`
- ⌘K command palette
- Page templates in create mode
- Frontmatter form panel
- WebSocket presence (avatar dots on pages)
- Team settings page (members, roles, remove)
- Graph: hub highlighting (PageRank), orphan warnings
- Docker Compose self-host README

### Phase 5 — Authentication & Dev Bypass (Days 41–45)
- Standard Email/Password registration (`/login`, `/register`)
- Google OAuth integration via django-allauth
- Custom `seed_dev_user` Django management command to generate a mock user/team and bypass auth friction locally
- Protected Next.js middleware routing to redirect unauthenticated users to `/login`
- Setting `access_token` and `refresh_token` in `httpOnly` cookies

---

## Revenue Model

| Plan | Price | Limits |
|------|-------|--------|
| Free | $0 | 1 team, 3 members, 100 pages, 50 chat/mo |
| Team | $20/user/mo | Unlimited pages + chat, 5GB storage |
| Pro | $40/user/mo | Best models, largest context, SAML, audit logs |

## Post-Revenue Only
- Yjs CRDT real-time co-editing
- SAML/OIDC SSO
- Agentic kernel
- Mobile layout
- Notion/Confluence import
