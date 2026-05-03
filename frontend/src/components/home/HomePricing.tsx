"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SignUpButton, useUser } from "@clerk/nextjs";
import { ArrowRight, Check, Loader2 } from "lucide-react";

import { api } from "@/lib/api";
import {
  billingSelectionRedirect,
  fetchBillingPlans,
  fetchBillingQuote,
  startTeamCheckout,
  type BillingPlansCatalog,
  type BillingPlanRow,
  type BillingQuote,
} from "@/lib/billingCheckout";
import { useWikiStore } from "@/stores/useWikiStore";
import { useToast } from "@/components/ui/Toast";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function PaidTierCard({
  tier,
  usageTierOptions,
  quote,
  quoteLoading,
  seats,
  usageTier,
  onSeatsChange,
  onUsageChange,
  isSignedIn,
  currentTeamId,
  onCheckout,
  checkoutBusy,
}: {
  tier: BillingPlanRow;
  usageTierOptions: BillingPlansCatalog["usage_tiers"];
  quote: BillingQuote | null;
  quoteLoading: boolean;
  seats: number;
  usageTier: string;
  onSeatsChange: (n: number) => void;
  onUsageChange: (u: string) => void;
  isSignedIn: boolean;
  currentTeamId: string | null;
  onCheckout: () => void;
  checkoutBusy: boolean;
}) {
  const redirectUrl = billingSelectionRedirect(tier.key, seats, usageTier);
  const priceLabel =
    quote && tier.key !== "free"
      ? formatUsd(quote.monthly_total_usd)
      : tier.price_label;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        tier.key === "team"
          ? "border-[var(--accent)]/50 bg-[var(--surface-1)] shadow-[0_0_0_1px_var(--accent)]/20"
          : "border-[var(--border-subtle)] bg-[var(--surface-1)]/80"
      }`}
    >
      {tier.key === "team" ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bg-950)]">
          Most teams
        </span>
      ) : null}
      <div className="text-sm font-medium text-[var(--text-muted)]">{tier.name}</div>
      <div className="mt-2 flex min-h-[2.5rem] flex-wrap items-baseline gap-2">
        {quoteLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" aria-hidden />
        ) : (
          <span className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">{priceLabel}</span>
        )}
        <span className="text-sm text-[var(--text-dim)]">/ team / month</span>
      </div>
      <p className="mt-1 text-xs text-[var(--text-dim)]">
        {tier.min_price_usd > 0 && tier.max_price_usd
          ? `Band ${formatUsd(tier.min_price_usd)} – ${formatUsd(tier.max_price_usd)} · your selection updates the quote`
          : tier.max_price_usd === null
            ? `Scales above Pro · floor from ${formatUsd(tier.min_price_usd)}`
            : null}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
          Seats
          <input
            type="range"
            min={tier.seat_min}
            max={tier.seat_max}
            value={seats}
            onChange={(e) => onSeatsChange(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <span className="font-mono text-[var(--text-secondary)]">{seats}</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
          Usage tier
          <select
            value={usageTier}
            onChange={(e) => onUsageChange(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          >
            {usageTierOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
        {tier.key === "team" && "For growing teams that live in the wiki and need steady ingest and AI throughput."}
        {tier.key === "pro" && "For orgs that need scale, compliance-friendly workflows, and hands-on help."}
        {tier.key === "enterprise" && "For larger orgs with procurement, security review, and higher limits."}
      </p>
      <ul className="mt-4 flex flex-1 flex-col gap-2.5 text-sm text-[var(--text-secondary)]">
        {tier.features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {tier.trial_days > 0 ? (
        <p className="mt-3 text-[11px] text-[var(--text-dim)]">Includes up to {tier.trial_days}-day trial on Paddle when enabled.</p>
      ) : null}
      <div className="mt-8">
        {!isSignedIn ? (
          <SignUpButton mode="modal" forceRedirectUrl={redirectUrl}>
            <button
              type="button"
              className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                tier.key === "team"
                  ? "bg-[var(--accent)] text-[var(--bg-950)] hover:opacity-90"
                  : "border border-[var(--border-subtle)] bg-[var(--bg-900)] text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
              }`}
            >
              Get started <ArrowRight className="ml-1 inline h-4 w-4 align-text-bottom" />
            </button>
          </SignUpButton>
        ) : !currentTeamId ? (
          <Link
            href="/wiki"
            className="flex w-full items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
          >
            Open app to select a team
          </Link>
        ) : (
          <button
            type="button"
            disabled={checkoutBusy || quoteLoading || !quote}
            onClick={onCheckout}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
              tier.key === "team"
                ? "bg-[var(--accent)] text-[var(--bg-950)] hover:opacity-90"
                : "border border-[var(--border-subtle)] bg-[var(--bg-900)] text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {checkoutBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Checkout in Paddle
          </button>
        )}
      </div>
    </div>
  );
}

export function HomePricing() {
  const { user, isSignedIn } = useUser();
  const currentTeamId = useWikiStore((s) => s.currentTeamId);
  const { info, error } = useToast();

  const [catalog, setCatalog] = useState<BillingPlansCatalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, { seats: number; usage: string }>>({});
  const [quotes, setQuotes] = useState<Record<string, BillingQuote | null>>({});
  const [quoteLoading, setQuoteLoading] = useState<Record<string, boolean>>({});
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const quoteTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  useEffect(() => {
    fetchBillingPlans()
      .then((c) => {
        setCatalog(c);
        const next: Record<string, { seats: number; usage: string }> = {};
        for (const p of c.plans) {
          if (p.key === "free") continue;
          next[p.key] = { seats: p.seat_default, usage: "standard" };
        }
        setPrefs(next);
      })
      .catch(() => setCatalogError(true));
  }, []);

  const runQuote = useCallback((planKey: string, seats: number, usage: string) => {
    if (planKey === "free") return;
    setQuoteLoading((m) => ({ ...m, [planKey]: true }));
    fetchBillingQuote({ plan_key: planKey, seat_count: seats, usage_tier: usage })
      .then((q) => setQuotes((m) => ({ ...m, [planKey]: q })))
      .catch(() => setQuotes((m) => ({ ...m, [planKey]: null })))
      .finally(() => setQuoteLoading((m) => ({ ...m, [planKey]: false })));
  }, []);

  useEffect(() => {
    if (!catalog) return;
    const currentTimers = quoteTimers.current;
    for (const p of catalog.plans) {
      if (p.key === "free") continue;
      const pr = prefs[p.key];
      if (!pr) continue;
      if (currentTimers[p.key]) clearTimeout(currentTimers[p.key]);
      currentTimers[p.key] = setTimeout(() => runQuote(p.key, pr.seats, pr.usage), 280);
    }
    return () => {
      for (const k of Object.keys(currentTimers)) {
        if (currentTimers[k]) clearTimeout(currentTimers[k]);
      }
    };
  }, [catalog, prefs, runQuote]);

  const paidPlans = useMemo(() => (catalog?.plans || []).filter((p) => p.key !== "free"), [catalog]);

  const handleCheckout = async (planKey: string) => {
    if (!currentTeamId) return;
    const q = quotes[planKey];
    if (!q) {
      error("Price not ready yet — adjust seats or wait a moment.");
      return;
    }
    setCheckoutBusy(planKey);
    try {
      try {
        await api.post(`/analytics/${currentTeamId}/events/upgrade-clicked/`, { surface: "home_pricing" });
      } catch {
        /* non-blocking */
      }
      const successUrl = `${window.location.origin}/settings?billing=success`;
      const cancelUrl = `${window.location.origin}/settings?billing=cancel`;
      const checkout = await startTeamCheckout(currentTeamId, {
        plan_key: planKey,
        seat_count: q.seat_count,
        usage_tier: q.usage_tier,
        monthly_total_cents: q.monthly_total_cents,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (checkout?.checkout_url) {
        window.open(checkout.checkout_url, "_blank");
        info("Opening Paddle checkout…");
      } else {
        info("Checkout response missing URL.");
      }
    } catch (e: unknown) {
      error(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setCheckoutBusy(null);
    }
  };

  const freePlan = catalog?.plans.find((p) => p.key === "free");

  return (
    <section className="mt-14 border-t border-[var(--border-subtle)] pt-14" aria-labelledby="home-pricing-heading">
      <div className="text-center">
        <h2 id="home-pricing-heading" className="text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl">
          Simple pricing for shared team memory
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          {catalog?.disclaimer ||
            "Every plan includes the same core product: collaborative wiki, knowledge graph, ingest pipeline, and citation-grounded chat."}
        </p>
        {user?.primaryEmailAddress?.emailAddress ? (
          <p className="mt-1 text-xs text-[var(--text-dim)]">Signed in as {user.primaryEmailAddress.emailAddress}</p>
        ) : null}
      </div>

      {catalogError || !catalog ? (
        <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
          {catalogError ? "Could not load live prices — refresh or try again later." : "Loading plans…"}
        </p>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-4">
          {freePlan ? (
            <div className="relative flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/80 p-6">
              <div className="text-sm font-medium text-[var(--text-muted)]">{freePlan.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">{freePlan.price_label}</span>
                <span className="text-sm text-[var(--text-dim)]">/ team / month</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                Try the full wiki-first loop with a small team. Upgrade when you outgrow limits.
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm text-[var(--text-secondary)]">
                {freePlan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <SignUpButton mode="modal">
                  <button
                    type="button"
                    className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-950)] transition-opacity hover:opacity-90"
                  >
                    Start free
                  </button>
                </SignUpButton>
              </div>
            </div>
          ) : null}

          {paidPlans.map((tier) => {
            const pr = prefs[tier.key] || { seats: tier.seat_default, usage: "standard" };
            return (
              <PaidTierCard
                key={tier.key}
                tier={tier}
                usageTierOptions={catalog.usage_tiers}
                quote={quotes[tier.key] ?? null}
                quoteLoading={!!quoteLoading[tier.key]}
                seats={pr.seats}
                usageTier={pr.usage}
                onSeatsChange={(n) => setPrefs((p) => ({ ...p, [tier.key]: { ...pr, seats: n } }))}
                onUsageChange={(u) => setPrefs((p) => ({ ...p, [tier.key]: { ...pr, usage: u } }))}
                isSignedIn={!!isSignedIn}
                currentTeamId={currentTeamId}
                onCheckout={() => handleCheckout(tier.key)}
                checkoutBusy={checkoutBusy === tier.key}
              />
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-[var(--text-dim)]">
        Totals are computed on the server from seats and usage tier; Paddle shows the final charge. After sign-in, open{" "}
        <Link href="/settings" className="text-[var(--accent)] underline-offset-2 hover:underline">
          Settings
        </Link>{" "}
        to manage billing for your team.
      </p>
    </section>
  );
}
