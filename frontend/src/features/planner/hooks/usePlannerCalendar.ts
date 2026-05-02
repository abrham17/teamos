"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlannerCalendarFeed } from "../api";
import type { PlanCalendarEvent } from "../types";

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function usePlannerCalendar(teamId: string | null) {
  const [events, setEvents] = useState<PlanCalendarEvent[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState("");

  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    const end = new Date(now);
    end.setDate(now.getDate() + 60);
    return { fromDate: toIsoDate(start), toDate: toIsoDate(end) };
  }, []);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setLoadingCalendar(true);
    setCalendarError("");
    getPlannerCalendarFeed(teamId, range.fromDate, range.toDate)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Failed to load calendar feed.";
        setCalendarError(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingCalendar(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, range.fromDate, range.toDate]);

  return { events, loadingCalendar, calendarError };
}
