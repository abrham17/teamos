"use client";

import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2, Plus, X, Clock, Flag, Tag } from "lucide-react";
import type { PlanCalendarEvent } from "../types";

interface CalendarPanelProps {
  events: PlanCalendarEvent[];
  loading: boolean;
  onAddEvent?: (date: Date) => void;
}

export function CalendarPanel({ events, loading, onAddEvent }: CalendarPanelProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<PlanCalendarEvent | null>(null);

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
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        setSelectedEvent(e);
                      }}
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

      {/* EVENT DETAIL DIALOG */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-2xl relative overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-950)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)]">
                  {selectedEvent.project_name}
                </span>
                <h3 className="text-base font-bold text-[var(--text-primary)] pt-1">
                  {selectedEvent.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 hover:bg-[var(--bg-700)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details Grid */}
            <div className="space-y-4 pt-2">
              {/* Description */}
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Description</span>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-950)]/40 border border-[var(--border-subtle)] p-3 rounded-xl min-h-[60px] whitespace-pre-wrap">
                  {selectedEvent.description || "No description provided for this roadmap item."}
                </p>
              </div>

              {/* Status & Priority / Kind */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Status</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${
                      selectedEvent.status === "completed" || selectedEvent.status === "reached"
                        ? "bg-emerald-500 shadow-[0_0_6px_#10b981]"
                        : selectedEvent.status === "in-progress"
                          ? "bg-[var(--accent)] shadow-[0_0_6px_var(--accent)]"
                          : selectedEvent.status === "blocked"
                            ? "bg-rose-500 shadow-[0_0_6px_#f43f5e]"
                            : "bg-amber-500 shadow-[0_0_6px_#f59e0b]"
                    }`} />
                    <span className="text-xs font-bold capitalize text-[var(--text-secondary)]">
                      {selectedEvent.status.replace("-", " ")}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] font-black">Priority</span>
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span className="text-xs font-bold capitalize text-[var(--text-secondary)]">
                      {selectedEvent.priority || "Medium"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Start Date</span>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-bold">
                    <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>{selectedEvent.start_date ? new Date(selectedEvent.start_date).toLocaleDateString() : "Not set"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">End Date</span>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-bold">
                    <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>{selectedEvent.end_date ? new Date(selectedEvent.end_date).toLocaleDateString() : "Not set"}</span>
                  </div>
                </div>
              </div>

              {/* Assignee / Kind */}
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-[var(--border-subtle)]/50">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Type</span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
                    {selectedEvent.kind === "milestone" ? (
                      <>
                        <Flag className="w-3.5 h-3.5 text-amber-500" />
                        <span>Milestone</span>
                      </>
                    ) : (
                      <>
                        <CalendarIcon className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Task</span>
                      </>
                    )}
                  </div>
                </div>

                {selectedEvent.assignee_email && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Assignee</span>
                    <span className="text-xs font-bold text-[var(--text-secondary)] truncate block" title={selectedEvent.assignee_email}>
                      {selectedEvent.assignee_email}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Close */}
            <div className="mt-6 flex justify-end border-t border-[var(--border-subtle)] pt-4 shrink-0">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] rounded-xl border border-[var(--border-subtle)] transition-all"
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
