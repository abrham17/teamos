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
                    whileDrag={{ scale: 1.03, rotate: 1.5, zIndex: 50, cursor: 'grabbing' }}
                    className="group bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-[var(--accent-subtle)] transition-all cursor-grab active:cursor-grabbing flex flex-col gap-2"
                  >
                    {/* Card Priority Tag & Actions */}
                    <div className="flex items-start justify-between">
                      <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded ${
                        task.priority === "high" 
                          ? "bg-rose-500/10 text-rose-500" 
                          : task.priority === "medium" 
                          ? "bg-amber-500/10 text-amber-500" 
                          : "bg-emerald-500/10 text-emerald-500"
                      }`}>
                        {task.priority}
                      </span>
                      <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--surface-2)] rounded transition-all">
                        <MoreHorizontal className="w-3 h-3 text-[var(--text-dim)]" />
                      </button>
                    </div>

                    {/* Task Title */}
                    <h4 className="text-sm font-bold text-[var(--text-primary)] leading-tight group-hover:text-[var(--accent)] transition-colors">
                      {task.title}
                    </h4>
                    
                    {/* Task Description */}
                    {task.description && (
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {/* Subtask Checklist Progress Summary */}
                    {subtasks.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <ListTodo className="w-3 h-3 text-[var(--accent)]" />
                            Sub-tasks ({completedSubtasks}/{subtasks.length})
                          </span>
                          <span>{percentComplete}%</span>
                        </div>
                        <div className="h-1 bg-[var(--bg-900)] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                            style={{ width: `${percentComplete}%` }}
                          />
                        </div>
                        
                        {/* Collapsible toggle checklist link */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                          className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--accent)] hover:underline pt-1"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isExpanded ? "Hide sub-tasks" : "Show checklist"}
                        </button>
                      </div>
                    )}

                    {/* Expanded Collapsible Subtasks Checklist */}
                    <AnimatePresence>
                      {isExpanded && subtasks.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden border-t border-[var(--border-subtle)]/50 pt-3 mt-1.5 space-y-2"
                        >
                          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                            {subtasks.map((sub) => {
                              const subCompleted = sub.status === "completed";
                              return (
                                <div 
                                  key={sub.id} 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateTask(sub.id, { status: subCompleted ? "todo" : "completed" });
                                  }}
                                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-all cursor-pointer text-xs"
                                >
                                  {subCompleted ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
                                  )}
                                  <span className={`truncate flex-1 ${subCompleted ? "line-through text-[var(--text-dim)]" : "text-[var(--text-secondary)]"}`}>
                                    {sub.title}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Quick inline "+ Sub-task" addition button inside the card checklist */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddTask?.(task.status, task.id);
                            }}
                            className="flex items-center gap-1 text-[9px] font-bold text-[var(--accent)] hover:underline pl-1"
                          >
                            <Plus className="w-3 h-3" />
                            Add Sub-task
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Card Footer with Assignee & Date */}
                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]/50 mt-1.5">
                      <div className="flex items-center gap-3">
                        {(task.start_date || task.end_date) && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--text-dim)]">
                            <Calendar className="w-3 h-3" />
                            <span>{task.end_date ? new Date(task.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Set date'}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex -space-x-2">
                        {task.assignee_id ? (
                          <div 
                            title={task.assignee_email || "Assigned"}
                            className="w-6 h-6 rounded-lg bg-[var(--accent)] flex items-center justify-center text-[8px] font-black text-white border-2 border-[var(--surface-1)] shadow-sm"
                          >
                            {task.assignee_email?.substring(0, 2).toUpperCase() || "U"}
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-dim)] border-2 border-[var(--surface-1)]">
                            <User className="w-3 h-3" />
                          </div>
                        )}
                      </div>
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
