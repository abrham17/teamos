// ─── Overview ────────────────────────────────────────────────────────────────

export interface ModelUsage {
  model_used: string;
  total_cost: number;
  total_calls: number;
  pct: number;
}

export interface AlertItem {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  team?: string;
  created_at: string;
}

export interface TrendPoint {
  date: string;
  revenue: number;
  cost: number;
  margin: number;
}

export interface OverviewStats {
  billing_month: string;
  total_revenue: number;
  total_spend: number;
  gross_margin: number;
  margin_pct: number;
  active_subscriptions: number;
  revenue_trend: number; // percent change vs last month
  cost_trend: number;
  margin_trend: number;
  teams_trend: number;
  usage_by_model: ModelUsage[];
  trend_data: TrendPoint[];
  alerts: AlertItem[];
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  plan: "free" | "starter" | "growth" | "enterprise";
  status: "active" | "trial" | "grace_period" | "blocked";
  member_count: number;
  cost_mtd: number;
  revenue: number;
  margin_pct: number;
  calls: number;
  budget_used_pct: number;
  created_at: string;
  alert?: "margin" | "budget";
}

export interface TeamDetail extends Team {
  per_user: UserCost[];
  per_operation: OperationCost[];
  usage_by_model: ModelUsage[];
  usage_timeline: TrendPoint[];
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface UserCost {
  id: string;
  name: string;
  email: string;
  team: string;
  cost_mtd: number;
  calls: number;
  top_model: string;
  anomaly: boolean;
}

// ─── Trials ──────────────────────────────────────────────────────────────────

export interface Trial {
  id: string;
  team_id: string;
  team_name: string;
  owner_email: string;
  started_at: string;
  expires_at: string;
  days_left: number;
  status: "active" | "expiring" | "expired" | "converted";
  member_count: number;
}

export interface TrialStats {
  active: number;
  expiring_soon: number;
  expired: number;
  converted: number;
  conversion_rate: number;
}

// ─── Delinquent ──────────────────────────────────────────────────────────────

export interface DelinquentTeam {
  id: string;
  team_name: string;
  plan: string;
  status: "grace_period" | "blocked";
  revenue: number;
  grace_expires_at?: string;
  days_in_grace?: number;
  blocked_at?: string;
  failure_reason: string;
}

// ─── Forecast ────────────────────────────────────────────────────────────────

export interface ForecastPoint {
  date: string;
  actual?: number;
  projected?: number;
  upper?: number;
  lower?: number;
}

export interface ForecastStats {
  projected_month_end: number;
  budget_ceiling: number;
  burn_rate_daily: number;
  burn_trend: number;
  days_until_exhaustion: number;
  current_spend: number;
  chart_data: ForecastPoint[];
}

// ─── Operations ──────────────────────────────────────────────────────────────

export interface OperationCost {
  operation: string;
  total_cost: number;
  total_calls: number;
  avg_cost_per_call: number;
  pct_of_total: number;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "down";

export interface HealthService {
  name: string;
  status: HealthStatus;
  latency_ms?: number;
  detail?: string;
  checked_at: string;
  uptime_pct?: number;
}
