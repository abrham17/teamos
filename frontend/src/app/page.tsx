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
import LandingFooter from '@/components/landing/LandingFooter';


export default function Home() {
  const { isSignedIn } = useUser();

  return (
    <div data-theme="dark" className="min-h-screen bg-[var(--bg-950)] text-[var(--text-primary)]">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-950)]/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[var(--accent)] flex items-center justify-center font-bold text-white text-xs">
              T
            </div>
            <span className="font-semibold tracking-tight text-[15px]">TeamOS</span>
          </div>

          <div className="flex items-center gap-3">
            {!isSignedIn ? (
              <>
                <SignInButton mode="modal">
                  <button className="text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="bg-[var(--accent)] text-white px-5 py-1.5 text-[12px] font-medium hover:bg-[var(--accent-dark)] transition-colors">
                    Get started
                  </button>
                </SignUpButton>
              </>
            ) : (
              <Link href="/wiki" className="bg-[var(--accent)] text-white px-5 py-1.5 text-[12px] font-medium hover:bg-[var(--accent-dark)] transition-colors">
                Open workspace
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-14">
        <section className="px-6 min-h-[calc(100vh-56px)] flex items-center justify-center">
          <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-20 items-center py-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="space-y-8"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 border border-[var(--border-subtle)] bg-[var(--bg-800)]">
                <span className="w-1.5 h-1.5 bg-[var(--accent)]"></span>
                <span className="text-[11px] uppercase font-medium tracking-widest text-[var(--text-muted)]">Team Intelligence</span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight">
                Wiki meets<br/>
                <span className="text-[var(--accent)]">Planning.</span>
              </h1>

              <p className="text-[var(--text-muted)] text-base max-w-sm leading-relaxed">
                The knowledge engine that doesn&apos;t just store documentation — it uses it to architect and execute your team&apos;s projects.
              </p>

              <div className="flex items-center gap-4 pt-2">
                {!isSignedIn ? (
                  <SignUpButton mode="modal">
                    <button className="bg-[var(--accent)] text-white px-8 py-3 text-[13px] font-medium hover:bg-[var(--accent-dark)] transition-colors">
                      Get started free
                    </button>
                  </SignUpButton>
                ) : (
                  <Link href="/wiki" className="bg-[var(--accent)] text-white px-8 py-3 text-[13px] font-medium hover:bg-[var(--accent-dark)] transition-colors">
                    Open workspace
                  </Link>
                )}
                <span className="text-[11px] font-medium tracking-widest text-[var(--text-dim)] uppercase">Wiki · Graph · Plans · AI</span>
              </div>
            </motion.div>

            {/* Hero Mockup */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.7 }}
              className="relative lg:block hidden"
            >
              <div className="border border-[var(--border-subtle)] bg-[var(--bg-800)] overflow-hidden">
                <HeroMockup />
              </div>
              <div className="absolute -top-4 -left-4 p-3 border border-[var(--border-subtle)] bg-[var(--bg-800)] w-44">
                <div className="text-[10px] text-[var(--accent)] font-semibold uppercase tracking-wider mb-1">Knowledge Nodes</div>
                <div className="text-2xl font-bold tracking-tight">4,285</div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Neural Convergence (Problem/Solution) */}
        <NeuralConvergence />

        {/* Phase 1: Ingestion & Synthesis */}
        <section className="py-28 px-6 border-t border-[var(--border-subtle)]">
          <div className="max-w-6xl mx-auto text-center mb-20 space-y-4">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="text-[var(--accent)] font-mono text-[10px] tracking-[0.5em] uppercase font-semibold block"
            >
              Phase 01 — Synthesis
            </motion.span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Ingestion &amp; Mapping
            </h2>
            <p className="text-[var(--text-muted)] text-base max-w-xl mx-auto">
              Ingest raw docs, build semantic vectors, and wire relationships into a live knowledge graph.
            </p>
          </div>
          <ProcessShowcase />
        </section>

        {/* Bridging Narrative */}
        <section className="py-16 flex flex-col items-center border-t border-[var(--border-subtle)]">
          <div className="py-8 text-center max-w-xl px-6">
            <h3 className="text-lg font-semibold text-[var(--text-secondary)]">Context meets Action.</h3>
            <p className="text-[13px] text-[var(--text-dim)] mt-2 leading-relaxed">Knowledge synthesized in Phase 01 feeds directly into the Agentic Planner — turning static docs into dynamic roadmaps.</p>
          </div>
        </section>

        {/* Use Cases Bento */}
        <UseCaseGrid />

        {/* Phase 2: Agentic Planning */}
        <section className="py-28 px-6 border-t border-[var(--border-subtle)]">
          <div className="max-w-6xl mx-auto text-center mb-20 space-y-4">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="text-[var(--accent)] font-mono text-[10px] tracking-[0.5em] uppercase font-semibold block"
            >
              Phase 02 — Execution
            </motion.span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Project Architecting
            </h2>
            <p className="text-[var(--text-muted)] text-base max-w-xl mx-auto">
              Autonomous agents leverage your wiki context to plan, resource, and deploy initiatives with full alignment.
            </p>
          </div>
          <AgentShowcase />
        </section>

        {/* Pricing */}
        <section className="py-20 px-6 border-t border-[var(--border-subtle)]">
          <div className="mx-auto w-full max-w-5xl">
            <HomePricing />
          </div>
        </section>

        <LandingFooter />
      </main>
    </div>
  );
}
