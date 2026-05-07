"use client";

import React from 'react';
import Link from 'next/link';

export default function LandingFooter() {
  return (
    <footer className="relative z-10 border-t border-white/5 bg-[#020617] py-20 px-6 overflow-hidden">
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto mb-20">
        <div className="relative p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm overflow-hidden group hover:border-blue-500/30 transition-all">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <div className="text-8xl font-black italic uppercase tracking-tighter">PRICING</div>
          </div>
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">Scale your architecture.</h3>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">Simple per-user pricing with no hidden fees.</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-3xl font-black italic tracking-tighter text-blue-500">$20</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Team / User</div>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-center">
                <div className="text-3xl font-black italic tracking-tighter text-purple-500">$30</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">Pro / User</div>
              </div>
              <Link 
                href="/settings?billing=true"
                className="ml-4 bg-white text-black px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-12">
        <div className="col-span-1 md:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-white shadow-lg">
              T
            </div>
            <span className="font-display font-black tracking-tighter text-2xl uppercase italic">TeamOS</span>
          </div>
          <p className="text-slate-500 text-sm max-w-sm leading-relaxed uppercase tracking-widest font-bold">
            The knowledge engine for agentic teams. documentation that builds itself.
          </p>
          <div className="flex gap-4">
             <div className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center text-slate-500 hover:text-white hover:border-white/20 cursor-pointer transition-all">𝕏</div>
             <div className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center text-slate-500 hover:text-white hover:border-white/20 cursor-pointer transition-all">gh</div>
          </div>
        </div>

        <div className="space-y-6">
          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Engine</h4>
          <ul className="space-y-4 text-xs font-bold uppercase tracking-widest text-slate-600">
            <li><Link href="/wiki" className="hover:text-[var(--accent)] transition-colors">Wiki loop</Link></li>
            <li><Link href="/graph" className="hover:text-[var(--accent)] transition-colors">Graph semantics</Link></li>
            <li><Link href="/chat" className="hover:text-[var(--accent)] transition-colors">Agentic Chat</Link></li>
            <li><Link href="/ingest" className="hover:text-[var(--accent)] transition-colors">Ingest pipeline</Link></li>
          </ul>
        </div>

        <div className="space-y-6">
          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Platform</h4>
          <ul className="space-y-4 text-xs font-bold uppercase tracking-widest text-slate-600">
            <li><Link href="/settings" className="hover:text-[var(--accent)] transition-colors">Settings</Link></li>
            <li><Link href="/settings?billing=true" className="hover:text-[var(--accent)] transition-colors">Billing</Link></li>
            <li><Link href="/docs" className="hover:text-[var(--accent)] transition-colors">API Docs</Link></li>
            <li><Link href="/legal" className="hover:text-[var(--accent)] transition-colors">Privacy & Terms</Link></li>
          </ul>
        </div>

        <div className="space-y-6">
          <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Plans</h4>
          <ul className="space-y-4 text-xs font-bold uppercase tracking-widest text-slate-600">
            <li><Link href="/settings?billing_plan=free" className="hover:text-green-500 transition-colors">Start Free</Link></li>
            <li><Link href="/settings?billing_plan=team" className="hover:text-blue-500 transition-colors">Team Plan</Link></li>
            <li><Link href="/settings?billing_plan=pro" className="hover:text-purple-500 transition-colors">Pro Plan</Link></li>
            <li><Link href="/settings?billing=true" className="hover:text-white transition-colors">Compare All</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">
          © 2026 TeamOS. Build 4.1.2-alpha. All rights reserved.
        </p>
        <div className="flex gap-6">
           <span className="text-[10px] font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              All Systems Operational
           </span>
        </div>
      </div>
    </footer>
  );
}
