"use client";

import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { ArrowRight, Check } from "lucide-react";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    cadence: "per team / month",
    description: "Try the full wiki-first loop with a small team. Upgrade when you outgrow limits.",
    features: [
      "1 team, up to 5 members",
      "Wiki, graph, chat & citations",
      "Limited ingest & AI usage",
      "Community support",
    ],
    highlighted: false,
    cta: "start_free" as const,
  },
  {
    name: "Team",
    price: "$49",
    cadence: "per team / month",
    description: "For growing teams that live in the wiki and need steady ingest and AI throughput.",
    features: [
      "Up to 25 members",
      "Higher ingest & job queue priority",
      "Graph analytics & exports",
      "Email support",
    ],
    highlighted: true,
    cta: "signup" as const,
  },
  {
    name: "Pro",
    price: "$129",
    cadence: "per team / month",
    description: "For orgs that need scale, compliance-friendly workflows, and hands-on help.",
    features: [
      "Unlimited members (fair use)",
      "Top AI & pipeline limits",
      "Audit-friendly exports",
      "Priority support & onboarding",
    ],
    highlighted: false,
    cta: "signup" as const,
  },
];

export function HomePricing() {
  return (
    <section className="mt-14 border-t border-[var(--border-subtle)] pt-14" aria-labelledby="home-pricing-heading">
      <div className="text-center">
        <h2 id="home-pricing-heading" className="text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl">
          Simple pricing for shared team memory
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Every plan includes the same core product: collaborative wiki, knowledge graph, ingest pipeline, and
          citation-grounded chat. You pay for team size, usage limits, and support—not for “AI add-ons” bolted on the side.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`relative flex flex-col rounded-2xl border p-6 ${
              tier.highlighted
                ? "border-[var(--accent)]/50 bg-[var(--surface-1)] shadow-[0_0_0_1px_var(--accent)]/20"
                : "border-[var(--border-subtle)] bg-[var(--surface-1)]/80"
            }`}
          >
            {tier.highlighted ? (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bg-950)]">
                Most teams
              </span>
            ) : null}
            <div className="text-sm font-medium text-[var(--text-muted)]">{tier.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">{tier.price}</span>
              <span className="text-sm text-[var(--text-dim)]">{tier.cadence}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{tier.description}</p>
            <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm text-[var(--text-secondary)]">
              {tier.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              {tier.cta === "start_free" ? (
                <SignUpButton mode="modal">
                  <button
                    type="button"
                    className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-950)] transition-opacity hover:opacity-90"
                  >
                    Start free
                  </button>
                </SignUpButton>
              ) : (
                <SignUpButton mode="modal">
                  <button
                    type="button"
                    className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                      tier.highlighted
                        ? "bg-[var(--accent)] text-[var(--bg-950)] hover:opacity-90"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-900)] text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    Get started <ArrowRight className="ml-1 inline h-4 w-4 align-text-bottom" />
                  </button>
                </SignUpButton>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-[var(--text-dim)]">
        Prices shown are illustrative launch targets and may change. Billing is handled securely at checkout; see{" "}
        <Link href="/settings" className="text-[var(--accent)] underline-offset-2 hover:underline">
          Settings
        </Link>{" "}
        after sign-in for your team&apos;s current plan.
      </p>
    </section>
  );
}
