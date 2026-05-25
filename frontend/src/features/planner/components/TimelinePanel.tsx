"use client";

import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PlanTask, PlanMilestone, TeamMember } from "../types";
import {
  ChevronRight,
  ChevronLeft,
  BarChartHorizontal,
  Maximize2,
  Minimize2,
  X,
  Plus,
  Flag
} from "lucide-react";

interface TimelinePanelProps {
  tasks: PlanTask[];
  milestones: PlanMilestone[];
  onAddTask?: () => void;
  onAddMilestone?: () => void;
  teamMembers: TeamMember[];
}

export function TimelinePanel({ tasks, milestones, onAddTask, onAddMilestone }: Omit<TimelinePanelProps, 'teamMembers'>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const expandedContainerRef = useRef<HTMLDivElement>(null);

  const visibleTasks = useMemo(() => {
    if (showSubtasks) return tasks;
    return tasks.filter((t) => !t.parent_task_id);
  }, [tasks, showSubtasks]);

  const { start, end } = useMemo(() => {
    if (visibleTasks.length === 0 && milestones.length === 0) {
      const now = new Date();
      return { start: now, end: new Date(now.getTime() + 86400000 * 60) }; // 60 days
    }
    const dates = [
      ...visibleTasks.map((t) => new Date(t.start_date || Date.now()).getTime()),
      ...visibleTasks.map((t) => new Date(t.end_date || Date.now()).getTime()),
      ...milestones.map((m) => new Date(m.target_date || Date.now()).getTime()),
    ];
    // Align start to the beginning of the week (Sunday)
    const minDate = new Date(Math.min(...dates) - 86400000 * 7);
    minDate.setDate(minDate.getDate() - minDate.getDay());
    
    const maxDate = new Date(Math.max(...dates) + 86400000 * 21);
    return {
      start: minDate,
      end: maxDate,
    };
  }, [visibleTasks, milestones]);

  const daysCount = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  const weeksCount = Math.ceil(daysCount / 7);
  const weekWidth = 120;
  const pxPerDay = weekWidth / 7;

  const getX = (dateStr: string | null) => {
    if (!dateStr) return 0;
    const date = new Date(dateStr);
    const diff = date.getTime() - start.getTime();
    return (diff / 86400000) * pxPerDay;
  };

  const getWidth = (startStr: string | null, endStr: string | null) => {
    if (!startStr || !endStr) return weekWidth;
    const s = new Date(startStr);
    const e = new Date(endStr);
    const diff = e.getTime() - s.getTime();
    return Math.max(pxPerDay, (diff / 86400000) * pxPerDay);
  };

  const months = useMemo(() => {
    const items: { name: string; width: number }[] = [];
    let current = new Date(start);
    while (current < end) {
      const month = current.toLocaleString("default", { month: "long", year: "numeric" });
      const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      const daysInMonth = Math.ceil(
        (Math.min(nextMonth.getTime(), end.getTime()) - current.getTime()) / 86400000
      );
      items.push({ name: month, width: daysInMonth * pxPerDay });
      current = nextMonth;
    }
    return items;
  }, [start, end]);

  const weeks = useMemo(() => {
    const items = [];
    for (let i = 0; i < weeksCount; i++) {
      const date = new Date(start.getTime() + i * 7 * 86400000);
      items.push({
        label: `W${i + 1}`,
        dateStr: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      });
    }
    return items;
  }, [start, weeksCount]);

  const TimelineContent = ({ isFull = false }) => (
    <div className={`flex flex-col h-full bg-[var(--bg-950)]/30 ${isFull ? "p-8" : "p-6"}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center">
            <BarChartHorizontal className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="font-bold text-[var(--text-primary)] tracking-tight">Project Roadmap</h3>
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
              Visual Timeline
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddTask}
            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent)] text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:opacity-90 transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </button>
          <button
            onClick={onAddMilestone}
            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-2)] text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-[var(--surface-3)] transition-all border border-[var(--border-subtle)]"
          >
            <Flag className="w-3.5 h-3.5" />
            Add Milestone
          </button>
          <button
            onClick={() => setShowSubtasks(!showSubtasks)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-[var(--border-subtle)] ${
              showSubtasks
                ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/20"
                : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
            }`}
          >
            {showSubtasks ? "Hide Subtasks" : "Show Subtasks"}
          </button>
          <div className="w-px h-6 bg-[var(--border-subtle)] mx-1" />
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 flex items-center justify-center hover:bg-[var(--surface-2)] rounded-lg transition-colors border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button className="h-8 w-8 flex items-center justify-center hover:bg-[var(--surface-2)] rounded-lg transition-colors border border-[var(--border-subtle)]">
            <ChevronLeft className="w-4 h-4 text-[var(--text-dim)]" />
          </button>
          <button className="h-8 w-8 flex items-center justify-center hover:bg-[var(--surface-2)] rounded-lg transition-colors border border-[var(--border-subtle)]">
            <ChevronRight className="w-4 h-4 text-[var(--text-dim)]" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto custom-scrollbar relative border border-[var(--border-subtle)] rounded-2xl bg-[var(--bg-900)]/50"
        ref={isFull ? expandedContainerRef : containerRef}
      >
        {/* Sticky month-only header */}
        <div className="flex border-b border-[var(--border-subtle)] min-w-max sticky top-0 bg-[var(--bg-900)]/90 backdrop-blur-md z-20">
          <div className="w-56 flex-shrink-0 border-r border-[var(--border-subtle)] p-4 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest bg-[var(--surface-1)]">
            Resource / Task
          </div>
          <div className="flex h-12">
            {months.map((m, i) => (
              <div
                key={i}
                style={{ width: m.width }}
                className="border-r border-[var(--border-subtle)] px-4 flex items-center text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider bg-[var(--surface-1)]/50"
              >
                {m.name}
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-max relative overflow-y-visible">
          {/* Alternating weekly band overlay */}
          <div className="absolute left-56 top-0 bottom-0 flex pointer-events-none z-0">
            {weeks.map((_, i) => (
              <div
                key={i}
                style={{ width: weekWidth }}
                className={`border-r border-[var(--border-subtle)]/20 h-full ${
                  i % 2 === 0 ? "bg-transparent" : "bg-[var(--surface-1)]/20"
                }`}
              />
            ))}
          </div>
          {visibleTasks.map((task, idx) => (
            <div
              key={task.id}
              className="flex border-b border-[var(--border-subtle)] group hover:bg-[var(--accent-subtle)]/5 transition-colors relative h-16"
            >
              <div className="w-56 flex-shrink-0 border-r border-[var(--border-subtle)] p-4 flex flex-col justify-center bg-[var(--bg-900)] sticky left-0 z-10">
                <span className="text-xs font-bold text-[var(--text-primary)] truncate tracking-tight">
                  {task.title}
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className={`text-[8px] uppercase font-black tracking-tighter px-1 rounded ${
                      task.priority === "high"
                        ? "bg-rose-500/10 text-rose-500"
                        : task.priority === "medium"
                        ? "bg-amber-500/10 text-amber-500"
                        : "bg-emerald-500/10 text-emerald-500"
                    }`}
                  >
                    {task.priority}
                  </span>
                  <span className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-tighter">
                    {task.status.replace("-", " ")}
                  </span>
                </div>
              </div>

              <div className="flex-1 relative h-16 py-4">
                <motion.div
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: idx * 0.05, duration: 0.5 }}
                  style={{
                    left: getX(task.start_date),
                    width: getWidth(task.start_date, task.end_date),
                    transformOrigin: "left",
                  }}
                  className={`absolute h-8 rounded-lg flex items-center justify-between px-3 text-[10px] font-bold tracking-tight shadow-sm cursor-pointer hover:brightness-110 transition-all z-10 ${
                    task.status === "completed"
                      ? "bg-emerald-500 text-white"
                      : task.status === "in-progress"
                      ? "bg-[var(--accent)] text-white shadow-[0_0_12px] shadow-[var(--accent-glow)]"
                      : "bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                  }`}
                >
                  <span className="truncate pr-2">{task.title}</span>
                </motion.div>
              </div>
            </div>
          ))}

          {milestones.map((m) => (
            <div
              key={m.id}
              style={{ left: getX(m.target_date) + 224 }}
              className="absolute top-0 bottom-0 z-0 pointer-events-none border-l-2 border-[var(--accent)]/20 border-dashed"
            >
              <div className="sticky top-24 bg-[var(--accent)] text-white px-2 py-1 rounded-md text-[9px] font-bold uppercase -ml-2 whitespace-nowrap shadow-lg border border-white/10">
                {m.title}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        <TimelineContent />
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[var(--bg-900)] overflow-hidden flex flex-col"
          >
            <div className="flex justify-end p-6 shrink-0">
              <button
                onClick={() => setIsExpanded(false)}
                className="p-2 hover:bg-[var(--surface-2)] rounded-full text-[var(--text-muted)] transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <TimelineContent isFull={true} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
