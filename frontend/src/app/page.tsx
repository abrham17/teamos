"use client";

import React from 'react';
import { motion } from 'motion/react';
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import Link from 'next/link';
import { ArrowRight, Sparkles, Database, Shield } from 'lucide-react';
import ProcessShowcase from '@/components/landing/ProcessShowcase';
import AgentShowcase from '@/components/landing/AgentShowcase';
import NeuralConvergence from '@/components/landing/NeuralConvergence';
import UseCaseGrid from '@/components/landing/UseCaseGrid';
import HeroMockup from '@/components/landing/HeroMockup';
import { HomePricing } from "@/components/home/HomePricing";
import LandingFooter from '@/components/landing/LandingFooter';
import { Illustration } from '@/components/ui/Illustration';
import { ICONSCOUT } from '@/lib/iconscoutAssets';

export default function Home() {
  const { isSignedIn } = useUser();

  return (
    <div data-theme="dark" className="min-h-screen bg-[#06060a] text-[var(--text-primary)] font-sans relative overflow-x-hidden">
      
      {/* Floating Ambient Glow Orbs */}
      <div className="absolute top-[10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] animate-float-slow pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[140px] animate-float-slow pointer-events-none" style={{ animationDelay: '2s' }} />
      <div className="absolute top-[75%] left-[10%] w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[130px] animate-float-slow pointer-events-none" style={{ animationDelay: '4s' }} />

      {/* Floating Glassmorphic Navbar */}
      <header className="fixed top-4 left-4 right-4 z-50 max-w-5xl mx-auto">
        <nav className="h-16 px-6 rounded-2xl border border-white/[0.08] bg-slate-950/75 backdrop-blur-md flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center font-bold text-white text-[12px] shadow-[var(--shadow-glow)]">
              T
            </div>
            <span className="font-extrabold tracking-tight text-[16px] text-white">TeamOS</span>
          </div>

          <div className="flex items-center gap-4">
            {!isSignedIn ? (
              <>
                <SignInButton mode="modal">
                  <button className="text-[13px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white px-5 py-2.5 text-[12px] font-bold uppercase tracking-widest rounded-xl hover:shadow-[var(--shadow-glow)] transition-all active:scale-95 cursor-pointer">
                    Get started
                  </button>
                </SignUpButton>
              </>
            ) : (
              <Link href="/wiki" className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white px-5 py-2.5 text-[12px] font-bold uppercase tracking-widest rounded-xl hover:shadow-[var(--shadow-glow)] transition-all active:scale-95">
                Open Workspace
              </Link>
            )}
          </div>
        </nav>
      </header>

      {/* Main Sections */}
      <main className="pt-24">
        {/* Hero Section */}
        <section className="px-6 min-h-[calc(100vh-96px)] flex items-center justify-center relative">
          <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-16 items-center py-20">
            {/* Left Info Column */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="lg:col-span-5 space-y-8 text-left"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] shadow-[0_2px_10px_rgba(0,0,0,0.2)]">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-light)] animate-pulse" />
                <span className="text-[11px] uppercase font-bold tracking-widest text-slate-400">Team Intelligence Workspace</span>
              </div>

              <h1 className="text-5xl md:text-6xl font-black leading-[1.05] tracking-tight text-white">
                Wiki meets<br/>
                <span className="text-gradient">Planning.</span>
              </h1>

              <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-md">
                The knowledge engine that doesn&apos;t just store documentation — it parses wiki context, maps files to tasks, and enables autonomous agents to execute your team&apos;s projects.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                {!isSignedIn ? (
                  <SignUpButton mode="modal">
                    <button className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white px-8 py-3.5 text-[12px] font-bold uppercase tracking-widest rounded-xl hover:shadow-[var(--shadow-glow)] active:scale-95 transition-all flex items-center gap-2 group cursor-pointer">
                      <span>Get started free</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </button>
                  </SignUpButton>
                ) : (
                  <Link href="/wiki" className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white px-8 py-3.5 text-[12px] font-bold uppercase tracking-widest rounded-xl hover:shadow-[var(--shadow-glow)] active:scale-95 transition-all flex items-center gap-2 group">
                    <span>Open workspace</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-3 text-[10px] font-bold font-mono tracking-widest text-slate-500 uppercase pt-2 select-none">
                <span>Wiki</span>
                <span>·</span>
                <span>Graph</span>
                <span>·</span>
                <span>Plans</span>
                <span>·</span>
                <span>Agent AI</span>
              </div>
            </motion.div>

            {/* Right Graphic Mockup Column */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.7 }}
              className="lg:col-span-7 relative"
            >
              <div className="mb-6 hidden lg:flex justify-center">
                <Illustration
                  src={ICONSCOUT.illustrations.heroTeamwork}
                  alt="Team collaboration on shared knowledge"
                  width={420}
                  height={280}
                  className="max-h-[200px] opacity-95"
                  priority
                />
              </div>
              <HeroMockup />
              
              {/* Floating micro indicators */}
              <div className="absolute -top-4 -left-4 p-3 rounded-xl border border-white/[0.06] bg-slate-950/90 backdrop-blur shadow-2xl w-44 text-left hidden md:block animate-float-slow">
                <div className="flex items-center gap-1.5 mb-1">
                  <Database className="w-3.5 h-3.5 text-[var(--accent-light)]" />
                  <span className="text-[9px] text-[var(--accent-light)] font-bold uppercase tracking-wider">Semantic Nodes</span>
                </div>
                <div className="text-2xl font-black tracking-tight text-white">4,285</div>
                <div className="text-[8px] text-slate-500 font-mono mt-0.5">Updated: seconds ago</div>
              </div>

              <div className="absolute -bottom-4 -right-4 p-3 rounded-xl border border-white/[0.06] bg-slate-950/90 backdrop-blur shadow-2xl w-48 text-left hidden md:block animate-float-slow" style={{ animationDelay: '3s' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Security State</span>
                </div>
                <div className="text-[12px] font-extrabold text-white">SOC-2 Type II Certified</div>
                <div className="text-[8px] text-slate-500 font-mono mt-0.5">Encrypted Knowledge Graphs</div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Neural Convergence (Problem/Solution) */}
        <NeuralConvergence />

        {/* Phase 1: Ingestion & Synthesis */}
        <section className="py-28 px-6 border-t border-white/[0.05]">
          <div className="max-w-6xl mx-auto text-center mb-16 space-y-4">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="text-[var(--accent)] font-mono text-[10px] tracking-[0.5em] uppercase font-bold block"
            >
              Phase 01 — Synthesis
            </motion.span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
              Ingestion &amp; Mapping
            </h2>
            <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              Ingest raw docs, build semantic vectors, and map relationships automatically into a live, interactive knowledge graph.
            </p>
          </div>
          <ProcessShowcase />
        </section>

        {/* Use Cases Bento */}
        <UseCaseGrid />

        {/* Phase 2: Agentic Planning */}
        <section className="py-28 px-6 border-t border-white/[0.05]">
          <div className="max-w-6xl mx-auto text-center mb-16 space-y-4">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="text-[var(--accent)] font-mono text-[10px] tracking-[0.5em] uppercase font-bold block"
            >
              Phase 02 — Execution
            </motion.span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
              Project Architecting
            </h2>
            <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              Autonomous agents leverage your wiki context to define milestones, optimize resource allocation, and commit roadmaps.
            </p>
          </div>
          <AgentShowcase />
        </section>

        {/* Pricing */}
        <section className="py-12 px-6 border-t border-white/[0.05] relative overflow-hidden">
          <div className="mx-auto w-full max-w-5xl">
            <HomePricing />
          </div>
        </section>

        {/* Footer */}
        <LandingFooter />
      </main>
    </div>
  );
}
