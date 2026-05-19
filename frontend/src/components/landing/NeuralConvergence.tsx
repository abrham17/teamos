"use client";

import React from 'react';
import { motion } from 'motion/react';
import { Share2, FileText, Globe, Link as LinkIcon } from 'lucide-react';

export default function NeuralConvergence() {
  return (
    <section className="py-24 px-6 border-t border-[var(--border-subtle)]">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-[var(--border-subtle)] bg-[var(--bg-800)]">
            <Share2 className="w-3 h-3 text-[var(--accent)]" />
            <span className="text-[11px] uppercase font-medium tracking-widest text-[var(--text-muted)]">The Problem: Fragmentation</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            Stop chasing<br />
            <span className="text-[var(--accent)]">lost context.</span>
          </h2>
          <p className="text-[var(--text-muted)] text-base leading-relaxed max-w-sm">
            Most teams lose velocity searching across disparate silos. TeamOS converges files, chats, and URLs into a single knowledge map.
          </p>
        </div>

        <div className="relative h-[360px] border border-[var(--border-subtle)] bg-[var(--bg-800)] overflow-hidden p-10 flex items-center justify-center">
          <div className="relative w-full h-full">
            {/* Silo Side (Left) */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1/3 flex flex-col gap-8 items-center">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 2 + i, ease: "easeInOut" }}
                  className="w-10 h-10 border border-[var(--border-subtle)] bg-[var(--bg-700)] flex items-center justify-center text-[var(--text-dim)]"
                >
                  <FileText className="w-4 h-4" />
                </motion.div>
              ))}
            </div>

            {/* Path */}
            <div className="absolute left-1/3 right-1/4 top-1/2 -translate-y-1/2 h-px bg-[var(--border-strong)] overflow-hidden">
              <motion.div
                animate={{ x: ["0%", "400%"] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                className="w-16 h-full bg-[var(--accent)]"
              />
            </div>

            {/* Convergence Node (Right) */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/2 flex items-center justify-center">
              <div className="relative w-40 h-40">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 24, ease: "linear" }}
                  className="absolute inset-0 border border-dashed border-[var(--border-strong)]"
                />
                <div className="absolute inset-4 border border-[var(--border-subtle)] bg-[var(--bg-700)] flex items-center justify-center">
                  <Globe className="w-10 h-10 text-[var(--accent)]" />
                </div>
                {[0, 90, 180, 270].map((angle, i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ delay: i * 0.4, repeat: Infinity, duration: 2 }}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-68px)`,
                    }}
                    className="w-7 h-7 bg-[var(--accent)] flex items-center justify-center text-white"
                  >
                    <LinkIcon className="w-3 h-3" />
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
