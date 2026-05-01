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
    <div className="flex flex-col h-full bg-[var(--bg-900)] overflow-y-auto">
      <div className="flex items-center h-14 border-b border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--surface-1)]">
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
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
            <div className="text-xs text-[var(--text-muted)]">Team plan</div>
            <div className="mt-2 text-2xl font-semibold capitalize">{teamPlan}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
            <div className="text-xs text-[var(--text-muted)]">Tracked event rows</div>
            <div className="mt-2 text-2xl font-semibold">{funnelRows.length}</div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
            <div className="text-xs text-[var(--text-muted)]">Admin cohorts available</div>
            <div className="mt-2 text-2xl font-semibold">{cohorts.length}</div>
          </div>
        </div>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-medium">
            <TrendingUp className="w-4 h-4" /> Top Funnel Events
          </div>
          {topEvents.length === 0 ? (
            <div className="mt-4 text-sm text-[var(--text-muted)]">No analytics events recorded yet.</div>
          ) : (
            <div className="mt-4 space-y-3">
              {topEvents.map(([eventName, count]) => (
                <div key={eventName}>
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>{EVENT_LABELS[eventName] || eventName}</span>
                    <span>{count}</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-[var(--bg-800)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)]"
                      style={{ width: `${Math.max((count / maxTopCount) * 100, 6)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-medium">
            <Users className="w-4 h-4" /> Weekly Cohort Conversion (Admin)
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-xs text-[var(--text-muted)]">
              Start date
              <input
                type="date"
                value={cohortStartDate}
                onChange={(e) => setCohortStartDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2 py-1.5 text-[var(--text-primary)]"
              />
            </label>
            <label className="text-xs text-[var(--text-muted)]">
              End date
              <input
                type="date"
                value={cohortEndDate}
                onChange={(e) => setCohortEndDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2 py-1.5 text-[var(--text-primary)]"
              />
            </label>
            <label className="text-xs text-[var(--text-muted)]">
              Conversion window (days)
              <input
                type="number"
                min={1}
                max={180}
                value={cohortWindowDays}
                onChange={(e) => setCohortWindowDays(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2 py-1.5 text-[var(--text-primary)]"
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
                className="h-8 px-3 rounded-md border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                    <th className="py-2 pr-3">Cohort week</th>
                    <th className="py-2 pr-3">Teams</th>
                    <th className="py-2 pr-3">First page</th>
                    <th className="py-2 pr-3">First ingest</th>
                    <th className="py-2 pr-3">First chat</th>
                    <th className="py-2 pr-3">Invite accepted</th>
                    <th className="py-2 pr-3">Subscription started</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((row) => (
                    <tr key={row.cohort_week_start || "unknown"} className="border-b border-[var(--border-subtle)]/50">
                      <td className="py-2 pr-3">{row.cohort_week_start ? row.cohort_week_start.slice(0, 10) : "n/a"}</td>
                      <td className="py-2 pr-3">{row.teams_created}</td>
                      <td className="py-2 pr-3">{row.first_page_created}</td>
                      <td className="py-2 pr-3">{row.first_ingest_completed}</td>
                      <td className="py-2 pr-3">{row.first_chat_answer_received}</td>
                      <td className="py-2 pr-3">{row.invite_accepted}</td>
                      <td className="py-2 pr-3">{row.subscription_started}</td>
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
