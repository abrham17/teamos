import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowRight, Bot, GitBranch, Network, Sparkles, Users } from "lucide-react";
import type { ReactNode } from "react";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[var(--bg-900)] text-[var(--text-primary)] px-6 py-12">
      <div className="w-full max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" /> TeamOS knowledge operating system
            </div>
            <h1 className="mt-5 text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              TeamOS helps your team think faster together.
            </h1>
            <p className="mt-4 text-[var(--text-muted)] text-lg max-w-xl">
              TeamOS turns scattered notes, docs, and conversations into one shared team brain.
              Write in wiki, ingest source material, ask citation-grounded AI questions, and see the relationship graph in one workspace.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <SignedOut>
                <SignInButton>
                  <button className="px-4 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-colors">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton>
                  <button className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-950)] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2">
                    Create account <ArrowRight className="w-4 h-4" />
                  </button>
                </SignUpButton>
              </SignedOut>

              <SignedIn>
                <Link
                  href="/wiki"
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-950)] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                >
                  Open workspace <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/analytics"
                  className="px-4 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  View analytics
                </Link>
              </SignedIn>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
            <div className="text-sm text-[var(--text-muted)] mb-3">Knowledge Graph Snapshot</div>
            <div className="relative h-72 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-950)] overflow-hidden">
              <svg viewBox="0 0 520 260" className="w-full h-full">
                <defs>
                  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.35" />
                  </linearGradient>
                </defs>
                <path d="M90 70 C160 30, 230 30, 300 70" stroke="url(#edge)" strokeWidth="2.5" fill="none" />
                <path d="M90 70 C170 120, 250 140, 320 165" stroke="url(#edge)" strokeWidth="2.5" fill="none" />
                <path d="M300 70 C355 88, 392 110, 430 145" stroke="url(#edge)" strokeWidth="2.5" fill="none" />
                <path d="M320 165 C365 185, 415 197, 455 210" stroke="url(#edge)" strokeWidth="2.5" fill="none" />
                <circle cx="90" cy="70" r="16" fill="#1d4ed8" />
                <circle cx="300" cy="70" r="18" fill="#06b6d4" />
                <circle cx="430" cy="145" r="14" fill="#10b981" />
                <circle cx="320" cy="165" r="15" fill="#8b5cf6" />
                <circle cx="455" cy="210" r="13" fill="#f59e0b" />
                <text x="64" y="104" fill="#cbd5e1" fontSize="12">Roadmap</text>
                <text x="268" y="103" fill="#cbd5e1" fontSize="12">Auth System</text>
                <text x="396" y="173" fill="#cbd5e1" fontSize="12">Billing</text>
                <text x="278" y="192" fill="#cbd5e1" fontSize="12">Onboarding</text>
                <text x="421" y="238" fill="#cbd5e1" fontSize="12">Growth</text>
              </svg>
            </div>
            <div className="mt-3 text-xs text-[var(--text-muted)]">
              Explore links between pages, sources, and decisions as your team knowledge grows.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
          <FeatureCard
            icon={<Users className="w-4 h-4 text-[var(--accent)]" />}
            title="Collaborative wiki"
            description="Capture decisions, runbooks, and project context with role-based access."
          />
          <FeatureCard
            icon={<Network className="w-4 h-4 text-[var(--accent)]" />}
            title="Graph-first context"
            description="See how pages connect so knowledge is navigable, not buried."
          />
          <FeatureCard
            icon={<Bot className="w-4 h-4 text-[var(--accent)]" />}
            title="Citation-grounded AI"
            description="Ask questions and get answers linked back to exact team sources."
          />
        </div>

        <div className="mt-10 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-medium">
            <GitBranch className="w-4 h-4 text-[var(--accent)]" /> How users experience TeamOS
          </div>
          <p className="mt-3 text-sm text-[var(--text-muted)] leading-relaxed">
            Users typically start by creating a team and inviting members, then import docs or URLs into the knowledge base.
            TeamOS organizes this into wiki pages and a graph. From there, anyone in the workspace can ask questions in chat and
            get grounded answers with citations. The result is shared memory that survives handoffs, onboarding, and fast-moving projects.
          </p>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex items-center gap-2">
        {icon}
        <div className="font-medium">{title}</div>
      </div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p>
    </div>
  );
}
