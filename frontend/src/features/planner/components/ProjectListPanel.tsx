"use client";

import { Search, Target, Plus } from "lucide-react";
import type { PlanProjectListItem } from "../types";
import { EmptyState } from "@/components/ui/EmptyState";
import { ICONSCOUT } from "@/lib/iconscoutAssets";

interface ProjectListPanelProps {
  projects: PlanProjectListItem[];
  activeProjectId: string | null;
  query: string;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
}

export function ProjectListPanel({
  projects,
  activeProjectId,
  query,
  loading,
  onQueryChange,
  onSelectProject,
  onNewProject,
}: ProjectListPanelProps) {
  return (
    <aside className="w-[340px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <div className="h-14 border-b border-[var(--border-subtle)] px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Planner</h2>
        </div>
        <button
          onClick={onNewProject}
          className="p-1.5 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--border-subtle)] hover:bg-[var(--accent-subtle)]/80 transition-all"
          title="New Project"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 border-b border-[var(--border-subtle)]">
        <label className="relative block">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search projects..."
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </label>
      </div>

      <div className="overflow-y-auto h-[calc(100%-116px)] p-2 custom-scrollbar">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="p-3 rounded-xl border border-[var(--border-subtle)] bg-white/[0.01] animate-pulse space-y-2.5">
                <div className="h-4 w-2/3 bg-white/[0.03] rounded" />
                <div className="h-3 w-5/6 bg-white/[0.02] rounded" />
                <div className="h-3.5 w-1/3 bg-white/[0.02] rounded-full" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            compact
            illustrationSrc={ICONSCOUT.illustrations.emptyPlanner}
            illustrationAlt="No planner projects"
            title="No projects yet"
            description="Create a project to plan milestones, tasks, and team workload."
            action={
              <button
                type="button"
                onClick={onNewProject}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--bg-950)] hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                New project
              </button>
            }
          />
        ) : (
          projects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors mb-2 ${
                  active
                    ? "border-[var(--border-subtle)] bg-[var(--accent-subtle)]"
                    : "border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-900)]"
                }`}
              >
                <div className="text-sm font-medium text-[var(--text-primary)]">{project.name}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">
                  {project.description || "No description yet."}
                </div>
                <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                  {project.task_count} tasks • {project.milestone_count} milestones
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
