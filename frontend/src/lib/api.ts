const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function getAuthHeader(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};

  try {
    const clerk = (window as any).Clerk;
    if (!clerk?.session?.getToken) return {};
    const token = await clerk.session.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export const api = {
  get: async (url: string) => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", ...authHeader },
      credentials: "include",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  post: async (url: string, data: any) => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify(data),
      credentials: "include",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  put: async (url: string, data: any) => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify(data),
      credentials: "include",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  patch: async (url: string, data: any) => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify(data),
      credentials: "include",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  delete: async (url: string, data?: any) => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    if (!res.ok) throw new Error(await res.text());
    return res.status === 204 ? null : res.json();
  },
};
