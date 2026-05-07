"use client";

import { useEffect, useState } from "react";
import { useWikiStore } from "@/stores/useWikiStore";
import { api } from "@/lib/api";
import { fetchBillingPlans, fetchBillingQuote, startTeamCheckout, type BillingPlansCatalog, type BillingQuote } from "@/lib/billingCheckout";
import { useToast } from "@/components/ui/Toast";
import { Check, CreditCard, Loader2, Sparkles, Zap } from "lucide-react";
import { motion } from "motion/react";

interface TeamSubscription {
  plan_key: string;
  status: string;
  provider: string;
  external_subscription_id?: string;
  current_period_end?: string;
  trial_expires_at?: string;
  grace_expires_at?: string;
}

export function BillingSettings() {
  const { currentTeamId } = useWikiStore();
  const { success, info, error } = useToast();
  
  const [subscription, setSubscription] = useState<TeamSubscription | null>(null);
  const [catalog, setCatalog] = useState<BillingPlansCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<{
    plan_key: string;
    seat_count: number;
    usage_tier: string;
  }>({ plan_key: "team", seat_count: 8, usage_tier: "standard" });

  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (!currentTeamId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [subData, catData] = await Promise.all([
          api.get<TeamSubscription>(`/billing/${currentTeamId}/subscription/`),
          fetchBillingPlans()
        ]);
        setSubscription(subData);
        setCatalog(catData);
        
        // Default prefs based on current plan or team
        if (subData.plan_key !== "free") {
          setPrefs(prev => ({ ...prev, plan_key: subData.plan_key }));
        }
      } catch (e) {
        console.error("Failed to load billing data", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentTeamId]);

  useEffect(() => {
    if (!prefs.plan_key || prefs.plan_key === "free") {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const q = await fetchBillingQuote({
          plan_key: prefs.plan_key,
          seat_count: prefs.seat_count,
          usage_tier: prefs.usage_tier,
        });
        setQuote(q);
      } catch (e) {
        console.error(e);
      } finally {
        setQuoteLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [prefs]);

  const handleCheckout = async () => {
    if (!currentTeamId || !quote) return;
    setCheckoutBusy(prefs.plan_key);
    try {
      const successUrl = `${window.location.origin}/settings?billing=success`;
      const cancelUrl = `${window.location.origin}/settings?billing=cancel`;
      const checkout = await startTeamCheckout(currentTeamId, {
        plan_key: quote.plan_key,
        seat_count: quote.seat_count,
        usage_tier: quote.usage_tier,
        monthly_total_cents: quote.monthly_total_cents,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (checkout?.checkout_url) {
        window.open(checkout.checkout_url, "_blank");
        info("Opening Paddle checkout...");
      }
    } catch (e: any) {
      error(e.message || "Checkout failed");
    } finally {
      setCheckoutBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  const currentPlan = catalog?.plans.find(p => p.key === (subscription?.plan_key || "free"));

  return (
    <div className="space-y-10">
      {/* Current Subscription Status */}
      <section>
        <div className="mb-4">
          <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[var(--accent)]" /> Subscription Plan
          </h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">You are currently on the {currentPlan?.name} plan.</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8">
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)]/5 rounded-full blur-3xl -mr-32 -mt-32" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-[var(--accent)] text-[var(--bg-950)] text-xs font-bold rounded-full uppercase tracking-widest">
                  {subscription?.plan_key || "FREE"}
                </span>
                <span className={`text-xs font-medium uppercase tracking-wider ${subscription?.status === 'active' ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                  ● {subscription?.status || 'Active'}
                </span>
              </div>
              
              <div>
                <h4 className="text-2xl font-bold text-[var(--text-primary)]">{currentPlan?.name} Plan</h4>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {subscription?.current_period_end 
                    ? `Your next billing date is ${new Date(subscription.current_period_end).toLocaleDateString()}.`
                    : subscription?.trial_expires_at 
                      ? `Your trial expires on ${new Date(subscription.trial_expires_at).toLocaleDateString()}.`
                      : "Free forever for small teams."}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {currentPlan?.features.slice(0, 4).map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <Check className="w-4 h-4 text-[var(--success)]" />
                    {f}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 min-w-[240px]">
              {subscription?.plan_key === "free" ? (
                <div className="p-4 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                  <div className="text-xs font-bold uppercase tracking-widest text-[var(--accent)] mb-1">Upgrade Available</div>
                  <div className="text-sm text-[var(--text-primary)] mb-4">Unlock higher limits and premium AI models for your team.</div>
                  <button 
                    onClick={() => setPrefs(prev => ({ ...prev, plan_key: "team" }))}
                    className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-[var(--bg-950)] font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4 fill-current" /> Upgrade Now
                  </button>
                </div>
              ) : (
                <button 
                  className="w-full py-2.5 rounded-lg border border-[var(--border-strong)] text-[var(--text-primary)] font-bold text-sm hover:bg-[var(--surface-2)] transition-colors"
                >
                  Manage Billing
                </button>
              )}
              <p className="text-[10px] text-center text-[var(--text-dim)] uppercase tracking-tighter">Payments secured by Paddle</p>
            </div>
          </div>
        </div>
      </section>

      {/* Plan Selection / Upgrade UI */}
      <section className="pt-4">
        <div className="mb-6">
          <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" /> Change Subscription
          </h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">Select a new plan or adjust your current one.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Plan Options Column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {catalog?.plans.filter(p => p.key !== 'free').map(p => (
                <button
                  key={p.key}
                  onClick={() => setPrefs(prev => ({ ...prev, plan_key: p.key }))}
                  className={`relative flex flex-col p-5 rounded-xl border transition-all text-left ${
                    prefs.plan_key === p.key 
                      ? "border-[var(--accent)] bg-[var(--accent-subtle)] shadow-[0_0_20px_var(--accent-subtle)]" 
                      : "border-[var(--border-subtle)] bg-[var(--surface-1)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {prefs.plan_key === p.key && (
                    <motion.div layoutId="plan-active" className="absolute -top-2 -right-2 bg-[var(--accent)] text-[var(--bg-950)] rounded-full p-1 shadow-lg">
                      <Check className="w-3 h-3" />
                    </motion.div>
                  )}
                  <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">{p.name}</span>
                  <span className="text-lg font-bold text-[var(--text-primary)]">{p.price_label}</span>
                  <p className="text-[10px] text-[var(--text-dim)] mt-2 line-clamp-2">{p.features[0]}</p>
                </button>
              ))}
            </div>

            {/* Customization Sliders */}
            {prefs.plan_key !== 'free' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-6 space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-[var(--text-secondary)]">Team Seats</label>
                      <span className="px-2 py-0.5 bg-[var(--bg-950)] rounded text-xs font-mono text-[var(--accent)]">{prefs.seat_count} seats</span>
                    </div>
                    <input 
                      type="range" 
                      min={catalog?.plans.find(p => p.key === prefs.plan_key)?.seat_min || 1}
                      max={catalog?.plans.find(p => p.key === prefs.plan_key)?.seat_max || 100}
                      value={prefs.seat_count}
                      onChange={(e) => setPrefs(prev => ({ ...prev, seat_count: parseInt(e.target.value) }))}
                      className="w-full accent-[var(--accent)] h-1.5 bg-[var(--bg-950)] rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-dim)] uppercase tracking-widest font-bold">
                      <span>{catalog?.plans.find(p => p.key === prefs.plan_key)?.seat_min || 1} MIN</span>
                      <span>{catalog?.plans.find(p => p.key === prefs.plan_key)?.seat_max || 100} MAX</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-medium text-[var(--text-secondary)]">AI Usage Tier</label>
                    <div className="flex p-1 bg-[var(--bg-950)] rounded-lg border border-[var(--border-subtle)]">
                      {catalog?.usage_tiers.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setPrefs(prev => ({ ...prev, usage_tier: t.id }))}
                          className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-tighter rounded-md transition-all ${
                            prefs.usage_tier === t.id 
                              ? "bg-[var(--accent)] text-[var(--bg-950)]" 
                              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] italic">
                      {catalog?.usage_tiers.find(t => t.id === prefs.usage_tier)?.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Quote / Summary Column */}
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-6">
              <h4 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)]">Quote Summary</h4>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)] capitalize">{prefs.plan_key} Plan</span>
                  <span className="text-[var(--text-primary)] font-medium">
                    {prefs.plan_key === 'free' ? '$0' : quote ? `$${quote.monthly_total_usd.toFixed(0)}` : '...'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">{prefs.seat_count} Seats</span>
                  <span className="text-[var(--text-dim)]">—</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">{prefs.usage_tier} usage</span>
                  <span className="text-[var(--text-dim)]">—</span>
                </div>
                
                <div className="pt-3 border-t border-[var(--border-subtle)]">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-[var(--text-primary)]">Total Monthly</span>
                    <div className="text-right">
                      {quoteLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
                      ) : (
                        <>
                          <div className="text-2xl font-black text-[var(--accent)]">
                            {prefs.plan_key === 'free' ? '$0' : quote ? `$${quote.monthly_total_usd.toFixed(2)}` : '$--'}
                          </div>
                          <div className="text-[10px] text-[var(--text-dim)] uppercase font-bold tracking-tighter">per team / mo</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">Includes:</p>
                <ul className="space-y-2">
                  {catalog?.plans.find(p => p.key === prefs.plan_key)?.features.slice(0, 3).map(f => (
                    <li key={f} className="flex gap-2 text-xs text-[var(--text-secondary)]">
                      <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-8">
              <button
                onClick={handleCheckout}
                disabled={!quote || quoteLoading || checkoutBusy !== null || prefs.plan_key === subscription?.plan_key}
                className="w-full py-4 rounded-xl bg-white text-black font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100 flex items-center justify-center gap-2 shadow-[0_10px_20px_rgba(255,255,255,0.1)]"
              >
                {checkoutBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {prefs.plan_key === subscription?.plan_key ? "Current Plan" : "Proceed to Checkout"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
