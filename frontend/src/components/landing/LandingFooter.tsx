"use client";

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// Inline SVGs — Twitter & Github icons were removed from lucide-react
const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.05] bg-slate-950/80 backdrop-blur-md py-16 px-6 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[var(--accent)]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* CTA strip */}
      <div className="max-w-6xl mx-auto mb-16">
        <div className="glass-premium rounded-2xl p-8 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="space-y-1.5 text-left w-full lg:w-auto">
            <h3 className="text-xl font-extrabold text-white tracking-tight">Scale your team intelligence.</h3>
            <p className="text-slate-400 text-xs md:text-sm">Simple per-user rates with zero hidden base fees. Scale risk-free.</p>
          </div>
          <div className="flex flex-wrap items-center gap-6 w-full lg:w-auto justify-start lg:justify-end">
            <div className="flex items-center gap-6">
              <div className="text-left">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Team Tier</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white">$20</span>
                  <span className="text-[10px] text-slate-400 font-medium">/ user</span>
                </div>
              </div>
              <div className="w-px h-8 bg-white/[0.08]" />
              <div className="text-left">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Pro Tier</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-[var(--accent-light)]">$30</span>
                  <span className="text-[10px] text-slate-400 font-medium">/ user</span>
                </div>
              </div>
            </div>
            
            <Link
              href="/settings?billing=true"
              className="px-5 py-3 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white text-[12px] font-bold uppercase tracking-widest hover:shadow-[var(--shadow-glow)] transition-all active:scale-95 flex items-center gap-2 group ml-2"
            >
              <span>Get started</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-12 pt-4">
        <div className="col-span-1 md:col-span-2 space-y-6 text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center font-bold text-white text-[11px] shadow-[var(--shadow-glow)]">
              T
            </div>
            <span className="font-extrabold tracking-tight text-[16px] text-white">TeamOS</span>
          </div>
          <p className="text-slate-400 text-[13px] max-w-xs leading-relaxed">
            The context-driven workspace engine for high-velocity teams. Documentation that builds, schedules, and executes itself.
          </p>
          <div className="flex gap-2">
            {[
              { icon: <TwitterIcon />, href: "#" },
              { icon: <GithubIcon />, href: "#" }
            ].map((social, i) => (
              <a
                key={i}
                href={social.href}
                className="w-8 h-8 rounded-lg border border-white/[0.05] bg-white/[0.01] flex items-center justify-center text-slate-400 hover:text-white hover:border-white/[0.1] hover:bg-white/[0.04] transition-all cursor-pointer"
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-4 text-left">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Core Engine</h4>
          <ul className="space-y-2.5 text-[13px]">
            {[
              { label: "Wiki Workspace", href: "/wiki" },
              { label: "Knowledge Graph", href: "/graph" },
              { label: "Agent Planning", href: "/chat" },
              { label: "Secure Ingestion", href: "/ingest" }
            ].map((link, i) => (
              <li key={i}>
                <Link href={link.href} className="text-slate-400 hover:text-white transition-colors duration-200 block">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4 text-left">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Platform</h4>
          <ul className="space-y-2.5 text-[13px]">
            {[
              { label: "Settings", href: "/settings" },
              { label: "Billing & Plans", href: "/settings?billing=true" },
              { label: "API Reference", href: "/docs" },
              { label: "Terms & Conditions", href: "/legal" }
            ].map((link, i) => (
              <li key={i}>
                <Link href={link.href} className="text-slate-400 hover:text-white transition-colors duration-200 block">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4 text-left">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Scale Plans</h4>
          <ul className="space-y-2.5 text-[13px]">
            {[
              { label: "Free Trial (60-day)", href: "/settings?billing_plan=free" },
              { label: "Team Space", href: "/settings?billing_plan=team" },
              { label: "Pro Space", href: "/settings?billing_plan=pro" },
              { label: "Compare Tiers", href: "/settings?billing=true" }
            ].map((link, i) => (
              <li key={i}>
                <Link href={link.href} className="text-slate-400 hover:text-white transition-colors duration-200 block">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="max-w-6xl mx-auto mt-14 pt-6 border-t border-white/[0.05] flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-[12px] text-slate-500 font-medium">
          © {new Date().getFullYear()} TeamOS Inc. All rights reserved.
        </p>
        <span className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-bold uppercase tracking-wider bg-emerald-500/5 border border-emerald-500/10 px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          All engine nodes operational
        </span>
      </div>
    </footer>
  );
}
