"use client";

import React from "react";
import { motion } from "motion/react";
import { PlanTask, TeamMember } from "../types";
import { Plus, MoreHorizontal, Calendar, Signal, User, AlertCircle, Clock, CheckCircle2 } from "lucide-react";

interface BoardPanelProps {
  tasks: PlanTask[];
  onUpdateTask: (id: string, updates: Partial<PlanTask>) => void;
  teamMembers: TeamMember[];
}

const COLUMNS = [
  { id: "todo", label: "To Do", color: "bg-slate-500", icon: Clock },
  { id: "in-progress", label: "In Progress", color: "bg-[var(--accent)]", icon: Signal },
  { id: "completed", label: "Completed", color: "bg-emerald-500", icon: CheckCircle2 },
  { id: "blocked", label: "Blocked", color: "bg-rose-500", icon: AlertCircle },
] as const;

export function BoardPanel({ tasks, onUpdateTask, teamMembers }: BoardPanelProps) {
  return (
    <div className="flex gap-6 h-full overflow-x-auto p-6 custom-scrollbar bg-[var(--bg-950)]/50">
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter((t) => t.status === column.id);
        
        return (
          <div key={column.id} className="w-80 flex-shrink-0 flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${column.color} shadow-[0_0_8px] shadow-current`} />
                <h3 className="font-bold text-xs tracking-widest text-[var(--text-muted)] uppercase">
                  {column.label}
                </h3>
                <span className="text-[10px] font-mono text-[var(--text-dim)] ml-1">
                  {columnTasks.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
                <button className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-dim)]">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar min-h-0 pb-4">
              {columnTasks.map((task) => (
                <motion.div
                  key={task.id}
                  layoutId={task.id}
                  drag
                  dragSnapToOrigin
                  onDragEnd={(e, info) => {
                    const container = (e.target as HTMLElement).closest(".overflow-x-auto");
                    if (!container) return;
                    const rect = container.getBoundingClientRect();
                    const relativeX = info.point.x - rect.left + container.scrollLeft;
                    const columnWidth = 320 + 24; // w-80 (320px) + gap-6 (24px)
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
                  whileDrag={{ scale: 1.05, rotate: 2, zIndex: 50, cursor: 'grabbing' }}
                  className="group bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-[var(--accent-subtle)] transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between mb-3">
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

                  <h4 className="text-sm font-bold text-[var(--text-primary)] leading-tight mb-2 group-hover:text-[var(--accent)] transition-colors">
                    {task.title}
                  </h4>
                  
                  {task.description && (
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 mb-4 leading-relaxed">
                      {task.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]/50">
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
              ))}
              
              {columnTasks.length === 0 && (
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
