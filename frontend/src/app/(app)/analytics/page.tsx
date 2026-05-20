"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { BarChart3, TrendingUp, Users } from "lucide-react";
import { useWikiStore } from "@/stores/useWikiStore";

type FunnelRow = {
  week_start: string | null;
  event_name: string;
  count: number;
};

type CohortRow = {
  cohort_week_start: string | null;
  teams_created: number;
  first_page_created: number;
  first_ingest_completed: number;
  first_chat_answer_received: number;
  invite_accepted: number;
  subscription_started: number;
};

type FunnelResponse = {
  team_plan: string;
  funnel: FunnelRow[];
};

type CohortResponse = {
  cohorts: CohortRow[];
};

const EVENT_LABELS: Record<string, string> = {
  workspace_created: "Workspace created",
  first_page_created: "First page",
  first_ingest_completed: "First ingest done",
  first_chat_answer_received: "First chat answer",
  invite_sent: "Invite sent",
  invite_accepted: "Invite accepted",
  upgrade_clicked: "Upgrade clicked",
  subscription_started: "Subscription started",
};

export default function AnalyticsPage() {
  const { currentTeamId } = useWikiStore();
  const [teamPlan, setTeamPlan] = useState("free");
  const [funnelRows, setFunnelRows] = useState<FunnelRow[]>([]);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [error, setError] = useState("");
  const [cohortStartDate, setCohortStartDate] = useState("");
  const [cohortEndDate, setCohortEndDate] = useState("");
  const [cohortWindowDays, setCohortWindowDays] = useState("28");

  useEffect(() => {
    if (!currentTeamId) return;
    setError("");
    api
      .get<FunnelResponse>(`/analytics/${currentTeamId}/funnel/weekly/`)
      .then((data) => {
        setFunnelRows((data?.funnel || []) as FunnelRow[]);
        setTeamPlan(data?.team_plan || "free");
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Failed to load analytics funnel.";
        setError(message);
      });

  }, [currentTeamId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (cohortStartDate) params.set("start_date", cohortStartDate);
    if (cohortEndDate) params.set("end_date", cohortEndDate);
    if (cohortWindowDays) params.set("conversion_window_days", cohortWindowDays);

    const query = params.toString();
    const url = query ? `/analytics/cohorts/weekly/?${query}` : "/analytics/cohorts/weekly/";
    api
      .get<CohortResponse>(url)
      .then((data) => setCohorts((data?.cohorts || []) as CohortRow[]))
      .catch(() => setCohorts([]));
  }, [cohortStartDate, cohortEndDate, cohortWindowDays]);

  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const row of funnelRows) {
      acc[row.event_name] = (acc[row.event_name] || 0) + row.count;
    }
    return acc;
  }, [funnelRows]);

  const topEvents = useMemo(() => {
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [totals]);

  const maxTopCount = topEvents.length ? Math.max(...topEvents.map(([, count]) => count)) : 1;

  if (!currentTeamId) {
    return <div className="p-8 text-[var(--text-muted)]">Select a team first.</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-950)] overflow-y-auto">
      <div className="flex items-center h-14 border-b border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] z-20">
        <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <BarChart3 className="w-5 h-5" /> Product Analytics
        </h2>
      </div>

      <div className="max-w-6xl mx-auto w-full p-8 flex flex-col gap-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 shadow-md backdrop-blur-md">
            <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Team plan</div>
            <div className="mt-2 text-3xl font-bold capitalize text-[var(--text-primary)]">{teamPlan}</div>
          </div>
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 shadow-md backdrop-blur-md">
            <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Tracked event rows</div>
            <div className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{funnelRows.length}</div>
          </div>
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 shadow-md backdrop-blur-md">
            <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Admin cohorts available</div>
            <div className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{cohorts.length}</div>
          </div>
        </div>

        <section className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 shadow-md backdrop-blur-md">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-semibold">
            <TrendingUp className="w-4 h-4 text-[var(--accent)]" /> Top Funnel Events
          </div>
          {topEvents.length === 0 ? (
            <div className="mt-4 text-sm text-[var(--text-muted)]">No analytics events recorded yet.</div>
          ) : (
            <div className="mt-4 space-y-4">
              {topEvents.map(([eventName, count]) => (
                <div key={eventName}>
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span className="text-[var(--text-secondary)] font-medium">{EVENT_LABELS[eventName] || eventName}</span>
                    <span className="font-mono text-[var(--text-primary)]">{count}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] rounded-full shadow-[0_0_8px_var(--accent)]"
                      style={{ width: `${Math.max((count / maxTopCount) * 100, 6)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 shadow-md backdrop-blur-md">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-semibold">
            <Users className="w-4 h-4 text-[var(--accent)]" /> Weekly Cohort Conversion (Admin)
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Start date
              <input
                type="date"
                value={cohortStartDate}
                onChange={(e) => setCohortStartDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 transition-all text-xs"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              End date
              <input
                type="date"
                value={cohortEndDate}
                onChange={(e) => setCohortEndDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 transition-all text-xs"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Conversion window (days)
              <input
                type="number"
                min={1}
                max={180}
                value={cohortWindowDays}
                onChange={(e) => setCohortWindowDays(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 transition-all text-xs"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setCohortStartDate("");
                  setCohortEndDate("");
                  setCohortWindowDays("28");
                }}
                className="h-9 px-4 rounded-xl border border-white/[0.08] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.03] transition-colors"
              >
                Reset filters
              </button>
            </div>
          </div>
          {cohorts.length === 0 ? (
            <div className="mt-4 text-sm text-[var(--text-muted)]">
              Cohort data not available for this account (admin-only endpoint) or no cohort records yet.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.05] bg-white/[0.01]">
              <table className="w-full min-w-[760px] text-sm text-left">
                <thead className="bg-white/[0.01] border-b border-[var(--border-subtle)]">
                  <tr className="text-[var(--text-dim)] text-xs font-bold uppercase tracking-wider">
                    <th className="px-4 py-3">Cohort week</th>
                    <th className="px-4 py-3">Teams</th>
                    <th className="px-4 py-3">First page</th>
                    <th className="px-4 py-3">First ingest</th>
                    <th className="px-4 py-3">First chat</th>
                    <th className="px-4 py-3">Invite accepted</th>
                    <th className="px-4 py-3">Subscription started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]/30">
                  {cohorts.map((row) => (
                    <tr key={row.cohort_week_start || "unknown"} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{row.cohort_week_start ? row.cohort_week_start.slice(0, 10) : "n/a"}</td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{row.teams_created}</td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{row.first_page_created}</td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{row.first_ingest_completed}</td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{row.first_chat_answer_received}</td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{row.invite_accepted}</td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{row.subscription_started}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
