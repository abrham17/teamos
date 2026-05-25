"use client";

import React from 'react';
import { 
  Search, 
  Link as LinkIcon, 
  Cpu, 
  Rocket, 
  FileText, 
  Network, 
  Settings, 
  MessageSquare, 
  CheckCircle2, 
  Clock,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function HeroMockup() {
  return (
    <div className="relative w-full rounded-2xl border border-white/[0.08] bg-slate-950/80 backdrop-blur-md shadow-2xl overflow-hidden p-0.5">
      {/* OS window header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          <span className="ml-2 text-[11px] font-mono text-slate-500 tracking-wider">teamos-workspace-main.json</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.05]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-medium text-slate-400">Agent Active</span>
        </div>
      </div>

      <div className="flex h-[420px] md:h-[460px]">
        {/* Sidebar */}
        <div className="w-16 md:w-56 border-r border-white/[0.05] bg-white/[0.01] p-4 flex flex-col justify-between hidden md:flex">
          <div className="space-y-6">
            <div className="flex items-center gap-2.5 px-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center font-bold text-white text-[10px]">
                T
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] font-bold tracking-tight text-white leading-tight">TeamOS Core</span>
                <span className="text-[9px] text-slate-500">v1.2.0-beta</span>
              </div>
            </div>

            <div className="space-y-1">
              {[
                { label: "Wiki Workspace", icon: <FileText className="w-3.5 h-3.5" />, active: true },
                { label: "Knowledge Graph", icon: <Network className="w-3.5 h-3.5" /> },
                { label: "Agentic Planner", icon: <Cpu className="w-3.5 h-3.5" /> },
                { label: "Team Space", icon: <MessageSquare className="w-3.5 h-3.5" /> },
                { label: "Settings", icon: <Settings className="w-3.5 h-3.5" /> },
              ].map((item, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-colors cursor-pointer",
                    item.active 
                      ? "bg-[var(--accent)]/15 text-[var(--accent-light)] border border-[var(--accent)]/10" 
                      : "text-slate-400 hover:text-white hover:bg-white/[0.03]"
                  )}
                >
                  {item.icon}
                  <span className="hidden md:inline">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-white/[0.04] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Vector Status</span>
              <span className="text-[9px] font-bold text-emerald-400">100%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
              <div className="bg-gradient-to-r from-[var(--accent)] to-emerald-400 h-full w-full rounded-full" />
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950/40">
          {/* Top Bar */}
          <div className="flex justify-between items-center px-6 py-3.5 border-b border-white/[0.05] bg-white/[0.01]">
            <div className="flex items-center gap-2.5 w-full max-w-xs bg-white/[0.03] border border-white/[0.05] rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] text-slate-500 select-none">Search knowledge nodes... (⌘K)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {['M', 'S', 'A'].map((c, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "w-6 h-6 rounded-full border border-slate-950 flex items-center justify-center text-[10px] font-bold text-white",
                      i === 0 ? "bg-indigo-600" : i === 1 ? "bg-purple-600" : "bg-sky-600"
                    )}
                  >
                    {c}
                  </div>
                ))}
              </div>
              <div className="h-4 w-px bg-white/[0.08]" />
              <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center border border-[var(--accent)]/30">
                <Activity className="w-3 h-3 text-[var(--accent)]" />
              </div>
            </div>
          </div>

          {/* Grid Workspace */}
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
            {/* Wiki Page View */}
            <div className="glass-premium rounded-xl p-5 space-y-4 relative flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[var(--accent)]" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--accent-light)]" />
                    <span className="text-[12px] font-bold text-white">🚀 launch-milestones.md</span>
                  </div>
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-white/[0.06] text-slate-400">Wiki File</span>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[14px] font-extrabold text-white tracking-tight leading-tight">Project Launch Plan</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    This document defines the deployment sequence. We must connect the architectural designs in <span className="text-[var(--accent-light)] font-semibold underline decoration-dashed">[[systems-architecture]]</span> before configuring the server nodes.
                  </p>
                  <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.04] font-mono text-[9px] text-indigo-300">
                    {"// Agentic instruction block"}<br />
                    @Agent: verify server resources inside [[deploy-spec]]
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/[0.05] text-[10px]">
                <span className="text-slate-500">Last synchronized: 2 min ago</span>
                <div className="flex items-center gap-1.5 text-[var(--accent-light)] font-semibold cursor-pointer">
                  <span>Linked Nodes</span>
                  <LinkIcon className="w-3 h-3" />
                </div>
              </div>
            </div>

            {/* Agentic Planning Canvas */}
            <div className="glass-premium rounded-xl p-5 relative overflow-hidden flex flex-col justify-between border-dashed border-white/[0.12] bg-white/[0.01]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span className="text-[12px] font-bold text-white">Agent Action Canvas</span>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-pulse">Running Execution</span>
                </div>

                {/* Animated Graph Visual inside Canvas */}
                <div className="relative h-20 w-full rounded-lg bg-slate-900/60 border border-white/[0.04] flex items-center justify-between px-6 overflow-hidden">
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M 40 40 L 140 40" stroke="rgba(139, 127, 244, 0.2)" strokeWidth="1.5" />
                    <path d="M 40 40 L 140 40" stroke="var(--accent)" strokeWidth="1.5" className="svg-flow-line" />
                    <path d="M 140 40 L 240 40" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="1.5" />
                    <path d="M 140 40 L 240 40" stroke="#10b981" strokeWidth="1.5" className="svg-flow-line" />
                  </svg>
                  
                  <div className="relative flex flex-col items-center gap-1 z-10">
                    <div className="w-8 h-8 rounded-full bg-slate-950 border border-[var(--accent)] flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-[var(--accent-light)]" />
                    </div>
                    <span className="text-[8px] font-bold text-slate-400">launch-plan</span>
                  </div>

                  <div className="relative flex flex-col items-center gap-1 z-10">
                    <div className="w-8 h-8 rounded-full bg-slate-950 border border-indigo-500 flex items-center justify-center">
                      <Network className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <span className="text-[8px] font-bold text-slate-400">deploy-spec</span>
                  </div>

                  <div className="relative flex flex-col items-center gap-1 z-10">
                    <div className="w-8 h-8 rounded-full bg-slate-950 border border-emerald-500 flex items-center justify-center">
                      <Rocket className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <span className="text-[8px] font-bold text-slate-400">server-config</span>
                  </div>
                </div>

                {/* Subtasks Status */}
                <div className="space-y-1.5">
                  {[
                    { label: "Parse Wiki Dependencies", status: "complete" },
                    { label: "Verify deploy-spec constraints", status: "complete" },
                    { label: "Synthesize sprint milestones", status: "active" }
                  ].map((task, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[10px]">
                      <span className="text-slate-300 font-semibold">{task.label}</span>
                      <div className="flex items-center gap-1.5">
                        {task.status === "complete" ? (
                          <>
                            <span className="text-[9px] text-emerald-400 font-medium">Verified</span>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          </>
                        ) : (
                          <>
                            <span className="text-[9px] text-amber-400 font-medium">Resolving...</span>
                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.05] text-[10px] text-slate-500 flex items-center justify-between">
                <span>Task coverage: 2/3 resolved</span>
                <span className="text-slate-400 font-medium">Commit sync: pending</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
