"use client";

import React from 'react';
import { motion } from 'motion/react';
import { Share2, FileText, Globe, Link as LinkIcon } from 'lucide-react';

export default function NeuralConvergence() {
  return (
    <section className="py-32 px-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
            <Share2 className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-blue-400">The Problem: Fragmentation</span>
          </div>
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter italic leading-[0.85]">
            Stop Chasing <br />
            <span className="text-gradient">Lost Context.</span>
          </h2>
          <p className="text-slate-400 text-xl leading-relaxed">
            Most teams lose velocity searching for info in disparate silos. TeamOS converges files, chats, and URLs into a single, high-fidelity neural map.
          </p>
        </div>

        <div className="relative h-[400px] glass rounded-[3rem] border border-white/5 overflow-hidden p-12 flex items-center justify-center">
          {/* Comparison Animation Viewport */}
          <div className="relative w-full h-full">
            {/* Silo Side (Left) */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1/3 flex flex-col gap-8 items-center">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    x: [0, Math.random() * 10 - 5, 0],
                    y: [0, Math.random() * 10 - 5, 0]
                  }}
                  transition={{ repeat: Infinity, duration: 3 + i }}
                  className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500"
                >
                  <FileText className="w-5 h-5" />
                </motion.div>
              ))}
            </div>

            {/* Path To Neural */}
            <div className="absolute left-1/3 right-1/4 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-20">
              <motion.div 
                animate={{ x: ["0%", "400%"] }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="w-20 h-full bg-blue-400 shadow-[0_0_20px_#3b82f6]"
              />
            </div>

            {/* Neural Side (Right) */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/2 flex items-center justify-center">
              <div className="relative w-48 h-48">
                 <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                  className="absolute inset-0 rounded-full border border-dashed border-blue-500/20"
                 />
                 <div className="absolute inset-4 rounded-full bg-blue-500/5 backdrop-blur-xl border border-white/10 flex items-center justify-center">
                    <Globe className="w-12 h-12 text-blue-400 animate-pulse" />
                 </div>
                 {[0, 90, 180, 270].map((angle, i) => (
                   <motion.div
                    key={i}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ delay: i * 0.5, repeat: Infinity, duration: 2 }}
                    style={{ 
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-80px)`
                    }}
                    className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white"
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
