"use client";

import React from 'react';
import { motion } from 'motion/react';
import { 
  Code2, 
  Compass, 
  FlaskConical, 
  Rocket, 
  GitBranch,
  Network,
  ClipboardCheck,
  TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function UseCaseGrid() {
  const cases = [
    {
      title: "Engineering Workspace",
      desc: "Automatically sync software design specs directly to repository commit histories. Keep your team's technical documentation permanently aligned with actual codebase changes.",
      icon: <Code2 className="w-5 h-5 text-blue-400" />,
      tag: "Code & Spec Sync",
      span: "md:col-span-2 lg:col-span-2",
      glowColor: "group-hover:border-blue-500/30 group-hover:bg-blue-500/[0.02]",
      badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      element: (
        <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-white/[0.04] font-mono text-[9px] text-slate-500 space-y-1">
          <div className="flex items-center gap-1.5 text-blue-400">
            <GitBranch className="w-3 h-3" />
            <span>git checkout -b feature/spec-alignment</span>
          </div>
          <div>&gt; Scanning wiki page: systems-architecture.md...</div>
          <div className="text-emerald-400">&gt; Success: 14 schema specifications verified.</div>
        </div>
      )
    },
    {
      title: "Academic Research",
      desc: "Index complex papers, datasets, and cross-reference research sources into a unified visual graph.",
      icon: <FlaskConical className="w-5 h-5 text-pink-400" />,
      tag: "Knowledge Graphing",
      span: "md:col-span-1 lg:col-span-1",
      glowColor: "group-hover:border-pink-500/30 group-hover:bg-pink-500/[0.02]",
      badgeClass: "bg-pink-500/10 text-pink-400 border-pink-500/20",
      element: (
        <div className="mt-4 flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-white/[0.04]">
          <span className="text-[10px] font-semibold text-slate-400">Node Weight</span>
          <div className="flex items-center gap-1">
            <Network className="w-3 h-3 text-pink-400" />
            <span className="text-[10px] font-mono font-bold text-white">99.2%</span>
          </div>
        </div>
      )
    },
    {
      title: "Product Roadmaps",
      desc: "Turn specifications into schedules. Agents build dependency milestones using document context.",
      icon: <Compass className="w-5 h-5 text-purple-400" />,
      tag: "Autonomous Planning",
      span: "md:col-span-1 lg:col-span-1",
      glowColor: "group-hover:border-purple-500/30 group-hover:bg-purple-500/[0.02]",
      badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      element: (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>Milestones</span>
            <span>2/3 Done</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
            <div className="bg-purple-500 h-full w-[66%]" />
          </div>
        </div>
      )
    },
    {
      title: "Corporate Strategy",
      desc: "Deploy decisions directly to operational goals. Maintain permanent records explaining 'why we built this,' and leverage historical documents to prevent repeating past engineering or operational mistakes.",
      icon: <Rocket className="w-5 h-5 text-emerald-400" />,
      tag: "Decision Records",
      span: "md:col-span-2 lg:col-span-2",
      glowColor: "group-hover:border-emerald-500/30 group-hover:bg-emerald-500/[0.02]",
      badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      element: (
        <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
          <div className="p-2 rounded bg-slate-900 border border-white/[0.04] flex items-center gap-2">
            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300 font-bold">SOC2 Audited</span>
          </div>
          <div className="p-2 rounded bg-slate-900 border border-white/[0.04] flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300 font-bold">14x Velocity</span>
          </div>
        </div>
      )
    }
  ];

  return (
    <section className="py-28 px-6 border-t border-white/[0.05] relative overflow-hidden bg-slate-950/20">
      <div className="max-w-6xl mx-auto space-y-16">
        {/* Section Header */}
        <div className="max-w-xl text-left space-y-4">
          <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.08] text-white">
            Built for every team.
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Specialized workflows optimized for high-velocity teams. Fusing context and execution across all business departments.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cases.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className={cn(
                "group p-6 rounded-2xl border border-white/[0.06] bg-slate-950/40 backdrop-blur-md flex flex-col justify-between hover:scale-[1.01] transition-all",
                c.glowColor,
                c.span
              )}
            >
              <div>
                {/* Header Badge */}
                <div className="flex items-center justify-between mb-6">
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05] group-hover:bg-white/[0.08] transition-all">
                    {c.icon}
                  </div>
                  <span className={cn("text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded border", c.badgeClass)}>
                    {c.tag}
                  </span>
                </div>

                {/* Text Description */}
                <div className="space-y-2.5">
                  <h3 className="text-lg font-extrabold text-white tracking-tight">{c.title}</h3>
                  <p className="text-slate-400 text-[12px] md:text-[13px] leading-relaxed">{c.desc}</p>
                </div>
              </div>

              {/* Dynamic Bottom Graphic Element */}
              <div className="pt-2">
                {c.element}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
