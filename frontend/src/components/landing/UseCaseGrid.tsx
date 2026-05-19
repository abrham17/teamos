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
    <section className="py-24 px-6 border-t border-[var(--border-subtle)]">
      <div className="max-w-6xl mx-auto">
        <div className="mb-14 space-y-3">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            Built for every team.
          </h2>
          <p className="text-[var(--text-muted)] text-base">Specialized for the verticals that matter most.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--border-subtle)]">
          {cases.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={cn(
                "p-8 bg-[var(--bg-950)] hover:bg-[var(--bg-800)] transition-colors group",
                c.span
              )}
            >
              <div className="mb-5 text-[var(--accent)]">
                {c.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3">{c.title}</h3>
              <p className="text-[var(--text-muted)] text-[13px] leading-relaxed">{c.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
