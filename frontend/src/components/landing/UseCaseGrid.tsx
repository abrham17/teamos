"use client";

import React from 'react';
import { motion } from 'motion/react';
import { Code2, Compass, FlaskConical, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function UseCaseGrid() {
  const cases = [
    {
      title: "Engineering",
      desc: "Link architecture specs to actual PR history. Automate documentation updates.",
      icon: <Code2 className="w-6 h-6 text-blue-400" />,
      span: "md:col-span-2 lg:col-span-2"
    },
    {
      title: "Research",
      desc: "Connect papers, datasets, and internal notes into a logic chain.",
      icon: <FlaskConical className="w-6 h-6 text-pink-400" />,
      span: "md:col-span-1 lg:col-span-1"
    },
    {
      title: "Product",
      desc: "From brief to execution. Let agents build your roadmap from wiki context.",
      icon: <Compass className="w-6 h-6 text-purple-400" />,
      span: "md:col-span-1 lg:col-span-1"
    },
    {
      title: "Strategy",
      desc: "Infinite context for decision records. Never ask 'why did we do this?' again.",
      icon: <Rocket className="w-6 h-6 text-emerald-400" />,
      span: "md:col-span-2 lg:col-span-2"
    }
  ];

  return (
    <section className="py-32 px-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-16 gap-8">
        <div className="space-y-4 max-w-2xl text-left">
          <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none italic">
            Built for <span className="text-gradient">Every Node.</span>
          </h2>
          <p className="text-slate-500 text-lg uppercase tracking-widest font-bold font-display">Specialized verticals for advanced knowledge operations.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cases.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn(
              "p-8 rounded-[2rem] bg-white/5 border border-white/5 hover:border-white/20 transition-all group",
              c.span
            )}
          >
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              {c.icon}
            </div>
            <h3 className="text-3xl font-black uppercase tracking-tighter mb-4 italic text-white">{c.title}</h3>
            <p className="text-slate-500 text-sm leading-relaxed font-mono uppercase tracking-widest">{c.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
