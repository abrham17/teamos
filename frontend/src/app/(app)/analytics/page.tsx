"use client";

import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { BarChart3, FileText, BookOpen, Layers } from "lucide-react";
import { useWikiStore } from "@/stores/useWikiStore";

type DailyTokenUsage = {
  date: string;
  label: string;
  tokens: number;
};

type QuantitativeStats = {
  documents_processed: number;
  wiki_created: number;
  projects_count: number;
  daily_token_usage?: DailyTokenUsage[];
};

export default function AnalyticsPage() {
  const { currentTeamId } = useWikiStore();
  const [stats, setStats] = useState<QuantitativeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentTeamId) return;
    setLoading(true);
    setError("");

    api
      .get<QuantitativeStats>(`/analytics/${currentTeamId}/stats/`)
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Failed to load analytics statistics.";
        setError(message);
        setLoading(false);
      });
  }, [currentTeamId]);

  const maxTokens = useMemo(() => {
    if (!stats?.daily_token_usage || stats.daily_token_usage.length === 0) return 100;
    const max = Math.max(...stats.daily_token_usage.map((d) => d.tokens));
    return max > 0 ? max : 100;
  }, [stats]);

  if (!currentTeamId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-900)] text-[var(--text-muted)]">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30 text-[var(--text-primary)]" />
          <p className="text-sm font-medium">Select a team workspace to view analytics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-900)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center h-14 border-b border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--bg-900)] z-20">
        <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[var(--accent)]" /> Workspace Analytics
        </h2>
      </div>

      <div className="max-w-5xl mx-auto w-full p-8 flex flex-col gap-6">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 h-36"
                />
              ))}
            </div>
            <div className="animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 h-64" />
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Documents Processed */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 shadow-sm hover:border-[var(--border-strong)] transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    Documents Processed
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <FileText className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4 text-4xl font-extrabold text-[var(--text-primary)] tracking-tight">
                  {stats?.documents_processed ?? 0}
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Total documents ingested into vector index
                </p>
              </div>

              {/* Wiki Pages Created */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 shadow-sm hover:border-[var(--border-strong)] transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    Wiki Created
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-[var(--sidebar-accent)]/10 flex items-center justify-center text-[var(--sidebar-accent)]">
                    <BookOpen className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4 text-4xl font-extrabold text-[var(--text-primary)] tracking-tight">
                  {stats?.wiki_created ?? 0}
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Active strategic documentation pages
                </p>
              </div>

              {/* Projects Count */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 shadow-sm hover:border-[var(--border-strong)] transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    Projects Count
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4 text-4xl font-extrabold text-[var(--text-primary)] tracking-tight">
                  {stats?.projects_count ?? 0}
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Quantitative projects tracked in workspace
                </p>
              </div>
            </div>

            {/* Token Usage Bar Chart */}
            {stats?.daily_token_usage && stats.daily_token_usage.length > 0 && (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Token Usage
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Total prompt and completion tokens processed over the last 14 days
                    </p>
                  </div>
                </div>

                <div className="h-44 flex items-end gap-2.5 px-2">
                  {stats.daily_token_usage.map((day) => {
                    const heightPercent = Math.max((day.tokens / maxTokens) * 100, 3);
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 bg-black/80 text-white text-[10px] py-1 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-30 font-mono">
                          {day.tokens.toLocaleString()} tokens
                        </div>

                        {/* Bar */}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full rounded-t bg-gradient-to-t from-[var(--accent)] to-[var(--accent-light)] opacity-85 hover:opacity-100 transition-all duration-200 cursor-pointer shadow-sm"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between mt-3 text-[10px] text-[var(--text-muted)] px-2 font-mono">
                  {stats.daily_token_usage.map((day) => (
                    <div key={day.date} className="flex-1 text-center">
                      {day.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
