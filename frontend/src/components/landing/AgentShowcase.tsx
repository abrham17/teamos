"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cpu, 
  BrainCircuit, 
  Target, 
  Users, 
  CheckCircle, 
  ShieldCheck, 
  Database,
  UserCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AgentShowcase() {
  const [activeStage, setActiveStage] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAutoModeRef = useRef(true);

  const stopCycle = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startCycle = useCallback(() => {
    stopCycle();
    isAutoModeRef.current = true;
    timerRef.current = setInterval(() => {
      setActiveStage(prev => (prev + 1) % 4);
    }, 4500);
  }, [stopCycle]);

  useEffect(() => {
    startCycle();
    return () => stopCycle();
  }, [startCycle, stopCycle]);



  const selectStage = (idx: number) => {
    stopCycle();
    isAutoModeRef.current = false;
    setActiveStage(idx);
  };

  const stages = [
    {
      title: "Wiki Context Retrieval",
      desc: "Agent queries your workspace database to retrieve system requirements and API schemas.",
      icon: <BrainCircuit className="w-4 h-4" />,
      tag: "STEP 01 — GROUNDING"
    },
    {
      title: "Logic Chain Mapping",
      desc: "Architects project dependencies and resolves scheduling constraints based on core wiki guidelines.",
      icon: <Target className="w-4 h-4" />,
      tag: "STEP 02 — REASONING"
    },
    {
      title: "Capacity Planning",
      desc: "Analyzes team availability to schedule milestones and allocate active tasks automatically.",
      icon: <Users className="w-4 h-4" />,
      tag: "STEP 03 — ALLOCATION"
    },
    {
      title: "Commitment Sync",
      desc: "Commits the live project board and updates the wiki, establishing a single source of truth.",
      icon: <CheckCircle className="w-4 h-4" />,
      tag: "STEP 04 — EXECUTION"
    }
  ];

  return (
    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-12 items-stretch">
      {/* Left Selection Pane */}
      <div className="lg:w-1/2 flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] shadow-[0_2px_10px_rgba(0,0,0,0.2)]">
            <Cpu className="w-3.5 h-3.5 text-[var(--accent-light)]" />
            <span className="text-[11px] uppercase font-bold tracking-widest text-slate-400">Context-Driven Planning</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.08] text-white">
            Context-driven<br />
            <span className="text-gradient">execution.</span>
          </h2>

          <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-lg">
            Wikis shouldn&apos;t be read-only. TeamOS agents use your documentation as a real-time grounding layer — analyzing constraints, specifications, and architecture before scheduling a single issue.
          </p>
        </div>

        {/* Tab Cards */}
        <div className="grid grid-cols-1 gap-3 pt-4">
          {stages.map((s, i) => {
            const isActive = activeStage === i;
            return (
              <div
                key={i}
                onClick={() => selectStage(i)}
                className={cn(
                  "p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer relative overflow-hidden",
                  isActive
                    ? "border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] shadow-[0_4px_20px_rgba(139,127,244,0.06)]"
                    : "border-white/[0.05] bg-transparent opacity-65 hover:opacity-100 hover:bg-white/[0.01]"
                )}
              >
                {/* Active progress track bar */}
                {isActive && isAutoModeRef.current && (
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 4.5, ease: "linear" }}
                    className="absolute bottom-0 left-0 h-0.5 bg-[var(--accent)]"
                  />
                )}

                <div className="flex items-center gap-3 mb-1.5 relative z-10">
                  <div className={cn(
                    "p-1.5 rounded-lg border transition-colors",
                    isActive 
                      ? "bg-[var(--accent)]/15 border-[var(--accent)]/30 text-[var(--accent-light)]" 
                      : "bg-white/[0.02] border-white/[0.05] text-slate-400"
                  )}>
                    {s.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono font-bold text-slate-500">{s.tag}</span>
                    <h4 className="font-extrabold text-[13px] text-white leading-tight">{s.title}</h4>
                  </div>
                </div>
                <p className="text-[12px] text-slate-400 leading-relaxed ml-9 relative z-10">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Simulator Canvas */}
      <div className="lg:w-1/2 w-full h-[450px] rounded-2xl border border-white/[0.06] bg-slate-950/40 relative overflow-hidden flex items-center justify-center p-8 shadow-xl">
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:32px_32px] opacity-25" />
        
        <div className="relative w-full h-full flex flex-col justify-between z-10">
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
              {activeStage === 0 && "agent_retrieval_agent"}
              {activeStage === 1 && "agent_reasoning_engine"}
              {activeStage === 2 && "agent_resource_scheduler"}
              {activeStage === 3 && "agent_commit_handler"}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />
              <span className="text-[9px] font-mono text-[var(--accent-light)] font-bold uppercase">Processing</span>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center py-4">
            <AnimatePresence mode="wait">
              {activeStage === 0 && (
                <motion.div
                  key="stage0"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="w-full space-y-4"
                >
                  <div className="p-3.5 rounded-xl border border-white/[0.05] bg-slate-900 space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-[var(--accent-light)] animate-pulse" />
                        <span className="text-[11px] font-bold text-white">Semantic Search Index</span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-500">Query: &quot;milestones &amp; architecture specifications&quot;</span>
                    </div>

                    <div className="space-y-1.5 font-mono text-[9px]">
                      <div className="flex justify-between text-emerald-400">
                        <span>[MATCH] api-specification.md</span>
                        <span>94% score</span>
                      </div>
                      <div className="flex justify-between text-indigo-400">
                        <span>[MATCH] launch-milestones.md</span>
                        <span>89% score</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>[MATCH] infra-constraints.md</span>
                        <span>82% score</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500">
                    <BrainCircuit className="w-3.5 h-3.5 text-[var(--accent-light)] animate-spin" />
                    <span>Grounding planning nodes in local documentation...</span>
                  </div>
                </motion.div>
              )}

              {activeStage === 1 && (
                <motion.div
                  key="stage1"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full space-y-4"
                >
                  <span className="text-[10px] font-extrabold text-white block">Project Reasoning Sequence</span>
                  
                  <div className="space-y-3 relative">
                    {/* Floating connector line */}
                    <div className="absolute left-6 top-5 bottom-5 w-0.5 bg-slate-800" />
                    
                    {[
                      { title: "M1: Set Core API Infrastructure", desc: "Dependent on: api-specification.md", val: "Validated" },
                      { title: "M2: Configure WebSocket Channels", desc: "Dependent on: infra-constraints.md", val: "Validated" },
                      { title: "M3: Sync Workspace Dashboard", desc: "Dependent on: launch-milestones.md", val: "Verified" }
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-4 pl-3 relative z-10">
                        <div className="w-6.5 h-6.5 rounded-full border border-[var(--accent)]/40 bg-slate-900 flex items-center justify-center text-[10px] font-bold text-[var(--accent-light)] shadow-lg">
                          {i + 1}
                        </div>
                        <div className="flex-1 p-2.5 rounded-xl border border-white/[0.04] bg-slate-900/60 flex items-center justify-between">
                          <div className="flex flex-col text-left">
                            <span className="text-[11px] font-bold text-white leading-normal">{step.title}</span>
                            <span className="text-[9px] text-slate-500">{step.desc}</span>
                          </div>
                          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">{step.val}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeStage === 2 && (
                <motion.div
                  key="stage2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-extrabold text-white">Sprint Allocation & Capacity Tracker</span>
                    <span className="text-[9px] text-slate-500">Based on historical velocity</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { name: "Melvin K.", role: "Backend Architect", load: 74, color: "bg-indigo-500" },
                      { name: "Sarah L.", role: "DevOps Engineer", load: 60, color: "bg-purple-500" },
                      { name: "Anna R.", role: "Frontend Lead", load: 82, color: "bg-sky-500" },
                      { name: "Alex B.", role: "QA Engineer", load: 45, color: "bg-emerald-500" }
                    ].map((user, i) => (
                      <div key={i} className="p-3 rounded-xl border border-white/[0.05] bg-slate-900 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-slate-950 border border-white/[0.1] flex items-center justify-center font-bold text-[10px] text-white">
                          {user.name.split(' ')[0][0]}
                        </div>
                        <div className="flex-1 space-y-1 text-left">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-white">{user.name}</span>
                            <span className="text-[9px] font-semibold text-slate-500">{user.load}% Load</span>
                          </div>
                          <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden">
                            <div className={cn("h-full rounded-full", user.color)} style={{ width: `${user.load}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-[9px] text-emerald-400 font-mono">
                    <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Resource allocation optimized successfully. Overloads: 0 detected.</span>
                  </div>
                </motion.div>
              )}

              {activeStage === 3 && (
                <motion.div
                  key="stage3"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full space-y-4 text-center"
                >
                  <div className="flex flex-col items-center gap-3 py-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.15, 1] }}
                      className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
                    >
                      <ShieldCheck className="w-7 h-7" />
                    </motion.div>
                    <h5 className="font-extrabold text-white tracking-tight leading-none text-base">Roadmap Committed & Synced</h5>
                    <span className="text-[10px] font-mono text-slate-500">WORKSPACE_COMMIT_SYNC_A82-F19</span>
                  </div>

                  <div className="p-3.5 rounded-xl border border-white/[0.04] bg-slate-900 font-mono text-[9px] text-left space-y-1 text-slate-400">
                    <div>&gt; Syncing milestones to main workspace wiki... done.</div>
                    <div>&gt; Distributing task definitions to planner board... done.</div>
                    <div className="text-emerald-400">&gt; Status: All system dependencies verified. Ready for execution.</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-white/[0.05] pt-3 text-[10px] text-slate-500 flex justify-between">
            <span>Cycle mode: {isAutoModeRef.current ? "Auto-cycling" : "Interactive manual"}</span>
            {!isAutoModeRef.current && (
              <button 
                onClick={startCycle}
                className="text-[var(--accent-light)] font-bold hover:underline"
              >
                Resume Auto-cycle
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
