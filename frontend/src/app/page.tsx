import { Bot, GitBranch, Network, Users } from "lucide-react";
import type { ReactNode } from "react";

import { HomeFlowStory } from "@/components/home/HomeFlowStory";
import { HomeHeroActions } from "@/components/home/HomeHeroActions";
import { HomePricing } from "@/components/home/HomePricing";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100dvh-3rem)] flex-col bg-[var(--bg-900)] text-[var(--text-primary)]">
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <HomeFlowStory actions={<HomeHeroActions />} />
      </div>

      <div className="mx-auto w-full max-w-6xl shrink-0 px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

        <HomePricing />
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
