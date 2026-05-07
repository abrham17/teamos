const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface ClerkSession {
  getToken?: (options?: { template?: string }) => Promise<string | null>;
}

interface ClerkGlobal {
  session?: ClerkSession;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};

  try {
    const clerk = (window as Window & { Clerk?: ClerkGlobal }).Clerk;
    if (!clerk?.session?.getToken) return {};
    const token = await clerk.session.getToken({ template: "backend" });
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Same auth as `api.*` — use for raw `fetch` (e.g. SSE chat stream). */
export async function getApiAuthHeaders(): Promise<Record<string, string>> {
  return getAuthHeader();
}

type Envelope<T = unknown> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
    details?: unknown;
  };
  meta?: Record<string, unknown>;
};

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function parseResponse(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return tryParseJson(text) ?? text;
}

function unwrapEnvelope(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as Envelope;
    return envelope.data ?? null;
  }
  return payload;
}

export function extractErrorMessage(payload: unknown) {
  if (!payload) return "Request failed.";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object" && payload !== null) {
    const maybePayload = payload as { error?: { message?: string }; detail?: string };
    if (maybePayload.error?.message) return maybePayload.error.message;
    if (maybePayload.detail) return maybePayload.detail;
  }
  return JSON.stringify(payload);
}

export const api = {
  get: async <T = unknown>(url: string): Promise<T> => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", ...authHeader },
      credentials: "include",
    });
    const payload = await parseResponse(res);
    if (!res.ok) throw new Error(extractErrorMessage(payload));
    return unwrapEnvelope(payload) as T;
  },
  post: async <T = unknown>(url: string, data: unknown): Promise<T> => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const payload = await parseResponse(res);
    if (!res.ok) throw new Error(extractErrorMessage(payload));
    return unwrapEnvelope(payload) as T;
  },
  put: async <T = unknown>(url: string, data: unknown): Promise<T> => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const payload = await parseResponse(res);
    if (!res.ok) throw new Error(extractErrorMessage(payload));
    return unwrapEnvelope(payload) as T;
  },
  patch: async <T = unknown>(url: string, data: unknown): Promise<T> => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const payload = await parseResponse(res);
    if (!res.ok) throw new Error(extractErrorMessage(payload));
    return unwrapEnvelope(payload) as T;
  },
  delete: async <T = unknown>(url: string, data?: unknown): Promise<T> => {
    const authHeader = await getAuthHeader();
    const res = await fetch(`${API_URL}${url}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    const payload = await parseResponse(res);
    if (!res.ok) throw new Error(extractErrorMessage(payload));
    return unwrapEnvelope(payload) as T;
  },
};
