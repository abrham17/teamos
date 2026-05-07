"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SignUpButton, useUser } from "@clerk/nextjs";
import { ArrowRight, Check, Loader2, Sparkles, Zap, Shield, Globe } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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

  const isPro = tier.key === "pro" || tier.key === "enterprise";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`relative flex flex-col rounded-3xl border p-8 transition-all duration-500 group ${
        tier.key === "team"
          ? "border-[var(--accent)]/50 bg-[var(--bg-800)] shadow-[0_0_40px_rgba(0,212,232,0.1)] scale-105 z-10"
          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10"
      }`}
    >
      {tier.key === "team" && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[var(--accent)] to-blue-500 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--bg-950)] shadow-lg">
          Most Popular
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
          {tier.name}
        </div>
        {tier.key === "enterprise" ? <Globe className="w-5 h-5 text-purple-400" /> : tier.key === "pro" ? <Shield className="w-5 h-5 text-amber-400" /> : <Zap className="w-5 h-5 text-[var(--accent)]" />}
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <AnimatePresence mode="wait">
            <motion.span 
              key={priceLabel}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-5xl font-black tracking-tighter text-[var(--text-primary)]"
            >
              {quoteLoading ? "..." : priceLabel}
            </motion.span>
          </AnimatePresence>
          <span className="text-sm font-medium text-[var(--text-dim)] uppercase tracking-widest">/ month</span>
        </div>
        <p className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest">
           Per Team · Scalable
        </p>
      </div>

      <div className="mt-8 space-y-6 flex-1">
         <div className="space-y-4">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
               <span>Seats</span>
               <span className="text-[var(--accent)]">{seats}</span>
            </div>
            <input
              type="range"
              min={tier.seat_min}
              max={tier.seat_max}
              value={seats}
              onChange={(e) => onSeatsChange(Number(e.target.value))}
              className="w-full accent-[var(--accent)] h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer"
            />
         </div>

         <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">AI Performance</label>
            <select
              value={usageTier}
              onChange={(e) => onUsageChange(e.target.value)}
              className="w-full rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
            >
              {usageTierOptions.map((u) => (
                <option key={u.id} value={u.id} className="bg-[var(--bg-900)]">
                  {u.label}
                </option>
              ))}
            </select>
         </div>

         <ul className="space-y-3 pt-4">
            {tier.features.map((f) => (
              <li key={f} className="flex gap-3 text-sm text-[var(--text-secondary)]">
                <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10">
                  <Check className="h-2.5 w-2.5 text-[var(--accent)]" />
                </div>
                <span className="leading-tight">{f}</span>
              </li>
            ))}
         </ul>
      </div>

      <div className="mt-10">
        {!isSignedIn ? (
          <SignUpButton mode="modal" forceRedirectUrl={redirectUrl}>
            <button
              type="button"
              className={`group/btn relative w-full overflow-hidden rounded-2xl py-4 text-sm font-black uppercase tracking-widest transition-all ${
                tier.key === "team"
                  ? "bg-[var(--accent)] text-[var(--bg-950)] hover:shadow-[0_0_30px_rgba(0,212,232,0.4)]"
                  : "bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                Start Trial <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </span>
            </button>
          </SignUpButton>
        ) : !currentTeamId ? (
          <Link
            href="/wiki"
            className="flex w-full items-center justify-center rounded-2xl bg-white/5 py-4 text-sm font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all"
          >
            Open Workspace
          </Link>
        ) : (
          <button
            type="button"
            disabled={checkoutBusy || quoteLoading || !quote}
            onClick={onCheckout}
            className={`group/btn relative w-full overflow-hidden rounded-2xl py-4 text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
              tier.key === "team"
                ? "bg-[var(--accent)] text-[var(--bg-950)] hover:shadow-[0_0_30px_rgba(0,212,232,0.4)]"
                : "bg-white/5 text-white hover:bg-white/10"
            }`}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {checkoutBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {checkoutBusy ? "Processing..." : "Checkout via Paddle"}
            </span>
          </button>
        )}
      </div>
    </motion.div>
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
    <section className="relative py-20 px-6" aria-labelledby="home-pricing-heading">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="text-center mb-16 space-y-4">
          <motion.span 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            className="text-[var(--accent)] font-mono text-[10px] tracking-[0.5em] uppercase font-bold"
          >
            BILLING_ENGINE_v2.0
          </motion.span>
          <h2 id="home-pricing-heading" className="text-6xl md:text-7xl font-black uppercase tracking-tighter italic text-gradient leading-[0.85]">
            Scale your <br/> memory.
          </h2>
          <p className="max-w-2xl mx-auto text-slate-400 text-lg">
            {catalog?.disclaimer ||
              "Transparent, usage-aware pricing designed for teams that move fast and think deep."}
          </p>
        </div>

        {catalogError || !catalog ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-3xl border border-white/5">
             <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mb-4" />
             <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">
               Synchronizing live prices...
             </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-4 items-start">
            {freePlan && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="flex flex-col rounded-3xl border border-white/5 bg-white/[0.01] p-8 hover:bg-white/[0.02] transition-all"
              >
                <div className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-6">
                  {freePlan.name}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-black tracking-tighter text-[var(--text-primary)]">{freePlan.price_label}</span>
                  <span className="text-xs font-medium text-[var(--text-dim)] uppercase tracking-widest">/ forever</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-8 leading-relaxed">
                  The perfect starting point for small teams architecting their first knowledge graph.
                </p>
                <ul className="space-y-3 flex-1">
                  {freePlan.features.map((f) => (
                    <li key={f} className="flex gap-3 text-sm text-[var(--text-muted)]">
                      <Check className="mt-1 h-3.5 w-3.5 text-slate-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-10">
                  <SignUpButton mode="modal">
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-white/10 py-4 text-sm font-black uppercase tracking-widest text-white hover:bg-white/5 transition-all"
                    >
                      Get Started
                    </button>
                  </SignUpButton>
                </div>
              </motion.div>
            )}

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

        <div className="mt-20 flex flex-col md:flex-row items-center justify-between gap-8 p-8 rounded-3xl bg-white/[0.02] border border-white/5">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                 <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                 <h4 className="font-bold text-white uppercase tracking-tight">Enterprise Security</h4>
                 <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">SOC2 // GDPR // ISO 27001 Ready</p>
              </div>
           </div>
           <div className="flex gap-4">
              <Link href="/settings" className="text-xs font-black uppercase tracking-[0.3em] text-[var(--accent)] hover:underline">
                Manage Billing
              </Link>
              <span className="text-slate-700">|</span>
              <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">
                Powered by Paddle
              </span>
           </div>
        </div>
      </div>
    </section>
  );
}
