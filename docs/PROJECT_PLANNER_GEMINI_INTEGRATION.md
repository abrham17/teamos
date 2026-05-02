# Project Planner: TeamOS Integration Plan

This document specifies how to bring **project planning** into TeamOS using the `gemini_plan` folder **only as a UI/UX reference** (components and flows to port). **Do not** ship Google Gemini or `@google/genai` in TeamOS. All language-model behavior must go through **existing TeamOS tooling**: `teamos_project/llm_config.py`, the chat stack (`backend/chat/`), `ingest.vectors.vector_store`, and the same OpenAI/Groq configuration already used for Ask and Wiki agent modes.

A core product principle: **plans are one source of knowledge for the team’s next movement**—alongside the wiki and ingest, but authoritative for *commitments, sequencing, ownership, and dates*. Chat, search, and agents should **read and cite** plan state the same way they read wiki chunks, so “what we do next” is not fragmented across ad-hoc docs.

This complements `PROJECT_PLANNING_PREPARATION.md`.

---

## 1. Executive summary

| Layer | Recommendation |
|-------|----------------|
| **Product truth** | Treat **plans** (projects, milestones, tasks, statuses, owners, dates) as **canonical execution knowledge**: the structured answer to “where we are going next and who does what.” Wiki narrates *why*; plans state *what’s committed*. |
| **UI shell** | Do **not** ship the prototype’s embedded sidebar or standalone theme toggle. Mount planner views inside `frontend/src/app/(app)/layout.tsx` (existing `Sidebar` + `main`). |
| **Design tokens** | Map prototype classes to TeamOS CSS variables (`var(--bg-*)`, `var(--text-*)`, `var(--accent*)`, `var(--surface-*)`). TeamOS uses `data-theme="dark" \| "light"` on `<html>` (see §4.3). |
| **State** | Replace prototype `localStorage` with **team-scoped** Postgres APIs. |
| **Intelligence** | **No Gemini.** Use **only** existing backends: `get_llm_backend()` / `chat_completion_model()`, `vector_store` client, chat streaming (`ChatQueryStreamView`), and (for mutations) the same **tool-calling** pattern as `backend/chat/agent_stream.py` / `chat/tools.py`. Extend retrieval and tools—do not add a parallel provider SDK for planning. |
| **Backend** | Separate Django apps (`projects`, `planning`, `calendar`—names flexible) in the same repo, shared `Team` and auth. |

**Success:** Sidebar **Plan** entry, planner UI consistent with TeamOS, durable plan data, and **Ask / Plan / Wiki agent** flows that all treat **plan content as first-class retrieval context** and (where permitted) **mutate plans through the same gated tool path** as wiki edits.

---

## 2. Plans as one source of knowledge (“next movement”)

### 2.1 What this means

- **Single operational picture:** For a given team, the **plan store** is the default place to answer: current objectives, ordered work, deadlines, assignees, blockers, and milestone health. Narrative detail may live in wiki pages **linked** from plan entities, but the **commitment** lives in the plan row.
- **Not a second-class appendix:** Ingest and wiki remain sources for evidence and background; **plan entities** are sources for **action and sequence**. RAG, command palette, and chat should include plan-derived chunks with clear **provenance** (e.g. citation type: `plan_task`, `plan_milestone`).
- **Drives the product:** Defaults such as “My work,” “This week,” notifications, and (later) analytics should prefer **plan state** over scraping markdown for tasks.
- **Agent behavior:** When the user asks “what should we do next?” or “are we on track?”, the system should **ground** answers in **stored plan data + wiki/ingest context**, not free-form guesses. Proposals to change the plan go through **tools** that persist to the same store humans edit in `/plan`.

### 2.2 Relationship to wiki and ingest

| Layer | Role |
|-------|------|
| **Plan** | Committed work structure—**next movement** in time and responsibility. |
| **Wiki** | Narrative, decisions, SOPs, briefs—linked from plan items where useful. |
| **Ingest** | External evidence; can **spawn** or **enrich** wiki pages and optionally **reference** plan items (e.g. “this doc supports milestone M”). |

---

## 3. Reference prototype (`gemini_plan`) — UI only

The `gemini_plan` Vite app is **not** a template for AI or auth. Use it to accelerate **layout and interaction** only.

### 3.1 Stack mismatch

| Piece | Prototype | TeamOS |
|-------|-----------|--------|
| Build | Vite + React 19 | Next.js App Router |
| Theme | `brand-*`, `.dark` class | `globals.css` + `data-theme` |
| Data | `localStorage` | Django API |
| AI | `@google/genai` + Gemini | **Disallowed** — use §5 and §7 |

### 3.2 Component inventory (porting)

| Component | Role | Integration note |
|-----------|------|------------------|
| `Dashboard.tsx` | Project grid, empty states | `/plan` landing; copy tied to **current team**. |
| `ProjectDetail.tsx` | Single-project workspace | e.g. `/plan/[projectId]`. |
| `RecentView.tsx` | Recent activity | API-driven `updated_at` / activity feed. |
| `CalendarView.tsx` | Calendar | `calendar` app feed from tasks/milestones. |
| `Board.tsx` / `Timeline.tsx` | Views | Optional; align with backend ordering. |
| `TeamView.tsx` | Roster | Map to `accounts` membership / roles. |
| `AIPlannerOverlay.tsx` | Natural-language assist | **Rename/refocus:** call **TeamOS planning assist endpoint** that internally uses **chat/LLM stack** (§5.4), not Gemini. |
| Modals | CRUD | POST/PATCH to planning APIs. |

### 3.3 Prototype data shapes

`gemini_plan/src/types.ts` remains a useful **starting DTO** for API design; extend with `team_id`, audit fields, wiki links, etc.

### 3.4 Drop from prototype

- Entire **Gemini** client (`aiService.ts` pattern) from any browser or new server path that imports `@google/genai`.
- Duplicate sidebar, `aether_*` localStorage keys, and `window.openAIPlanner`.

---

## 4. Frontend integration strategy

### 4.1 Layout

1. Add `frontend/src/components/planner/` (or `features/plan/`) with ported components + shared types.
2. Strip any full-app chrome; wrap with `PlanWorkspace` under `app/(app)/plan/page.tsx`.
3. **IA:** Sidebar **Plan** → in-page tabs: Overview | Recent | Calendar | (optional) My work; project detail as a segment route.

### 4.2 Token mapping

| Prototype (example) | TeamOS |
|---------------------|--------|
| `bg-brand-surface` / `bg-brand-panel` | `bg-[var(--bg-900)]` / `bg-[var(--surface-1)]` |
| `border-brand-border` | `border-[var(--border-subtle)]` |
| `text-text-main`, `text-text-muted` | `text-[var(--text-primary)]`, `text-[var(--text-muted)]` |
| `brand-primary` accents | `var(--accent)` (respects light/dark in `globals.css`) |

Prefer `rounded-[var(--radius-lg)]` over one-off radii unless product dictates otherwise.

### 4.3 `dark:` vs `data-theme`

Configure Tailwind so **`dark` variant** matches `[data-theme="dark"]`, or replace `dark:` with semantic variables only. Verify both themes.

### 4.4 Dependencies

- Add `motion` if needed; keep `lucide-react`.
- **Do not** add `@google/genai` to the frontend.

### 4.5 API client

Use `frontend/src/lib/api.ts` patterns: `lib/planApi.ts` for CRUD and for **planning assist** calls that hit Django (which then uses the existing LLM client).

---

## 5. Backend: apps, APIs, and **existing** LLM usage

### 5.1 Django app split

| App | Responsibility |
|-----|----------------|
| **`projects`** | Initiative container (team FK, name, description, status). |
| **`planning`** | Tasks, milestones, dependencies, assignees, ordering, wiki links. |
| **`calendar`** | Aggregated time windows / feed (optional v2 for export/sync). |

URLs (examples): `/api/projects/`, `/api/planning/...`, `/api/calendar/feed?from=&to=`. Same Clerk → user → team patterns as wiki/chat.

### 5.2 Existing LLM stack (authoritative)

| Module | Purpose |
|--------|---------|
| `teamos_project/llm_config.py` | `get_llm_backend()` (`openai` \| `groq`), `chat_completion_model()`, `embedding_model_name()` |
| `ingest.vectors.vector_store` | Shared OpenAI client used in chat |
| `backend/chat/views.py` | `ChatQueryStreamView` — Ask (RAG + stream), Agent (tools + stream, OpenAI-only for wiki agent today) |
| `backend/chat/agent_stream.py` | Tool rounds + streaming |
| `backend/chat/tools.py` | Tool schemas and `execute_tool` |

**Planning features must:**

- Use **`vector_store.openai`** (or the same abstraction chat uses) for completions.
- Respect **`chat_completion_model()`** and **`get_llm_backend()`** constraints (e.g. tool-heavy Plan agent parity with wiki agent may require `LLM_BACKEND=openai`, same as current wiki agent gate).
- Participate in existing **quota** patterns (`check_quota`, `token_consume`) where applicable.

### 5.3 Embeddings and RAG

- On meaningful plan updates, enqueue chunks into the **same embedding/Qdrant path** as wiki (`PageChunk`-style or unified chunk model with `source_type=plan`).
- Extend `_retrieve_wiki_citations` (or equivalent) so Ask mode retrieves **wiki + plan** snippets; citations must distinguish **plan** vs **wiki** so “next movement” answers are traceable.

### 5.4 Planning assist (replaces Gemini overlay backend)

Do **not** introduce a standalone Gemini service. Implement one or both:

1. **Chat-first:** New mode **`plan`** (§7) uses tool definitions that create/update plan entities, same architectural shape as wiki `agent_stream.py`.
2. **Focused HTTP API (optional):** e.g. `POST /api/planning/assist/draft` — server loads team + optional project context, calls **`llm.chat.completions.create`** with **`response_format` JSON** (OpenAI) or a constrained parse step, returns a **draft** for human review before commit. Still uses `chat_completion_model()` and existing keys—**no new provider**.

All assists are **server-side**, audited, and team-scoped.

---

## 6. Wiki integration

- **Links:** `wiki_page_id` or stable slug on tasks/milestones.
- **Spawn pages:** Briefs/decisions from plan actions (`WikiPage` + `page_type`, frontmatter `project_id`).
- **Wikilinks:** Optional markdown in descriptions with the same resolution as the wiki editor, or entity-level links only in v1.
- **Retrieval:** Plan chunks indexed so **one unified “team brain”** answers questions about **both** narrative wiki and **committed next steps**.

---

## 7. Agent usage integration

### 7.1 Today

- `ChatModeSelect`: `ask` | `agent` (wiki).
- Retrieval in Ask mode should be extended to **include plan context** so the model’s picture of “what the team is doing” is grounded in **plan truth**.

### 7.2 Plan mode (direction)

Extend to **`ask` | `plan` | `agent`** (naming TBD):

| Mode | Intent | Behavior |
|------|--------|----------|
| **Ask** | Understand | RAG: wiki + **plan chunks** + ingest; read-only. |
| **Plan** | Shape **next movement** | Tool calls persist tasks/milestones/links; same permission/entitlement gates as editing plans in `/plan`. |
| **Agent** | Narrative wiki | Existing wiki tools. |

**Gating:** `can_edit_plans`, `plan_agent_available`, `Team.plan` tier—mirror wiki agent patterns.

### 7.3 UX alignment

- **Planning assist overlay** in the UI and **Plan mode** in chat should share **one** persistence layer and similar **draft → confirm** semantics where destructive.
- Default chat mode to **Plan** when `pathname` is under `/plan`.

### 7.4 Safety

- Idempotent tools where possible; audit `created_by` / `updated_by`; optional proposal queue for large diffs.

---

## 8. Security and compliance

- **No client API keys.** Only env vars already used for OpenAI/Groq (as in chat).
- **Authorization:** `team_id` + role on every planner query and tool.
- **Export:** Same visibility rules as API read.
- **Audit:** Plan changes logged for “source of truth” accountability.

---

## 9. Entitlements and analytics

- Gate planner and plan-agent features with `Team.plan` and roles.
- Analytics: plan created, task completed, assist invoked (no PII in event payloads).

---

## 10. Phase-by-phase plan (synced with existing TeamOS)

This section classifies work by **system surface** so each phase lines up with how TeamOS is built today: **accounts/auth**, **wiki**, **chat** (capabilities + SSE + tools), **ingest/vectors**, **graph**, **billing/entitlements**, **frontend** (Next.js + `api` + `useWikiStore`), and **product analytics**.

### 10.0 Classification legend

| Tag | Meaning | Primary locations |
|-----|---------|-------------------|
| **ACC** | Team membership, roles, Clerk JWT | `backend/accounts/` (`Team`, `TeamMember`, `accounts/permissions.py`, `accounts/urls.py`) |
| **API** | REST envelope, auth header | `frontend/src/lib/api.ts`, `getApiAuthHeaders()` for SSE |
| **FE** | App shell, routes, UI tokens | `frontend/src/app/(app)/`, `Sidebar.tsx`, `globals.css`, `ThemeProvider` |
| **PLAN** | New planning domain | New `backend/planning/` (recommended single app: `Project`, `Task`, `Milestone`; optional later split per §5.1) |
| **CHAT** | Ask / agent streaming, caps | `backend/chat/views.py`, `agent_stream.py`, `tools.py`, `chat/urls.py` |
| **ING** | Chunks, embeddings, Qdrant | `backend/ingest/vectors.py`, `wiki/models.py` (`PageChunk` pattern), pipeline tasks |
| **WIKI** | Pages, links from plans | `backend/wiki/` |
| **GRAPH** | Knowledge graph | `backend/graph_engine/` |
| **ENT** | Plan tier quotas | `backend/teamos_project/entitlements.py`, `check_quota()` |
| **PA** | Product events | `backend/product_analytics/` |

**Team context (existing):** The frontend already scopes work with `useWikiStore` (`currentTeamId`). Planning APIs should follow the same convention as wiki/chat: **`/api/.../<team_id>/...`** or consistent query param—mirror **`/api/wiki/`** and **`/api/chat/<uuid:team_id>/`** patterns so middleware and `IsTeamMember` stay predictable.

**URL spine (to add):** `teamos_project/urls.py` today includes `auth`, `wiki`, `graph`, `chat`, `ingest`, `export`, `billing`, `analytics`. Planning should gain e.g. `path("api/planning/", include("planning.urls"))` (exact prefix is a naming choice; keep one canonical prefix).

---

### Phase A — Data plane and read API (no AI, no planner UI beyond read-only)

**Goal:** Durable, team-scoped **plan truth** in Postgres; read-only HTTP API; proves auth and isolation.

| Step | Tags | Work |
|------|------|------|
| A.1 | PLAN, ACC | Create Django app `planning` (or `projects` + `planning` if you insist on split). Models: `Project` (FK `Team`, title, description, status, audit timestamps, soft-delete optional), `Task`, `Milestone`, dependency M2M or edges table, `assignee` FK to `accounts.User` nullable. |
| A.2 | PLAN | Migrations, `admin.py` registration for ops. |
| A.3 | PLAN, ACC | DRF views: list/detail projects for a team using **`IsAuthenticated` + `IsTeamMember`** (same as `wiki/views.py`). Use existing response helpers (`ok`/`fail`) if wiki uses them consistently. |
| A.4 | PLAN | `planning/urls.py` + root `urls.py` include. |
| A.5 | PLAN | Unit tests: cross-team access denied; viewer can read. Defer mutation tests to Phase C unless you intentionally ship writes in A. |

**Exit criteria:** `GET /api/planning/...` returns team-scoped JSON; no frontend requirement yet.

**Sync note:** Aligns with **`Team`** and **`TeamMember.role`** (`owner` / `editor` / `viewer`) from `accounts`; do not invent a parallel RBAC.

---

### Phase B — Frontend shell and read-only planner UX

**Goal:** **Plan** appears in the same chrome as Wiki/Chat; users **see** roadmap data from Phase A.

| Step | Tags | Work |
|------|------|------|
| B.1 | FE | Add `NAV_ITEMS` entry in `frontend/src/components/sidebar/Sidebar.tsx` (e.g. `/plan`, icon + label). Active state uses existing `isActive` / `navCls` patterns. |
| B.2 | FE, API | `frontend/src/app/(app)/plan/page.tsx` (+ optional `plan/[projectId]/page.tsx`). Layout: full width inside `(app)/layout.tsx` (Sidebar + `main` already present). |
| B.3 | FE, API | `frontend/src/lib/planApi.ts` (or `features/plan/api.ts`): `api.get`/`post`/`patch`/`delete` against planning routes; **always pass current team** from `useWikiStore` (same as wiki pages expect team context). |
| B.4 | FE | Port **read-only** slices of `gemini_plan` components into `frontend/src/components/planner/`: dashboard list, project detail shell. Replace prototype tokens with **`var(--*)`** from §4.2; remove duplicate sidebar/theme. |
| B.5 | FE | Optional: register `/plan` in `CommandPalette` if it exists for navigation parity. |

**Exit criteria:** Authenticated user selects team in sidebar → opens **Plan** → sees projects for that team only.

---

### Phase C — Mutations, permissions, and full CRUD UI

**Goal:** Editors/owners can maintain **canonical next-movement** data; viewers stay read-only—**same role semantics as wiki**.

| Step | Tags | Work |
|------|------|------|
| C.1 | PLAN, ACC | Add `CanEditPlans` (or reuse pattern from `CanEditWiki` in `accounts/permissions.py`): minimum role **editor** for POST/PATCH/DELETE on plan entities. |
| C.2 | PLAN | Implement create/update/delete for projects, tasks, milestones; validate dates, dependency cycles (server-side). |
| C.3 | FE | Wire modals/forms from prototype (`ManualProjectModal`, `AddTaskModal`, `AddMilestoneModal`) to planning API; optimistic UI optional. |
| C.4 | ENT | If plans should consume quota: extend **`PLAN_LIMITS`** / `check_quota()` in `entitlements.py` (e.g. `plan_project_create` or reuse an existing bucket after product decision). If not v1, document “unlimited for all paid tiers” and add limits later. |
| C.5 | PA | Emit analytics events (e.g. plan created, task status changed) via existing `product_analytics` patterns. |

**Exit criteria:** Role matrix matches wiki: **viewer** read-only, **editor/owner** full plan CRUD.

---

### Phase D — Knowledge layer: plan chunks + Ask mode retrieval

**Goal:** Plans become **first-class RAG context**; Ask answers cite **wiki + plan** provenance—**synced with `chat/views.py` retrieval path** and **ingest/Qdrant**.

| Step | Tags | Work |
|------|------|------|
| D.1 | PLAN, ING | On task/milestone/project meaningful updates, create or refresh **plan chunks** (new model e.g. `PlanChunk` mirroring `PageChunk`: text, hash, `qdrant_point_id`, FK to task/milestone/project). |
| D.2 | ING | Reuse embedding model from `embedding_model_name()` and vector upsert logic used for wiki (same client, team id in payload metadata for filtering). |
| D.3 | CHAT | Extend retrieval helper(s) in `chat/views.py` (currently wiki-oriented around `_retrieve_wiki_citations`) to **also query plan points** for the same `team_id`, merge into `context_str`, and tag citations with **`source: "wiki" \| "plan"`** (and subtype: task vs milestone). |
| D.4 | CHAT | Update Ask system prompt snippet if needed so the model uses plan citations for **“what’s next / who / when”** questions. |
| D.5 | CHAT | Tests: fixture plan chunks → Ask retrieval includes plan lines in context; no cross-team leakage. |

**Exit criteria:** Chat **Ask** mode grounded in **plan truth** where indexed; citations distinguish wiki vs plan.

**Sync note:** Uses **`llm_config`** / **`vector_store`** only—no new vendor.

---

### Phase E — Plan mode (tools) and optional planning-assist HTTP

**Goal:** Conversational **mutation** of plans via **same tool-calling architecture** as wiki agent (`agent_stream.py` + `tools.py`); gated like agent mode.

| Step | Tags | Work |
|------|------|------|
| E.1 | CHAT | Extend `ChatCapabilitiesView` (`GET /api/chat/<team_id>/capabilities/`) with `can_edit_plans`, `plan_mode_available` (e.g. requires `LLM_BACKEND=openai` for tools, mirroring `agent_mode_available`). |
| E.2 | FE | Extend `ChatModeSelect` + `ChatInterface.tsx`: add **`plan`** to `ChatMode`; disable when capabilities forbid; default to `plan` when `usePathname()` is under `/plan` (localStorage override optional). |
| E.3 | CHAT | Add OpenAI tool schemas in `chat/tools.py`: e.g. `plan_upsert_task`, `plan_set_milestone`, `plan_link_wiki_page`—each calls planning services with **`ToolContext` team/user**. |
| E.4 | CHAT | Implement `iter_plan_sse_events` or branch in `ChatQueryStreamView` for `mode == "plan"` reusing **`iter_agent_sse_events`** patterns (rounds + streaming). Enforce **`check_quota(..., "token_consume")`** like existing query path. |
| E.5 | CHAT | Optional **`POST /api/planning/assist/draft`** for the UI overlay: server builds JSON draft via `chat_completion_model()` + structured output; returns draft only—**persist only after user confirm** or reuse Plan mode tools. |
| E.6 | ING | After tool mutations, trigger chunk refresh (same as Phase D) so RAG stays aligned. |

**Exit criteria:** Editor can change plan via chat **Plan** mode; viewer cannot; Groq-only deployments show clear **503/unavailable** for plan tools if you mirror wiki agent rules.

---

### Phase F — Calendar surface, wiki linking, graph (optional hardening)

**Goal:** Time-based views and **explicit** wiki integration; optional **graph_engine** visibility.

| Step | Tags | Work |
|------|------|------|
| F.1 | PLAN, FE | Aggregated **`GET`** feed: tasks + milestones in range (implement inside `planning` first; promote to `calendar` app only if sync/export demands it). Wire `CalendarView.tsx`. |
| F.2 | WIKI, PLAN | Nullable `wiki_page_id` on tasks/milestones; wiki picker in UI using existing wiki list/search endpoints. |
| F.3 | WIKI | “Spawn brief/decision page” flows create `WikiPage` with `page_type` + frontmatter `project_id` (server action or tool). |
| F.4 | GRAPH | Optional: nodes/edges for Project → Task → WikiPage in `graph_engine` (follow existing analytics/node patterns). |
| F.5 | ENT, PA | Tune limits and events for calendar export / plan linking if product requires. |

**Exit criteria:** Calendar reflects DB dates; at least one wiki link path is production-safe and permission-checked.

---

### 10.1 Phase dependency graph

```text
Phase A (data + read API)
    → Phase B (FE read-only)
        → Phase C (CRUD + authz)
            → Phase D (embed + Ask RAG)     ← can start chunk schema design in parallel late in C
                → Phase E (Plan mode tools)
                    → Phase F (calendar + wiki + graph polish)
```

**Practical overlap:** D.1–D.2 (chunk pipeline) can start once C.2 stabilizes model fields; E depends on D only if you want tools to trigger re-embedding immediately (hooks can be stubbed first).

---

### 10.2 Quick matrix: phase × existing module

| Module / file | A | B | C | D | E | F |
|---------------|---|---|---|---|---|---|
| `teamos_project/urls.py` | ✓ | | | | | |
| `accounts/permissions.py` | ✓ | | ✓ | | | |
| `entitlements.py` | | | ✓ | | | ✓ |
| `chat/views.py` | | | | ✓ | ✓ | |
| `chat/tools.py` | | | | | ✓ | ✓ |
| `chat/agent_stream.py` (or sibling) | | | | | ✓ | |
| `ingest/vectors.py` / pipeline | | | | ✓ | ✓ | |
| `wiki/*` | | | | | | ✓ |
| `graph_engine/*` | | | | | | ○ |
| `Sidebar.tsx` | | ✓ | | | | |
| `api.ts` / plan client | | ✓ | ✓ | | | |

✓ = primary work; ○ = optional; blank = little or no change.

---

## 11. Checklist before merge

- [ ] **No** `@google/genai` / Gemini in frontend or new backend modules.
- [ ] Plan assist / Plan mode uses **`llm_config` + `vector_store`** (same as chat).
- [ ] Ask mode retrieval includes **plan** context where indexed.
- [ ] Plans treated as **canonical** for committed next steps; docs describe linkage to wiki/ingest.
- [ ] Team-scoped authz tests; quota/rate limits on assist endpoints.
- [ ] Light/dark (`data-theme`) verified on `/plan`.

---

## 12. Reference paths

| Area | Path |
|------|------|
| UI reference prototype | `gemini_plan/` (UX only; **not** AI) |
| App shell | `frontend/src/app/(app)/layout.tsx` |
| Sidebar | `frontend/src/components/sidebar/Sidebar.tsx` |
| Theme | `frontend/src/components/ui/ThemeProvider.tsx`, `frontend/src/app/globals.css` |
| LLM config | `backend/teamos_project/llm_config.py` |
| Chat stream + Ask | `backend/chat/views.py` (`ChatQueryStreamView`) |
| Wiki agent tools | `backend/chat/agent_stream.py`, `backend/chat/tools.py` |
| Wiki models | `backend/wiki/models.py` |
| Prior planning spec | `PROJECT_PLANNING_PREPARATION.md` |
| Django settings | `backend/teamos_project/settings/base.py` |

Naming choices (`/plan` vs `/planning`, optional `calendar` app in v1) remain product decisions; this document is binding on **using existing TeamOS LLM and APIs** and on **plans as a single source of knowledge for the team’s next movement**.
