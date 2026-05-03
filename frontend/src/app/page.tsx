"use client";

import React from 'react';
import { motion } from 'motion/react';
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import Link from 'next/link';
import ProcessShowcase from '@/components/landing/ProcessShowcase';
import AgentShowcase from '@/components/landing/AgentShowcase';
import NeuralConvergence from '@/components/landing/NeuralConvergence';
import UseCaseGrid from '@/components/landing/UseCaseGrid';
import HeroMockup from '@/components/landing/HeroMockup';
import { HomePricing } from "@/components/home/HomePricing";


export default function Home() {
  const { isSignedIn } = useUser();

  return (
    <div data-theme="dark" className="min-h-screen bg-[#020617] text-white selection:bg-blue-500/30 selection:text-white relative overflow-hidden">
      {/* Background Blobs */}
      <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600 rounded-full blur-[120px] opacity-10 pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-indigo-600 rounded-full blur-[120px] opacity-10 pointer-events-none" />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-8 backdrop-blur-md bg-transparent border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-white shadow-lg">
              T
            </div>
            <span className="font-display font-black tracking-tighter text-2xl uppercase">TeamOS</span>
          </div>
          
          <div className="flex items-center gap-4">
            {!isSignedIn ? (
              <>
                <SignInButton mode="modal">
                  <button className="hidden sm:block text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="bg-blue-600 text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-all">
                    Sign Up
                  </button>
                </SignUpButton>
              </>
            ) : (
              <Link href="/wiki" className="bg-blue-600 text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-all">
                Go to Workspace
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 pt-20">
        <section className="relative px-6 min-h-[calc(100vh-80px)] flex items-center justify-center pt-10">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-left space-y-8"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full mb-6">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Team Logic v1.2 Active</span>
              </div>

              <h1 className="text-7xl md:text-8xl font-black leading-[0.85] tracking-tighter uppercase italic">
                Wiki meets <br/>
                <span className="text-gradient">Planning.</span>
              </h1>
              
              <p className="text-slate-400 text-lg md:text-xl max-w-sm leading-relaxed mt-8">
                The first knowledge engine that doesn&apos;t just store documentation—it uses it to architect and plan your team&apos;s projects automatically.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 mt-12">
                {!isSignedIn ? (
                  <SignUpButton mode="modal">
                    <button className="w-full sm:w-auto bg-white text-black px-12 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-transform shadow-2xl">
                      Get Started
                    </button>
                  </SignUpButton>
                ) : (
                  <Link href="/wiki" className="w-full sm:w-auto bg-white text-black px-12 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-transform shadow-2xl text-center flex items-center justify-center">
                    Open Workspace
                  </Link>
                )}
                <div className="text-[10px] font-bold tracking-[0.4em] text-slate-600 uppercase">
                  Wiki // Graph // Ops // Planning
                </div>
              </div>
            </motion.div>

            {/* Hero Mockup Area */}
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: 0.4, duration: 1 }}
               className="relative lg:block hidden"
            >
              <div className="absolute -inset-4 bg-blue-500/10 blur-3xl opacity-50" />
              <HeroMockup />
              
              {/* Floating Data Label */}
              <div className="absolute -top-10 -left-10 p-4 bg-black/40 border border-white/10 rounded-xl backdrop-blur-md w-48 shadow-2xl">
                <div className="text-[10px] text-blue-400 font-bold uppercase tracking-tighter mb-1">Knowledge Nodes</div>
                <div className="text-3xl font-mono font-bold tracking-tighter">4,285</div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Neural Convergence (Problem/Solution) */}
        <NeuralConvergence />

        {/* Phase 1: Ingestion & Synthesis */}
        <section className="py-32 px-6 bg-gradient-to-b from-transparent to-blue-950/10">
          <div className="max-w-7xl mx-auto text-center mb-24 space-y-6">
             <motion.span 
               initial={{ opacity: 0 }}
               whileInView={{ opacity: 1 }}
               className="text-blue-500 font-mono text-[10px] tracking-[0.5em] uppercase font-bold"
             >
               PHASE_01: SYNTHESIS
             </motion.span>
             <h2 className="text-6xl md:text-8xl font-black uppercase tracking-tighter italic text-gradient leading-[0.85]">
                Ingestion & <br/> Mapping.
             </h2>
             <p className="text-slate-400 text-xl max-w-2xl mx-auto">
                Watch how the engine ingests raw data, builds semantic vectors, and wires relationships into the knowledge graph.
             </p>
          </div>
          <ProcessShowcase />
        </section>

        {/* Bridging Narrative */}
        <section className="py-20 flex flex-col items-center">
          <motion.div 
            initial={{ height: 0 }}
            whileInView={{ height: 80 }}
            className="w-px bg-gradient-to-b from-blue-500 to-purple-500"
          />
          <div className="py-8 text-center max-w-xl">
            <h3 className="text-xl font-bold uppercase tracking-tighter italic text-slate-400">Context meets Action.</h3>
            <p className="text-sm text-slate-500 uppercase tracking-widest mt-2 font-mono">The knowledge synthesized in Phase 01 feeds directly into the Agentic Planner, turning static docs into dynamic roadmaps.</p>
          </div>
          <motion.div 
            initial={{ height: 0 }}
            whileInView={{ height: 80 }}
            className="w-px bg-gradient-to-b from-purple-500 to-transparent"
          />
        </section>

        {/* Use Cases Bento */}
        <UseCaseGrid />

        {/* Phase 2: Agentic Planning */}
        <section className="py-32 px-6 border-y border-white/5">
          <div className="max-w-7xl mx-auto text-center mb-24 space-y-6">
             <motion.span 
               initial={{ opacity: 0 }}
               whileInView={{ opacity: 1 }}
               className="text-purple-500 font-mono text-[10px] tracking-[0.5em] uppercase font-bold"
             >
               PHASE_02: EXECUTION
             </motion.span>
             <h2 className="text-6xl md:text-8xl font-black uppercase tracking-tighter italic text-gradient leading-[0.85]">
                Project <br/> Architecting.
             </h2>
             <p className="text-slate-400 text-xl max-w-2xl mx-auto">
                Autonomous agents leverage your synthesized wiki context to plan, resource, and deploy initiatives with perfect alignment.
             </p>
          </div>
          <AgentShowcase />
        </section>

        {/* Pricing & Payment Section */}
        <section className="py-20 px-6">
          <div className="mx-auto w-full max-w-6xl">
            <HomePricing />
          </div>
        </section>
      </main>
    </div>
  );
}
