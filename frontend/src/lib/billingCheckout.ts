import { api } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface BillingPlanRow {
  key: string;
  name: string;
  price_label: string;
  seat_default: number;
  seat_min: number;
  seat_max: number;
  trial_days: number;
  features: string[];
}

export interface BillingPlansCatalog {
  currency: string;
  cadence: string;
  usage_tiers: Array<{ id: string; label: string; description: string }>;
  plans: BillingPlanRow[];
  disclaimer: string;
}

export interface BillingQuote {
  plan_key: string;
  seat_count: number;
  usage_tier: string;
  monthly_total_usd: number;
  monthly_total_cents: number;
  variant_key: string;
  breakdown: Array<Record<string, unknown>>;
}

export async function fetchBillingPlans(): Promise<BillingPlansCatalog> {
  const res = await fetch(`${API_URL}/billing/plans/`, { credentials: "omit" });
  if (!res.ok) throw new Error(`Failed to load plans (${res.status})`);
  const envelope = await res.json();
  const data = envelope?.data ?? envelope;
  return data as BillingPlansCatalog;
}

export async function fetchBillingQuote(params: {
  plan_key: string;
  seat_count: number;
  usage_tier: string;
}): Promise<BillingQuote> {
  const res = await fetch(`${API_URL}/billing/quote/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Quote failed (${res.status})`);
  const envelope = await res.json();
  const data = envelope?.data ?? envelope;
  return data as BillingQuote;
}

export interface CheckoutSessionResponse {
  provider?: string;
  checkout_url?: string;
  external_checkout_id?: string;
  quote?: BillingQuote;
}

export async function startTeamCheckout(
  teamId: string,
  body: {
    plan_key: string;
    seat_count: number;
    usage_tier: string;
    monthly_total_cents: number;
    success_url: string;
    cancel_url: string;
  },
): Promise<CheckoutSessionResponse> {
  return api.post<CheckoutSessionResponse>(`/billing/${teamId}/checkout-session/`, body);
}

export function billingSelectionRedirect(planKey: string, seatCount: number, usageTier: string): string {
  const q = new URLSearchParams({
    billing_plan: planKey,
    seats: String(seatCount),
    usage: usageTier,
  });
  return `/settings?${q.toString()}`;
}
