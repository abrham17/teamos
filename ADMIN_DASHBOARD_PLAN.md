# TeamOS Admin Dashboard — Architecture & Build Plan

> **Purpose:** Platform-wide cost monitoring, trial management, and system health — completely separate from the customer frontend.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT LAYOUT                            │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │  Frontend    │   │  Admin       │   │  Backend         │   │
│  │  (Next.js)   │   │  Dashboard   │   │  (Django)        │   │
│  │  team-os.tech│   │  (Next.js)   │   │  api.team-os.tech│   │
│  │              │   │  ops.team-   │   │                  │   │
│  │  Customer    │   │  os.tech     │   │  ┌────────────┐  │   │
│  │  facing UI   │   │              │   │  │ accounts   │  │   │
│  │              │   │  Staff-only  │   │  │ billing    │  │   │
│  │              │   │  ops UI      │   │  │ chat       │  │   │
│  └──────┬───────┘   └──────┬───────┘   │  │ ingest     │  │   │
│         │                  │           │  │ planning   │  │   │
│         │    REST/SSE      │   REST    │  │ wiki       │  │   │
│         └────────┬─────────┘           │  │ graph_eng  │  │   │
│                  │                     │  │ llm_orch   │  │   │
│                  └─────────────────────▶  └────────────┘  │   │
│                                        │                  │   │
│                                        │  ┌────────────┐  │   │
│                                        │  │  Qdrant    │  │   │
│                                        │  │  Redis     │  │   │
│                                        │  │  Postgres  │  │   │
│                                        │  └────────────┘  │   │
│                                        └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| **Separate app** | Yes — own Next.js project | Never expose admin routes to customers |
| **Domain** | `ops.team-os.tech` | Clear separation |
| **Auth** | Django staff session + CORS | Reuse existing Django auth, `is_staff=True` |
| **Data source** | Direct Django REST API (`/api/admin/`) | No ETL, real-time data from same DB |
| **Hosting** | Render — separate static site | Cost-efficient, isolated deploy |

---

## 2. Backend: Admin API Endpoints

All endpoints require `is_staff=True`. Served from the existing Django backend under `/api/admin/`.

### 2.1 New Django App: `admin_api/`

```
backend/admin_api/
├── __init__.py
├── apps.py
├── urls.py
├── views/
│   ├── __init__.py
│   ├── overview.py        # Platform P&L
│   ├── teams.py           # Per-team economics
│   ├── users.py           # Per-user cost attribution
│   ├── models_usage.py    # Model split analytics
│   ├── trials.py          # Trial lifecycle management
│   ├── forecast.py        # Predictive spend
│   ├── operations.py      # Per-operation cost breakdown
│   └── health.py          # System health checks
├── serializers.py
└── permissions.py         # IsStaffUser permission class
```

### 2.2 API Endpoints

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/api/admin/overview/` | GET | MRR, total API cost, margin %, trends |
| `/api/admin/overview/trend/` | GET | Daily/weekly cost + revenue time series |
| `/api/admin/teams/` | GET | All teams with revenue, cost, margin, alerts |
| `/api/admin/teams/:id/` | GET | Single team deep-dive |
| `/api/admin/teams/:id/usage/` | GET | Team's per-operation cost breakdown |
| `/api/admin/users/top-spenders/` | GET | Top N users by cost |
| `/api/admin/users/:id/usage/` | GET | User's operation + model breakdown |
| `/api/admin/models/usage/` | GET | GPT-4o vs mini vs nano split (volume + cost) |
| `/api/admin/trials/` | GET | Active, expiring, expired, converted |
| `/api/admin/trials/:team_id/extend/` | POST | Extend trial by N days |
| `/api/admin/trials/:team_id/expire/` | POST | Force-expire a trial |
| `/api/admin/forecast/` | GET | Projected month-end spend + burn rate |
| `/api/admin/operations/` | GET | Cost by operation type (chat, ingest, plan) |
| `/api/admin/health/` | GET | Qdrant, OpenAI, Celery, Redis, DB status |
| `/api/admin/alerts/` | GET | Active budget warnings, anomalies |
| `/api/admin/subscriptions/delinquent/` | GET | Teams in grace period or blocked |

### 2.3 Data Sources (No New Tables — Aggregates Existing)

| Admin Query | Data Source |
|-------------|-------------|
| MRR | `TeamSubscription` → `SUM(revenue)` by active status |
| API Cost | `TeamApiUsage` → `SUM(cost_usd)` by billing_month |
| Per-team cost | `TeamApiUsage` → `GROUP BY team_id` |
| Per-user cost | `TeamApiUsage` → `GROUP BY user_id` |
| Model split | `TeamApiUsage` → `GROUP BY model_used` |
| Trial status | `TeamSubscription` → filter by `trial_expires_at` |
| Operations | `TeamApiUsage` → `GROUP BY operation` |
| Forecast | `TeamApiUsage` → rolling average × remaining days |
| Health | Direct pings to Qdrant, Redis, Celery, OpenAI |

---

## 3. Frontend: Admin Dashboard Pages

### 3.1 Tech Stack

| Component | Choice |
|-----------|--------|
| Framework | **Next.js 15** (App Router) |
| Styling | **Vanilla CSS** with CSS variables (dark theme) |
| Charts | **Recharts** (lightweight, SSR-compatible) |
| Tables | Custom components with sort/filter |
| Auth | Session cookie from Django (`withCredentials: true`) |
| State | React Query for server state |

### 3.2 Page Structure

```
admin-dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Dark sidebar layout
│   │   ├── page.tsx            # Overview / P&L
│   │   ├── teams/
│   │   │   ├── page.tsx        # Team list with economics
│   │   │   └── [id]/page.tsx   # Team deep-dive
│   │   ├── users/
│   │   │   ├── page.tsx        # Top spenders
│   │   │   └── [id]/page.tsx   # User drill-down
│   │   ├── models/
│   │   │   └── page.tsx        # Model usage analytics
│   │   ├── trials/
│   │   │   └── page.tsx        # Trial management
│   │   ├── forecast/
│   │   │   └── page.tsx        # Predictive spend
│   │   ├── operations/
│   │   │   └── page.tsx        # Per-operation costs
│   │   └── health/
│   │       └── page.tsx        # System health
│   ├── components/
│   │   ├── Sidebar.tsx         # Navigation
│   │   ├── StatCard.tsx        # KPI cards
│   │   ├── CostChart.tsx       # Line/area charts
│   │   ├── PieBreakdown.tsx    # Model split pie
│   │   ├── TeamTable.tsx       # Sortable team table
│   │   ├── AlertBanner.tsx     # Warning banners
│   │   └── HealthIndicator.tsx # Green/yellow/red dots
│   └── lib/
│       ├── api.ts              # Fetch wrapper for admin API
│       └── formatters.ts       # Currency, percentage formatters
```

### 3.3 Page Specifications

#### Page 1: Overview (Home)

| Component | Data | Visual |
|-----------|------|--------|
| MRR card | Total monthly revenue | Big number + trend arrow |
| API Cost card | Total monthly API spend | Big number + trend arrow |
| Margin card | Gross margin % | Big number, color-coded |
| Active teams card | Count by plan | Stacked bar |
| Trend chart | 30-day revenue vs cost | Dual-line area chart |
| Alert feed | Top 5 active alerts | List with severity colors |

#### Page 2: Teams

| Column | Source |
|--------|--------|
| Team name | `Team.name` |
| Plan | `TeamSubscription.plan_key` |
| Status | active / grace_period / blocked / trial |
| Revenue | From `compute_quote()` |
| API Cost (MTD) | `SUM(TeamApiUsage.cost_usd)` this month |
| Margin % | `(revenue - cost) / revenue` |
| Budget phase | Current spend ratio vs band |
| ⚠️ Alert | If margin < 50% or budget > 85% |

Click → Team deep-dive: per-user breakdown, per-operation breakdown, model split, usage timeline.

#### Page 3: Trial Management

| Component | Function |
|-----------|----------|
| Active trials count | Filter: `plan=free, trial_expires_at > now` |
| Expiring < 7 days | Highlight for nudge campaigns |
| Expired (data held) | Count of blocked trials |
| Conversion rate | `converted / total_expired × 100` |
| **Actions** | Extend trial (+7/14/30 days), Force expire, Send upgrade email |

#### Page 4: Delinquent Subscriptions

| Component | Function |
|-----------|----------|
| Grace period teams | Paid teams that failed payment, in 7-day grace |
| Blocked teams | Grace expired, fully blocked |
| Revenue at risk | Sum of MRR from grace-period teams |
| **Actions** | Extend grace, Force block, Manual payment override |

#### Page 5: Forecast

| Component | Visual |
|-----------|--------|
| Projected month-end cost | Big number vs budget ceiling |
| Burn rate | $/day with trend direction |
| Days until budget exhaustion | Countdown |
| Actual vs projected chart | Line chart, shaded confidence band |

#### Page 6: System Health

| Check | Method | Display |
|-------|--------|---------|
| Qdrant | HTTP health endpoint | ✅/❌ + vector count + storage |
| OpenAI API | Test embedding call | ✅/❌ + latency p95 |
| Celery | Inspect active workers | ✅/❌ + queue depth |
| Redis | `PING` | ✅/❌ + memory usage |
| PostgreSQL | `SELECT 1` | ✅/❌ + connection count |

---

## 4. Sync: How Admin Dashboard Stays Real-Time

### 4.1 Data Flow

```
User action (chat/ingest/plan)
    │
    ▼
LLM Orchestrator (billing/llm_orchestrator.py)
    │
    ├── Makes LLM call to OpenAI
    ├── Records TeamApiUsage row (team, user, op, model, tokens, cost)
    └── Returns response to calling module
    
Admin Dashboard
    │
    ├── Polls /api/admin/* endpoints every 30s (overview page)
    ├── On-demand refresh for deep-dive pages
    └── WebSocket (optional future) for real-time alerts
```

### 4.2 No ETL Pipeline Needed

The admin dashboard reads **directly from the same database** the backend writes to:

- `TeamApiUsage` — written by LLM orchestrator on every call
- `TeamSubscription` — written by billing webhooks
- `ChatTokenUsage` — written by chat views
- `IngestJob` — written by ingest pipeline

No data warehouse, no Kafka, no batch jobs. Simple `GROUP BY` queries with date filters.

### 4.3 Caching Strategy

| Query | Cache TTL | Why |
|-------|-----------|-----|
| Overview stats | 60 seconds | Acceptable staleness for KPIs |
| Team list | 30 seconds | Admin needs fresh data |
| Forecast | 5 minutes | Projection doesn't change fast |
| Health checks | 15 seconds | Need near-real-time |
| Trial counts | 2 minutes | Changes infrequently |

Use Django `cache` (Redis) for all admin aggregations.

### 4.4 Alert System

```
Celery beat schedule (every 5 minutes):
    │
    ├── Check teams approaching budget ceiling (>85%)
    │   → Create alert record + Slack webhook
    │
    ├── Check trials expiring in <48 hours
    │   → Create alert + optional email to team owner
    │
    ├── Check delinquent subscriptions entering grace period
    │   → Create alert + Slack webhook
    │
    ├── Check per-user anomalies (>3× team average spend)
    │   → Create alert record
    │
    └── Check system health (Qdrant, OpenAI, Redis)
        → Alert on degradation
```

---

## 5. Implementation Plan

### Phase C.1 — Backend Admin API (Week 7–8)

- [ ] Create `admin_api/` Django app
- [ ] `IsStaffUser` permission class
- [ ] Overview endpoint (MRR, cost, margin aggregations)
- [ ] Teams list + detail endpoints
- [ ] Trial management endpoints (list, extend, expire)
- [ ] Delinquent subscription endpoints
- [ ] Health check endpoint (Qdrant, Redis, Celery, OpenAI pings)
- [ ] Wire URLs into `teamos_project/urls.py`

### Phase C.2 — Frontend Dashboard (Week 8–9)

- [ ] Initialize separate Next.js app in `admin-dashboard/`
- [ ] Dark theme layout with sidebar navigation
- [ ] Overview page with stat cards + trend chart
- [ ] Teams table with sort, filter, margin alerts
- [ ] Trial management page with action buttons
- [ ] Delinquent subscriptions page
- [ ] System health page with live indicators

### Phase C.3 — Analytics & Alerts (Week 9–10)

- [ ] Model usage analytics page (pie + bar charts)
- [ ] Per-user cost attribution page
- [ ] Forecast page with projected vs budget chart
- [ ] Per-operation cost breakdown page
- [ ] Celery beat alert tasks (budget, trials, anomalies, health)
- [ ] Slack webhook integration for critical alerts
- [ ] Deploy to Render as separate static site

---

## 6. Files to Create

### Backend (`admin_api/`)

| File | Purpose |
|------|---------|
| `admin_api/__init__.py` | App init |
| `admin_api/apps.py` | Django app config |
| `admin_api/urls.py` | Admin route definitions |
| `admin_api/permissions.py` | `IsStaffUser` permission |
| `admin_api/views/overview.py` | P&L aggregations |
| `admin_api/views/teams.py` | Per-team economics |
| `admin_api/views/users.py` | Per-user attribution |
| `admin_api/views/trials.py` | Trial lifecycle CRUD |
| `admin_api/views/forecast.py` | Predictive spend |
| `admin_api/views/health.py` | System status pings |
| `admin_api/views/alerts.py` | Active alerts |
| `admin_api/tasks.py` | Celery beat alert checks |

### Frontend (`admin-dashboard/`)

| File | Purpose |
|------|---------|
| `admin-dashboard/src/app/layout.tsx` | Dark sidebar shell |
| `admin-dashboard/src/app/page.tsx` | Overview / home |
| `admin-dashboard/src/app/teams/page.tsx` | Team economics list |
| `admin-dashboard/src/app/trials/page.tsx` | Trial management |
| `admin-dashboard/src/app/forecast/page.tsx` | Spend forecast |
| `admin-dashboard/src/app/health/page.tsx` | System health |
| `admin-dashboard/src/lib/api.ts` | Admin API client |
| `admin-dashboard/src/components/Sidebar.tsx` | Navigation |
| `admin-dashboard/src/components/StatCard.tsx` | KPI display |
| `admin-dashboard/src/components/CostChart.tsx` | Recharts wrapper |
