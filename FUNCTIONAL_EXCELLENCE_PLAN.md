# TeamOS — Functional Excellence Plan

> **Purpose:** Define what “great” means for **behavior, correctness, and reliability** in each product area. This complements:
> - **`TEAMOS_PLAN.md`** — product scope, stack, pipelines, and build phases  
> - **`UI_REDESIGN_PLAN.md`** — visual polish, layout, and component structure  

This document is **not** a pixel plan; it is the **functional contract** (user-visible outcomes, API semantics, failure modes, and quality gates) so implementation stays aligned with the other plans.

---

## How to Use This Doc

1. **Per module:** implement features in the order **Correctness → Completeness → Delight** (empty states and speed come after wrong data is ruled out).  
2. **Each subsection** ends with **Definition of done** — treat as acceptance criteria.  
3. **Cross-cutting** items apply to every module; do not ship a module “done” if cross-cutting blockers remain for that surface.

---

## Cross-Cutting — Must Hold Everywhere

| Area | Target behavior | Definition of done |
|------|-----------------|------------------|
| **Tenancy** | Every read/write is scoped by `team_id`; no IDOR between teams | Automated tests for “user A cannot access team B’s resources”; ingest/export/chat/wiki/graph all enforce membership |
| **Auth session** | JWT in httpOnly cookies; HTTPS in production; CSRF strategy consistent with cookie auth | Documented pattern (e.g. CSRF for cookie sessions + double-submit or SameSite strict where appropriate); `secure` flag on cookies in prod |
| **Settings** | Single clear entrypoint (`development` / `production`); no accidental `DEBUG` or leaked `SECRET_KEY` | Remove or gate legacy `settings.py`; ASGI/WSGI/management all document `DJANGO_SETTINGS_MODULE` |
| **Errors** | Structured API errors (`code`, `message`, `field`); frontend maps to toasts + retry where safe | No silent `console.error`-only failures on critical paths |
| **Idempotency** | Ingest/export jobs safe to retry; dedup by content hash where promised | Re-running a job does not duplicate vectors or corrupt graph |
| **Observability** | Request/job correlation; Celery task logging; actionable logs in production | Central `LOGGING` config; key stages of ingest/chat emit log lines with `job_id` / `team_id` |
| **`PLAN_TIERS`** | Free/team/pro limits actually enforced (chunking, retrieval, models, rate limits) | Integration tests: same query behaves per tier; over-limit returns clear 402/403 with upgrade hint |

---

## 1 — Ingestion (Sources → Chunks → Vectors)

**Aligned with:** `TEAMOS_PLAN.md` — Ingestion Pipeline, Celery steps, tiered chunking.

### Functional goals

| Capability | Great looks like |
|------------|------------------|
| **Sources** | URL, PDF, DOCX, pasted/imported `.md` all produce consistent internal representation before chunking |
| **Pipeline** | Parse → chunk (tier) → dedup → embed → store in team collection → optional auto-tag → graph hints; each stage is recoverable |
| **Progress** | User sees honest progress (stage + percent or step list); failures show **which step** failed and whether retry is safe |
| **Linking to wiki** | Ingest from editor or “new from source” creates/updates a `WikiPage` and ties chunks to that page |

### Gaps to close (typical MVP → great)

- Implement missing **`ingest.pipeline`** (or equivalent) so `run_ingest_job` is not a dead import — single module that orchestrates steps from `TEAMOS_PLAN.md`.
- **Authorization:** every ingest endpoint checks team membership (no “MVP omitted” bypass in production).
- **Dedup:** SHA-256 per chunk; re-ingest updates or skips deterministically.

### Definition of done

- [ ] Celery task runs end-to-end for URL + one file type (PDF or DOCX) + raw markdown.  
- [ ] Failed job stores error message + failed step; UI can display it.  
- [ ] Qdrant namespace / collection naming matches `team_{id}` (or documented alternative) and is never cross-tenant.  
- [ ] Tier from `PLAN_TIERS` drives chunk size, embed model, and retrieval limits in code paths that consume this job’s output.

---

## 2 — Interlinked Wiki (TipTap, Workspace, Wikilinks)

**Aligned with:** `TEAMOS_PLAN.md` — Markdown Workspace; `UI_REDESIGN_PLAN.md` — wiki polish (autosave UX).

### Functional goals

| Capability | Great looks like |
|------------|------------------|
| **CRUD** | Create/open/save/list with correct slugs, titles, and optimistic concurrency (optional `updated_at` or version) |
| **Wikilinks** | `[[Title]]` resolves to existing pages; autocomplete is team-scoped; broken links are detectable (optional lint or panel) |
| **Backlinks** | Panel reflects graph of incoming links; updates within debounce save |
| **Templates / frontmatter** | Template create applies default frontmatter; panel edits persist and round-trip |
| **Viewer role** | Editor is read-only; save and ingest shortcuts disabled server-side too |
| **⌘K picker** | Fuzzy search across title/tags/summary; keyboard nav; “create new” when no match |

### Gaps to close

- **Slug regeneration:** when title changes, slug rules must be correct (avoid compare-after-assign bugs).  
- **Autosave:** debounced saves must handle offline/failure (retry, dirty state) — pair UI plan with functional states: `idle` / `saving` / `saved` / `error`.

### Definition of done

- [ ] Viewer cannot mutate via API (403).  
- [ ] Wikilink create/update triggers backlink consistency (or scheduled repair job documented).  
- [ ] Open picker returns results <300ms perceived (paged or debounced) for teams with hundreds of pages.  
- [ ] Single-page export matches editor content (see Export module).

---

## 3 — Knowledge Graph (Edges, Signals, Cytoscape)

**Aligned with:** `TEAMOS_PLAN.md` — Knowledge Graph (signals, algorithms, UI behaviors).

### Functional goals

| Capability | Great looks like |
|------------|------------------|
| **Edge types** | `wikilink`, `ai_inferred`, `manual` with confidence where applicable; no duplicate contradictory edges without resolution rules |
| **Updates** | On page save: surgical diff (not full rebuild) via Celery; graph API returns consistent snapshot |
| **Algorithms** | PageRank / Louvain / orphans run async, cached (~1h), and degrade gracefully if Redis empty |
| **UI contract** | Node click/double-click behaviors match plan; manual edge create persists and appears for other users |

### Definition of done

- [ ] Creating a wikilink creates or updates a `wikilink` edge with confidence 1.0.  
- [ ] AI-inferred edges are capped by tier (rate/cost) and labeled in API.  
- [ ] Graph load is paginated or scoped (e.g. ego network) for large wikis — document limits.  
- [ ] Deleting a page removes or archives edges deterministically.

---

## 4 — Team Chat (Citational RAG + History)

**Aligned with:** `TEAMOS_PLAN.md` — Chat RAG Pipeline, citations JSON, session history.

### Functional goals

| Capability | Great looks like |
|------------|------------------|
| **Retrieval** | Hybrid BM25 + dense + RRF; **always** filtered by `team_id`; `retrieve_k` / rerank from tier |
| **Streaming** | SSE (or Channels) delivers token stream + citation events + terminal `done` / error event |
| **Citations** | Chip navigates to `/wiki/{slug}#{section}`; snippet and confidence shown; missing page handled |
| **History** | Sessions list; messages ordered; long sessions compress per plan (rolling summary after N turns) |
| **Safety** | Empty retrieval yields honest “no sources” answer, not hallucinated citations |

### Definition of done

- [ ] Every assistant message stores citation metadata server-side for replay.  
- [ ] Rate limits per `PLAN_TIERS` enforced (monthly chat cap on free tier per revenue table).  
- [ ] Stream interruption (client disconnect) does not corrupt session state.  
- [ ] Automated test: citation payload references only pages in the same team.

---

## 5 — Team Management (Auth, Roles, Invites, Presence)

**Aligned with:** `TEAMOS_PLAN.md` — Team Management; Phase 5 auth notes.

### Functional goals

| Capability | Great looks like |
|------------|------------------|
| **Auth** | Email + password + Google OAuth; JWT in httpOnly cookies; refresh rotation documented |
| **Roles** | Owner / Editor / Viewer enforced in **views**, not only UI |
| **Invites** | Token link, expiry (7d), single-use or idempotent accept; email edge cases handled |
| **Presence** | Channels room per team/page; avatars match active sessions; disconnect cleanup |
| **Dev ergonomics** | `seed_dev_user` clearly guarded (settings flag only) and never runnable in production config |

### Definition of done

- [ ] Permission matrix documented and tested (matrix test or table-driven API tests).  
- [ ] Cookie flags: `Secure` in production; `SameSite` aligned with CSRF approach.  
- [ ] Middleware / frontend gate: unauthenticated users cannot hit `(app)` routes; stale cookie shows clean re-auth.  
- [ ] Presence does not leak other teams’ page activity.

---

## 6 — Export (MD, ZIP, Full Wiki + `_graph.json`)

**Aligned with:** `TEAMOS_PLAN.md` — Export table.

### Functional goals

| Capability | Great looks like |
|------------|------------------|
| **Single page** | Download `.md` with frontmatter and wikilinks preserved |
| **Multi select** | ZIP of `.md` files; sane filenames; size limits per tier |
| **Full wiki** | ZIP includes `_graph.json` matching API graph model; large wikis stream or async job with download link |
| **Authz** | Export respects role (e.g. viewer can export read content); team boundary enforced |

### Definition of done

- [ ] Export job mirrors wiki + graph at a single consistent timestamp (or documented snapshot rules).  
- [ ] Partial failure (one page fails) reports which page failed.  
- [ ] Generated `_graph.json` validates against a small JSON schema checked in repo.

---

## Frontend — Functional Layer (Alongside UI Redesign)

**Aligned with:** `UI_REDESIGN_PLAN.md` for visuals; this table is **behavior**.

| Surface | Functional bar |
|---------|----------------|
| **`lib/api.ts`** | Typed request/response; centralized 401/403 handling; no `any` on public API shapes |
| **Stores (Zustand)** | Single source of truth per domain; no duplicated server state that can drift |
| **Chat / graph / ingest** | Loading, error, empty, and success states; user can recover without refresh |
| **Middleware** | Prefer validating session with backend or handling short-lived access token refresh pattern — document choice |

### Definition of done

- [ ] No critical user action relies only on `console.error`.  
- [ ] Toasts used for mutation feedback (success/error) per `UI_REDESIGN_PLAN.md` toast system.  
- [ ] Feature flags or env drive API base URL for prod/staging.

---

## Backend — Structure & Consistency

| Concern | Target |
|---------|--------|
| **Duplicated auth checks** | Centralize membership + role helpers (permissions module or service layer) used by wiki, chat, graph, ingest, export |
| **Serializers** | Validate `team_id` on input; never trust client for tenant |
| **Tasks** | All Celery tasks accept explicit ids; no implicit “current user” |
| **WebSockets** | Auth on connect; group names include team id |

### Definition of done

- [ ] One module documents permission helpers; views import them.  
- [ ] OpenAPI or schema-adjacent doc for main resources (optional but ideal for frontend types).

---

## Testing & CI — Functional Safety Net

| Layer | Minimum |
|-------|---------|
| **API** | pytest + DRF APIClient: auth, tenant isolation, role matrix per module |
| **Pipelines** | Mock external LLM/embeddings in CI; test pipeline orchestration and failure steps |
| **Frontend** | Smoke tests for auth redirect + one critical flow (e.g. wiki save) when test stack is adopted |

### Definition of done

- [ ] CI runs lint + backend tests on PR.  
- [ ] At least one test per module proving **403/404** for cross-tenant access.  
- [ ] Ingest pipeline test does not require live Qdrant (use fake or test container).

---

## Phased Rollout (Mapped to `TEAMOS_PLAN.md` Build Phases)

| TEAMOS phase | Functional excellence focus |
|--------------|----------------------------|
| **Phase 1 — Foundation** | Tenancy + role enforcement on wiki; single settings story; cookie/CSRF documented; first API tests |
| **Phase 2 — Ingest + Graph** | Full ingest pipeline module; progress events; graph edge correctness + membership on graph APIs |
| **Phase 3 — Chat** | Tiered RAG; citations integrity; session history; rate limits |
| **Phase 4 — Export + Presence** | Snapshot exports; presence privacy; graph algorithms behind cache |
| **Phase 5 — Auth polish** | OAuth hardening; dev seed gated; middleware/session edge cases |

---

## Summary — “Great” in One Sentence

**TeamOS is functionally great when every module respects team boundaries and plan tiers, pipelines are observable and recoverable, and the UI never hides failures that affect user data.**

---

*Last aligned with: `TEAMOS_PLAN.md`, `UI_REDESIGN_PLAN.md` (same repository). Update this doc when those plans change scope or phase order.*
