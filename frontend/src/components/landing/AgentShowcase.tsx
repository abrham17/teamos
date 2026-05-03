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
    <section className="py-32 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row gap-16 items-center">
      <div className="lg:w-1/2 space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full">
          <Cpu className="w-3 h-3 text-purple-400" />
          <span className="text-[10px] uppercase font-bold tracking-widest text-purple-400">Phase 02: Execution</span>
        </div>
        
        <h2 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.85]">
          Context-Driven <br />
          <span className="text-gradient">Planning.</span>
        </h2>
        
        <p className="text-slate-400 text-xl max-w-lg leading-relaxed">
          The wiki isn&apos;t just for reading. Our agents use it as a grounding layer. They read your entire interlinked logic before architecting a single task, ensuring plans are authoritative, not just estimated.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-12">
          {stages.map((s, i) => (
            <div 
              key={i}
              className={cn(
                "p-4 rounded-2xl border transition-all duration-500",
                activeStage === i ? "bg-white/10 border-white/20 shadow-xl" : "bg-transparent border-white/5 opacity-40 grayscale"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "p-2 rounded-lg",
                  i === 0 ? "bg-blue-500/20 text-blue-400" :
                  i === 1 ? "bg-purple-500/20 text-purple-400" :
                  i === 2 ? "bg-pink-500/20 text-pink-400" : "bg-emerald-500/20 text-emerald-400"
                )}>
                  {s.icon}
                </div>
                <h4 className="font-bold uppercase tracking-tighter text-sm italic">{s.title}</h4>
              </div>
              <p className="text-[10px] text-slate-500 line-clamp-2 uppercase tracking-wider leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:w-1/2 w-full h-[500px] glass rounded-[3rem] border border-white/5 relative overflow-hidden flex items-center justify-center">
         {/* Live "System Log" Animation */}
         <div className="absolute inset-0 p-8 font-mono text-[10px] text-blue-500/30 overflow-hidden pointer-events-none uppercase tracking-tighter select-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div 
                key={i}
                animate={{ x: [-20, 20, -20], opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 5 + i, repeat: Infinity }}
                className="mb-1"
              >
                [SYSTEM] LOG_{8274 + i} :: ANALYZING_CONTEXT_SLICE_{i} :: CONFIDENCE=0.9{i}
              </motion.div>
            ))}
         </div>

         <div className="relative w-full max-w-sm px-8 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStage}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 1.05 }}
                transition={{ duration: 0.5 }}
                className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl relative z-10"
              >
                {activeStage === 0 && (
                   <div className="flex flex-col gap-4">
                      <div className="h-2 w-1/3 bg-blue-500/20 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} className="h-full bg-blue-400" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-3 w-full bg-white/5 rounded" />
                        <div className="h-3 w-3/4 bg-white/5 rounded" />
                        <div className="h-3 w-5/6 bg-white/5 rounded" />
                      </div>
                      <span className="text-[9px] text-blue-400 uppercase tracking-widest font-mono">Scanning Knowledge Graph...</span>
                   </div>
                )}

                {activeStage === 1 && (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-[10px] font-bold italic">M{i}</div>
                        <div className="h-2 flex-1 bg-white/5 rounded" />
                      </div>
                    ))}
                    <span className="text-[9px] text-purple-400 uppercase tracking-widest font-mono">Sequencing Milestones...</span>
                  </div>
                )}

                {activeStage === 2 && (
                  <div className="flex flex-wrap gap-2">
                    {['MEL', 'SAM', 'ANNA', 'REX'].map((user, i) => (
                      <motion.div 
                        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }}
                        key={user} 
                        className="px-3 py-1 bg-pink-500 text-black font-black text-[10px] rounded tracking-widest"
                      >
                        {user}
                      </motion.div>
                    ))}
                    <span className="w-full text-[9px] text-pink-400 uppercase tracking-widest font-mono mt-2">Optimal Resource Alloc...</span>
                  </div>
                )}

                {activeStage === 3 && (
                  <div className="flex flex-col items-center gap-4 py-4 text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-black"
                    >
                      <CheckSquare className="w-8 h-8" />
                    </motion.div>
                    <h5 className="font-bold uppercase tracking-tighter text-white">Project Initialized</h5>
                    <span className="text-slate-500 text-[10px] font-mono tracking-widest">WORKSPACE_UUID_A82-F19</span>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
         </div>
      </div>
    </section>
  );
}
