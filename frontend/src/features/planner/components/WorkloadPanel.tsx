import { PlanProjectDetail, TeamMember, PlanTask } from "../types";
import { User as UserIcon, TrendingUp, Zap } from "lucide-react";

interface WorkloadPanelProps {
  project: PlanProjectDetail;
  teamMembers: TeamMember[];
}

export function WorkloadPanel({ project, teamMembers }: WorkloadPanelProps) {
  // Compute workload and velocity
  const workload: Record<string, PlanTask[]> = {};
  const completed: Record<string, PlanTask[]> = {};

  teamMembers.forEach((m) => {
    workload[m.user.id] = [];
    completed[m.user.id] = [];
  });
  workload["unassigned"] = [];

  project.tasks.forEach((t) => {
    if (t.status === "completed") {
      if (t.assignee_id && completed[t.assignee_id]) {
        completed[t.assignee_id].push(t);
      }
    } else {
      if (t.assignee_id && workload[t.assignee_id]) {
        workload[t.assignee_id].push(t);
      } else {
        workload["unassigned"].push(t);
      }
    }
  });

  const getWorkloadColor = (count: number) => {
    if (count === 0) return "bg-[var(--surface-2)] text-[var(--text-muted)]";
    if (count <= 2) return "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
    if (count <= 4) return "bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20";
    return "bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20";
  };

  const calculateVelocity = (userId: string) => {
    const tasks = completed[userId] || [];
    if (tasks.length === 0) return null;

    let totalMs = 0;
    tasks.forEach(t => {
      const start = new Date(t.created_at).getTime();
      const end = new Date(t.updated_at).getTime();
      totalMs += (end - start);
    });

    const avgDays = totalMs / tasks.length / (1000 * 60 * 60 * 24);
    return Math.max(0.1, avgDays); // prevent 0
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-[var(--text-primary)]">Team Workload & Predictive Velocity</h3>
          <p className="text-xs text-[var(--text-muted)]">Active task distribution and estimated capacity based on historical performance</p>
        </div>
      </div>

      <div className="space-y-4">
        {teamMembers.map((m) => {
          const tasks = workload[m.user.id] || [];
          const velocity = calculateVelocity(m.user.id);
          const predictedDays = velocity ? Math.ceil(velocity * tasks.length) : null;

          return (
            <div key={m.user.id} className="bg-[var(--surface-1)] border border-[var(--border-subtle)] p-5 rounded-2xl flex items-start gap-5 transition-all hover:border-[var(--accent-subtle)]">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] font-bold shrink-0 text-lg">
                {m.user.first_name?.substring(0, 2).toUpperCase() || m.user.email.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-[var(--text-primary)] truncate flex items-center gap-2">
                    {m.user.first_name || m.user.email}
                    {velocity && (
                      <span className="flex items-center gap-1 text-[10px] text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-full border border-[var(--accent)]/20">
                        <Zap className="w-3 h-3" />
                        {velocity.toFixed(1)} days/task
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    {predictedDays !== null && tasks.length > 0 && (
                      <span className="text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        ~{predictedDays}d to clear
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${getWorkloadColor(tasks.length)}`}>
                      {tasks.length} active tasks
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="text-[10px] bg-[var(--bg-900)] border border-[var(--border-subtle)] px-2 py-1 rounded truncate max-w-[150px] text-[var(--text-secondary)]" title={t.title}>
                      {t.title}
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <span className="text-xs text-[var(--text-dim)] italic">No active tasks</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {workload["unassigned"].length > 0 && (
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] p-4 rounded-2xl flex items-start gap-4 opacity-75">
            <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-muted)] font-bold shrink-0">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-[var(--text-muted)]">Unassigned Tasks</span>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                  {workload["unassigned"].length} pending
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {workload["unassigned"].map((t) => (
                  <div key={t.id} className="text-[10px] bg-[var(--bg-900)] border border-[var(--border-subtle)] px-2 py-1 rounded truncate max-w-[150px] text-[var(--text-secondary)]" title={t.title}>
                    {t.title}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
