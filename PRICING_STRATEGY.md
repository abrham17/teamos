# TeamOS: Production Pricing, LLM Cost Engineering & Admin Monitoring Plan

> **Updated:** May 2026 | **Status:** Pre-implementation
> **Stack:** OpenAI models only + Qdrant vector DB + Paddle billing

---

## 1. LLM Orchestrator — Separate Django App

The LLM Orchestrator is a **dedicated Django app** (`llm_orchestrator/`) — not a file inside `billing/`. It is its own module with models, views, tasks, and middleware, but deeply integrated with every other app.

```
backend/
├── accounts/
├── billing/          ← subscription + payment logic
├── chat/             ← imports llm_orchestrator.call()
├── ingest/           ← imports llm_orchestrator.call()
├── planning/         ← imports llm_orchestrator.call()
├── llm_orchestrator/ ← NEW — separate Django app
│   ├── __init__.py
│   ├── apps.py
│   ├── models.py     ← TeamApiUsage, ModelCostConfig
│   ├── router.py     ← continuous curve + operation routing
│   ├── orchestrator.py ← single call() gateway
│   ├── budget.py     ← adaptive bands + forecast
│   ├── telemetry.py  ← per-call logging
│   ├── middleware.py ← trial/payment block enforcement
│   ├── tasks.py      ← monthly reset, forecast cron
│   ├── admin.py      ← Django admin registration
│   └── urls.py       ← admin API endpoints for dashboard
├── admin_api/        ← admin dashboard backend
├── wiki/
└── graph_engine/
```

### Integration Points

```
┌──────────────────────────────────────────────────────────────┐
│                   LLM ORCHESTRATOR APP                       │
│                  (llm_orchestrator/)                          │
│                                                              │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌────────────┐ │
│  │Cost Router │ │Model Select│ │Fallback  │ │ Budget     │ │
│  │• budget    │ │• operation │ │• health  │ │ Monitor    │ │
│  │  bands     │ │  type      │ │  checks  │ │ • forecast │ │
│  │• spend     │ │• value     │ │• graceful│ │ • adaptive │ │
│  │  curve     │ │  score     │ │  degrade │ │   bands    │ │
│  └────────────┘ └────────────┘ └──────────┘ └────────────┘ │
│  ┌────────────┐                                             │
│  │Telemetry   │  Writes → TeamApiUsage (per-call records)   │
│  │• per-user  │  Reads  → TeamSubscription (plan, status)   │
│  │• per-op    │  Reads  → billing.pricing (budget calc)     │
│  │• latency   │  Serves → admin_api (dashboard queries)     │
│  └────────────┘  Serves → frontend (usage stats API)        │
└──────────────────────────────────────────────────────────────┘
         │                │
    ┌────▼──────┐   ┌────▼──────┐
    │  OpenAI   │   │  Qdrant   │
    │ GPT-4o    │   │ Vector DB │
    │ 4.1-nano  │   │ 1536 dim  │
    │ 4o-mini   │   │           │
    │ embed-3-s │   │           │
    └───────────┘   └───────────┘
```

### How Other Apps Use It

```python
# In chat/agent_stream.py, ingest/agent_decompose.py, planning/agent_sync.py:
from llm_orchestrator.orchestrator import llm_call

result = llm_call(
    team=team,
    user=user,
    operation="chat_ask",       # determines value score + routing
    messages=[...],
    response_format={"type": "json_object"},
)
# Orchestrator handles: model selection, cost tracking, fallback, telemetry
```

### Deep Integration Map

| App | Integration | Direction |
|-----|-------------|----------|
| `chat/` | Calls `llm_call()` for all chat/agent LLM requests | chat → orchestrator |
| `ingest/` | Calls `llm_call()` for decompose, relate, governance | ingest → orchestrator |
| `planning/` | Calls `llm_call()` for plan generation | planning → orchestrator |
| `billing/` | Provides subscription data for budget calculation | billing → orchestrator |
| `admin_api/` | Queries `TeamApiUsage` for dashboard analytics | orchestrator → admin |
| `frontend` | Fetches usage stats via REST API | orchestrator → frontend |
| `admin-dashboard` | Reads cost/model/forecast data via admin API | orchestrator → admin dash |

**Provider strategy:** OpenAI-only. No Groq, no OpenRouter. Single provider = simpler ops, unified billing, consistent API.

---

## 2. Model Pricing Reference (May 2026)

### Chat & Agent Models (Per 1M Tokens)

| Model | Input | Output | Latency | Role |
|-------|-------|--------|---------|------|
| **GPT-4.1-nano** | $0.10 | $0.40 | ~300ms | Free tier, background ops, survival fallback |
| **GPT-4o-mini** | $0.15 | $0.60 | ~500ms | Budget-conscious mid-tier routing |
| **GPT-4o** | $2.50 | $10.00 | ~800ms | Pro/Enterprise primary |

### Embeddings (Universal — All Plans)

| Model | Price/1M tokens | Dimensions | Storage |
|-------|----------------|-----------|---------|
| **text-embedding-3-small** | $0.02 | **1,536** | **Qdrant** |

> **Embeddings are infrastructure, not a variable.** Same model, same dimensions, same Qdrant instance for Free through Enterprise. At $0.02/1M tokens, 50K pages cost $0.50. Never optimize this — it's noise.

---

## 3. Token Footprint & Cost Per Operation

### 3.1 Operation Profiles

| Operation | Input Tok | Output Tok | Calls | Value | Background? |
|-----------|----------|-----------|-------|-------|-------------|
| Chat Ask (RAG) | ~2,000 | ~500 | 1 | Medium | No |
| Chat Agent (tools) | ~3,000 | ~800 | 1–8 | High | No |
| Ingest Decompose | ~4,000 | ~2,000 | 1 | Medium | Yes |
| Ingest Relate | ~3,000 | ~500 | 1/page | Low | Yes |
| Ingest Governance | ~2,500 | ~400 | 1 | Low | Yes |
| Template Detect | ~2,000 | ~100 | 1 | Low | Yes |
| Plan Generate | ~4,000 | ~2,000 | 1 | High | No |
| Embedding | ~500/chunk | — | N | N/A | Yes |

### 3.2 Dollar Cost Per Operation

| Operation | GPT-4.1-nano | GPT-4o-mini | GPT-4o |
|-----------|-------------|-------------|--------|
| Chat Ask | **$0.00040** | $0.00060 | $0.0100 |
| Agent (3 rounds) | **$0.00126** | $0.00189 | $0.0315 |
| Ingest full | **$0.00166** | $0.00295 | $0.0530 |
| Plan generate | **$0.00120** | $0.00150 | $0.0300 |

---

## 4. Subscription Tiers

### Free — Time-Limited Trial (2 Months)

| Attribute | Value |
|-----------|-------|
| **Price** | $0 |
| **Duration** | **2 months from signup, then auto-blocked** |
| **Seats** | **3 members max** |
| **LLM Engine** | GPT-4.1-nano only (all operations) |
| **Embeddings** | text-embedding-3-small → Qdrant (1536d) |
| **Token Budget** | 5,000 tokens |
| **Wiki Pages** | 10 |
| **Ingest Jobs** | 10 |
| **On Expiry** | All API access blocked. Data preserved indefinitely. Upgrade to any paid plan to restore access. |
| **API Cost/Team/Month** | ~$0.25 |
| **Strategy** | 2-month window creates urgency. Data retention ensures easy conversion — "your wiki is waiting." |

**Auto-block behavior:**
- Day 1–60: Full access with GPT-4.1-nano
- Day 61+: All API endpoints return `403 trial_expired`
- UI shows: "Your 2-month free trial has ended. Your data is safe — upgrade to continue."
- Data (wiki pages, graph, chat history, raw sources) is **never deleted**
- Team owner can upgrade at any time to instantly restore access

### Team — Growing Teams

| Attribute | Value |
|-----------|-------|
| **Price** | $29–$95/month (seat-scaled) |
| **Seats** | 1–25 |
| **LLM Engine** | Continuous curve: GPT-4o → GPT-4o-mini (floor, never nano) |
| **Embeddings** | text-embedding-3-small → Qdrant (1536d) |
| **Quality SLA** | Stable quality, GPT-4o-mini minimum for user-facing |
| **Budget Band** | 20–40% of revenue |
| **Token Budget** | 500K |
| **Wiki Pages** | 200 |
| **Ingest Jobs** | 500 |
| **Target Margin** | 60–80% |

### Pro — The Money Maker

| Attribute | Value |
|-----------|-------|
| **Price** | $100–$300/month (seat + usage-tier) |
| **Seats** | 5–100 |
| **LLM Engine** | GPT-4o primary, operation-aware routing, continuous curve |
| **Embeddings** | text-embedding-3-small → Qdrant (1536d) |
| **Quality SLA** | GPT-4o guaranteed for high-value ops |
| **Budget Band** | 20–40% of revenue |
| **Token Budget** | 5M |
| **Wiki Pages** | 2,000 |
| **Ingest Jobs** | 5,000 |
| **Usage Tiers** | low (+0%), standard (+12%), high (+28%) |
| **Target Margin** | 60–80% |

### Enterprise — Premium

| Attribute | Value |
|-----------|-------|
| **Price** | $355+/month (no cap) |
| **Seats** | 10–250 |
| **LLM Engine** | GPT-4o always — no degradation, no routing |
| **Embeddings** | text-embedding-3-small → Qdrant (1536d) |
| **Quality SLA** | Deterministic GPT-4o, <1.5s p95 |
| **Budget Band** | 30–50% of revenue |
| **Token Budget** | 50M |
| **Wiki Pages** | 20,000 |
| **Ingest Jobs** | 50,000 |
| **Perks** | Priority support, SLAs, invoice billing |
| **Target Margin** | 50–70% |

---

## 5. Operation-Aware Routing

### Not all operations deserve premium models.

| Operation | Priority Model | Fallback | Never Use |
|-----------|---------------|----------|-----------|
| Chat Ask (user-facing) | GPT-4o | GPT-4o-mini | — |
| Chat Agent (user-facing) | GPT-4o | GPT-4o-mini | nano (too weak for tools) |
| Plan Generate (user-facing) | GPT-4o | GPT-4o-mini | nano |
| Ingest Decompose (background) | GPT-4o-mini | GPT-4.1-nano | GPT-4o (overkill) |
| Ingest Relate (background) | GPT-4.1-nano | — | GPT-4o |
| Template Detect (background) | GPT-4.1-nano | — | GPT-4o |
| Embeddings (infra) | embed-3-small | — | never routed |

> **Free tier exception:** All operations use GPT-4.1-nano regardless of this table.

---

## 6. Continuous Cost Curve (Replaces Hard Phases)

### Smooth probabilistic weight shifting — no quality cliffs.

```
spend_ratio = current_month_spend / monthly_budget

GPT-4o weight     = max(0, 1.0 - spend_ratio × 1.3)
GPT-4o-mini weight = remaining after 4o and nano
GPT-4.1-nano weight = max(0, (spend_ratio - 0.85) × 5.0)

  0% spent  → 100% 4o,   0% mini,   0% nano
 30% spent  →  61% 4o,  39% mini,   0% nano
 50% spent  →  35% 4o,  65% mini,   0% nano
 75% spent  →   3% 4o,  97% mini,   0% nano
 90% spent  →   0% 4o,  75% mini,  25% nano
100%+ spent →   0% 4o,   0% mini, 100% nano
```

**Override rules:**
- `value_score == HIGH` AND `spend < 90%` → force GPT-4o
- `background_ingest` → never GPT-4o regardless of budget
- `enterprise` → always GPT-4o (SLA)
- `free` → always GPT-4.1-nano (no routing)

---

## 7. Adaptive Budget Bands

```
base_ratio = 0.30

Adjustments:
  avg_3mo_usage < 50% of budget → shrink to 0.20
  avg_3mo_usage > 85% of budget → expand to 0.40
  first 30 days of subscription  → expand to 0.45 (onboarding grace)
  enterprise with SLA            → fixed 0.50
```

| Plan | Revenue | Band | Effective Budget |
|------|---------|------|-----------------|
| Free | $0 | N/A | $0.50 fixed cap |
| Team | $29–$95 | 20–40% | $5.80–$38.00 |
| Pro | $100–$300 | 20–40% | $20–$120 |
| Enterprise | $355+ | 30–50% | $106.50+ |

---

## 8. Predictive Budget Controller

```
projected_spend = (current_spend / days_elapsed) × days_in_month

Triggers:
  projected > budget        → start shifting weights to cheaper models
  projected > budget × 1.2  → aggressive shift + owner notification
  projected > budget × 1.5  → nano-only + admin alert
```

Benefits: Smooth early throttling prevents end-of-month quality cliffs.

---

## 9. Payment Failure & Cancellation Handling

### The Problem

Paid teams (Team/Pro/Enterprise) may fail to pay monthly bills or cancel subscriptions. We need a graceful path that gives them a chance to fix payment, doesn't immediately destroy their experience, but eventually blocks access. **Data and embeddings are never deleted.**

### Lifecycle: Payment Failure → Grace → Block

```
Paid team (active subscription)
    │
    │ Payment fails / subscription cancelled
    ▼
┌──────────────────────────────────────┐
│  GRACE PERIOD (7 days)               │
│  • Downgraded to Free-tier limits    │
│  • GPT-4.1-nano only                 │
│  • 3 seat limit enforced             │
│  • Banner: "Payment failed —         │
│    update billing within 7 days"     │
│  • Daily email reminders             │
└──────────────────┬───────────────────┘
                   │ Day 8 (no payment)
                   ▼
┌──────────────────────────────────────┐
│  BLOCKED                             │
│  • All API returns 403               │
│  • UI: "Account suspended — update   │
│    payment to restore access"        │
│  • Data preserved indefinitely       │
│  • Qdrant embeddings kept            │
│  • Wiki, graph, chat all intact      │
└──────────────────┬───────────────────┘
                   │ Owner updates payment
                   ▼
┌──────────────────────────────────────┐
│  RESTORED                            │
│  • Instant access                    │
│  • Original plan re-activated        │
│  • All data + embeddings intact      │
└──────────────────────────────────────┘
```

### Status Transitions

| Trigger | Status Change | Effect |
|---------|--------------|--------|
| Payment fails | `active` → `past_due` | Grace period starts (7 days) |
| Subscription cancelled | `active` → `canceled` | Grace period starts (7 days) |
| Grace period expires | `past_due`/`canceled` → `suspended` | Full API block |
| Payment succeeds | `past_due` → `active` | Immediate restoration |
| Resubscribe | `suspended` → `active` | Immediate restoration |

### Grace Period Rules

- **Duration:** 7 days from payment failure or cancellation
- **Access level:** Free-tier equivalent (GPT-4.1-nano, 3 seats, reduced quotas)
- **Notifications:** Daily email to team owner + in-app banner
- **Tracked in:** `TeamSubscription.grace_expires_at`

### Data Preservation Policy

| Data Type | On Grace Period | On Block | On Resubscribe |
|-----------|----------------|----------|----------------|
| Wiki pages | ✅ Accessible | ❌ Inaccessible (preserved) | ✅ Restored |
| Qdrant embeddings | ✅ Kept | ✅ **Kept** | ✅ Intact |
| Graph edges | ✅ Accessible | ❌ Inaccessible (preserved) | ✅ Restored |
| Chat history | ✅ Accessible | ❌ Inaccessible (preserved) | ✅ Restored |
| Raw sources | ✅ Accessible | ❌ Inaccessible (preserved) | ✅ Restored |

> **Critical:** Qdrant vectors are NEVER deleted on payment failure. Rebuilding embeddings is wasteful and slow. Keep them indefinitely — storage cost is negligible.

---

## 10. Monthly Cost Scenarios (Recomputed with GPT-4.1-nano)

### Team of 8, 20 workdays

**Light usage:** 15 queries/user/day, 2 ingests/day, 1 plan/week

| Strategy | Chat | Ingest | Planning | Embed | **Total** |
|----------|------|--------|----------|-------|-----------|
| All nano | $0.96 | $0.66 | $0.05 | $0.08 | **$1.75** |
| Continuous curve (Pro) | $8.40 | $1.18 | $0.48 | $0.08 | **$10.14** |
| All GPT-4o | $24.00 | $14.00 | $1.20 | $0.08 | **$39.28** |

**Heavy usage:** 50 queries/user/day, 10 ingests/day, 5 plans/week

| Strategy | Chat | Ingest | Planning | Embed | **Total** |
|----------|------|--------|----------|-------|-----------|
| All nano | $3.20 | $3.32 | $0.24 | $0.40 | **$7.16** |
| Continuous curve (Pro) | $28.00 | $5.90 | $2.40 | $0.40 | **$36.70** |
| All GPT-4o | $80.00 | $70.00 | $6.00 | $0.40 | **$156.40** |

### Free Tier Cost (3 users, nano only, 2-month window)

| Scenario | Monthly Cost | 2-Month Total |
|----------|-------------|---------------|
| Light (10 queries/user/day) | $0.36 | $0.72 |
| Heavy (30 queries/user/day) | $1.08 | $2.16 |
| **Average expected** | **$0.50** | **$1.00** |

> At $0.50/month per free team, supporting 1,000 trial teams costs only **$500/month** for the 2-month window.

---

## 11. Unit Economics

| Plan | Avg Revenue | Avg API Cost | Margin | Margin % |
|------|------------|-------------|--------|---------|
| Free (2mo) | $0 | $0.50/mo | -$0.50 | loss leader |
| Team (avg) | $57 | $6.50 | $50.50 | 89% |
| Pro (avg) | $185 | $28.00 | $157.00 | 85% |
| Enterprise | $650 | $160.00 | $490.00 | 75% |

### 12-Month MRR Projections

| Month | Free Trials | Team | Pro | Ent | MRR | API Cost | Net |
|-------|------------|------|-----|-----|-----|----------|-----|
| 1–3 | 50 | 2 | 0 | 0 | $114 | $139 | -$25 |
| 4–6 | 200 | 8 | 2 | 0 | $826 | $456 | +$370 |
| 7–9 | 500 | 20 | 5 | 1 | $2,715 | $1,325 | +$1,390 |
| 10–12 | 1,000 | 40 | 12 | 3 | $6,410 | $3,170 | +$3,240 |

---

## 12. Free Trial Auto-Block System

### Flow

```
Team created → plan = "free", trial_start = now()
                    │
          ┌─────────▼──────────┐
          │  Day 1–60: Active  │
          │  • GPT-4.1-nano    │
          │  • 3 seats max     │
          │  • Full features   │
          └─────────┬──────────┘
                    │ Day 61
          ┌─────────▼──────────┐
          │  BLOCKED           │
          │  • 403 on all API  │
          │  • Data preserved  │
          │  • Upgrade CTA     │
          └─────────┬──────────┘
                    │ Owner upgrades
          ┌─────────▼──────────┐
          │  Restored          │
          │  • Instant access  │
          │  • All data intact │
          └────────────────────┘
```

### Implementation Notes

- `TeamSubscription.trial_expires_at` — set to `created_at + 60 days`
- Middleware/permission check: if `plan == "free"` AND `now() > trial_expires_at` → return `403`
- Cron task: daily scan for expired trials, set `status = "trial_expired"`
- Data retention: **indefinite** — no deletion pipeline for expired trials
- Upgrade path: changing `plan_key` to any paid plan immediately unblocks

---

## 13. Admin Dashboard Monitoring System

### Separate application from main frontend — dedicated ops visibility.

```
┌──────────────────────────────────────────────────────────┐
│                  ADMIN DASHBOARD                         │
│           (admin.team-os.tech or /admin/)                │
│           Separate Next.js app or Django admin           │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  1. COST OVERVIEW                                   │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │ │
│  │  │Total MRR │ │Total API │ │Gross     │           │ │
│  │  │$6,410    │ │Cost      │ │Margin    │           │ │
│  │  │          │ │$3,170    │ │50.6%     │           │ │
│  │  └──────────┘ └──────────┘ └──────────┘           │ │
│  │  [Monthly trend chart]                             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  2. PER-TEAM COST TABLE                             │ │
│  │  Team    | Plan | Revenue | API Cost | Margin | ⚠️  │ │
│  │  Acme    | Pro  | $185    | $42      | 77%    |     │ │
│  │  Beta    | Team | $57     | $38      | 33%    | ⚠️  │ │
│  │  Gamma   | Free | $0      | $0.80    | —      |     │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  3. MODEL USAGE BREAKDOWN                           │ │
│  │  [Pie: GPT-4o 35% | 4o-mini 45% | nano 20%]       │ │
│  │  [Bar: Cost by operation type]                      │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  4. ALERTS & ANOMALIES                              │ │
│  │  🔴 Team "Beta" at 92% budget — approaching nano   │ │
│  │  🟡 3 free trials expiring in 48 hours              │ │
│  │  🟡 User john@acme spending 3× team average        │ │
│  │  🟢 Embedding costs: $12.40 this month (stable)    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  5. TRIAL MANAGEMENT                                │ │
│  │  Active trials: 47   Expiring <7d: 12              │ │
│  │  Expired (data held): 203   Converted: 38 (18%)    │ │
│  │  [Extend trial] [Force expire] [Send nudge email]  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  6. PREDICTIVE SPEND FORECAST                       │ │
│  │  Projected month-end API cost: $3,850               │ │
│  │  Budget ceiling: $4,200                             │ │
│  │  Burn rate: $128/day (trending ↑ 3%)                │ │
│  │  [Chart: actual vs projected vs budget]             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  7. PER-USER COST ATTRIBUTION                       │ │
│  │  Top spenders this month:                           │ │
│  │  1. sarah@acme — $18.40 (heavy agent usage)        │ │
│  │  2. mike@beta — $14.20 (bulk ingest)               │ │
│  │  3. lisa@delta — $9.80 (planning generation)       │ │
│  │  [Drill into user → operation breakdown]            │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  8. SYSTEM HEALTH                                   │ │
│  │  Qdrant: ✅ 1.2M vectors, 98% capacity healthy     │ │
│  │  OpenAI API: ✅ p95 latency 780ms                   │ │
│  │  Celery queue: ✅ 3 pending tasks                   │ │
│  │  Redis: ✅ 42MB used                                │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Admin Dashboard Pages

| Page | Purpose | Key Data |
|------|---------|----------|
| **Overview** | Platform-wide P&L at a glance | MRR, total API cost, margin %, trend |
| **Teams** | Per-team economics | Revenue, cost, margin, budget phase, alerts |
| **Users** | Per-user cost attribution | Top spenders, operation breakdown, abuse flags |
| **Models** | Model usage analytics | % split by model, cost by model, quality metrics |
| **Trials** | Free trial lifecycle | Active, expiring, expired, conversion rate |
| **Forecast** | Predictive spend | Projected vs budget, burn rate, trend |
| **Operations** | Per-operation costs | Chat vs ingest vs planning, cost per call type |
| **Health** | Infrastructure status | Qdrant, OpenAI API, Celery, Redis, latency p95 |

### Admin Dashboard Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| **Framework** | Separate Next.js app OR Django admin + charts | Isolated from customer frontend |
| **Auth** | Staff-only Django session or separate Clerk org | Never accessible to customers |
| **Data** | Direct DB queries on `TeamApiUsage`, `TeamSubscription` | Real-time, no ETL needed initially |
| **Charts** | Recharts or Chart.js | Lightweight, SSR-compatible |
| **Hosting** | Same Render instance, different route (`/ops/`) | Cost-efficient, single deploy |
| **Alerts** | Slack webhook + email for critical thresholds | Budget overruns, trial conversions |

---

## 14. Telemetry: What Gets Tracked

### Per LLM Call Record (`TeamApiUsage`)

```python
{
    team_id, user_id,
    operation: "chat_ask" | "chat_agent" | "ingest_decompose" | ...,
    model_used: "gpt-4.1-nano" | "gpt-4o-mini" | "gpt-4o",
    input_tokens, output_tokens,
    cost_usd: Decimal,
    latency_ms: int,
    value_score: "high" | "medium" | "low",
    billing_month: "2026-05",
    routed_by: "free_fixed" | "continuous_curve" | "enterprise_sla",
    created_at
}
```

### Queries This Enables

- "Which team is losing us money?" → `GROUP BY team, SUM(cost) > revenue × 0.40`
- "Which user is an outlier?" → `GROUP BY user, compare to team avg`
- "Which operation type burns most budget?" → `GROUP BY operation`
- "What's our blended cost per query?" → `AVG(cost) WHERE operation = 'chat_ask'`
- "Trial conversion by usage level?" → `expired trials JOIN usage → conversion rate by spend`

---

## 15. Implementation Roadmap

### Phase A — Foundation (Week 1–3)

- [ ] Create `llm_orchestrator/` Django app with models, router, orchestrator, budget, telemetry
- [ ] Implement `llm_call()` gateway in `llm_orchestrator/orchestrator.py`
- [ ] Create `TeamApiUsage` model in `llm_orchestrator/models.py`
- [ ] Add `trial_expires_at`, `grace_expires_at` to `TeamSubscription`
- [ ] Build trial auto-block + payment grace middleware in `llm_orchestrator/middleware.py`
- [ ] Wire `llm_call()` into chat, ingest, planning modules
- [ ] Update `entitlements.py` — Free tier: 3 seats, 2-month limit; grace period quotas
- [ ] Remove all Groq/local-model references, standardize GPT-4.1-nano as floor

### Phase B — Routing & Prediction (Week 4–6)

- [ ] Implement continuous cost curve in `llm_orchestrator/router.py`
- [ ] Add request value scoring per operation type
- [ ] Build predictive monthly spend forecaster in `llm_orchestrator/budget.py`
- [ ] Add early throttling triggers based on projected burn
- [ ] Monthly spend reset cron in `llm_orchestrator/tasks.py`
- [ ] Trial expiry + grace expiry daily crons in `billing/tasks.py`
- [ ] Payment failure → grace period handler (Paddle webhook integration)
- [ ] Daily email reminders for grace period teams

### Phase C — Admin Dashboard (Week 7–10)

- [ ] Set up admin app (separate Next.js or Django admin extension)
- [ ] Overview page: MRR, API cost, margin
- [ ] Per-team cost table with alerts
- [ ] Model usage pie/bar charts
- [ ] Trial management panel (extend/expire/nudge)
- [ ] Predictive spend forecast chart
- [ ] Per-user cost attribution drilldown
- [ ] System health panel (Qdrant, OpenAI, Celery, Redis)
- [ ] Slack webhook alerts for budget overruns

---

## 16. Files to Create/Modify

| File | Change | Phase |
|------|--------|-------|
| `llm_orchestrator/` | **NEW Django app** — Separate app for all LLM orchestration | A |
| `llm_orchestrator/models.py` | `TeamApiUsage`, `ModelCostConfig` | A |
| `llm_orchestrator/orchestrator.py` | Single `llm_call()` gateway | A |
| `llm_orchestrator/router.py` | Continuous curve + op-aware routing | A |
| `llm_orchestrator/budget.py` | Adaptive bands + forecast | A |
| `llm_orchestrator/telemetry.py` | Per-call cost/latency logging | A |
| `llm_orchestrator/middleware.py` | Trial expiry + payment block enforcement | A |
| `llm_orchestrator/tasks.py` | Monthly reset, forecast cron, grace expiry | B |
| `billing/models.py` | Add `trial_expires_at`, `grace_expires_at` to `TeamSubscription` | A |
| `billing/tasks.py` | Grace period expiry cron, payment failure handler | B |
| `teamos_project/llm_config.py` | Delegate to `llm_orchestrator` | A |
| `teamos_project/entitlements.py` | Free: 3 seats, 2mo limit; grace period quotas | A |
| `chat/agent_stream.py` | Use `llm_orchestrator.llm_call()` | A |
| `ingest/agent_decompose.py` | Use `llm_orchestrator.llm_call()` | A |
| `planning/agent_sync.py` | Use `llm_orchestrator.llm_call()` | A |
| `admin_api/` | **NEW Django app** — Admin dashboard backend | C |
| `admin-dashboard/` | **NEW Next.js app** — Separate monitoring frontend | C |

---

## 17. Design Principles

1. **OpenAI-only stack** — GPT-4.1-nano replaces Groq as floor model. Single provider, unified billing.
2. **Qdrant universal** — text-embedding-3-small (1536d) for all plans. Embeddings are infrastructure.
3. **LLM Orchestrator is its own app** — Not buried in `billing/`. Separate Django app with deep integration into chat, ingest, planning, admin, and frontend.
4. **Never hard-block on budget** — Budget exhaustion → nano fallback, never a paywall for active subscribers.
5. **Hard-block expired trials** — Free users get exactly 60 days. Data preserved, access revoked.
6. **Grace before block** — Paid teams get 7-day grace on payment failure (free-tier access), then full block. Data + embeddings always preserved.
7. **Smooth degradation** — Continuous cost curve, not quality cliffs.
8. **Operation-aware** — Background work runs cheap; user-facing gets premium.
9. **Predictive** — Forecast spend and throttle early.
10. **Track everything** — Every LLM call: model, tokens, cost, latency, user, operation.
11. **Admin visibility** — Separate dashboard app for platform economics, never mixed into customer UI.
12. **Adaptive margins** — 20–40% budget bands, not fixed percentages.
13. **Data is sacred** — Never delete user data, wiki, embeddings, or graph on any billing event. Always preserve for re-activation.
