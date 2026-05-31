"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PlanTask } from "../types";
import {
  Plus,
  MoreHorizontal,
  Calendar,
  Signal,
  User,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ListTodo,
  CheckSquare,
  Square
} from "lucide-react";

interface BoardPanelProps {
  tasks: PlanTask[];
  onUpdateTask: (id: string, updates: Partial<PlanTask>) => void;
  onAddTask?: (status: PlanTask["status"], parentTaskId?: string) => void;
}

const COLUMNS = [
  { id: "todo", label: "To Do", color: "bg-slate-500", icon: Clock },
  { id: "in-progress", label: "In Progress", color: "bg-[var(--accent)]", icon: Signal },
  { id: "completed", label: "Completed", color: "bg-emerald-500", icon: CheckCircle2 },
  { id: "blocked", label: "Blocked", color: "bg-rose-500", icon: AlertCircle },
] as const;

export function BoardPanel({ tasks, onUpdateTask, onAddTask }: BoardPanelProps) {
  // Local state to keep track of expanded card checklist widgets
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const toggleExpand = (taskId: string) => {
    setExpandedCards((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  return (
    <div className="flex gap-6 h-full overflow-x-auto p-6 custom-scrollbar bg-[var(--bg-950)]/50">
      {COLUMNS.map((column) => {
        // Filter tasks that belong to this column
        const columnTasks = tasks.filter((t) => t.status === column.id);
        // Only render Parent Tasks (parent_task_id is empty or null) as main column cards
        const parentTasks = columnTasks.filter((t) => !t.parent_task_id);

        return (
          <div key={column.id} className="w-85 flex-shrink-0 flex flex-col gap-4">
            {/* Column Header */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${column.color} shadow-[0_0_8px] shadow-current`} />
                <h3 className="font-bold text-xs tracking-widest text-[var(--text-muted)] uppercase">
                  {column.label}
                </h3>
                <span className="text-[10px] font-mono text-[var(--text-dim)] ml-1">
                  {parentTasks.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => onAddTask?.(column.id as PlanTask["status"])}
                  className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-dim)]">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cards Scrollable Body */}
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar min-h-0 pb-4">
              {parentTasks.map((task) => {
                // Find sub-tasks belonging to this parent task
                const subtasks = tasks.filter((t) => t.parent_task_id === task.id);
                const completedSubtasks = subtasks.filter((s) => s.status === "completed").length;
                const percentComplete = subtasks.length > 0 
                  ? Math.round((completedSubtasks / subtasks.length) * 100) 
                  : 0;
                const isExpanded = !!expandedCards[task.id];

                return (
                  <motion.div
                    key={task.id}
                    id={`plan-entity-${task.id}`}
                    layoutId={task.id}
                    drag
                    dragSnapToOrigin
                    onDragEnd={(e, info) => {
                      const container = (e.target as HTMLElement).closest(".overflow-x-auto");
                      if (!container) return;
                      const rect = container.getBoundingClientRect();
                      const relativeX = info.point.x - rect.left + container.scrollLeft;
                      const columnWidth = 340 + 24; // w-85 (340px) + gap-6 (24px)
                      const colIndex = Math.floor(relativeX / columnWidth);
                      
                      if (colIndex >= 0 && colIndex < COLUMNS.length) {
                        const newStatus = COLUMNS[colIndex].id;
                        if (newStatus !== task.status) {
                          onUpdateTask(task.id, { status: newStatus as PlanTask["status"] });
                        }
                      }
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileDrag={{ scale: 1.02, rotate: 1, zIndex: 50, cursor: 'grabbing' }}
                    className="group bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-3.5 hover:border-[var(--accent)]/30 transition-all cursor-grab active:cursor-grabbing flex flex-col gap-2 shadow-none"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <h4 className="text-sm font-medium text-[var(--text-primary)] leading-snug flex-1">
                        {task.title}
                      </h4>
                      <div className="flex -space-x-1 shrink-0 mt-0.5">
                        {task.assignee_id ? (
                          <div 
                            title={task.assignee_email || "Assigned"}
                            className="w-5.5 h-5.5 rounded bg-[var(--accent-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[8px] font-bold text-[var(--accent)]"
                          >
                            {task.assignee_email?.substring(0, 2).toUpperCase() || "U"}
                          </div>
                        ) : (
                          <div className="w-5.5 h-5.5 rounded bg-[var(--surface-2)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-dim)]">
                            <User className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded ${
                        task.priority === "high" 
                          ? "bg-rose-500/10 text-rose-500" 
                          : task.priority === "medium" 
                          ? "bg-amber-500/10 text-amber-500" 
                          : "bg-emerald-500/10 text-emerald-500"
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
              
              {parentTasks.length === 0 && (
                <div className="h-24 border-2 border-dashed border-[var(--border-subtle)] rounded-2xl flex flex-col items-center justify-center text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest gap-2">
                  <span>Empty Column</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
