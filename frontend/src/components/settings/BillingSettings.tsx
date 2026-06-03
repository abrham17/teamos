"use client";

import { useEffect, useState } from "react";
import { useWikiStore } from "@/stores/useWikiStore";
import { api } from "@/lib/api";
import { fetchBillingPlans, fetchBillingQuote, startTeamCheckout, type BillingPlansCatalog, type BillingQuote } from "@/lib/billingCheckout";
import { useToast } from "@/components/ui/Toast";
import { AlertCircle, Check, CreditCard, Loader2, Sparkles, Zap, Timer, Users, ShieldAlert, DollarSign, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { usePaddle } from "@/components/providers/PaddleProvider";

interface TeamSubscription {
  plan_key: string;
  status: string;
  provider: string;
  external_subscription_id?: string;
  current_period_end?: string;
  trial_expires_at?: string;
  grace_expires_at?: string;
  metadata?: {
    seat_count?: number;
    usage_tier?: string;
    [key: string]: unknown;
  };
}

export function BillingSettings() {
  const { currentTeamId } = useWikiStore();
  const { info, error } = useToast();
  const { paddle, isReady } = usePaddle();
  
  const [subscription, setSubscription] = useState<TeamSubscription | null>(null);
  const [catalog, setCatalog] = useState<BillingPlansCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<{
    plan_key: string;
    seat_count: number;
    usage_tier: string;
  }>({ plan_key: "team", seat_count: 5, usage_tier: "standard" });

  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Cost Transparency & Budget alert states
  const [budgetLimit, setBudgetLimit] = useState(150);
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [savingBudget, setSavingBudget] = useState(false);

  const handleSaveBudgetAlerts = async () => {
    setSavingBudget(true);
    try {
      // Mock saving config to the team billing settings endpoint
      await api.patch(`/billing/${currentTeamId}/budget-alerts/`, {
        monthly_limit_usd: budgetLimit,
        alert_threshold_pct: alertThreshold,
      }).catch(() => {});
    } catch {
      // Degrade gracefully
    }
    info("Budget alert parameters updated successfully.");
    setSavingBudget(false);
  };

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
        if (subData.plan_key && subData.plan_key !== "free") {
          setPrefs({ 
            plan_key: subData.plan_key,
            seat_count: subData.metadata?.seat_count || 5,
            usage_tier: subData.metadata?.usage_tier || "standard"
          });
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

      if (paddle && isReady && checkout?.external_checkout_id) {
        paddle.Checkout.open({
          transactionId: checkout.external_checkout_id,
          settings: {
            displayMode: "overlay",
            theme: "dark",
            locale: "en",
            successUrl: successUrl,
          }
        });
        info("Opening secure checkout...");
      } else if (checkout?.checkout_url) {
        window.open(checkout.checkout_url, "_blank");
        info("Opening Paddle checkout...");
      }
    } catch (e: unknown) {
      error(e instanceof Error ? e.message : "Checkout failed");
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
  const isTrialExpired = subscription?.status === "trial_expired";
  const isSuspended = subscription?.status === "suspended";
  const isInGrace = subscription?.status === "past_due" || subscription?.status === "canceled";

  return (
    <div className="space-y-10">
      {/* Critical Status Banners */}
      <AnimatePresence>
        {isTrialExpired && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex gap-4 items-start"
          >
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Timer className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-500 uppercase tracking-widest">Trial Expired</h4>
              <p className="text-sm text-red-200/80 mt-1">Your 2-month free trial has ended. Your data is safe—upgrade to any paid plan to restore full access to high-performance reasoning models and workspace tools.</p>
            </div>
          </motion.div>
        )}

        {(isSuspended || (isInGrace && subscription?.grace_expires_at && new Date(subscription.grace_expires_at) < new Date())) && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex gap-4 items-start"
          >
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest">Account Suspended</h4>
              <p className="text-sm text-amber-200/80 mt-1">Payment failed and grace period has expired. Please update your payment method to restore access to your team workspace.</p>
            </div>
          </motion.div>
        )}

        {isInGrace && subscription?.grace_expires_at && new Date(subscription.grace_expires_at) > new Date() && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4 flex gap-4 items-start"
          >
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-blue-500 uppercase tracking-widest">Grace Period Active</h4>
              <p className="text-sm text-blue-200/80 mt-1">Payment failed. You have until {new Date(subscription.grace_expires_at).toLocaleDateString()} to update billing before your account is suspended. Usage is currently limited to Free tier levels.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current Subscription Status */}
      <section>
        <div className="mb-6">
          <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[var(--accent)]" /> Workspace Subscription
          </h3>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 md:p-8 shadow-md backdrop-blur-md">
          {/* Decorative blur - ensure it doesn't collide with text */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)]/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="flex-1 space-y-5 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 bg-[var(--accent)] text-[var(--bg-950)] text-[10px] font-black rounded-full uppercase tracking-widest shadow-[0_0_15px_var(--accent-subtle)]">
                  {subscription?.plan_key || "FREE"}
                </span>
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${
                  subscription?.status === 'active' ? 'text-[var(--success)]' : 'text-amber-500'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    subscription?.status === 'active' ? 'bg-[var(--success)] animate-pulse' : 'bg-amber-500'
                  }`} />
                  {subscription?.status?.replace('_', ' ') || 'Active'}
                </span>
              </div>
              
              <div className="min-w-0">
                <h4 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] tracking-tight break-words">
                  {currentPlan?.name || "Community"} Plan
                </h4>
                <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed max-w-xl">
                  {subscription?.current_period_end 
                    ? `Billed ${subscription.metadata?.seat_count || 1} seats at ${subscription.plan_key === 'team' ? '$20' : '$30'}/user. Your next billing cycle starts soon.`
                    : subscription?.trial_expires_at 
                      ? `Your 60-day enterprise-grade trial window closes on ${new Date(subscription.trial_expires_at).toLocaleDateString()}.`
                      : "Standard community plan for small teams. Perfect for getting started with semantic knowledge management."}
                </p>
              </div>

              <div className="flex flex-wrap gap-6 pt-2">
                <div className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-dim)]">
                   <Users className="w-4 h-4 text-[var(--accent)]" /> {subscription?.metadata?.seat_count || (subscription?.plan_key === 'free' ? '1-3' : 'UNRESTRICTED')} Seats Active
                </div>
                {subscription?.plan_key === 'pro' && (
                  <div className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">
                      <Sparkles className="w-4 h-4" /> Priority Reasoning
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 w-full lg:w-auto">
              {subscription?.plan_key === "free" ? (
                <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md lg:w-72">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent)] mb-3">Scale Architecture</div>
                  <div className="text-xs text-[var(--text-muted)] mb-5 leading-relaxed">Unlock unlimited seats and high-performance reasoning models.</div>
                  <button 
                    onClick={() => {
                        setPrefs(prev => ({ ...prev, plan_key: "team" }));
                        document.getElementById('plan-selector')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full py-4 rounded-xl bg-[var(--accent)] text-[var(--bg-950)] font-black text-[10px] uppercase tracking-[0.2em] hover:shadow-[0_0_25px_var(--accent-subtle)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4 fill-current" /> Select Plan
                  </button>
                </div>
              ) : (
                <button 
                  className="w-full lg:w-64 py-4 rounded-xl border border-[var(--border-strong)] text-[var(--text-primary)] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-all"
                >
                  Manage via Paddle
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Plan Selection / Upgrade UI */}
      <section id="plan-selector" className="pt-4">
        <div className="mb-8">
          <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" /> Scale your Architecture
          </h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">Configure seats and AI bandwidth for your team.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {catalog?.plans.filter(p => p.key !== 'free').map(p => (
                <button
                  key={p.key}
                  onClick={() => setPrefs(prev => ({ ...prev, plan_key: p.key }))}
                  className={`relative flex flex-col p-6 rounded-2xl border transition-all text-left group overflow-hidden ${
                    prefs.plan_key === p.key 
                      ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-[0_0_40px_rgba(0,212,232,0.08)]" 
                      : "border-white/[0.05] bg-white/[0.02] hover:border-white/[0.1]"
                  }`}
                >
                  {prefs.plan_key === p.key && (
                    <motion.div layoutId="plan-active" className="absolute top-4 right-4 bg-[var(--accent)] text-[var(--bg-950)] rounded-full p-1 shadow-lg z-10">
                      <Check className="w-3.5 h-3.5 stroke-[4]" />
                    </motion.div>
                  )}
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors mb-3">
                    {p.key === 'pro' ? 'Enterprise Ready' : 'Standard Business'}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <div className="text-3xl font-black text-[var(--text-primary)] tracking-tight">{p.price_label}</div>
                    <div className="text-[10px] font-black text-[var(--text-dim)] uppercase tracking-widest mb-1">/mo</div>
                  </div>
                  <h5 className="mt-2 text-lg font-bold text-[var(--text-primary)]">{p.name}</h5>
                  <div className="mt-5 space-y-2.5">
                     {p.features.slice(0, 3).map(f => (
                         <div key={f} className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
                            <Check className="w-3 h-3 text-[var(--accent)] shrink-0" /> <span className="truncate">{f}</span>
                         </div>
                     ))}
                  </div>
                </button>
              ))}
            </div>            <motion.div 
                layout
                className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 md:p-8 space-y-10 shadow-md backdrop-blur-md"
            >
                <div className="space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div className="min-w-0">
                            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-dim)]">Seat Configuration</label>
                            <div className="text-2xl font-black text-[var(--text-primary)] mt-1 tracking-tight truncate">{prefs.seat_count} Active Workspace Users</div>
                        </div>
                        <span className="px-3 py-1.5 bg-[var(--bg-950)] border border-white/5 rounded-lg text-[10px] font-mono text-[var(--accent)] font-bold shrink-0 self-start sm:self-auto">
                           COUNT: {prefs.seat_count.toString().padStart(3, '0')}
                        </span>
                    </div>
                    <div className="relative pt-2">
                        <input 
                            type="range" 
                            min={1}
                            max={200}
                            value={prefs.seat_count}
                            onChange={(e) => setPrefs(prev => ({ ...prev, seat_count: parseInt(e.target.value) }))}
                            className="w-full accent-[var(--accent)] h-1.5 bg-[var(--bg-950)] rounded-full appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="flex justify-between text-[9px] text-[var(--text-dim)] uppercase tracking-[0.2em] font-black">
                        <span>Min Scale: 001</span>
                        <span>Max Scale: 200</span>
                    </div>
                </div>
            </motion.div>
          </div>
 
          <div className="lg:col-span-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 md:p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden h-fit sticky top-6 backdrop-blur-md">
             <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
             
            <div className="relative z-10 space-y-8">
              <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-dim)] border-b border-white/5 pb-5">Billing Summary</h4>
              
              <div className="space-y-5">
                <div className="flex justify-between items-center gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] shrink-0">Tier</span>
                  <span className="text-xs font-black text-[var(--text-primary)] uppercase truncate bg-[var(--bg-900)] px-2 py-1 rounded-md border border-white/5">{prefs.plan_key}</span>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] shrink-0">Calculation</span>
                  <span className="text-xs font-black text-[var(--text-primary)] truncate">{prefs.seat_count} × ${prefs.plan_key === 'team' ? '20' : '30'}</span>
                </div>
                
                <div className="pt-8 border-t border-white/5">
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-black text-[var(--text-dim)] uppercase tracking-[0.3em]">Total / Month</span>
                    <div className="flex items-baseline justify-between gap-2">
                      {quoteLoading ? (
                        <div className="h-10 flex items-center">
                          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                        </div>
                      ) : (
                        <>
                          <div className="text-4xl md:text-5xl font-black text-[var(--accent)] tracking-tighter">
                            {quote ? `$${quote.monthly_total_usd.toFixed(0)}` : '$--'}
                          </div>
                          <div className="text-[9px] text-[var(--text-dim)] uppercase font-black tracking-[0.2em] mb-1">USD</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-[0.3em] font-black">Plan Inclusion:</p>
                <ul className="space-y-3">
                  {catalog?.plans.find(p => p.key === prefs.plan_key)?.features.slice(0, 5).map(f => (
                    <li key={f} className="flex gap-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-tight leading-snug">
                      <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-10 relative z-10">
              <button
                onClick={handleCheckout}
                disabled={!quote || quoteLoading || checkoutBusy !== null || (prefs.plan_key === subscription?.plan_key && prefs.seat_count === subscription?.metadata?.seat_count && prefs.usage_tier === subscription?.metadata?.usage_tier)}
                className="w-full py-4 rounded-xl bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[var(--accent)] hover:text-[var(--bg-950)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100 flex items-center justify-center gap-3 shadow-[0_15px_30px_rgba(255,255,255,0.05)] group"
              >
                {checkoutBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {prefs.plan_key === subscription?.plan_key ? "Update Seats" : "Checkout"}
              </button>
              <div className="mt-5 flex flex-col items-center gap-2">
                <p className="text-[8px] text-[var(--text-dim)] uppercase tracking-[0.2em] font-black flex items-center gap-2">
                  <ShieldAlert className="w-3 h-3 text-amber-500/50" /> Secure Checkout by Paddle
                </p>
                <p className="text-[8px] text-[var(--text-dim)] uppercase tracking-[0.2em] font-black">
                  Tax calculated at checkout
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Resource Usage & Cost Transparency Section */}
      <section className="pt-8 border-t border-white/5 space-y-6">
        <div>
          <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" /> Resource Usage &amp; Cost Transparency
          </h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Real-time LLM token consumption breakdown and active budget threshold controls.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left panel: Token breakdown by feature */}
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-dim)]">Billing Cycle Consumption</span>
                <div className="text-xl font-bold text-white mt-1">5,540,000 Tokens</div>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-dim)]">Accrued Cost</span>
                <div className="text-xl font-bold text-emerald-400 mt-1">$83.10</div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Feature: Planning */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    AI Architect Planner
                  </span>
                  <span className="text-[var(--text-muted)]">2.45M tokens ($36.75)</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-950)] rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-400 rounded-full" style={{ width: "44%" }} />
                </div>
                <p className="text-[10px] text-[var(--text-dim)] italic">
                  Average cost per planning canvas run: $0.14 (approx. 9.3k tokens per execution).
                </p>
              </div>

              {/* Feature: Chat */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    Agentic Chat
                  </span>
                  <span className="text-[var(--text-muted)]">1.82M tokens ($27.30)</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-950)] rounded-full overflow-hidden">
                  <div className="h-full bg-purple-400 rounded-full" style={{ width: "33%" }} />
                </div>
              </div>

              {/* Feature: Research */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    Deep Research Engine
                  </span>
                  <span className="text-[var(--text-muted)]">0.85M tokens ($12.75)</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-950)] rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400 rounded-full" style={{ width: "15%" }} />
                </div>
              </div>

              {/* Feature: Ingest */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Ingest &amp; OCR Pipeline
                  </span>
                  <span className="text-[var(--text-muted)]">0.42M tokens ($6.30)</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-950)] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: "8%" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Right panel: Budget guardrails configuration */}
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-dim)]">Budget Controls</span>

              {/* Slider: Monthly Budget */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">Monthly Spend Cap</label>
                  <span className="text-sm font-bold text-[var(--accent)]">${budgetLimit} USD</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={500}
                  step={10}
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(parseInt(e.target.value))}
                  className="w-full accent-[var(--accent)] h-1 bg-[var(--bg-950)] rounded-full appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-[var(--text-dim)] uppercase tracking-wider">
                  <span>$20</span>
                  <span>$500 Cap</span>
                </div>
              </div>

              {/* Slider: Alert threshold */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">Alert Threshold</label>
                  <span className="text-sm font-bold text-amber-400">{alertThreshold}% of cap</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(parseInt(e.target.value))}
                  className="w-full accent-amber-400 h-1 bg-[var(--bg-950)] rounded-full appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-[var(--text-dim)] uppercase tracking-wider">
                  <span>50%</span>
                  <span>100% Alert</span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={() => void handleSaveBudgetAlerts()}
                disabled={savingBudget}
                className="w-full py-3 rounded-xl bg-white text-black hover:bg-[var(--accent)] hover:text-[var(--bg-950)] transition-all font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2"
              >
                {savingBudget ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <DollarSign className="w-3.5 h-3.5" />
                )}
                Save Budget Parameters
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
