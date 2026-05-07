"use client";

import { useEffect, useState } from "react";
import { useWikiStore } from "@/stores/useWikiStore";
import { api } from "@/lib/api";
import { fetchBillingPlans, fetchBillingQuote, startTeamCheckout, type BillingPlansCatalog, type BillingQuote } from "@/lib/billingCheckout";
import { useToast } from "@/components/ui/Toast";
import { AlertCircle, Check, CreditCard, Loader2, Sparkles, Zap, Timer, Users, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
      if (checkout?.checkout_url) {
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
        <div className="mb-4">
          <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[var(--accent)]" /> Workspace Subscription
          </h3>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)]/5 rounded-full blur-3xl -mr-32 -mt-32" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-[var(--accent)] text-[var(--bg-950)] text-xs font-bold rounded-full uppercase tracking-widest">
                  {subscription?.plan_key || "FREE"}
                </span>
                <span className={`text-xs font-black uppercase tracking-widest flex items-center gap-1.5 ${
                  subscription?.status === 'active' ? 'text-[var(--success)]' : 'text-amber-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    subscription?.status === 'active' ? 'bg-[var(--success)]' : 'bg-amber-500'
                  }`} />
                  {subscription?.status?.replace('_', ' ') || 'Active'}
                </span>
              </div>
              
              <div>
                <h4 className="text-2xl font-bold text-[var(--text-primary)]">{currentPlan?.name} Plan</h4>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {subscription?.current_period_end 
                    ? `Billed ${subscription.metadata?.seat_count || 1} seats at ${subscription.plan_key === 'team' ? '$20' : '$30'}/user.`
                    : subscription?.trial_expires_at 
                      ? `Your 60-day trial window closes on ${new Date(subscription.trial_expires_at).toLocaleDateString()}.`
                      : "Standard community plan for small teams."}
                </p>
              </div>

              <div className="flex flex-wrap gap-4 pt-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--text-dim)]">
                   <Users className="w-3.5 h-3.5" /> {subscription?.metadata?.seat_count || (subscription?.plan_key === 'free' ? '1-3' : 'UNRESTRICTED')} Seats
                </div>
                {subscription?.plan_key === 'pro' && (
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-purple-400">
                      <Sparkles className="w-3.5 h-3.5" /> PRIORITY REASONING ACTIVE
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 min-w-[240px]">
              {subscription?.plan_key === "free" ? (
                <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 backdrop-blur-sm">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)] mb-2">Initialize Per-User Plan</div>
                  <div className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">Upgrade to Team ($20) or Pro ($30) for unlimited seats and priority AI.</div>
                  <button 
                    onClick={() => {
                        setPrefs(prev => ({ ...prev, plan_key: "team" }));
                        document.getElementById('plan-selector')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--bg-950)] font-black text-xs uppercase tracking-widest hover:shadow-[0_0_20px_var(--accent-subtle)] transition-all flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4 fill-current" /> Select a Plan
                  </button>
                </div>
              ) : (
                <button 
                  className="w-full py-3 rounded-xl border border-[var(--border-strong)] text-[var(--text-primary)] font-black text-xs uppercase tracking-widest hover:bg-[var(--surface-2)] transition-colors"
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
        <div className="mb-6">
          <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" /> Scale your Architecture
          </h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">Configure seats and AI bandwidth for your team.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {catalog?.plans.filter(p => p.key !== 'free').map(p => (
                <button
                  key={p.key}
                  onClick={() => setPrefs(prev => ({ ...prev, plan_key: p.key }))}
                  className={`relative flex flex-col p-6 rounded-2xl border transition-all text-left group ${
                    prefs.plan_key === p.key 
                      ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-[0_0_30px_rgba(0,212,232,0.1)]" 
                      : "border-[var(--border-subtle)] bg-[var(--surface-1)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {prefs.plan_key === p.key && (
                    <motion.div layoutId="plan-active" className="absolute -top-3 -right-3 bg-[var(--accent)] text-[var(--bg-950)] rounded-full p-1.5 shadow-xl">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </motion.div>
                  )}
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors mb-2">{p.name}</span>
                  <div className="flex items-end gap-1">
                    <div className="text-3xl font-black text-[var(--text-primary)] tracking-tighter">{p.price_label}</div>
                    <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase mb-2">/month</div>
                  </div>
                  <div className="mt-4 space-y-2">
                     {p.features.slice(0, 3).map(f => (
                         <div key={f} className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-tighter flex items-center gap-1">
                            <Check className="w-2.5 h-2.5 text-[var(--accent)]" /> {f}
                         </div>
                     ))}
                  </div>
                </button>
              ))}
            </div>

            <motion.div 
                layout
                className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl p-8 space-y-10"
            >
                <div className="grid grid-cols-1 gap-12">
                    <div className="space-y-6">
                        <div className="flex justify-between items-end">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Seat Configuration</label>
                                <div className="text-2xl font-black text-[var(--text-primary)] mt-1">{prefs.seat_count} Active Users</div>
                            </div>
                            <span className="px-2 py-1 bg-[var(--bg-950)] rounded text-[10px] font-mono text-[var(--accent)] font-bold">X{prefs.seat_count}</span>
                        </div>
                        <input 
                            type="range" 
                            min={1}
                            max={200}
                            value={prefs.seat_count}
                            onChange={(e) => setPrefs(prev => ({ ...prev, seat_count: parseInt(e.target.value) }))}
                            className="w-full accent-[var(--accent)] h-2 bg-[var(--bg-950)] rounded-full appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-[var(--text-dim)] uppercase tracking-widest font-black">
                            <span>1 SEAT MIN</span>
                            <span>UNRESTRICTED SCALING</span>
                        </div>
                    </div>

                </div>
            </motion.div>
          </div>

          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 rounded-full blur-2xl -mr-16 -mt-16" />
             
            <div className="relative z-10 space-y-8">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] border-b border-white/5 pb-4">Subscription Summary</h4>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Plan Tier</span>
                  <span className="text-sm font-black text-[var(--text-primary)] uppercase">{prefs.plan_key}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Seat Math</span>
                  <span className="text-sm font-black text-[var(--text-primary)]">{prefs.seat_count} Users × ${prefs.plan_key === 'team' ? '20' : '30'}</span>
                </div>
                
                <div className="pt-6 border-t border-white/5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest">Workspace Total</span>
                    <div className="text-right">
                      {quoteLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)] ml-auto" />
                      ) : (
                        <div className="flex flex-col items-end">
                          <div className="text-4xl font-black text-[var(--accent)] tracking-tighter">
                            {quote ? `$${quote.monthly_total_usd.toFixed(2)}` : '$--'}
                          </div>
                          <div className="text-[8px] text-[var(--text-dim)] uppercase font-black tracking-widest mt-1">USD // PER_MONTH</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-6">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] font-black">Architecture Details:</p>
                <ul className="space-y-3">
                  {catalog?.plans.find(p => p.key === prefs.plan_key)?.features.map(f => (
                    <li key={f} className="flex gap-3 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-tighter">
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
                className="w-full py-5 rounded-2xl bg-white text-black font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:grayscale disabled:scale-100 flex items-center justify-center gap-3 shadow-[0_15px_30px_rgba(255,255,255,0.1)] group"
              >
                {checkoutBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4 transition-transform group-hover:-rotate-12" />}
                {prefs.plan_key === subscription?.plan_key ? "Update Seat Configuration" : "Initialize Checkout"}
              </button>
              <p className="text-[8px] text-center text-[var(--text-dim)] uppercase tracking-[0.2em] mt-4 font-bold flex items-center justify-center gap-2">
                <ShieldAlert className="w-2 h-2" /> No hidden fees • Cancel anytime • Paddle Secure
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
