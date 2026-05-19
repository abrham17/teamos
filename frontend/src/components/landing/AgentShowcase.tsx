"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, BrainCircuit, Target, ClipboardList, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AgentShowcase() {
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStage(prev => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const stages = [
    {
      title: "Wiki Context Retrieval",
      desc: "Agent crawls your interconnected knowledge graph to verify constraints, history, and project dependencies.",
      icon: <BrainCircuit className="w-5 h-5" />,
      color: "blue"
    },
    {
      title: "Agentic Logic Mapping",
      desc: "Based on the wiki's context, the agent architects high-level objectives and sequences them into a logic chain.",
      icon: <Target className="w-5 h-5" />,
      color: "purple"
    },
    {
      title: "Autonomous Allocation",
      desc: "Planning engine assigns owners and sets deadlines by analyzing team capacity directly from the wiki.",
      icon: <ClipboardList className="w-5 h-5" />,
      color: "pink"
    },
    {
      title: "Execution Commitment",
      desc: "The roadmap is committed and synced back to the wiki as a living project source of truth.",
      icon: <CheckSquare className="w-5 h-5" />,
      color: "emerald"
    }
  ];

  return (
    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-12 items-start">
      <div className="lg:w-1/2 space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 border border-[var(--border-subtle)] bg-[var(--bg-800)]">
          <Cpu className="w-3 h-3 text-[var(--accent)]" />
          <span className="text-[11px] uppercase font-medium tracking-widest text-[var(--text-muted)]">Context-Driven Execution</span>
        </div>

        <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
          Context-driven<br />
          <span className="text-[var(--accent)]">planning.</span>
        </h2>

        <p className="text-[var(--text-muted)] text-base max-w-md leading-relaxed">
          The wiki isn&apos;t just for reading. Agents use it as a grounding layer — reading your entire interlinked logic before architecting a single task.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-4">
          {stages.map((s, i) => (
            <div
              key={i}
              className={cn(
                "p-4 border transition-colors duration-300",
                activeStage === i
                  ? "border-[var(--accent)]/40 bg-[var(--accent-subtle)]"
                  : "border-[var(--border-subtle)] bg-transparent opacity-50"
              )}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="text-[var(--accent)]">{s.icon}</div>
                <h4 className="font-medium text-[13px]">{s.title}</h4>
              </div>
              <p className="text-[12px] text-[var(--text-dim)] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:w-1/2 w-full h-[440px] border border-[var(--border-subtle)] bg-[var(--bg-800)] relative overflow-hidden flex items-center justify-center">
         <div className="relative w-full max-w-sm px-8 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStage}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
                className="border border-[var(--border-subtle)] bg-[var(--bg-700)] p-6 relative z-10"
              >
                {activeStage === 0 && (
                   <div className="flex flex-col gap-4">
                      <div className="h-1 w-1/3 bg-[var(--bg-600)] overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} className="h-full bg-[var(--accent)]" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-2.5 w-full bg-[var(--bg-600)]" />
                        <div className="h-2.5 w-3/4 bg-[var(--bg-600)]" />
                        <div className="h-2.5 w-5/6 bg-[var(--bg-600)]" />
                      </div>
                      <span className="text-[10px] text-[var(--accent)] uppercase tracking-widest font-mono">Scanning knowledge graph...</span>
                   </div>
                )}

                {activeStage === 1 && (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-8 h-8 border border-[var(--border-subtle)] bg-[var(--bg-600)] text-[var(--accent)] flex items-center justify-center text-[10px] font-bold">M{i}</div>
                        <div className="h-1.5 flex-1 bg-[var(--bg-600)]" />
                      </div>
                    ))}
                    <span className="text-[10px] text-[var(--accent)] uppercase tracking-widest font-mono">Sequencing milestones...</span>
                  </div>
                )}

                {activeStage === 2 && (
                  <div className="flex flex-wrap gap-2">
                    {['MEL', 'SAM', 'ANNA', 'REX'].map((user, i) => (
                      <motion.div 
                        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }}
                        key={user} 
                        className="px-3 py-1 bg-[var(--accent)] text-white font-semibold text-[10px] tracking-widest"
                      >
                        {user}
                      </motion.div>
                    ))}
                    <span className="w-full text-[10px] text-[var(--accent)] uppercase tracking-widest font-mono mt-2">Optimal resource alloc...</span>
                  </div>
                )}

                {activeStage === 3 && (
                  <div className="flex flex-col items-center gap-4 py-4 text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.1, 1] }}
                      className="w-14 h-14 bg-[var(--success)] flex items-center justify-center text-white"
                    >
                      <CheckSquare className="w-8 h-8" />
                    </motion.div>
                    <h5 className="font-bold uppercase tracking-tighter text-white">Project Initialized</h5>
                    <span className="text-[var(--text-dim)] text-[10px] font-mono tracking-widest">WORKSPACE_UUID_A82-F19</span>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
         </div>
      </div>
    </div>
  );
}
