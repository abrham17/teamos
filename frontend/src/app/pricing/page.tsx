"use client";

import { HomePricing } from "@/components/home/HomePricing";
import Link from "next/link";
import { Command, ArrowLeft } from "lucide-react";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-950)] text-[var(--text-primary)]">
      <nav className="border-b border-white/5 bg-[var(--bg-950)]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center transition-all group-hover:bg-[var(--accent)]/20 group-hover:scale-105">
              <Command className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <span className="text-xl font-bold tracking-tight">TeamOS</span>
          </Link>
          
          <Link href="/" className="flex items-center gap-2 text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back Home
          </Link>
        </div>
      </nav>

      <main className="pb-20">
        <div className="pt-20 text-center max-w-3xl mx-auto px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)]">Secure Billing Powered by Paddle</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tighter mb-6 italic">Transparent <br/> Architecture.</h1>
          <p className="text-lg text-[var(--text-muted)] leading-relaxed">
            TeamOS is built to scale with your team. No seat limits, no hidden fees, just pure semantic reasoning power.
          </p>
        </div>

        <HomePricing />
        
        <div className="max-w-7xl mx-auto px-6 mt-10 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-dim)]">
                All transactions are encrypted and processed securely by Paddle.com
            </p>
            <div className="mt-8 flex justify-center gap-6">
                <Link href="/terms" className="text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--accent)] uppercase tracking-widest transition-colors">Terms of Service</Link>
                <Link href="/privacy" className="text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--accent)] uppercase tracking-widest transition-colors">Privacy Policy</Link>
                <Link href="/refund" className="text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--accent)] uppercase tracking-widest transition-colors">Refund Policy</Link>
            </div>
        </div>
      </main>
    </div>
  );
}
