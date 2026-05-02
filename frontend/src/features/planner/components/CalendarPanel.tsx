"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Loader2, Plus } from "lucide-react";
import type { PlanCalendarEvent } from "../types";

interface CalendarPanelProps {
  events: PlanCalendarEvent[];
  loading: boolean;
  onAddEvent?: (date: Date) => void;
}

export function CalendarPanel({ events, loading, onAddEvent }: CalendarPanelProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    const startPadding = firstDay.getDay();

    // Previous month padding
    for (let i = startPadding - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month, -i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month padding to fill grid (7 columns * 6 rows = 42)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate]);

  const prevMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 min-w-0 p-6 space-y-6 overflow-y-auto"
    >
      <header className="flex items-center justify-between bg-[var(--surface-1)] p-6 rounded-[32px] border border-[var(--border-subtle)] shadow-sm sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center">
            <CalendarIcon className="w-6 h-6 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              {currentDate.toLocaleString("default", { month: "long", year: "numeric" })}
            </h2>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
              Team Intelligence Schedule
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin mr-2" />}
          <div className="flex items-center bg-[var(--bg-900)] rounded-xl border border-[var(--border-subtle)] p-1">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-[var(--surface-2)] rounded-lg transition-all"
            >
              <ChevronLeft className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-[var(--surface-2)] rounded-lg transition-all"
            >
              <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>
      </header>

      <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[32px] overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-[var(--border-subtle)] bg-[var(--bg-950)]/50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {daysInMonth.map((dayObj, i) => {
            const isToday = dayObj.date.toDateString() === new Date().toDateString();
            const dayEvents = events.filter((e) => {
              if (!e.start_date) return false;
              const start = new Date(e.start_date);
              const end = e.end_date ? new Date(e.end_date) : start;
              const check = new Date(dayObj.date);
              check.setHours(0, 0, 0, 0);
              start.setHours(0, 0, 0, 0);
              end.setHours(0, 0, 0, 0);
              return check >= start && check <= end;
            });

            return (
              <div
                key={i}
                className={`group min-h-[140px] border-r border-b border-[var(--border-subtle)] p-2 space-y-1 transition-colors hover:bg-[var(--bg-900)]/40 ${
                  dayObj.isCurrentMonth
                    ? "bg-transparent"
                    : "bg-[var(--bg-950)]/20 text-[var(--text-dim)] opacity-40"
                }`}
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <span
                    className={`text-xs font-black p-1 rounded-md ${
                      isToday
                        ? "bg-[var(--accent)] text-white w-7 h-7 flex items-center justify-center shadow-lg shadow-[var(--accent-glow)]"
                        : "text-[var(--text-dim)]"
                    }`}
                  >
                    {dayObj.date.getDate()}
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddEvent?.(dayObj.date);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--accent-subtle)] rounded-md text-[var(--text-dim)] hover:text-[var(--accent)] transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1 overflow-y-auto max-h-[100px] scrollbar-hide">
                  {dayEvents.map((e, idx) => (
                    <div
                      key={idx}
                      title={`${e.project_name}: ${e.title}`}
                      className={`px-2 py-1.5 rounded-lg text-[9px] font-bold truncate border shadow-sm transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer ${
                        e.status === "completed" || e.status === "reached"
                          ? "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20"
                          : e.kind === "milestone"
                            ? "bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/20"
                            : "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/20"
                      }`}
                    >
                      {e.kind === "milestone" && "🚩 "}{e.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
