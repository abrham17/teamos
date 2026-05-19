"use client";

import React from 'react';
import Link from 'next/link';

export default function LandingFooter() {
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-950)] py-16 px-6">
      {/* CTA strip */}
      <div className="max-w-6xl mx-auto mb-16">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-8 border border-[var(--border-subtle)] bg-[var(--bg-800)]">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Scale your architecture.</h3>
            <p className="text-[var(--text-muted)] text-[13px]">Simple per-user pricing with no hidden fees.</p>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--accent)]">$20</div>
              <div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wider mt-0.5">Team / user</div>
            </div>
            <div className="w-px h-8 bg-[var(--border-subtle)]" />
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--accent)]">$30</div>
              <div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wider mt-0.5">Pro / user</div>
            </div>
            <Link
              href="/settings?billing=true"
              className="ml-2 bg-[var(--accent)] text-white px-6 py-2.5 text-[12px] font-medium hover:bg-[var(--accent-dark)] transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-12">
        <div className="col-span-1 md:col-span-2 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[var(--accent)] flex items-center justify-center font-bold text-white text-xs">
              T
            </div>
            <span className="font-semibold tracking-tight text-[15px]">TeamOS</span>
          </div>
          <p className="text-[var(--text-dim)] text-[13px] max-w-xs leading-relaxed">
            The knowledge engine for agentic teams. Documentation that builds itself.
          </p>
          <div className="flex gap-3">
            <div className="w-7 h-7 border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer transition-colors text-xs">𝕏</div>
            <div className="w-7 h-7 border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer transition-colors text-xs">gh</div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Engine</h4>
          <ul className="space-y-3 text-[13px] text-[var(--text-dim)]">
            <li><Link href="/wiki" className="hover:text-[var(--text-primary)] transition-colors">Wiki</Link></li>
            <li><Link href="/graph" className="hover:text-[var(--text-primary)] transition-colors">Graph</Link></li>
            <li><Link href="/chat" className="hover:text-[var(--text-primary)] transition-colors">Chat</Link></li>
            <li><Link href="/ingest" className="hover:text-[var(--text-primary)] transition-colors">Ingest</Link></li>
          </ul>
        </div>

        <div className="space-y-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Platform</h4>
          <ul className="space-y-3 text-[13px] text-[var(--text-dim)]">
            <li><Link href="/settings" className="hover:text-[var(--text-primary)] transition-colors">Settings</Link></li>
            <li><Link href="/settings?billing=true" className="hover:text-[var(--text-primary)] transition-colors">Billing</Link></li>
            <li><Link href="/docs" className="hover:text-[var(--text-primary)] transition-colors">API Docs</Link></li>
            <li><Link href="/legal" className="hover:text-[var(--text-primary)] transition-colors">Privacy &amp; Terms</Link></li>
          </ul>
        </div>

        <div className="space-y-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Plans</h4>
          <ul className="space-y-3 text-[13px] text-[var(--text-dim)]">
            <li><Link href="/settings?billing_plan=free" className="hover:text-[var(--text-primary)] transition-colors">Free</Link></li>
            <li><Link href="/settings?billing_plan=team" className="hover:text-[var(--text-primary)] transition-colors">Team</Link></li>
            <li><Link href="/settings?billing_plan=pro" className="hover:text-[var(--text-primary)] transition-colors">Pro</Link></li>
            <li><Link href="/settings?billing=true" className="hover:text-[var(--text-primary)] transition-colors">Compare</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-14 pt-6 border-t border-[var(--border-subtle)] flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-[12px] text-[var(--text-dim)]">
          © 2026 TeamOS. All rights reserved.
        </p>
        <span className="text-[12px] text-[var(--text-dim)] flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[var(--success)]" />
          All systems operational
        </span>
      </div>
    </footer>
  );
}
