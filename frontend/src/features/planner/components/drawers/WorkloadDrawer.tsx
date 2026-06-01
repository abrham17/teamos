import { User as UserIcon, TrendingUp, Zap } from "lucide-react";
import { DrawerContainer } from "./DrawerContainer";
import { PlanProjectDetail, TeamMember, PlanTask } from "../../types";

interface WorkloadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: PlanProjectDetail;
  teamMembers: TeamMember[];
}

export function WorkloadDrawer({ isOpen, onClose, project, teamMembers }: WorkloadDrawerProps) {
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
    return Math.max(0.1, avgDays);
  };

  if (!isOpen) return null;

  return (
    <DrawerContainer isOpen={isOpen} onClose={onClose} title="Workload & Velocity">
      <div className="space-y-4">
        <p className="text-[10px] text-[var(--text-muted)]">
          Active task distribution and estimated capacity based on historical performance
        </p>

        <div className="space-y-3">
          {teamMembers.map((m) => {
            const tasks = workload[m.user.id] || [];
            const velocity = calculateVelocity(m.user.id);
            const predictedDays = velocity ? Math.ceil(velocity * tasks.length) : null;

            return (
              <div key={m.user.id} className="bg-[var(--surface-1)] border border-[var(--border-subtle)] p-3 rounded-xl hover:border-[var(--accent-subtle)] transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] font-bold shrink-0 text-sm">
                    {m.user.first_name?.substring(0, 2).toUpperCase() || m.user.email.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                        {m.user.first_name || m.user.email}
                        {velocity && (
                          <span className="flex items-center gap-0.5 text-[9px] text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded-full border border-[var(--accent)]/20">
                            <Zap className="w-2.5 h-2.5" />
                            {velocity.toFixed(1)}d
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {predictedDays !== null && tasks.length > 0 && (
                          <span className="text-[9px] font-bold text-[var(--text-muted)] flex items-center gap-0.5">
                            <TrendingUp className="w-2.5 h-2.5" />
                            ~{predictedDays}d
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${getWorkloadColor(tasks.length)}`}>
                          {tasks.length}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {tasks.slice(0, 4).map((t) => (
                        <div key={t.id} className="text-[9px] bg-[var(--bg-900)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded truncate max-w-[120px] text-[var(--text-secondary)]" title={t.title}>
                          {t.title}
                        </div>
                      ))}
                      {tasks.length > 4 && (
                        <span className="text-[9px] text-[var(--text-dim)] font-semibold">+{tasks.length - 4}</span>
                      )}
                      {tasks.length === 0 && (
                        <span className="text-[10px] text-[var(--text-dim)] italic">No active tasks</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {workload["unassigned"].length > 0 && (
            <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] p-3 rounded-xl opacity-75">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-muted)] font-bold shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-[var(--text-muted)]">Unassigned</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                      {workload["unassigned"].length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {workload["unassigned"].slice(0, 4).map((t) => (
                      <div key={t.id} className="text-[9px] bg-[var(--bg-900)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded truncate max-w-[120px] text-[var(--text-secondary)]" title={t.title}>
                        {t.title}
                      </div>
                    ))}
                    {workload["unassigned"].length > 4 && (
                      <span className="text-[9px] text-[var(--text-dim)] font-semibold">+{workload["unassigned"].length - 4}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DrawerContainer>
  );
}
