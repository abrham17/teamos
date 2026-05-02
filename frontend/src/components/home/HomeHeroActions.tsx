"use client";

import Link from "next/link";
import { SignedIn } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";

export function HomeHeroActions() {
  return (
    <SignedIn>
      <div className="flex shrink-0 flex-wrap gap-3 px-4 pb-8 pt-6 sm:px-6 md:px-8">
        <Link
          href="/wiki"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-950)] transition-opacity hover:opacity-90"
        >
          Open workspace <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/analytics"
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-2)]"
        >
          View analytics
        </Link>
      </div>
    </SignedIn>
  );
}
