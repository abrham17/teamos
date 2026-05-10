"use client";

import React from "react";
import Link from "next/link";
import { Command, ArrowLeft, ShieldCheck } from "lucide-react";

export function LegalLayout({ 
  title, 
  lastUpdated, 
  children 
}: { 
  title: string; 
  lastUpdated: string; 
  children: React.ReactNode 
}) {
  return (
    <div className="min-h-screen bg-[var(--bg-950)] text-[var(--text-primary)] selection:bg-[var(--accent)] selection:text-[var(--bg-950)]">
      {/* Header */}
      <nav className="border-b border-white/5 bg-[var(--bg-950)]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center transition-all group-hover:bg-[var(--accent)]/20">
              <Command className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <span className="text-lg font-bold tracking-tight">TeamOS</span>
          </Link>
          
          <Link href="/" className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors uppercase tracking-widest">
            <ArrowLeft className="w-3 h-3" />
            Exit
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-24 pb-16 border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-4xl mx-auto px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full mb-6">
            <ShieldCheck className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Legal Architecture</span>
          </div>
          <h1 className="text-5xl font-black uppercase tracking-tighter italic mb-4">{title}</h1>
          <p className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-[0.2em]">Last Updated: {lastUpdated}</p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-20 prose prose-invert prose-slate prose-headings:uppercase prose-headings:tracking-tighter prose-headings:font-black prose-p:text-[var(--text-secondary)] prose-p:leading-relaxed prose-li:text-[var(--text-secondary)]">
        <div className="legal-content space-y-12">
            {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-20 bg-white/[0.01]">
        <div className="max-w-4xl mx-auto px-6 text-center">
            <Command className="w-8 h-8 text-[var(--text-dim)] mx-auto mb-6 opacity-20" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-dim)]">
                &copy; {new Date().getFullYear()} TeamOS. All rights reserved.
            </p>
            <div className="mt-8 flex justify-center gap-8">
                <Link href="/terms" className="text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--accent)] uppercase tracking-widest transition-colors">Terms</Link>
                <Link href="/privacy" className="text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--accent)] uppercase tracking-widest transition-colors">Privacy</Link>
                <Link href="/refund" className="text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--accent)] uppercase tracking-widest transition-colors">Refund</Link>
                <Link href="/pricing" className="text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--accent)] uppercase tracking-widest transition-colors">Pricing</Link>
            </div>
        </div>
      </footer>
      
      <style jsx global>{`
        .legal-content h2 {
          font-size: 1.5rem;
          margin-top: 4rem;
          margin-bottom: 1.5rem;
          color: var(--text-primary);
          border-left: 4px solid var(--accent);
          padding-left: 1.5rem;
        }
        .legal-content p {
          margin-bottom: 1.5rem;
          font-size: 1rem;
        }
        .legal-content ul {
          list-style: none;
          padding-left: 0;
          margin-bottom: 2rem;
        }
        .legal-content li {
          margin-bottom: 0.75rem;
          display: flex;
          gap: 0.75rem;
        }
        .legal-content li::before {
          content: "—";
          color: var(--accent);
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}
