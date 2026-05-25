"use client";

import React from 'react';
import { motion } from 'motion/react';
import { 
  Share2, 
  MessageSquare, 
  FileText, 
  GitFork, 
  Globe, 
  Link as LinkIcon, 
  Database,
  ArrowRight
} from 'lucide-react';

export default function NeuralConvergence() {
  const sources = [
    { label: "Slack & Chats", icon: <MessageSquare className="w-4 h-4 text-sky-400" />, desc: "Muted discussions" },
    { label: "GitHub & Code", icon: <GitFork className="w-4 h-4 text-indigo-400" />, desc: "Stale PR history" },
    { label: "Team Wiki Docs", icon: <FileText className="w-4 h-4 text-emerald-400" />, desc: "Isolated manuals" },
    { label: "Reference URLs", icon: <Globe className="w-4 h-4 text-amber-400" />, desc: "Bookmark folders" },
  ];

  return (
    <section className="py-28 px-6 border-t border-white/[0.05] relative overflow-hidden bg-slate-950/20">
      {/* Background radial highlight */}
      <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--accent)]/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
        {/* Text Content */}
        <div className="lg:col-span-5 space-y-7 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] shadow-[0_2px_10px_rgba(0,0,0,0.2)]">
            <Share2 className="w-3.5 h-3.5 text-[var(--accent-light)]" />
            <span className="text-[11px] uppercase font-bold tracking-widest text-slate-400">Context Fragmentation</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.08] text-white">
            Stop chasing<br />
            <span className="text-gradient">lost context.</span>
          </h2>

          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Most teams lose velocity hunting across chat threads, static wikis, and issue boards. TeamOS converges your files, chats, and URLs into a live, semantic knowledge graph.
          </p>

          <div className="space-y-3.5 pt-2">
            {[
              "Eliminate manual page linking and tagging chores",
              "Surface hidden relationships between code and docs",
              "Ground AI agents in verified team knowledge"
            ].map((bullet, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-1 w-4 h-4 rounded-full bg-[var(--accent)]/10 flex items-center justify-center border border-[var(--accent)]/20">
                  <ArrowRight className="w-2.5 h-2.5 text-[var(--accent-light)]" />
                </div>
                <span className="text-[13px] font-semibold text-slate-300 leading-normal">{bullet}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Visual Animation Box */}
        <div className="lg:col-span-7 relative h-[420px] rounded-2xl border border-white/[0.06] bg-slate-900/30 overflow-hidden p-8 flex items-center justify-center shadow-xl">
          {/* Subtle grid pattern background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
          
          <div className="relative w-full h-full flex items-center justify-between z-10">
            {/* Silo Side (Left Stack) */}
            <div className="w-48 flex flex-col gap-4 relative z-20">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-2 select-none">Fragmented Silos</span>
              {sources.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  whileHover={{ x: 4, scale: 1.02 }}
                  className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.05] bg-slate-950/70 shadow-md cursor-default group"
                >
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05] group-hover:bg-white/[0.08] transition-colors">
                    {s.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-white">{s.label}</span>
                    <span className="text-[9px] text-slate-500">{s.desc}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* SVG Interactive Lines Canvas */}
            <div className="absolute inset-0 w-full h-full pointer-events-none">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                {/* Connection flows from Left to Right */}
                {[
                  { y1: 72, y2: 180, color: "var(--accent)" },
                  { y1: 136, y2: 195, color: "var(--accent)" },
                  { y1: 200, y2: 210, color: "var(--accent)" },
                  { y1: 264, y2: 225, color: "var(--accent)" }
                ].map((path, i) => (
                  <g key={i}>
                    {/* Background faint path line */}
                    <path 
                      d={`M 180 ${path.y1} C 280 ${path.y1}, 280 ${path.y2}, 380 ${path.y2}`} 
                      stroke="rgba(255,255,255,0.03)" 
                      strokeWidth="1.5" 
                      fill="none" 
                    />
                    {/* Glowing flow animation line */}
                    <path 
                      d={`M 180 ${path.y1} C 280 ${path.y1}, 280 ${path.y2}, 380 ${path.y2}`} 
                      stroke={path.color} 
                      strokeWidth="1.5" 
                      fill="none" 
                      className="svg-flow-line opacity-50"
                      style={{ animationDelay: `${i * 0.4}s` }}
                    />
                  </g>
                ))}
              </svg>
            </div>

            {/* Convergence Node (Right Panel) */}
            <div className="flex flex-col items-center gap-4 relative z-20">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest select-none text-center">TeamOS Knowledge Hub</span>
              
              <div className="relative w-44 h-44 flex items-center justify-center">
                {/* Outer spin circle */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 24, ease: "linear" }}
                  className="absolute inset-0 border border-dashed border-white/[0.08] rounded-full"
                />

                {/* Second spin circle reverse */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 32, ease: "linear" }}
                  className="absolute inset-2.5 border border-dashed border-[var(--accent)]/15 rounded-full"
                />

                {/* Core Sphere */}
                <div className="relative w-28 h-28 rounded-full border border-white/[0.1] bg-slate-950 flex flex-col items-center justify-center shadow-[0_0_30px_rgba(139,127,244,0.12)]">
                  {/* Floating ambient glow inside sphere */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent)]/10 to-transparent rounded-full animate-pulse" />
                  
                  <Database className="w-8 h-8 text-[var(--accent-light)] mb-1 relative z-10" />
                  <span className="text-[10px] font-bold text-white tracking-widest uppercase relative z-10">CORE_V3</span>
                  <span className="text-[8px] font-mono text-[var(--accent-light)] relative z-10">Converged</span>
                </div>

                {/* Orbiting nodes */}
                {[0, 120, 240].map((angle, i) => (
                  <motion.div
                    key={i}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ delay: i * 0.5, repeat: Infinity, duration: 3, ease: "easeInOut" }}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-84px) rotate(-${angle}deg)`,
                    }}
                    className="w-8 h-8 rounded-full border border-white/[0.1] bg-slate-900 flex items-center justify-center text-white shadow-lg relative z-25 hover:border-[var(--accent)]/40 hover:bg-slate-950 transition-colors"
                  >
                    <LinkIcon className="w-3.5 h-3.5 text-[var(--accent-light)]" />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
