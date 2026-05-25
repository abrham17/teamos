"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Loader2, 
  Upload, 
  Cpu, 
  CheckCircle, 
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'IDLE' | 'UPLOADING' | 'PROCESSING' | 'QUEUE' | 'WIKI_DONE' | 'GRAPH_BUILD';

export default function ProcessShowcase() {
  const [step, setStep] = useState<Step>('IDLE');

  useEffect(() => {
    let active = true;
    const sequence = async () => {
      while (active) {
        setStep('IDLE');
        await new Promise(r => setTimeout(r, 2200));
        if (!active) break;
        setStep('UPLOADING');
        await new Promise(r => setTimeout(r, 1800));
        if (!active) break;
        setStep('PROCESSING');
        await new Promise(r => setTimeout(r, 2200));
        if (!active) break;
        setStep('QUEUE');
        await new Promise(r => setTimeout(r, 1600));
        if (!active) break;
        setStep('WIKI_DONE');
        await new Promise(r => setTimeout(r, 1600));
        if (!active) break;
        setStep('GRAPH_BUILD');
        await new Promise(r => setTimeout(r, 4500));
      }
    };
    sequence();
    return () => {
      active = false;
    };
  }, []);

  const timelineSteps = [
    { key: 'IDLE', label: 'Standby' },
    { key: 'UPLOADING', label: 'Ingestion' },
    { key: 'PROCESSING', label: 'Chunk & Embed' },
    { key: 'QUEUE', label: 'Verification' },
    { key: 'WIKI_DONE', label: 'Page Creation' },
    { key: 'GRAPH_BUILD', label: 'Graph Expansion' }
  ];

  const getStepIndex = (s: Step) => {
    return timelineSteps.findIndex(x => x.key === s);
  };

  return (
    <div className="w-full max-w-5xl mx-auto glass-premium rounded-2xl p-8 md:p-12 relative overflow-hidden min-h-[500px] flex flex-col justify-between">
      {/* Background ambient light */}
      <div className="absolute -top-12 -right-12 w-64 h-64 bg-[var(--accent)]/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Top progress indicator bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-slate-900">
        <motion.div
          className="h-full bg-gradient-to-r from-[var(--accent-dark)] to-[var(--accent)]"
          initial={{ width: "0%" }}
          animate={{ 
            width: `${((getStepIndex(step) + 1) / timelineSteps.length) * 100}%` 
          }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center flex-1">
        {/* Simulation Viewport (Left side) */}
        <div className="lg:col-span-7 h-72 md:h-80 w-full rounded-xl border border-white/[0.05] bg-slate-950/70 overflow-hidden relative flex items-center justify-center p-6 shadow-inner">
          <div className="absolute top-3 left-4 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="ml-2 text-[9px] font-mono text-slate-600">teamos://engine/ingest_pipeline</span>
          </div>

          <AnimatePresence mode="wait">
            {step === 'IDLE' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <div className="w-14 h-14 rounded-full border border-dashed border-white/[0.1] bg-white/[0.01] flex items-center justify-center mb-1">
                  <Upload className="w-6 h-6 text-slate-500 animate-bounce" />
                </div>
                <span className="text-[12px] font-extrabold text-white">Awaiting raw ingestion stream</span>
                <span className="text-[10px] text-slate-500 max-w-[240px]">Drag & drop markdown documents, PDFs, or URL references</span>
              </motion.div>
            )}

            {step === 'UPLOADING' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="w-full max-w-sm space-y-4"
              >
                <div className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.05] bg-slate-900">
                  <FileText className="w-8 h-8 text-[var(--accent-light)] animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-white">API_Architecture_v2.pdf</span>
                      <span className="text-slate-400">74%</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "74%" }}
                        transition={{ duration: 1.5 }}
                        className="bg-[var(--accent)] h-full rounded-full" 
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                  <span>Transport: secure_sandbox_upload</span>
                  <span>Speed: 4.8 MB/s</span>
                </div>
              </motion.div>
            )}

            {step === 'PROCESSING' && (
              <motion.div
                key="process"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full max-w-md space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">Semantic vector chunking...</span>
                  <Cpu className="w-4 h-4 text-[var(--accent-light)] animate-spin" />
                </div>
                <div className="space-y-1.5 font-mono text-[9px] text-slate-500">
                  <div className="p-2 rounded bg-white/[0.01] border border-white/[0.04]">
                    <span className="text-indigo-400">CHUNK_01:</span> &quot;The gateway node handles authentication using Clerk tokens...&quot;
                  </div>
                  <div className="p-2 rounded bg-white/[0.01] border border-white/[0.04]">
                    <span className="text-indigo-400">CHUNK_02:</span> &quot;All inter-service calls require encryption and payload validation...&quot;
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'QUEUE' && (
              <motion.div
                key="queue"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
                <span className="text-[12px] font-extrabold text-white">Cross-referencing graph links</span>
                <span className="text-[10px] text-slate-500 max-w-[260px]">Scanning 4,285 existing knowledge nodes for reference overlap...</span>
              </motion.div>
            )}

            {step === 'WIKI_DONE' && (
              <motion.div
                key="wiki_done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-2 text-center"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-1">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-[12px] font-extrabold text-white">Ingestion Complete</span>
                <span className="text-[10px] font-mono text-emerald-400">WIKI_PAGE_UUID_A82-F19</span>
              </motion.div>
            )}

            {step === 'GRAPH_BUILD' && (
              <motion.div
                key="graph"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full h-full flex items-center justify-center"
              >
                <svg className="w-full h-full max-w-[280px]" viewBox="0 0 100 100">
                  {/* Central Ingested Node */}
                  <motion.circle 
                    cx="50" cy="50" r="4.5" 
                    fill="var(--accent)" 
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ duration: 0.4 }}
                  />
                  <circle cx="50" cy="50" r="8" stroke="var(--accent)" strokeWidth="0.5" fill="none" className="animate-ping opacity-30" />
                  
                  {/* Neighbor Nodes & Path Lines */}
                  {[
                    { angle: 0, color: "#00d4e8", label: "docs" },
                    { angle: 60, color: "#a855f7", label: "meeting" },
                    { angle: 120, color: "#00d4e8", label: "specs" },
                    { angle: 180, color: "#f97316", label: "decision" },
                    { angle: 240, color: "#ef4444", label: "incident" },
                    { angle: 300, color: "#22c55e", label: "tasks" }
                  ].map((n, i) => {
                    const rad = (n.angle * Math.PI) / 180;
                    const x = 50 + 32 * Math.cos(rad);
                    const y = 50 + 32 * Math.sin(rad);

                    return (
                      <g key={i}>
                        {/* Connecting Path */}
                        <motion.line 
                          x1="50" y1="50" 
                          x2={x} y2={y}
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="0.75"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ delay: i * 0.15, duration: 0.8 }}
                        />
                        {/* Connecting flow dot */}
                        <motion.line 
                          x1="50" y1="50" 
                          x2={x} y2={y}
                          stroke="var(--accent)"
                          strokeWidth="0.75"
                          className="svg-flow-line opacity-40"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ delay: i * 0.15, duration: 0.8 }}
                        />
                        {/* Orbiting Node */}
                        <motion.circle 
                          cx={x} cy={y} r="2.5"
                          fill={n.color}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.4 + i * 0.15 }}
                        />
                      </g>
                    );
                  })}
                </svg>
                <div className="absolute bottom-2 right-4 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[var(--accent-light)] animate-pulse" />
                  <span className="text-[9px] font-mono text-[var(--accent-light)] uppercase tracking-wider">Mapping context references</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Informative Text Container (Right side) */}
        <div className="lg:col-span-5 space-y-6 text-left">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold font-mono tracking-widest text-[var(--accent-light)] uppercase px-2 py-0.5 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  {step === 'IDLE' && 'STATUS: STANDBY'}
                  {step === 'UPLOADING' && 'STATUS: STREAMING'}
                  {step === 'PROCESSING' && 'STATUS: SYNTHESIS'}
                  {step === 'QUEUE' && 'STATUS: INDEXING'}
                  {step === 'WIKI_DONE' && 'STATUS: RESOLVED'}
                  {step === 'GRAPH_BUILD' && 'STATUS: INTEGRATION'}
                </span>
              </div>

              <h3 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
                {step === 'IDLE' && "Waiting for Source"}
                {step === 'UPLOADING' && "Ingesting Sandbox Stream"}
                {step === 'PROCESSING' && "Semantic Vectorizing"}
                {step === 'QUEUE' && "Verifying Dependencies"}
                {step === 'WIKI_DONE' && "Wiki Workspace Synthesized"}
                {step === 'GRAPH_BUILD' && "Expanding Semantic Graph"}
              </h3>
              
              <p className="text-slate-400 text-xs md:text-[13px] leading-relaxed">
                {step === 'IDLE' && "The ingestion pipeline is idle. Add Markdown documents, web links, or meeting notes to configure your workspace."}
                {step === 'UPLOADING' && "The engine ingests the source file into a secure sandbox workspace, extracting headers, metadata, and body structures."}
                {step === 'PROCESSING' && "Document contents are sliced into 512-token chunks, processed through an LLM encoder, and converted to high-dimensional embedding vectors."}
                {step === 'QUEUE' && "Verification checks compare the new content references against existing page files, incidents, and decisions."}
                {step === 'WIKI_DONE' && "A fully formatted wiki page is generated containing structured formatting, source citations, and tag mappings."}
                {step === 'GRAPH_BUILD' && "The AI maps relationships between this node and existing workspace context, wiring updates instantly to your interactive graph."}
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                <StatusChip active={getStepIndex(step) >= 1} label="Ingest" />
                <StatusChip active={getStepIndex(step) >= 2} label="Embed" />
                <StatusChip active={getStepIndex(step) >= 5} label="Integrate Graph" />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Stepper Indicator */}
      <div className="mt-10 pt-6 border-t border-white/[0.05] grid grid-cols-3 md:grid-cols-6 gap-3">
        {timelineSteps.map((s, idx) => {
          const isActive = step === s.key;
          const isCompleted = getStepIndex(step) > idx;

          return (
            <div 
              key={s.key} 
              className={cn(
                "flex flex-col gap-1.5 text-left border-t-2 pt-2.5 transition-all duration-300",
                isActive 
                  ? "border-[var(--accent)]" 
                  : isCompleted 
                    ? "border-emerald-500 opacity-80" 
                    : "border-white/[0.06] opacity-35"
              )}
            >
              <span className={cn(
                "text-[8px] font-bold uppercase tracking-widest font-mono",
                isActive 
                  ? "text-[var(--accent-light)]" 
                  : isCompleted 
                    ? "text-emerald-400" 
                    : "text-slate-500"
              )}>
                Step 0{idx + 1}
              </span>
              <span className="text-[10px] font-bold text-white leading-tight">
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusChip({ active, label }: { active: boolean, label: string }) {
  return (
    <div className={cn(
      "px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest rounded transition-all",
      active 
        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
        : "bg-slate-900 text-slate-500 border border-white/[0.04]"
    )}>
      {label}
    </div>
  );
}
