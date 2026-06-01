"use client";

import { useWikiStore } from "@/stores/useWikiStore";
import { IntegrationsSettings } from "@/components/settings/IntegrationsSettings";
import { Plug } from "lucide-react";

export default function IntegrationsPage() {
  const { currentTeamId } = useWikiStore();

  if (!currentTeamId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Plug className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">Select a team to manage integrations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] px-6 z-20">
        <h2 className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
          <Plug className="h-5 w-5" /> Integrations
        </h2>
      </div>
      <div className="flex-1 p-8">
        <IntegrationsSettings teamId={currentTeamId} />
      </div>
    </div>
  );
}
