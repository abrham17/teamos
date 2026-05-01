# TeamOS Unimplemented Items (Feature Completeness to 8+/10)

This document captures the key gaps preventing TeamOS from reaching 8+/10 feature completeness, and provides a modular implementation plan.

## How this document is structured

- Each gap includes:
  - Why it matters
  - Current symptom
  - Target outcome
  - Modular implementation plan (frontend, backend, data, observability)
  - Acceptance criteria
- Priority labels:
  - `P0`: required for dependable day-to-day usage
  - `P1`: required for product credibility and fast iteration
  - `P2`: quality multipliers after core closure

---

## P0-1: Core workflows are partial (not fully closed loops)

### Why this matters

Feature completeness is not "endpoint exists", it is "a user can complete a real task end-to-end without workarounds."  
Partial loops create drop-off and increase support burden.

### Current symptoms

- Invite + accept flow is not consistently closed from sender UX to receiver UX to membership confirmation.
- Some settings actions are placeholders or lack safe completion flow.
- Some existing features are disconnected from routine user journeys.

### Target outcome

All critical collaboration/admin loops are fully shippable:

- Send invite -> recipient accepts -> user joins team -> role reflected in UI.
- Sensitive settings actions have safe guardrails and complete backend execution.
- Existing features are discoverable and integrated in primary workflows.

### Modular implementation plan

#### Module A: Collaboration Loop (Invites and Membership)

- **Backend (`accounts`)**
  - Create explicit invite lifecycle states (`pending`, `accepted`, `expired`, `revoked`).
  - Add idempotent accept endpoint.
  - Enforce team + role checks in one service function.
  - Emit audit event on invite send/accept/revoke.
- **Frontend (`app/(app)` + auth entry)**
  - Add invite acceptance route with token handling.
  - Add sender-side invite status table (pending/accepted/expired).
  - Add clear success and failure states.
- **Data**
  - Migration for invite state + timestamps.
- **Observability**
  - Event names:
    - `invite_sent`
    - `invite_accept_started`
    - `invite_accepted`
    - `invite_accept_failed`

#### Module A implementation status (May 1, 2026)

- **Done**
  - Added invite lifecycle status surface via serializer (`lifecycle_status`) for consistent UI state rendering.
  - Implemented idempotent invite acceptance logic in backend:
    - Repeated accept by same user now returns success with `invite_status=already_accepted`.
    - Added stronger revoked/expired/token/email checks in one transactional flow.
  - Added `/accept-invite` frontend page to close receiver-side UX loop.
  - Added backend tests for idempotent accept and email mismatch protection.
  - Added named account URL routes to support stable reverse lookup in tests.
- **File-level implementation map**
  - Backend model/serializer/view/urls:
    - `backend/accounts/models.py`
    - `backend/accounts/serializers.py`
    - `backend/accounts/views.py`
    - `backend/accounts/urls.py`
  - Backend tests:
    - `backend/accounts/tests.py`
  - Frontend invite acceptance page:
    - `frontend/src/app/accept-invite/page.tsx`
  - Settings invite state display improvements:
    - `frontend/src/app/(app)/settings/page.tsx`
- **Remaining in Module A**
  - Add explicit persisted invite lifecycle enum field in DB (currently computed state is used).
  - Add dedicated invite preview endpoint (optional) for richer accept screen before submit.
  - Emit analytics events for `invite_accept_started` and `invite_accept_failed` from frontend/backend telemetry pipeline.

#### Module B: Settings Completion (Destructive/Sensitive Actions)

- **Backend (`accounts`/`teams`)**
  - Implement team deletion with soft-delete first, optional hard-delete worker.
  - Add preflight checks (owner confirmation, dependency count).
  - Add rollback window where applicable.
- **Frontend (`settings`)**
  - Replace placeholders with full confirmation flows:
    - typed confirmation phrase
    - irreversible warning
    - post-action redirect and status
  - Show operation progress and final result.
- **Observability**
  - Track action start/success/failure metrics with reason codes.

#### Module B implementation status (May 1, 2026)

- **Done**
  - Added owner-only member removal enforcement in backend team member delete flow.
  - Added owner-driven member role management for non-owners:
    - viewer -> editor
    - editor -> viewer
  - Added owner self-role safety lock:
    - backend blocks owner self role changes via member role endpoint
    - backend blocks assigning `owner` role via member role endpoint (must use ownership transfer endpoint)
    - settings UI hides role-change/remove controls for the current owner row
  - Added typed email confirmation modal for sensitive actions in settings:
    - owner must type current account email before remove/transfer/delete actions can proceed
  - Added backend email confirmation enforcement for sensitive membership actions:
    - member removal requires matching `confirmation_email`
    - ownership transfer requires matching `confirmation_email`
  - Added ownership transfer endpoint with owner-only access and transactional role swap:
    - current owner -> editor
    - selected member -> owner
  - Added settings UI controls for owners:
    - `Make editor` / `Make viewer` actions for non-owner members
    - `Make owner` action on non-owner members
    - `Remove` action on non-owner members
  - Added backend tests for:
    - owner-only removal permissions
    - owner removal guard requiring transfer first
    - successful ownership transfer role swap
    - viewer->editor promotion by owner
    - editor->viewer demotion by owner
    - owner cannot change own role via member role endpoint
    - member role endpoint cannot assign owner role directly
    - remove requires matching confirmation email
    - ownership transfer requires matching confirmation email
- **File-level implementation map**
  - Backend:
    - `backend/accounts/views.py`
    - `backend/accounts/urls.py`
    - `backend/accounts/models.py`
    - `backend/accounts/tests.py`
  - Frontend:
    - `frontend/src/app/(app)/settings/page.tsx`
- **Remaining in Module B**
  - Add explicit ownership transfer audit event viewer in settings activity section.

#### Module C: Workflow Integration Layer

- **Frontend composition**
  - Surface key actions contextually:
    - Invite CTA from team members panel
    - Citation navigation from chat to wiki anchor
    - Export availability where users finish writing/discussing
- **Backend contracts**
  - Standardize response envelopes for integration points.
- **Product UX**
  - Add contextual empty states with one-click "next action."

#### Module C implementation status (May 1, 2026)

- **Done (initial slice)**
  - Added contextual empty-state CTA in invites list (`Invite first teammate`) that focuses invite composer.
  - Added workflow shortcuts section in settings for common follow-up actions:
    - invite teammate
    - open wiki
    - open chat
    - export wiki
  - Kept export action accessible in both data section and shortcuts for task-continuation flow.
  - Added chat-to-wiki citation deep-link payload flow:
    - citations now carry `chunk_id` and `anchor_hint` when available
    - chat citation click now navigates with query params (`page`, `chunk`, `anchor_hint`, `snippet`, `source=chat`)
    - wiki workspace shows citation context panel and supports "Find snippet" helper for near-exact navigation
  - Introduced standardized API response envelope helper:
    - backend helper `ok(...)` / `fail(...)` with `success`, `data`, `error`, `meta` structure
    - migrated first cross-module endpoint batch (accounts + chat + wiki selected endpoints)
  - Completed second envelope migration batch for core platform modules:
    - graph endpoints now return envelope-wrapped success/error payloads
    - ingest endpoints now return envelope-wrapped success/error payloads
    - export endpoints now return envelope errors for permission/not-found paths (binary success responses unchanged)
  - Updated frontend API client to auto-unwrap envelope responses and normalize envelope/non-envelope error extraction.
- **File-level implementation map**
  - `frontend/src/app/(app)/settings/page.tsx`
  - `frontend/src/components/chat/ChatInterface.tsx`
  - `frontend/src/components/wiki-v2/MarkdownWorkspace.tsx`
  - `backend/chat/views.py`
  - `backend/accounts/views.py`
  - `backend/wiki/views.py`
  - `backend/graph_engine/views.py`
  - `backend/ingest/views.py`
  - `backend/export_app/views.py`
  - `backend/teamos_project/api_response.py`
  - `frontend/src/lib/api.ts`
- **Remaining in Module C**
  - Complete envelope migration for any remaining non-core endpoints to remove mixed response formats.
  - Add telemetry for shortcut usage and empty-state CTA conversion.
  - Upgrade snippet-based jump to deterministic anchor scroll once editor heading anchors are exposed.

#### Module C documentation deliverable (May 1, 2026)

- Added comprehensive API contract documentation:
  - `API_CONTRACT.md`
- Covers:
  - global envelope format (`success/data/error/meta`)
  - endpoint contracts by module (`auth`, `wiki`, `graph`, `chat`, `ingest`, `export`)
  - SSE contract for chat streaming events
  - binary response exceptions for export flows
  - end-to-end process flow maps across major product journeys

### Acceptance criteria

- A brand-new invited user can join a team without manual intervention.
- Owner can execute critical settings actions safely through UI.
- Core actions are reachable in <= 2 clicks from relevant context screens.
- Invite and settings loops have basic event telemetry and error visibility.

---

## P0-2: Promise-vs-reality drift in docs/specs

### Why this matters

If docs claim capabilities the product does not deliver, users perceive "broken product" even when code is functioning as built.

### Current symptoms

- Some docs/specs describe richer behavior than current implementation.
- No single source of truth connecting "planned", "implemented", and "in-progress."

### Target outcome

Docs and product behavior stay synchronized with minimal manual overhead.

### Modular implementation plan

#### Module D: Capability Registry (Single Source of Truth)

- Add `docs/capabilities/*.md` or `docs/capability-matrix.md` with:
  - capability name
  - status: `planned | partial | implemented`
  - owner module
  - release notes link
  - verification test link
- Every user-visible claim in product docs must map to one capability row.

#### Module D implementation status (May 1, 2026)

- **Done**
  - Added centralized capability registry file with concrete status taxonomy:
    - `implemented | partial | planned`
  - Added capability rows across all major modules:
    - accounts/team/invites/wiki/graph/chat/ingest/export/platform/docs/monetization
  - Added required traceability columns:
    - primary evidence path
    - release notes pointer
    - verification link
  - Added governance rules for when/how statuses may be updated.
- **File-level implementation map**
  - `docs/capability-matrix.md`
- **Remaining in Module D**
  - Replace `TBD` release note placeholders with actual changelog/PR references.
  - Add CI/doc lint check to enforce status validity and non-empty evidence for `implemented` rows.
  - Add per-capability owner field once team ownership model is finalized.

#### Module E: Docs Contracts and Labels

- Add status badges to module docs:
  - `Implemented`
  - `Partial`
  - `Planned`
- Include explicit "Current behavior" and "Target behavior" sections in each module spec.

#### Module E implementation status (May 1, 2026)

- **Done**
  - Added module-level status labels to core product docs.
  - Added explicit `Current behavior` and `Target behavior` sections to:
    - `ingestion_module.md`
    - `wiki_system.md`
    - `knowledge_graph.md`
    - `chat_system.md`
    - `management_system.md`
    - `export_system.md`
  - Linked each module doc to capability IDs in `docs/capability-matrix.md`.
- **File-level implementation map**
  - `ingestion_module.md`
  - `wiki_system.md`
  - `knowledge_graph.md`
  - `chat_system.md`
  - `management_system.md`
  - `export_system.md`
  - `docs/capability-matrix.md`
- **Remaining in Module E**
  - Add automated doc check to enforce presence of Status + Current behavior + Target behavior sections.
  - Ensure future feature docs follow the same contract template.

#### Module F: Release Sync Check

- Add PR checklist item:
  - "If behavior changed, capability matrix updated."
- Add lightweight CI/docs check script:
  - fail if module doc claims `Implemented` but capability row not marked implemented.

#### Module F implementation status (May 1, 2026)

- **Done (local + CI checks)**
  - Added lightweight docs contract validation script:
    - `scripts/validate_docs_contracts.py`
  - Script validates:
    - required module doc sections (`Status`, `Current behavior`, `Target behavior`)
    - presence of `Capability refs` line in each module doc
    - capability IDs in module docs exist in `docs/capability-matrix.md`
  - Added run instructions to `README.md`.
  - Wired docs contract validation into GitHub Actions CI:
    - `.github/workflows/docs-contract.yml`
    - runs on pull requests and pushes to `main`/`master`
- **File-level implementation map**
  - `scripts/validate_docs_contracts.py`
  - `README.md`
  - `.github/workflows/docs-contract.yml`
- **Remaining in Module F**
  - No remaining mandatory items in this module.

### Acceptance criteria

- Every public-facing feature claim maps to one capability status row.
- No module doc may claim "implemented" without linked endpoint/UI evidence.
- Release notes include only capabilities marked `implemented`.

---

## P0-3: Quality gates are too thin for dependable features

### Why this matters

A feature without tests and CI is not operationally complete.  
Without guardrails, regressions silently reduce trust.

### Current symptoms

- Sparse backend test depth.
- Limited/no frontend integration tests.
- CI quality gates absent or minimal.
- Reliability behavior (retries, failure handling) uneven.

### Target outcome

Every critical user journey has automated coverage and merge-time protection.

### Modular implementation plan

#### Module G: Critical Path Test Suite

- **Backend tests**
  - Invite lifecycle (send/accept/revoke/expired).
  - Wiki create/edit/autosave permissions.
  - Chat citation response format and access controls.
  - Ingestion pipeline happy path + failure path.
  - Export authorization checks.
- **Frontend tests**
  - Core route smoke tests.
  - Invite acceptance flow.
  - Settings destructive action confirmation.
  - Chat-to-citation navigation behavior.

#### Module G implementation status (May 1, 2026)

- **Done (initial backend batch)**
  - Added wiki API tests for:
    - editor create page
    - viewer cannot create page
    - member page detail read
    - non-member access denial
  - Added chat API tests for:
    - create/list session flow
    - query validation (`message_required`)
    - cross-user session access denial
    - SSE citation payload structure persistence (`page_slug`, `chunk_id`, `anchor_hint`)
  - Added export API tests for:
    - member single-page export success
    - outsider export denial (`forbidden`)
  - Added ingest API tests for:
    - URL ingest success and `url_required` validation
    - file ingest success and `file_required` validation
    - viewer ingest permission denial
    - ingest jobs list visibility for team members
  - Added frontend citation deep-link builder extraction and unit test:
    - utility: `frontend/src/lib/chatCitationLink.ts`
    - test: `frontend/src/lib/chatCitationLink.test.ts`
    - chat UI now uses shared builder utility
    - local test execution pending package install in environments with npm registry access
  - Added frontend settings confirmation-gate utility and unit tests:
    - utility: `frontend/src/lib/settingsConfirm.ts`
    - test: `frontend/src/lib/settingsConfirm.test.ts`
    - settings page now uses shared utility for email normalization, match checks, action messaging, and confirm-button gating
- **File-level implementation map**
  - `backend/wiki/tests.py`
  - `backend/chat/tests.py`
  - `backend/export_app/tests.py`
  - `backend/ingest/tests.py`
  - `frontend/src/lib/chatCitationLink.ts`
  - `frontend/src/lib/chatCitationLink.test.ts`
  - `frontend/src/components/chat/ChatInterface.tsx`
  - `frontend/src/lib/settingsConfirm.ts`
  - `frontend/src/lib/settingsConfirm.test.ts`
  - `frontend/src/app/(app)/settings/page.tsx`
- **Remaining in Module G**
  - Expand from utility tests to full component interaction tests once frontend test runner install is available in this environment.

#### Module H: CI Pipeline

- Add GitHub Actions (or equivalent) with:
  - backend lint + unit tests
  - frontend lint + typecheck + tests
  - migration check
  - changed-files selective test optimization
- Set required status checks for protected branches.

#### Module H implementation status (May 1, 2026)

- **Done (initial CI slice)**
  - Added consolidated CI workflow:
    - `.github/workflows/ci.yml`
  - CI now runs on pull requests and pushes to `main`/`master`.
  - Implemented jobs:
    - backend dependency install + migration check + backend tests
    - frontend dependency install + frontend lint + frontend typecheck + frontend tests
    - docs contract validation
  - Consolidated docs-contract into the unified CI workflow.
  - Added changed-files selective execution using path filters:
    - backend job runs only when backend paths change (or on `main`/`master` pushes)
    - frontend job runs only when frontend paths change (or on `main`/`master` pushes)
    - docs-contract job runs only when docs/contract-related paths change (or on `main`/`master` pushes)
- **File-level implementation map**
  - `.github/workflows/ci.yml`
- **Done (branch protection operationalization)**
  - Added script to apply GitHub branch protection required checks via `gh api`:
    - `scripts/configure_branch_protection.sh`
  - Script enforces required status checks aligned with CI job names:
    - `backend`
    - `frontend`
    - `docs-contract`
  - Added repository setup instructions:
    - `README.md` -> `Branch Protection Setup` section.
- **File-level implementation map (extended)**
  - `scripts/configure_branch_protection.sh`
  - `README.md`
- **Remaining in Module H**
  - Execute the script in GitHub with repository-admin credentials for each protected default branch (`main`/`master` as applicable).
  - Optional: enforce branch settings audit in a scheduled workflow (nightly drift detection against live GitHub config).

#### Module I: Reliability and Error Standards

- Introduce shared error envelope contract.
- Add retry policy standard for async tasks (bounded retries + dead letter strategy).
- Add service-level logs for critical workflows with correlation IDs.

#### Module I implementation status (May 1, 2026)

- **Done (retry/backoff baseline)**
  - Added bounded retry policy to critical Celery tasks with exponential backoff + jitter:
    - `accounts.tasks.send_team_invite_email`
    - `ingest.tasks.wire_page_graph`
    - `ingest.tasks.infer_ai_edges`
    - `ingest.tasks.run_ingest_job`
  - Added structured failure context for ingest task retries:
    - logs include `job_id`, retry attempt, and max retries context.
  - Updated ingest failure handling:
    - keeps `running` while retries remain
    - marks `failed` only on final exhausted retry.
  - Added task-level reliability tests for retry-policy configuration:
    - ingest tasks (`run_ingest_job`, `wire_page_graph`, `infer_ai_edges`)
    - accounts invite email task (`send_team_invite_email`)
  - Added correlation-id propagation across request -> task dispatch -> task logs:
    - introduced shared trace helpers in `teamos_project.trace` (`get_request_trace_id`, `coalesce_trace_id`)
    - threaded `trace_id` from API entrypoints into async dispatch:
      - invite create/resend
      - ingest URL/file dispatch
      - wiki create/update graph wiring dispatch
    - propagated `trace_id` across chained tasks:
      - `run_ingest_job` -> `run_pipeline` -> `wire_page_graph` -> `infer_ai_edges`
    - added structured task logs with `trace_id`, `task_id`, and workflow context for invite and ingest/graph paths.
  - Added API tests validating request trace propagation into task dispatch kwargs for invite and ingest routes.
  - Added dead-letter strategy baseline for permanently failed async jobs:
    - introduced persisted dead-letter model `ingest.AsyncDeadLetter` for exhausted retries
    - added shared recorder utility `teamos_project.dead_letter.record_dead_letter`
    - wired final-attempt failure capture for critical Celery tasks:
      - `accounts.send_team_invite_email`
      - `ingest.run_ingest_job`
      - `ingest.wire_page_graph`
      - `ingest.infer_ai_edges`
    - added Celery queue policy + routing baseline with explicit queues:
      - `teamos.default`, `teamos.critical`, `teamos.dead_letter`
      - enabled `acks_late` and `reject_on_worker_lost` for safer delivery semantics.
  - Added reliability tests for dead-letter policy:
    - settings-level queue policy assertion
    - persistence test for `record_dead_letter`.
- **File-level implementation map**
  - `backend/teamos_project/trace.py`
  - `backend/teamos_project/dead_letter.py`
  - `backend/accounts/views.py`
  - `backend/accounts/tasks.py`
  - `backend/ingest/views.py`
  - `backend/ingest/tasks.py`
  - `backend/ingest/models.py`
  - `backend/ingest/migrations/0004_asyncdeadletter.py`
  - `backend/ingest/pipeline.py`
  - `backend/wiki/views.py`
  - `backend/teamos_project/settings/base.py`
  - `backend/accounts/tests.py`
  - `backend/ingest/tests.py`
- **Remaining in Module I**
  - No mandatory remaining items in this module.

### Acceptance criteria

- CI runs on every PR and blocks merge on failed checks.
- At least one automated test exists for each critical loop module.
- Critical failures produce structured logs with actionable error codes.

---

## P1-1: Monetization and product analytics loops are not embedded

### Why this matters

Startup completeness requires measurable growth and conversion, not just usable features.

### Current symptoms

- Pricing tiers exist in docs, but entitlement enforcement and billing integration are incomplete.
- Product analytics for activation/conversion/retention are limited.

### Target outcome

Plan limits and billing are enforced in-product, and key funnels are measurable.

### Modular implementation plan

#### Module J: Entitlements and Plan Enforcement

- Create `billing` or `entitlements` module with:
  - team plan state
  - usage counters (pages, ingest jobs, tokens, seats, exports)
  - limit checks via reusable policy service
- Enforce limits in backend domain entry points (not only frontend).
- Return structured "upgrade required" responses for over-limit actions.

#### Module J implementation status (May 1, 2026)

- **Done (entitlements baseline)**
  - Added reusable entitlement policy service:
    - `backend/teamos_project/entitlements.py`
    - capability checks implemented:
      - `wiki_page_create`
      - `ingest_job_create`
  - Added backend enforcement at domain entry points:
    - wiki page create endpoint now blocks over-limit actions with:
      - `status=402`, `code=plan_limit_exceeded`, structured quota details.
    - ingest URL/file job create endpoints now block over-limit actions with same contract.
  - Added tests for enforced over-limit behavior:
    - `backend/wiki/tests.py` (`test_free_plan_blocks_page_creation_when_limit_reached`)
    - `backend/ingest/tests.py` (`test_free_plan_blocks_url_ingest_when_limit_reached`)
  - Extended backend enforcement to export workflow:
    - capability: `export_job_create`
    - both wiki ZIP and single-page export now enforce quota with `plan_limit_exceeded`.
  - Added export usage tracking model:
    - `export_app.ExportEvent` (team/user/export_type/metadata/timestamp)
    - used as quota counter source for export entitlements.
  - Added export entitlement tests:
    - successful export logs usage event
    - over-limit export returns `402` + `plan_limit_exceeded`.
  - Added seat entitlement enforcement for collaboration loop:
    - capability: `seat_manage`
    - invite creation now blocks when seat quota is exhausted.
    - invite acceptance now blocks new membership creation when seat quota is exhausted.
    - quota usage includes:
      - current team members
      - active pending invites (not used, not revoked, not expired)
  - Added seat entitlement tests:
    - invite create blocked at seat cap
    - invite accept blocked at seat cap.
  - Added token consumption entitlement baseline:
    - capability: `token_consume`
    - token usage tracker model: `chat.ChatTokenUsage`
    - chat query endpoint now blocks when team token quota is exhausted (`402`, `plan_limit_exceeded`).
    - successful streamed chat answers now persist token-usage records.
  - Added token entitlement tests:
    - chat query blocked at token cap
    - token usage record created for successful query flow.
- **Remaining in Module J**
  - Move hardcoded limits to plan-config source of truth (settings/db-backed entitlements).
  - Add frontend upgrade prompts wired to `plan_limit_exceeded` details.

#### Module K: Billing Integration (Provider-agnostic boundary)

- Add adapter interface:
  - `create_checkout_session`
  - `sync_subscription_state`
  - `handle_webhook_event`
- Keep provider-specific SDK code isolated behind adapter.
- Add webhook idempotency and signature validation.

#### Module K implementation status (May 1, 2026)

- **Done (provider-agnostic billing baseline)**
  - Added `billing` module with provider adapter boundary:
    - `BaseBillingProvider`
    - `PaddleBillingProvider`
    - `get_billing_provider()` factory.
  - Added owner-only checkout session API:
    - `POST /api/billing/{team_id}/checkout-session/`
  - Added billing webhook processing API:
    - `POST /api/billing/webhook/{provider_name}/`
  - Added webhook idempotency + persistence:
    - `billing.BillingWebhookEvent` with unique (`provider`, `event_id`)
  - Added normalized subscription state model:
    - `billing.TeamSubscription`
  - Added signature validation baseline for webhook requests:
    - HMAC signature via `BILLING_WEBHOOK_SECRET`
  - Added tests for:
    - checkout session creation
    - webhook idempotency
    - invalid signature rejection.
  - Added Stripe provider adapter implementation behind same boundary:
    - `StripeBillingProvider`
    - `get_billing_provider()` now supports `BILLING_PROVIDER=stripe`.
  - Added Stripe adapter tests:
    - stripe checkout-session creation path
    - stripe webhook subscription-state sync path.
  - Added async subscription sync/reconciliation baseline:
    - Celery task: `billing.tasks.reconcile_pending_billing_webhooks`
    - processes pending `BillingWebhookEvent` records and syncs `TeamSubscription`
    - staff trigger endpoint: `POST /api/billing/reconcile/`
  - Added reconciliation tests:
    - pending event reconciliation task path
    - staff can queue reconciliation job.
  - Added scheduled reconciliation cadence:
    - Celery Beat schedule `billing-reconcile-pending-webhooks`
    - runs every 15 minutes with bounded batch size.
  - Added settings-level test asserting billing reconciliation cadence config.
- **Done (separate provider decision doc for Ethiopia context)**
  - Added `BILLING_PROVIDER_DECISION_ETHIOPIA.md` describing:
    - what provider path is used
    - how it is integrated
    - why Paddle is the current launch recommendation for Ethiopia context
    - Stripe vs Paddle trade-offs and source references.
- **Remaining in Module K**
  - Optional: add reconciliation health alerting if pending webhook backlog exceeds threshold.

#### Module L: Product Analytics and Funnel Instrumentation

- Define canonical events:
  - `workspace_created`
  - `first_page_created`
  - `first_ingest_completed`
  - `first_chat_answer_received`
  - `invite_sent`
  - `invite_accepted`
  - `upgrade_clicked`
  - `subscription_started`
- Add event dictionary and ownership.
- Build activation dashboard:
  - signup -> team created -> first value moment

#### Module L implementation status (May 1, 2026)

- **Done (analytics baseline)**
  - Added `product_analytics` module with canonical event store:
    - `product_analytics.ProductEvent`
  - Added reusable analytics service layer:
    - `record_product_event`
    - `record_first_once`
    - `weekly_funnel_counts`
    - `weekly_cohort_summary`
  - Instrumented core funnel events in backend flows:
    - `workspace_created` (team creation)
    - `first_page_created` (wiki first page)
    - `first_ingest_completed` (ingest first completion)
    - `first_chat_answer_received` (first assistant answer)
    - `invite_sent`
    - `invite_accepted`
  - Added weekly funnel API:
    - `GET /api/analytics/{team_id}/funnel/weekly/`
  - Added upgrade-intent analytics capture:
    - frontend settings CTA emits `upgrade_clicked` via
      - `POST /api/analytics/{team_id}/events/upgrade-clicked/`
  - Added cohort analytics API (admin):
    - `GET /api/analytics/cohorts/weekly/`
  - Added billing-lifecycle analytics:
    - emits `subscription_started` when subscription first transitions to active.
  - Added event dictionary and ownership doc:
    - `docs/product-analytics-events.md`
  - Added tests for:
    - analytics API access and response shape
    - workspace/invite/upgrade instrumentation events
    - cohort endpoint access and payload
    - subscription-started emission on billing activation.
  - Added frontend analytics dashboard surface:
    - `/analytics` page with funnel visualizations and cohort table rendering.
- **Remaining in Module L**
  - No mandatory remaining items in this module.

### Acceptance criteria

- Over-limit actions are blocked by backend policy with clear upgrade path.
- Subscription state can be updated via webhook without manual ops.
- Activation and conversion funnel is queryable by week and cohort.

---

## P1-2: Citation/deep-linking and graph semantics need product-grade closure

### Why this matters

These are differentiation features. If shallow or inconsistent, product feels generic.

### Modular implementation plan

#### Module M: Citation Deep-link Contract

- Define citation payload schema:
  - page slug/id
  - optional anchor/heading id
  - optional chunk id
  - confidence score
- Frontend navigation should land users at exact context location when available.
- Add graceful fallback to page-level navigation.

#### Module N: Graph Semantics Quality Pass

- Clarify current clustering behavior in docs.
- Add versioned analytics mode flags (simple vs advanced) to avoid ambiguity.
- Validate graph analytics outputs against sampled fixtures.

### Acceptance criteria

- Citation click lands at exact section when source metadata is available.
- Graph mode displayed in UI matches backend analytics mode.

---

## Implementation principles (modularity rules)

Use these rules to avoid future drift and keep modules independent:

- **Single-responsibility modules**
  - `accounts`: identity, team membership, invites, roles
  - `billing/entitlements`: plans, usage, enforcement
  - `wiki`: content lifecycle
  - `ingest`: source processing pipeline
  - `chat`: retrieval + response orchestration
  - `graph_engine`: graph building and analytics
  - `export_app`: export permissions and packaging
- **Thin routes/controllers, thick services**
  - Keep request parsing in views/routes; put business logic in service layer.
- **Contracts first**
  - Define payload schemas and error codes before UI wiring.
- **Feature flags for risky changes**
  - Roll out destructive and billing features behind flags.
- **Observability at module boundaries**
  - Log and emit events at start/success/failure per critical action.
- **Idempotency on external edges**
  - Invite acceptance, billing webhooks, async retries should be safe to replay.

---

## Suggested phased rollout

### Phase 1 (P0, 1-2 weeks)

- Close invite loop end-to-end.
- Complete settings destructive flows.
- Add minimal CI gates + critical-path tests.

### Phase 2 (P0/P1, 1-2 weeks)

- Capability registry + docs synchronization checks.
- Citation deep-link contract + navigation updates.
- Reliability standards (error envelope + retries).

### Phase 3 (P1, 2-3 weeks)

- Entitlements module + backend limit enforcement.
- Billing adapter integration + webhooks.
- Funnel analytics dashboards for activation/conversion.

---

## Definition of done for "8+/10 feature completeness"

TeamOS is 8+/10 complete when all are true:

- Core loops (invite, settings, wiki/chat/ingest/export transitions) are fully closed in UX and backend.
- Public docs match implemented behavior with status labels.
- Critical flows are covered by automated tests and protected by CI checks.
- Entitlements and billing are enforceable in backend and visible in product UX.
- Key activation and conversion metrics are instrumented and reviewable.
