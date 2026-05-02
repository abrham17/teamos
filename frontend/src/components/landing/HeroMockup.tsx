"use client";

import React from 'react';
import { motion } from 'motion/react';
import { Search, Link as LinkIcon, Cpu, Rocket, Network } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function HeroMockup() {
  return (
    <div className="relative w-full aspect-square md:aspect-video glass rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden p-4">
      {/* Sidebar */}
      <div className="absolute left-0 top-0 bottom-0 w-20 md:w-64 border-r border-white/5 bg-white/[0.02] p-6 hidden md:flex flex-col gap-8">
        <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded" />
            <div className="h-4 w-24 bg-white/10 rounded" />
        </div>
        <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-3">
                    <div className="w-4 h-4 bg-white/5 rounded" />
                    <div className="h-2 w-32 bg-white/5 rounded" />
                </div>
            ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="absolute left-20 md:left-64 right-0 top-0 bottom-0 p-8 flex flex-col gap-8">
        {/* Top bar */}
        <div className="flex justify-between items-center bg-white/[0.02] p-4 rounded-xl border border-white/5">
            <div className="flex gap-4">
                <Search className="w-4 h-4 text-slate-500" />
                <div className="h-4 w-64 bg-white/5 rounded" />
            </div>
            <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-500/20" />
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10" />
            </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 overflow-hidden">
            {/* Wiki Page View - The Context */}
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-6 relative group overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                <div className="h-8 w-2/3 bg-white/10 rounded" />
                <div className="space-y-3">
                    <div className="h-3 w-full bg-white/5 rounded" />
                    <div className="h-3 w-full bg-white/5 rounded" />
                    <div className="h-3 w-4/5 bg-white/5 rounded" />
                    <div className="h-3 w-full bg-blue-500/10 rounded" />
                </div>
                <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between">
                    <div className="text-[8px] font-bold text-slate-500 uppercase">Wiki Documentation</div>
                    <LinkIcon className="w-3 h-3 text-blue-400 group-hover:scale-125 transition-transform" />
                </div>
            </div>

            {/* Agentic Planning Canvas - The Outcome */}
            <div className="bg-blue-500/[0.02] border border-blue-500/10 rounded-2xl p-6 relative overflow-hidden flex flex-col gap-6">
                 <div className="flex items-center justify-between">
                    <div className="text-[10px] font-black uppercase tracking-tighter text-blue-400 flex items-center gap-2">
                        <Cpu className="w-3 h-3" />
                        Project Planner
                    </div>
                    <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
                        <Rocket className="w-4 h-4 text-white" />
                    </div>
                 </div>

                 <div className="space-y-3">
                    {[
                        { label: "Define Milestones", status: "Done" },
                        { label: "Cross-Reference Wiki", status: "Active" },
                        { label: "Build Roadmap", status: "Wait" }
                    ].map((step, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">{step.label}</span>
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                step.status === 'Done' ? "bg-emerald-500" : 
                                step.status === 'Active' ? "bg-blue-500 animate-pulse" : "bg-slate-700"
                            )} />
                        </div>
                    ))}
                 </div>

                 <div className="absolute bottom-4 right-4">
                    <Network className="w-32 h-32 text-blue-500 opacity-5 rotate-12" />
                 </div>
            </div>
        </div>
      </div>
    </div>
  );
}
