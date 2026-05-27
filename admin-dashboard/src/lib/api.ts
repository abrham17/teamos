const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.team-os.tech";

async function request<T>(
  path: string,
  options?: RequestInit & { token?: string | null }
): Promise<T> {
  const { token, ...rest } = options ?? {};
  const headers = new Headers(rest.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...rest,
    headers,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const api = {
  getOverview:    (token?: string | null) => request<any>("/stats/", { token }),
  getTrend:       (token?: string | null) => request<any>("/overview/trend/", { token }),
  getTeams:       (token?: string | null) => request<any[]>("/teams-usage/", { token }),
  getTeam:        (id: string, token?: string | null) => request<any>(`/teams/${id}/`, { token }),
  getTopSpenders: (token?: string | null) => request<any>("/users/top-spenders/", { token }),
  getTrials:      (token?: string | null) => request<any>("/trials/", { token }),
  extendTrial:    (teamId: string, days: number, token?: string | null) =>
    request<any>(`/trials/${teamId}/extend/`, { method: "POST", body: JSON.stringify({ days }), token }),
  expireTrial:    (teamId: string, token?: string | null) =>
    request<any>(`/trials/${teamId}/expire/`, { method: "POST", token }),
  getForecast:    (token?: string | null) => request<any>("/forecast/", { token }),
  getOperations:  (token?: string | null) => request<any>("/operations/", { token }),
  getHealth:      (token?: string | null) => request<any>("/health/", { token }),
  getAlerts:      (token?: string | null) => request<any>("/alerts/", { token }),
  getDelinquent:  (token?: string | null) => request<any>("/subscriptions/delinquent/", { token }),
  patchTeam:      (id: string, data: any, token?: string | null) =>
    request<any>(`/teams/${id}/`, { method: "PATCH", body: JSON.stringify(data), token }),
};
