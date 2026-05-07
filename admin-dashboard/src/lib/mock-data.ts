import type {
  OverviewStats,
  Team,
  UserCost,
  Trial,
  TrialStats,
  DelinquentTeam,
  ForecastStats,
  OperationCost,
  HealthService,
} from "@/types";

// ─── Overview ────────────────────────────────────────────────────────────────

export const mockOverview: OverviewStats = {
  billing_month: "May 2026",
  total_revenue: 48_320,
  total_spend: 9_840,
  gross_margin: 38_480,
  margin_pct: 79.6,
  active_subscriptions: 143,
  revenue_trend: 12.4,
  cost_trend: -2.1,
  margin_trend: 4.8,
  teams_trend: 8,
  usage_by_model: [
    { model_used: "GPT-4o", total_cost: 5_640, total_calls: 84_200, pct: 57.3 },
    { model_used: "GPT-4o mini", total_cost: 2_910, total_calls: 312_500, pct: 29.6 },
    { model_used: "GPT-4o nano", total_cost: 820, total_calls: 540_000, pct: 8.3 },
    { model_used: "o3", total_cost: 470, total_calls: 12_800, pct: 4.8 },
  ],
  trend_data: [
    { date: "Apr 7", revenue: 38_200, cost: 8_100, margin: 78.8 },
    { date: "Apr 10", revenue: 39_500, cost: 8_400, margin: 78.7 },
    { date: "Apr 13", revenue: 40_100, cost: 8_600, margin: 78.6 },
    { date: "Apr 16", revenue: 41_300, cost: 8_900, margin: 78.5 },
    { date: "Apr 19", revenue: 42_800, cost: 9_100, margin: 78.7 },
    { date: "Apr 22", revenue: 43_900, cost: 9_300, margin: 78.8 },
    { date: "Apr 25", revenue: 44_700, cost: 9_500, margin: 78.7 },
    { date: "Apr 28", revenue: 45_600, cost: 9_600, margin: 78.9 },
    { date: "May 1", revenue: 46_200, cost: 9_700, margin: 79.0 },
    { date: "May 4", revenue: 47_100, cost: 9_750, margin: 79.3 },
    { date: "May 7", revenue: 48_320, cost: 9_840, margin: 79.6 },
  ],
  alerts: [
    { id: "1", severity: "critical", message: "Acme Corp exceeded 95% of $2K budget ceiling", team: "Acme Corp", created_at: "2026-05-07T06:12:00Z" },
    { id: "2", severity: "warning", message: "3 trials expiring within 24 hours", created_at: "2026-05-07T05:30:00Z" },
    { id: "3", severity: "warning", message: "Globex Inc margin dropped below 50% threshold", team: "Globex Inc", created_at: "2026-05-07T04:45:00Z" },
    { id: "4", severity: "info", message: "Initech converted from trial → growth plan", team: "Initech", created_at: "2026-05-07T03:00:00Z" },
    { id: "5", severity: "critical", message: "Qdrant latency spike detected (p95: 840ms)", created_at: "2026-05-06T22:10:00Z" },
  ],
};

// ─── Teams ───────────────────────────────────────────────────────────────────

export const mockTeams: Team[] = [
  { id: "1", name: "Acme Corp", plan: "enterprise", status: "active", member_count: 48, cost_mtd: 1_940, revenue: 3_200, margin_pct: 39.4, calls: 284_000, budget_used_pct: 96.5, created_at: "2024-02-12", alert: "margin" },
  { id: "2", name: "Globex Inc", plan: "growth", status: "active", member_count: 22, cost_mtd: 820, revenue: 1_600, margin_pct: 48.8, calls: 112_000, budget_used_pct: 82.0, created_at: "2024-05-03", alert: "budget" },
  { id: "3", name: "Initech", plan: "growth", status: "active", member_count: 15, cost_mtd: 540, revenue: 1_200, margin_pct: 55.0, calls: 78_000, budget_used_pct: 54.0, created_at: "2025-01-18" },
  { id: "4", name: "Umbrella Ltd", plan: "enterprise", status: "active", member_count: 120, cost_mtd: 2_400, revenue: 8_000, margin_pct: 70.0, calls: 540_000, budget_used_pct: 60.0, created_at: "2024-07-22" },
  { id: "5", name: "Soylent Media", plan: "starter", status: "active", member_count: 8, cost_mtd: 180, revenue: 490, margin_pct: 63.3, calls: 28_000, budget_used_pct: 36.0, created_at: "2025-03-07" },
  { id: "6", name: "Stark Industries", plan: "enterprise", status: "active", member_count: 87, cost_mtd: 1_820, revenue: 6_400, margin_pct: 71.6, calls: 420_000, budget_used_pct: 45.5, created_at: "2024-09-14" },
  { id: "7", name: "Wayne Enterprises", plan: "growth", status: "trial", member_count: 12, cost_mtd: 290, revenue: 0, margin_pct: 0, calls: 42_000, budget_used_pct: 29.0, created_at: "2026-04-28" },
  { id: "8", name: "Oscorp", plan: "starter", status: "grace_period", member_count: 5, cost_mtd: 95, revenue: 490, margin_pct: 80.6, calls: 14_000, budget_used_pct: 19.0, created_at: "2025-08-11" },
  { id: "9", name: "Massive Dynamic", plan: "growth", status: "active", member_count: 34, cost_mtd: 710, revenue: 1_600, margin_pct: 55.6, calls: 98_000, budget_used_pct: 71.0, created_at: "2025-02-19" },
  { id: "10", name: "Cyberdyne Systems", plan: "enterprise", status: "active", member_count: 65, cost_mtd: 1_340, revenue: 4_800, margin_pct: 72.1, calls: 310_000, budget_used_pct: 33.5, created_at: "2024-11-03" },
];

// ─── Users ───────────────────────────────────────────────────────────────────

export const mockUsers: UserCost[] = [
  { id: "u1", name: "Alice Chen", email: "alice@acmecorp.com", team: "Acme Corp", cost_mtd: 312, calls: 48_200, top_model: "GPT-4o", anomaly: true },
  { id: "u2", name: "Bob Martinez", email: "bob@umbrella.com", team: "Umbrella Ltd", cost_mtd: 278, calls: 62_000, top_model: "GPT-4o", anomaly: false },
  { id: "u3", name: "Carol Singh", email: "carol@stark.io", team: "Stark Industries", cost_mtd: 241, calls: 54_100, top_model: "GPT-4o mini", anomaly: false },
  { id: "u4", name: "David Park", email: "david@acmecorp.com", team: "Acme Corp", cost_mtd: 198, calls: 32_800, top_model: "GPT-4o", anomaly: true },
  { id: "u5", name: "Eva Torres", email: "eva@cyberdyne.ai", team: "Cyberdyne Systems", cost_mtd: 187, calls: 41_200, top_model: "GPT-4o mini", anomaly: false },
  { id: "u6", name: "Frank Liu", email: "frank@globex.com", team: "Globex Inc", cost_mtd: 164, calls: 28_900, top_model: "GPT-4o", anomaly: false },
  { id: "u7", name: "Grace Kim", email: "grace@massive.co", team: "Massive Dynamic", cost_mtd: 143, calls: 22_400, top_model: "o3", anomaly: false },
  { id: "u8", name: "Henry Walsh", email: "henry@stark.io", team: "Stark Industries", cost_mtd: 132, calls: 18_700, top_model: "GPT-4o mini", anomaly: false },
  { id: "u9", name: "Irene Zhao", email: "irene@initech.co", team: "Initech", cost_mtd: 118, calls: 16_100, top_model: "GPT-4o nano", anomaly: false },
  { id: "u10", name: "James Okafor", email: "james@cyberdyne.ai", team: "Cyberdyne Systems", cost_mtd: 109, calls: 14_200, top_model: "GPT-4o mini", anomaly: false },
];

// ─── Trials ──────────────────────────────────────────────────────────────────

export const mockTrialStats: TrialStats = {
  active: 24,
  expiring_soon: 7,
  expired: 58,
  converted: 31,
  conversion_rate: 53.4,
};

export const mockTrials: Trial[] = [
  { id: "t1", team_id: "7", team_name: "Wayne Enterprises", owner_email: "bruce@wayne.vc", started_at: "2026-04-21", expires_at: "2026-05-21", days_left: 14, status: "active", member_count: 12 },
  { id: "t2", team_id: "t2", team_name: "Daily Planet", owner_email: "clark@dailyplanet.com", started_at: "2026-04-22", expires_at: "2026-05-08", days_left: 1, status: "expiring", member_count: 6 },
  { id: "t3", team_id: "t3", team_name: "Lexcorp AI", owner_email: "lex@lexcorp.io", started_at: "2026-04-20", expires_at: "2026-05-08", days_left: 1, status: "expiring", member_count: 3 },
  { id: "t4", team_id: "t4", team_name: "S.H.I.E.L.D.", owner_email: "fury@shield.gov", started_at: "2026-04-18", expires_at: "2026-05-09", days_left: 2, status: "expiring", member_count: 24 },
  { id: "t5", team_id: "t5", team_name: "Pied Piper", owner_email: "richard@piedpiper.io", started_at: "2026-04-10", expires_at: "2026-05-10", days_left: 3, status: "expiring", member_count: 8 },
  { id: "t6", team_id: "t6", team_name: "Hooli", owner_email: "gavin@hooli.com", started_at: "2026-03-15", expires_at: "2026-04-14", days_left: 0, status: "expired", member_count: 15 },
  { id: "t7", team_id: "t7", team_name: "Aviato", owner_email: "erlich@aviato.vc", started_at: "2026-03-20", expires_at: "2026-04-19", days_left: 0, status: "converted", member_count: 4 },
  { id: "t8", team_id: "t8", team_name: "Raviga Capital", owner_email: "peter@raviga.com", started_at: "2026-04-25", expires_at: "2026-05-25", days_left: 18, status: "active", member_count: 2 },
];

// ─── Delinquent ──────────────────────────────────────────────────────────────

export const mockDelinquent: DelinquentTeam[] = [
  { id: "d1", team_name: "Oscorp", plan: "starter", status: "grace_period", revenue: 490, grace_expires_at: "2026-05-12", days_in_grace: 4, failure_reason: "Card declined — insufficient funds" },
  { id: "d2", team_name: "Weyland Corp", plan: "growth", status: "grace_period", revenue: 1_600, grace_expires_at: "2026-05-10", days_in_grace: 6, failure_reason: "Expired card on file" },
  { id: "d3", team_name: "Veridian Dynamics", plan: "growth", status: "grace_period", revenue: 1_600, grace_expires_at: "2026-05-14", days_in_grace: 2, failure_reason: "Stripe webhook failure" },
  { id: "d4", team_name: "Tyrell Corp", plan: "enterprise", status: "blocked", revenue: 4_800, blocked_at: "2026-05-01", failure_reason: "Grace period expired — no payment" },
  { id: "d5", team_name: "Buy n Large", plan: "starter", status: "blocked", revenue: 490, blocked_at: "2026-04-28", failure_reason: "Chargeback initiated" },
];

// ─── Forecast ────────────────────────────────────────────────────────────────

export const mockForecast: ForecastStats = {
  projected_month_end: 14_800,
  budget_ceiling: 18_000,
  burn_rate_daily: 492,
  burn_trend: 3.2,
  days_until_exhaustion: 16,
  current_spend: 9_840,
  chart_data: [
    { date: "May 1", actual: 1_380 },
    { date: "May 2", actual: 2_820 },
    { date: "May 3", actual: 4_200 },
    { date: "May 4", actual: 5_610 },
    { date: "May 5", actual: 7_080 },
    { date: "May 6", actual: 8_420 },
    { date: "May 7", actual: 9_840 },
    { date: "May 8", projected: 10_330, upper: 10_950, lower: 9_710 },
    { date: "May 9", projected: 10_820, upper: 11_600, lower: 10_040 },
    { date: "May 10", projected: 11_310, upper: 12_250, lower: 10_370 },
    { date: "May 12", projected: 12_290, upper: 13_540, lower: 11_040 },
    { date: "May 15", projected: 13_760, upper: 15_490, lower: 12_030 },
    { date: "May 18", projected: 14_800, upper: 16_800, lower: 12_800 },
    { date: "May 21", projected: 15_350, upper: 17_600, lower: 13_100 },
    { date: "May 24", projected: 16_100, upper: 18_400, lower: 13_800 },
    { date: "May 27", projected: 16_820, upper: 19_200, lower: 14_440 },
    { date: "May 30", projected: 17_540, upper: 20_100, lower: 14_980 },
    { date: "May 31", projected: 18_000, upper: 20_800, lower: 15_200 },
  ],
};

// ─── Operations ──────────────────────────────────────────────────────────────

export const mockOperations: OperationCost[] = [
  { operation: "Chat (GPT-4o)", total_cost: 4_120, total_calls: 62_000, avg_cost_per_call: 0.0665, pct_of_total: 41.9 },
  { operation: "Ingest & Embed", total_cost: 2_340, total_calls: 184_000, avg_cost_per_call: 0.0127, pct_of_total: 23.8 },
  { operation: "Wiki Generation", total_cost: 1_480, total_calls: 28_400, avg_cost_per_call: 0.0521, pct_of_total: 15.0 },
  { operation: "Planning (Agent)", total_cost: 980, total_calls: 9_200, avg_cost_per_call: 0.1065, pct_of_total: 10.0 },
  { operation: "Graph Analysis", total_cost: 560, total_calls: 18_700, avg_cost_per_call: 0.0299, pct_of_total: 5.7 },
  { operation: "Semantic Search", total_cost: 360, total_calls: 124_000, avg_cost_per_call: 0.0029, pct_of_total: 3.6 },
];

// ─── Health ──────────────────────────────────────────────────────────────────

export const mockHealth: HealthService[] = [
  { name: "PostgreSQL", status: "healthy", latency_ms: 4, detail: "42 active connections / 200 max", checked_at: new Date(Date.now() - 8_000).toISOString(), uptime_pct: 99.99 },
  { name: "Redis", status: "healthy", latency_ms: 1, detail: "Memory: 312 MB / 2 GB", checked_at: new Date(Date.now() - 8_000).toISOString(), uptime_pct: 100 },
  { name: "Qdrant", status: "degraded", latency_ms: 840, detail: "p95 latency spike — 2.1M vectors indexed", checked_at: new Date(Date.now() - 8_000).toISOString(), uptime_pct: 98.4 },
  { name: "OpenAI API", status: "healthy", latency_ms: 210, detail: "Embedding test passed — rate limit OK", checked_at: new Date(Date.now() - 8_000).toISOString(), uptime_pct: 99.8 },
  { name: "Celery Workers", status: "healthy", latency_ms: undefined, detail: "4 workers active — queue depth: 12", checked_at: new Date(Date.now() - 8_000).toISOString(), uptime_pct: 99.5 },
];
