const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/admin";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const api = {
  getOverview: () => request<unknown>("/overview/"),
  getTrend: () => request<unknown>("/overview/trend/"),
  getTeams: () => request<unknown>("/teams/"),
  getTeam: (id: string) => request<unknown>(`/teams/${id}/`),
  getTopSpenders: () => request<unknown>("/users/top-spenders/"),
  getTrials: () => request<unknown>("/trials/"),
  extendTrial: (teamId: string, days: number) =>
    request<unknown>(`/trials/${teamId}/extend/`, {
      method: "POST",
      body: JSON.stringify({ days }),
    }),
  expireTrial: (teamId: string) =>
    request<unknown>(`/trials/${teamId}/expire/`, { method: "POST" }),
  getForecast: () => request<unknown>("/forecast/"),
  getOperations: () => request<unknown>("/operations/"),
  getHealth: () => request<unknown>("/health/"),
  getAlerts: () => request<unknown>("/alerts/"),
  getDelinquent: () => request<unknown>("/subscriptions/delinquent/"),
};
