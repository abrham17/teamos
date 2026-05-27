const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.team-os.tech/admin";

interface ApiResponse<T = unknown> {
  data?: T;
  [key: string]: unknown;
}

async function request<T>(
  path: string,
  options?: RequestInit & { token?: string | null }
): Promise<T> {
  const { token, ...rest } = options ?? {};
  const headers = new Headers(rest.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/api/admin${path}`, {
    credentials: "include",
    ...rest,
    headers,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json() as ApiResponse<T>;
  return (json.data ?? json) as T;
}

import type { OverviewStats, TrendPoint, Team, UserCost, TrialsResponse, ForecastStats, DelinquentTeam, OperationCost, HealthMetrics, AlertItem } from "@/types";

export const api = {
  getOverview:    (token?: string | null) => request<OverviewStats>("/stats", { token }),
  getTrend:       (token?: string | null) => request<TrendPoint[]>("/overview/trend", { token }),
  getTeams:       (token?: string | null) => request<Team[]>("/teams-usage", { token }),
  getTeam:        (id: string, token?: string | null) => request<Team>(`/teams/${id}`, { token }),
  getTopSpenders: (token?: string | null) => request<UserCost[]>("/users/top-spenders", { token }),
  getTrials:      (token?: string | null) => request<TrialsResponse>("/trials", { token }),
  extendTrial:    (teamId: string, days: number, token?: string | null) =>
    request<{ success: boolean }>(`/trials/${teamId}/extend`, { method: "POST", body: JSON.stringify({ days }), token }),
  expireTrial:    (teamId: string, token?: string | null) =>
    request<{ success: boolean }>(`/trials/${teamId}/expire`, { method: "POST", token }),
  getForecast:    (token?: string | null) => request<ForecastStats>("/forecast", { token }),
  getOperations:  (token?: string | null) => request<OperationCost[]>("/operations", { token }),
  getHealth:      (token?: string | null) => request<HealthMetrics>("/health", { token }),
  getAlerts:      (token?: string | null) => request<{ alerts: AlertItem[] }>("/alerts", { token }),
  getDelinquent:  (token?: string | null) => request<DelinquentTeam[]>("/subscriptions/delinquent", { token }),
  patchTeam:      (id: string, data: Record<string, unknown>, token?: string | null) =>
    request<Team>(`/teams/${id}/`, { method: "PATCH", body: JSON.stringify(data), token }),
};
