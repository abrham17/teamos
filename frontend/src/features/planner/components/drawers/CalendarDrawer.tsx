"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2, Plus, X, Clock, Flag, Tag } from "lucide-react";
import { DrawerContainer } from "./DrawerContainer";
import type { PlanCalendarEvent } from "../../types";

interface CalendarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  events: PlanCalendarEvent[];
  loading: boolean;
  onAddEvent?: (date: Date) => void;
  onNavigateToEvent?: (event: PlanCalendarEvent) => void;
}

export function CalendarDrawer({
  isOpen,
  onClose,
  events,
  loading,
  onAddEvent,
  onNavigateToEvent,
}: CalendarDrawerProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<PlanCalendarEvent | null>(null);

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    const startPadding = firstDay.getDay();

    for (let i = startPadding - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month, -i),
        isCurrentMonth: false,
      });
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

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

  if (!isOpen) return null;

  return (
    <DrawerContainer isOpen={isOpen} onClose={onClose} title="Calendar">
      <div className="space-y-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {currentDate.toLocaleString("default", { month: "long", year: "numeric" })}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {loading && <Loader2 className="w-3 h-3 text-[var(--accent)] animate-spin" />}
            <button onClick={prevMonth} className="p-1 hover:bg-[var(--surface-2)] rounded">
              <ChevronLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)]"
            >
              Today
            </button>
            <button onClick={nextMonth} className="p-1 hover:bg-[var(--surface-2)] rounded">
              <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[var(--border-subtle)] bg-[var(--bg-950)]/50">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
              <div
                key={i}
                className="py-2 text-center text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]"
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
                  className={`group min-h-[70px] border-r border-b border-[var(--border-subtle)] p-1 transition-colors hover:bg-[var(--bg-900)]/40 ${
                    dayObj.isCurrentMonth
                      ? "bg-transparent"
                      : "bg-[var(--bg-950)]/20 text-[var(--text-dim)] opacity-40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[10px] font-black p-0.5 rounded ${
                        isToday
                          ? "bg-[var(--accent)] text-white w-5 h-5 flex items-center justify-center"
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
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--accent-subtle)] rounded text-[var(--text-dim)] hover:text-[var(--accent)]"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="space-y-0.5 overflow-y-auto max-h-[50px] scrollbar-hide">
                    {dayEvents.map((e, idx) => (
                      <div
                        key={idx}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          setSelectedEvent(e);
                        }}
                        title={`${e.project_name}: ${e.title}`}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold truncate border cursor-pointer hover:scale-[1.02] ${
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

        {/* Event Detail */}
        {selectedEvent && (
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div className="space-y-1 flex-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-950)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                  {selectedEvent.project_name}
                </span>
                <h4 className="text-sm font-bold text-[var(--text-primary)]">
                  {selectedEvent.title}
                </h4>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 hover:bg-[var(--bg-700)] rounded text-[var(--text-muted)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-950)]/40 border border-[var(--border-subtle)] p-2 rounded-lg min-h-[40px]">
              {selectedEvent.description || "No description provided."}
            </p>

            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div>
                <span className="font-black uppercase tracking-wider text-[var(--text-muted)]">Status</span>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    selectedEvent.status === "completed" || selectedEvent.status === "reached"
                      ? "bg-emerald-500"
                      : selectedEvent.status === "in-progress"
                        ? "bg-[var(--accent)]"
                        : selectedEvent.status === "blocked"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                  }`} />
                  <span className="font-bold capitalize text-[var(--text-secondary)]">
                    {selectedEvent.status.replace("-", " ")}
                  </span>
                </div>
              </div>

              <div>
                <span className="font-black uppercase tracking-wider text-[var(--text-muted)]">Type</span>
                <div className="flex items-center gap-1 mt-1">
                  {selectedEvent.kind === "milestone" ? (
                    <>
                      <Flag className="w-3 h-3 text-amber-500" />
                      <span className="font-bold text-[var(--text-secondary)]">Milestone</span>
                    </>
                  ) : (
                    <>
                      <CalendarIcon className="w-3 h-3 text-[var(--accent)]" />
                      <span className="font-bold text-[var(--text-secondary)]">Task</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <span className="font-black uppercase tracking-wider text-[var(--text-muted)]">Start</span>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="font-bold text-[var(--text-secondary)]">
                    {selectedEvent.start_date ? new Date(selectedEvent.start_date).toLocaleDateString() : "Not set"}
                  </span>
                </div>
              </div>

              <div>
                <span className="font-black uppercase tracking-wider text-[var(--text-muted)]">End</span>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="font-bold text-[var(--text-secondary)]">
                    {selectedEvent.end_date ? new Date(selectedEvent.end_date).toLocaleDateString() : "Not set"}
                  </span>
                </div>
              </div>
            </div>

            {selectedEvent.assignee_email && (
              <div className="pt-2 border-t border-[var(--border-subtle)]/50">
                <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">Assignee</span>
                <div className="text-[11px] font-bold text-[var(--text-secondary)] mt-1">
                  {selectedEvent.assignee_email}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  onNavigateToEvent?.(selectedEvent);
                  onClose();
                }}
                className="flex-1 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all"
              >
                View on Canvas
              </button>
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-3 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] rounded-lg border border-[var(--border-subtle)] transition-all"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </DrawerContainer>
  );
}
