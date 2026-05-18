# TeamOS Full System Audit Report

**Date:** 2026-05-14  
**Auditor:** Senior Systems Architect  
**Codebase:** TeamOS (Django + Next.js + OpenAI + Qdrant + PostgreSQL)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Bugs](#critical-bugs)
3. [High Severity Issues](#high-severity-issues)
4. [Medium Severity Issues](#medium-severity-issues)
5. [Low Severity Issues](#low-severity-issues)
6. [Security Audit](#security-audit)
7. [Architecture Audit](#architecture-audit)
8. [AI System Audit](#ai-system-audit)
9. [Product & UX Audit](#product--ux-audit)
10. [Subscription & Business Logic Audit](#subscription--business-logic-audit)
11. [Dead Code & Unintegrated Modules](#dead-code--unintegrated-modules)
12. [Agent Capability Expansion Recommendations](#agent-capability-expansion-recommendations)
13. [Scores & Metrics](#scores--metrics)
14. [Refactor Roadmap](#refactor-roadmap)
15. [Production Readiness Checklist](#production-readiness-checklist)

---

## Executive Summary

TeamOS is a team knowledge management platform with wiki, AI chat, project planning, ingestion pipeline, and billing. The codebase has **solid foundational architecture** but suffers from multiple **critical production bugs**, **broken function signatures**, **dead code modules**, and **missing business logic enforcement**. The AI agent system is sophisticated but has several modules that were built and never wired into the main execution path.

**Overall Verdict:** NOT ready for production launch without fixing the critical and high severity issues below.

---

## Critical Bugs

### CRIT-1: `explain_connection()` — Wrong Call Signature (Runtime Crash)

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **File(s)** | `backend/graph_engine/reasoner.py:48-51` |
| **Root Cause** | `llm_call()` is called with `system=` and `prompt=` keyword arguments, but `llm_call()` signature accepts `team`, `operation`, `messages` — no `system` or `prompt` params. |
| **Runtime Impact** | Any call to `graph_explain_connection` tool crashes with `TypeError`. The agent tool `_graph_explain_connection` in `tools.py:1220` calls `explain_connection()` which will fail. |
| **Suggested Fix** | Rewrite to: `llm_call(team=Team.objects.get(id=team_id), operation="graph_explain", messages=[{"role":"system","content":"..."}, {"role":"user","content":prompt}])` |

### CRIT-2: `entitlements.py` — `team.memberships` Does Not Exist (AttributeError)

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **File(s)** | `backend/teamos_project/entitlements.py:42` |
| **Root Cause** | Code calls `team.memberships.count()` but `TeamMember.team` has `related_name="members"`, not `"memberships"`. |
| **Runtime Impact** | Every call to `check_quota(team, "add_member")` crashes with `AttributeError: 'Team' object has no attribute 'memberships'`. Invite acceptance silently breaks if it reaches this path. |
| **Suggested Fix** | Change to `team.members.count()`. |

### CRIT-3: `entitlements.py` — `seat_manage` Operation Not Handled

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **File(s)** | `backend/teamos_project/entitlements.py`, `backend/accounts/views.py:404,540` |
| **Root Cause** | `accounts/views.py` calls `check_quota(team, "seat_manage")` but `entitlements.py` only handles `"add_member"`, `"token_consume"`, and `"ingest_job"`. The `"seat_manage"` operation falls through to the default `QuotaResult(allowed=True, limit=-1, current=-1)`, bypassing ALL seat limits. |
| **Runtime Impact** | **Free tier seat limits (3 members) are NEVER enforced** for invite acceptance. Any free team can have unlimited members. |
| **Suggested Fix** | Either rename all call sites to `"add_member"` or add `"seat_manage"` as an alias in entitlements. |

### CRIT-4: `wiki_page_create` Quota Operation Undefined

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **File(s)** | `backend/wiki/views.py:66`, `backend/teamos_project/entitlements.py` |
| **Root Cause** | `check_quota(membership.team, "wiki_page_create")` is called but this operation is not handled in `entitlements.py`. Falls through to always-allowed. |
| **Runtime Impact** | Free-tier wiki page limits are never enforced. Not necessarily a bug if wiki pages are unlimited, but the code implies a limit was intended. |

---

## High Severity Issues

### HIGH-1: `semantic_memory.py` — O(N) Embedding Calls per Recall

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File(s)** | `backend/chat/semantic_memory.py:49-53` |
| **Root Cause** | `recall_similar_episodes()` calls `_embed()` **for every episode** in the corpus (up to 50). Each `_embed()` is a full OpenAI API call. |
| **Runtime Impact** | Up to **50 API calls** per single recall, costing $0.50+ and taking 10-30 seconds. This runs on every agent request if semantic memory is enabled. |
| **Suggested Fix** | Pre-compute and store embeddings in the `AgentEpisode` model or use Qdrant for episode search. |

### HIGH-2: `reasoner.py` — `causal_chain()` Has Same Broken Signature

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File(s)** | `backend/graph_engine/reasoner.py:86-120` |
| **Root Cause** | Same `llm_call(system=..., prompt=...)` broken call pattern as CRIT-1. |
| **Runtime Impact** | Any call to `causal_chain()` crashes. Currently not wired to a tool, so no user-facing impact yet. |

### HIGH-3: `FloatingAIChat.tsx` — Never Rendered

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File(s)** | `frontend/src/components/chat/FloatingAIChat.tsx`, `frontend/src/app/(app)/layout.tsx` |
| **Root Cause** | `FloatingAIChat` component exists (297 lines) but is never imported or rendered in the app layout or any page. |
| **Runtime Impact** | Dead code. The floating chat widget is completely invisible to users. |

### HIGH-4: `presence/views.py` — Completely Empty

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File(s)** | `backend/presence/views.py` |
| **Root Cause** | Only contains the default Django comment `# Create your views here.`. No REST API for presence. Only the WebSocket consumer exists. |
| **Runtime Impact** | No HTTP fallback for presence. The `PresenceIndicator.tsx` frontend component relies on WebSocket only, which may not work on all hosting configurations. |

### HIGH-5: `ai_assist.py` — Broken `llm_call` Signature

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File(s)** | `backend/wiki/ai_assist.py` |
| **Root Cause** | Uses `llm_call(system=..., prompt=...)` pattern (found 5 matches). The actual signature requires `team`, `operation`, `messages`. |
| **Runtime Impact** | ALL wiki AI assist operations (expand, summarize, suggest-links, detect-stale, from-plan) will crash with TypeError when called. |

### HIGH-6: Agent Mode Hardcoded to `"agent"` in Frontend

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File(s)** | `frontend/src/components/chat/ChatInterface.tsx:191` |
| **Root Cause** | `const mode = "agent"` is hardcoded. Users cannot switch to "ask" (RAG-only) or "plan" mode from the chat UI. |
| **Runtime Impact** | Every chat message goes through the full agent tool loop, wasting tokens and latency when users just want a simple knowledge query. The "plan" mode in chat is unreachable. |

### HIGH-7: LLM Cache Stores Full OpenAI Response Objects

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File(s)** | `backend/llm_orchestrator/orchestrator.py:142` |
| **Root Cause** | `cache.set(cache_key, response, timeout=900)` stores the raw OpenAI response object in Redis. These are not guaranteed to be pickle-serializable across deployments. |
| **Runtime Impact** | Cache deserialization can fail silently or crash, especially after library upgrades. Should serialize to dict. |

---

## Medium Severity Issues

### MED-1: SSE Parsing Fragile — No Multi-Chunk Buffer

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `frontend/src/components/chat/ChatInterface.tsx:234-311` |
| **Root Cause** | SSE parsing splits on `\n` and processes line-by-line. If a chunk is split across two `reader.read()` calls (common with network fragmentation), the `data:` line will be truncated and JSON parse will fail silently. |
| **Runtime Impact** | Occasional dropped tokens or missed tool results during streaming. |

### MED-2: `FlatingAIChat` Uses `mode: "ask"` — Different From Main Chat

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `frontend/src/components/chat/FloatingAIChat.tsx:91` |
| **Root Cause** | Sends `mode: "ask"` while the main `ChatInterface` sends `mode: "agent"`. |
| **Runtime Impact** | If FloatingAIChat were wired in, it would behave differently from the main chat — confusing for users. |

### MED-3: `ChatSessionDetailView.get()` Missing Messages in Response

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `backend/chat/views.py:288-293`, `backend/chat/serializers.py` |
| **Root Cause** | `ChatSessionSerializer` likely doesn't include nested messages. Frontend calls `.get<SessionDetailResponse>()` and expects `data.messages`. |
| **Runtime Impact** | Session detail may return empty messages array, requiring a separate message fetch. |

### MED-4: Duplicate Token Usage Tracking

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `backend/chat/views.py:392-400`, `backend/llm_orchestrator/orchestrator.py:130-138` |
| **Root Cause** | Token usage is tracked both in `ChatTokenUsage` (views.py) and `TeamApiUsage` (orchestrator telemetry). These use different estimation methods. |
| **Runtime Impact** | Budget calculations may be inaccurate. Double-counting could trigger premature budget exhaustion. |

### MED-5: `background_agents.py` Tasks Call `llm_call` Without Validated Team Subscription

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `backend/chat/background_agents.py` |
| **Root Cause** | Background tasks iterate all teams and run LLM calls. If a team has no subscription, `llm_call` creates one via `get_or_create`, bypassing billing intent. |
| **Runtime Impact** | Free/expired teams consume AI budget through background tasks. |

### MED-6: `PlanningAssistStreamView` Has Two Code Paths

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `backend/planning/views.py:444-525` |
| **Root Cause** | There are TWO streaming implementations in the same view — a sync `event_stream()` and an async `async_event_stream()` with queue-based thread bridge. Only one can be active. The current code uses the async path with `asyncio.to_thread`, which was previously causing `SynchronousOnlyOperation`. |
| **Runtime Impact** | Confusing code, risk of accidentally reverting to the broken path. |

### MED-7: `ACCESS_TOKEN_LIFETIME = 7 days` Is Too Long

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `backend/teamos_project/settings/base.py:127` |
| **Root Cause** | JWT access tokens live for 7 days. Industry standard is 15 minutes to 1 hour. |
| **Runtime Impact** | If a token is leaked, attacker has 7-day access window. |

---

## Low Severity Issues

### LOW-1: `db.sqlite3` Committed in Backend Directory

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **File(s)** | `backend/db.sqlite3` (4.9MB) |
| **Root Cause** | SQLite database file committed to git. |
| **Suggested Fix** | Add to `.gitignore`. |

### LOW-2: Markdown Plan Files Cluttering Root

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **File(s)** | 15+ `.md` plan files in project root |
| **Root Cause** | Architecture plans, pricing strategy, implementation plans scattered in root directory. |
| **Suggested Fix** | Move to `docs/` directory. |

### LOW-3: Import Inside Function Bodies

| Field | Detail |
|-------|--------|
| **Severity** | Low |
| **File(s)** | Multiple files (`views.py`, `tools.py`, `background_agents.py`) |
| **Root Cause** | `from X import Y` inside function bodies for circular import avoidance. |
| **Runtime Impact** | Minor performance overhead per request. Acceptable pattern for Django circular imports. |

---

## Security Audit

### SEC-1: Heroku API Key Exposed in Conversation History

| Field | Detail |
|-------|--------|
| **Severity** | CRITICAL |
| **Root Cause** | The Heroku API key `HRKU-AAVp8L5T7tKXvB93LtVi1L80gEGPbfT6G_ZJ52MpTbxg_____wMW3ZF32kRJ` was used in terminal commands and is now in shell history / logs. |
| **Suggested Fix** | **Rotate this key immediately.** Use `heroku authorizations:revoke` and generate a new one. |

### SEC-2: `AUTH_COOKIE_SECURE = False` in Base Settings

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **File(s)** | `backend/teamos_project/settings/base.py:132` |
| **Root Cause** | While production.py overrides this to `True`, the base setting is `False` with a comment "True in production". If any deployment path loads base without production overlay, cookies transmit over HTTP. |

### SEC-3: SSL Certificate Verification Disabled for Redis

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `backend/teamos_project/settings/production.py:54-57` |
| **Root Cause** | `ssl_cert_reqs: ssl.CERT_NONE` disables certificate verification for Redis connections. |
| **Runtime Impact** | Vulnerable to MITM attacks on Redis connection. Common Heroku workaround but should be documented. |

### SEC-4: Webhook Endpoint Has No Rate Limiting

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `backend/billing/views.py:113-115` |
| **Root Cause** | `BillingWebhookView` has `permission_classes = []` and `authentication_classes = []` with no rate limiting. |
| **Runtime Impact** | Webhook endpoint can be flooded with requests. |

### SEC-5: `SECRET_KEY` Default Is Insecure

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **File(s)** | `backend/teamos_project/settings/base.py:26` |
| **Root Cause** | `SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-change-me")`. If env var is missing in production, uses default. |

---

## Architecture Audit

### Current Architecture

```
Frontend (Next.js/Vercel) → REST API (Django/Heroku) → PostgreSQL (Supabase)
                                                     → Redis (Heroku)
                                                     → Qdrant (Vector DB)
                                                     → OpenAI / OpenRouter / Groq
                                                     → WebSocket (Channels/Daphne)
```

### Strengths
- **Clean separation**: Frontend/backend fully decoupled via REST API
- **LLM Orchestrator**: Centralized routing, caching, telemetry — excellent pattern
- **Billing**: Well-designed subscription + webhook + quota system
- **Ingestion Pipeline**: Multi-stage pipeline with governance (changeset review)
- **Agent System**: Sophisticated tool loop with reflection, memory, and multi-agent routing

### Weaknesses
- **Dead modules**: ~40% of AI modules are built but never called from production paths
- **No test coverage**: Test files exist but likely don't cover the critical paths identified here
- **Settings fragmentation**: Base → dev/prod override pattern leads to easy misconfiguration
- **Tight coupling**: Agent stream → tools → services → models chain makes testing difficult
- **No API versioning**: All endpoints are unversioned (`/api/chat/...`)

---

## AI System Audit

### Agent Tool System — Issues Found

| Tool | Status | Issue |
|------|--------|-------|
| `wiki_search_pages` | Working | — |
| `wiki_create_page` | Working | — |
| `wiki_update_page` | Working | — |
| `wiki_read_full_page` | Working | — |
| `graph_add_edge` | Working | — |
| `graph_explain_connection` | **BROKEN** | `reasoner.py` uses wrong `llm_call` signature |
| `agent_memory_read` | Working | — |
| `agent_memory_write` | Working | — |
| `agent_memory_delete` | Working | Handler exists |
| `plan_create_milestone` | **FRAGILE** | Crashes on non-UUID `project_id` (partially fixed with UUID validation) |
| `plan_generate_draft` | Working | — |
| `knowledge_gap_analysis` | Working | — |

### RAG Pipeline — Token Waste

The `_retrieve_wiki_citations()` function in `chat/views.py:57-203` calls **two extra LLM calls** (query expansion + HyDE) for every user message before the actual agent run. For a simple "what is X?" query, the system makes:

1. Query expansion LLM call (~$0.01)
2. HyDE generation LLM call (~$0.01)
3. Agent reasoning LLM call (~$0.03)
4. Agent streaming final answer (~$0.03)

**Total: 4 LLM calls minimum per message.** For agent mode with tool calls, this can reach 8-12 calls.

### Semantic Memory — Unusable in Current State

`semantic_memory.py` generates a **new embedding for every episode** on every recall (HIGH-1). With 50 episodes, that's 50 API calls. This module should not be enabled in production until embeddings are pre-computed.

---

## Product & UX Audit

### Chat Interface
- **Mode selector missing**: Users cannot switch between ask/agent/plan modes (HIGH-6)
- **No message loading state**: When switching sessions, old messages flash before new ones load
- **Voice overlay**: Works but feels disconnected — no visual feedback linking voice to chat
- **Scroll-to-bottom button**: Positioned with `right-6` but has no `bottom` positioning, may overlap content

### Wiki Editor
- **Markdown rendering fixed**: The TipTap Markdown extension fix is correct
- **No auto-save**: Editor doesn't auto-save drafts — user can lose work
- **Publishing workflow**: No draft/published state distinction in the model

### Planner
- **AI planner overlay**: Well-designed step-by-step UI
- **Conflict resolution**: Backend exists but frontend has no UI for manual resolution
- **Calendar view**: Exists but depends on task dates which agents often generate incorrectly

### General UX
- **No onboarding tour**: New users land in an empty workspace with no guidance
- **Error states**: Most errors show generic "Failed to connect to AI server" toast
- **Empty states**: Chat has a nice empty state, but wiki/planner lack them
- **Mobile**: Sidebar collapses but planner workspace is unusable on mobile

---

## Subscription & Business Logic Audit

### Free Tier Enforcement — BROKEN

| Limit | Intended | Actual | Status |
|-------|----------|--------|--------|
| Members per team | 3 | **Unlimited** | **BROKEN** — `seat_manage` operation not handled (CRIT-3) |
| Teams per user | 2 | 2 | Working (enforced in `TeamListCreateView.post()`) |
| Wiki pages | Unknown | **Unlimited** | **BROKEN** — `wiki_page_create` not handled (CRIT-4) |
| Ingest jobs | 10 | 10 | Working |
| Token budget | $5/month | $5/month | Working |

### The `team.memberships` Bug Chain

```
InviteCreateView.post() 
  → check_quota(team, "seat_manage")
    → entitlements.py: operation "seat_manage" not matched
      → QuotaResult(allowed=True) ← ALWAYS PASSES
        → invite created with no limit check
```

Even if we fix `seat_manage` to route to `add_member`, it will crash with `team.memberships` (should be `team.members`).

---

## Dead Code & Unintegrated Modules

| Module | File | Status | Issue |
|--------|------|--------|-------|
| `FloatingAIChat` | `frontend/.../FloatingAIChat.tsx` | Dead | Never imported in layout |
| `PresenceIndicator` | `frontend/.../PresenceIndicator.tsx` | Dead | Never imported in any page |
| `wiki/ai_assist.py` | `backend/wiki/ai_assist.py` | **Broken** | Wrong `llm_call` signature |
| `wiki/auto_maintain.py` | `backend/wiki/auto_maintain.py` | Dead | No Celery task calls it |
| `wiki/signals.py` | `backend/wiki/signals.py` | Dead | Not connected in `apps.py` `ready()` |
| `planning/reasoning_pipeline.py` | `backend/planning/reasoning_pipeline.py` | Active | Used by `agent_executor.py` |
| `planning/dependency_inference.py` | `backend/planning/dependency_inference.py` | Dead | Only called from reasoning_pipeline, which is active |
| `planning/adaptive_scheduler.py` | `backend/planning/adaptive_scheduler.py` | Dead | Only called from reasoning_pipeline |
| `chat/multi_agent.py` | `backend/chat/multi_agent.py` | Partial | Classify used in `agent_stream.py`, but orchestrator's `run_multi` never called |
| `KnowledgeActivity` model | `backend/ingest/models.py` | Write-only | Created during ingestion but no read API |
| `AsyncDeadLetter` model | `backend/ingest/models.py` | Unused | No code writes to it, no admin UI |
| `ProjectMember` model | `backend/planning/models.py` | Unused | Model exists but no API endpoints |

---

## Agent Capability Expansion Recommendations

### Missing High-Value Tools

1. **`plan_assign_task`** — Assign task to specific team member by name/role
2. **`plan_create_subtask`** — Create subtask under a parent task
3. **`plan_get_workload`** — Show tasks per user, identify overloaded members
4. **`plan_sprint_plan`** — Group tasks into time-boxed sprints
5. **`wiki_list_recent`** — Show recently modified pages (last 7/30 days)
6. **`wiki_archive_page`** — Soft-delete/archive stale pages
7. **`team_list_members`** — Let agent see who's on the team for assignment
8. **`calendar_get_availability`** — Check member availability before assigning
9. **`notification_send`** — Send notification to a team member
10. **`analytics_project_progress`** — Get completion % and burndown data

### Orchestration Improvements

- **Tool retry with backoff**: Currently tools fail once and report error. Add 1 retry.
- **Context window management**: No token counting. Long conversations will exceed context limits.
- **Agent memory summarization**: Memory grows unbounded. Add periodic summarization.
- **Parallel tool execution**: Currently sequential. Wiki search + graph traverse could run in parallel.

---

## Scores & Metrics

| Category | Score (0-10) | Notes |
|----------|-------------|-------|
| **Production Readiness** | **3/10** | Critical bugs in entitlements, graph reasoner, ai_assist |
| **Security** | **5/10** | Good auth structure, but exposed API key, long token lifetime |
| **Scalability** | **6/10** | Good async patterns, Redis caching, but semantic memory is O(N) |
| **Maintainability** | **5/10** | Clean models, but heavy coupling and dead code |
| **AI System Quality** | **6/10** | Sophisticated design, poor integration/wiring |
| **UX/UI** | **6/10** | Modern design, but missing mode selector, empty states |
| **Test Coverage** | **2/10** | Test files exist but critical paths untested |
| **Code Quality** | **6/10** | Consistent patterns, but function bodies too large |

---

## Refactor Roadmap

### Phase 1: Critical Fixes (Day 1-2)
1. Fix `entitlements.py`: `team.memberships` → `team.members` + add `seat_manage` operation
2. Fix `graph_engine/reasoner.py`: Correct `llm_call` signature in `explain_connection` and `causal_chain`
3. Fix `wiki/ai_assist.py`: Correct all 5 `llm_call` calls to use proper signature
4. Rotate exposed Heroku API key
5. Validate UUID in all `plan_*` tools that accept `project_id`

### Phase 2: Integration Wiring (Day 3-5)
1. Wire `FloatingAIChat` into `(app)/layout.tsx`
2. Connect `wiki/signals.py` in wiki `AppConfig.ready()`
3. Add chat mode selector in `ChatInterface.tsx`
4. Add `KnowledgeActivity` read endpoint
5. Add `AsyncDeadLetter` admin endpoint

### Phase 3: Performance (Day 6-8)
1. Pre-compute episode embeddings in `AgentEpisode` model
2. Add SSE parser buffering in frontend
3. Reduce `ACCESS_TOKEN_LIFETIME` to 1 hour
4. Serialize LLM cache values to dict, not raw response objects

### Phase 4: Business Logic (Day 9-10)
1. Add missing quota operations (`wiki_page_create`, project limits)
2. Enforce background task budget checks
3. Add rate limiting to webhook endpoint
4. Add proper error envelopes for all failure paths

---

## Production Readiness Checklist

| Item | Status |
|------|--------|
| All critical bugs fixed | ❌ |
| Seat limit enforcement working | ❌ |
| All agent tools functional | ❌ |
| API key rotated | ❌ |
| Access token lifetime < 1h | ❌ |
| SSE parsing robust | ❌ |
| Test coverage > 50% | ❌ |
| Dead code removed or wired | ❌ |
| Error monitoring (Sentry) | ❌ Not visible |
| Auto-scaling configured | ⚠️ Heroku dynos |
| Database backups | ⚠️ Supabase manages |
| CORS properly restricted | ✅ |
| CSRF protection enabled | ✅ |
| Webhook idempotency | ✅ |
| Billing webhook verification | ✅ |
| Quota enforcement working | ❌ Partially broken |
| SSL everywhere | ✅ |
| Rate limiting | ❌ Missing |

---

## Most Dangerous Hidden Bugs

1. **Free tier has unlimited members** — `seat_manage` operation unhandled + `team.memberships` AttributeError
2. **`graph_explain_connection` crashes** — Wrong `llm_call` signature in `reasoner.py`
3. **All wiki AI assist operations crash** — Wrong `llm_call` signature in `ai_assist.py`
4. **Semantic memory burns 50x API budget** — O(N) embedding calls per recall
5. **LLM cache stores non-serializable objects** — Can corrupt Redis cache silently

---

*End of report.*
