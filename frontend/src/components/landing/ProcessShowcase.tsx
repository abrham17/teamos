"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'IDLE' | 'UPLOADING' | 'PROCESSING' | 'QUEUE' | 'WIKI_DONE' | 'GRAPH_BUILD';

export default function ProcessShowcase() {
  const [step, setStep] = useState<Step>('IDLE');

  useEffect(() => {
    const sequence = async () => {
      while (true) {
        setStep('IDLE');
        await new Promise(r => setTimeout(r, 2000));
        setStep('UPLOADING');
        await new Promise(r => setTimeout(r, 1500));
        setStep('PROCESSING');
        await new Promise(r => setTimeout(r, 2000));
        setStep('QUEUE');
        await new Promise(r => setTimeout(r, 1500));
        setStep('WIKI_DONE');
        await new Promise(r => setTimeout(r, 1500));
        setStep('GRAPH_BUILD');
        await new Promise(r => setTimeout(r, 4000));
      }
    };
    sequence();
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto border border-[var(--border-subtle)] bg-[var(--bg-800)] p-8 md:p-14 relative overflow-hidden min-h-[480px] flex flex-col items-center justify-center">
      <div className="relative z-10 w-full">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-0.5 bg-[var(--bg-700)]">
          <motion.div
            className="h-full bg-[var(--accent)]"
            initial={{ width: "0%" }}
            animate={{ 
              width: step === 'IDLE' ? '0%' : 
                     step === 'UPLOADING' ? '20%' : 
                     step === 'PROCESSING' ? '40%' : 
                     step === 'QUEUE' ? '60%' : 
                     step === 'WIKI_DONE' ? '80%' : '100%' 
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Animation Viewport */}
          <div className="relative h-64 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {step === 'IDLE' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.2 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="w-16 h-16 border border-[var(--border-subtle)] bg-[var(--bg-700)] flex items-center justify-center">
                    <FileText className="w-8 h-8 text-[var(--text-dim)]" />
                  </div>
                  <span className="text-[var(--text-dim)] font-mono text-[11px] uppercase tracking-widest">Awaiting Input</span>
                </motion.div>
              )}

              {step === 'UPLOADING' && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="relative"
                >
                  <motion.div
                    animate={{ y: [0, -40, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-14 h-14 border border-[var(--border-subtle)] bg-[var(--bg-700)] flex items-center justify-center text-[var(--accent)]"
                  >
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </motion.div>
                </motion.div>
              )}

              {step === 'PROCESSING' && (
                <motion.div
                  key="process"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative w-full flex justify-center"
                >
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map(i => (
                      <motion.div
                        key={i}
                        animate={{ height: [20, 60, 20], opacity: [0.3, 1, 0.3] }}
                        transition={{ delay: i * 0.1, repeat: Infinity }}
                        className="w-3 bg-[var(--accent)]"
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {step === 'GRAPH_BUILD' && (
                <motion.div
                  key="graph"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative w-full h-full flex items-center justify-center p-8 overflow-hidden"
                >
                  <div className="relative w-full h-full border border-[var(--border-subtle)] p-4 flex items-center justify-center">
                    <svg width="100%" height="100%" viewBox="0 0 100 100">
                      {/* Main Node */}
                      <motion.circle cx="50" cy="50" r="4" fill="#3b82f6" />
                      
                      {/* Interlinking Edges and Nodes (2D) */}
                      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                        <g key={i}>
                          <motion.line 
                            x1="50" y1="50" 
                            x2={50 + 35 * Math.cos(angle * Math.PI / 180)}
                            y2={50 + 35 * Math.sin(angle * Math.PI / 180)}
                            stroke="#ffffff10"
                            strokeWidth="0.5"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ delay: i * 0.1, duration: 1 }}
                          />
                          <motion.circle 
                            cx={50 + 35 * Math.cos(angle * Math.PI / 180)}
                            cy={50 + 35 * Math.sin(angle * Math.PI / 180)}
                            r="2.5"
                            fill={i % 2 === 0 ? "#4f46e5" : "#6366f1"}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.5 + i * 0.1 }}
                          />
                          {/* Secondary level edges to show complexity */}
                          {i % 2 === 0 && (
                            <motion.line 
                              x1={50 + 35 * Math.cos(angle * Math.PI / 180)}
                              y1={50 + 35 * Math.sin(angle * Math.PI / 180)}
                              x2={50 + 45 * Math.cos((angle + 10) * Math.PI / 180)}
                              y2={50 + 45 * Math.sin((angle + 10) * Math.PI / 180)}
                              stroke="#ffffff05"
                              strokeWidth="0.3"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ delay: 1 + i * 0.1 }}
                            />
                          )}
                        </g>
                      ))}
                    </svg>
                    <div className="absolute top-2 left-2 text-[10px] font-mono text-[var(--text-dim)] uppercase">Graph Build</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Text Content */}
          <div className="flex flex-col gap-4 text-left">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <h3 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
                {step === 'IDLE' && "Standby"}
                {step === 'UPLOADING' && "Ingesting Stream"}
                {step === 'PROCESSING' && "Neural Chunking"}
                {step === 'QUEUE' && "Job Alignment"}
                {step === 'WIKI_DONE' && "Wiki Synthesized"}
                {step === 'GRAPH_BUILD' && "Map Expansion"}
              </h3>
              
              <p className="text-[var(--text-muted)] text-[14px] leading-relaxed max-w-sm">
                {step === 'IDLE' && "Waiting for a PDF, URL, or raw document to enter the system."}
                {step === 'UPLOADING' && "Pushing structured elements into the TeamOS secure sandbox."}
                {step === 'PROCESSING' && "Breaking information into 512-token semantic vectors for RAG."}
                {step === 'GRAPH_BUILD' && "AI identifies relationships between this doc and existing team wiki context."}
              </p>

              <div className="flex items-center gap-3">
                <StatusIndicator active={step === 'UPLOADING'} label="Ingest" />
                <StatusIndicator active={step === 'PROCESSING'} label="Embed" />
                <StatusIndicator active={step === 'GRAPH_BUILD'} label="Map" />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusIndicator({ active, label }: { active: boolean, label: string }) {
  return (
    <div className={cn(
      "px-3 py-1 text-[10px] font-semibold uppercase tracking-widest border transition-colors",
      active ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border-subtle)] text-[var(--text-dim)]"
    )}>
      {label}
    </div>
  );
}
