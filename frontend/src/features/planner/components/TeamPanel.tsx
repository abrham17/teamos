"use client";

import React from "react";
import { PlanTask, TeamMember, ProjectMember } from "../types";
import { LayoutGrid, CheckCircle2, Clock, AlertCircle, UserPlus, Shield, Trash2 } from "lucide-react";
import { motion } from "motion/react";

interface TeamPanelProps {
  tasks: PlanTask[];
  teamMembers: TeamMember[];
  projectMembers: ProjectMember[];
  onRemoveMember?: (userId: string) => void;
  onOpenAddMember?: () => void;
  onEditRole?: (userId: string, role: string) => void;
}

export function TeamPanel({ tasks, teamMembers, projectMembers, onRemoveMember, onOpenAddMember, onEditRole }: TeamPanelProps) {
  // Map project members first to show their explicit roles
  const projectMemberMap = new Map(projectMembers.map(m => [m.user.id, m]));

  const membersWithContext = teamMembers.map(member => {
    const projectMembership = projectMemberMap.get(member.user.id);
    return {
      ...member,
      projectRole: projectMembership?.role,
      isProjectMember: !!projectMembership,
      tasks: tasks.filter(t => t.assignee_id === member.user.id || t.assignee_email === member.user.email)
    };
  });

  // Sort: Project members first, then others
  const sortedMembers = [...membersWithContext].sort((a, b) => {
    if (a.isProjectMember && !b.isProjectMember) return -1;
    if (!a.isProjectMember && b.isProjectMember) return 1;
    return 0;
  });

  const unassignedTasks = tasks.filter(t => !t.assignee_id && !t.assignee_email);

  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-[var(--bg-950)]/50">
      <div className="max-w-6xl mx-auto space-y-10 pb-12">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Team Workload</h2>
            <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest mt-1">
              Resource Allocation & Task Distribution
            </p>
          </div>
          {onOpenAddMember && (
            <button
              onClick={onOpenAddMember}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:opacity-90 transition-all shadow-xl shadow-[var(--accent-glow)]"
            >
              <UserPlus className="w-4 h-4" />
              Add Project Member
            </button>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedMembers.map((member, idx) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[32px] p-6 shadow-sm hover:border-[var(--accent-subtle)] transition-all flex flex-col"
            >
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border shadow-inner ${
                    member.isProjectMember 
                      ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/20" 
                      : "bg-[var(--surface-2)] text-[var(--text-dim)] border-[var(--border-subtle)]"
                  }`}>
                    {member.user.first_name?.substring(0, 2).toUpperCase() || member.user.email?.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-[var(--text-primary)] truncate tracking-tight">{member.user.first_name || member.user.email}</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {member.isProjectMember && <Shield className="w-2.5 h-2.5 text-[var(--accent)]" />}
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${member.isProjectMember ? "text-[var(--accent)]" : "text-[var(--text-dim)]"}`}>
                        {member.projectRole || member.role || 'Contributor'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {member.isProjectMember && onEditRole && (
                    <button 
                      onClick={() => onEditRole(member.user.id, member.projectRole || "")}
                      className="p-2 hover:bg-[var(--accent-subtle)] rounded-xl text-[var(--text-dim)] hover:text-[var(--accent)] transition-all"
                      title="Update Role"
                    >
                      <Shield className="w-4 h-4" />
                    </button>
                  )}
                  {member.isProjectMember && onRemoveMember && (
                    <button 
                      onClick={() => {
                        if (confirm(`Remove ${member.user.first_name || member.user.email} from this project?`)) onRemoveMember(member.user.id);
                      }}
                      className="p-2 hover:bg-[var(--danger)]/10 rounded-xl text-[var(--text-dim)] hover:text-[var(--danger)] transition-all"
                      title="Remove from Project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {!member.isProjectMember && onEditRole && (
                    <button 
                      onClick={() => onEditRole(member.user.id, "Contributor")}
                      className="p-2 hover:bg-[var(--accent-subtle)] rounded-xl text-[var(--text-dim)] hover:text-[var(--accent)] transition-all"
                      title="Assign to Project"
                    >
                      <UserPlus className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <StatCard 
                  label="Tasks" 
                  value={member.tasks.length} 
                  icon={<LayoutGrid className="w-3 h-3" />} 
                />
                <StatCard 
                  label="Done" 
                  value={member.tasks.filter(t => t.status === 'completed').length} 
                  icon={<CheckCircle2 className="w-3 h-3" />} 
                  color="text-emerald-500"
                />
                <StatCard 
                  label="In Progress" 
                  value={member.tasks.filter(t => t.status === 'in-progress').length} 
                  icon={<Clock className="w-3 h-3" />} 
                  color="text-[var(--accent)]"
                />
              </div>

              <div className="flex-1 space-y-2">
                <p className="text-[9px] font-black text-[var(--text-dim)] uppercase tracking-widest mb-3">Recent Tasks</p>
                {member.tasks.slice(0, 5).map(task => (
                  <div key={task.id} className="flex items-center justify-between p-3 bg-[var(--bg-900)] rounded-xl border border-[var(--border-subtle)]/50">
                    <span className="text-[11px] font-medium text-[var(--text-muted)] truncate pr-2">{task.title}</span>
                    <StatusBadge status={task.status} />
                  </div>
                ))}
                {member.tasks.length === 0 && (
                  <div className="py-8 text-center text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest border-2 border-dashed border-[var(--border-subtle)] rounded-2xl">
                    No tasks assigned
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {unassignedTasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--surface-1)] border border-dashed border-[var(--danger)]/30 rounded-[32px] p-6 shadow-sm flex flex-col"
            >
              <div className="flex items-center gap-4 mb-6 text-[var(--danger)]">
                <div className="w-12 h-12 rounded-2xl bg-[var(--danger)]/10 flex items-center justify-center border border-[var(--danger)]/20 shadow-inner">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-[var(--text-primary)] tracking-tight">Unassigned</h4>
                  <p className="text-[10px] text-[var(--danger)] font-bold uppercase tracking-widest">Needs Owner</p>
                </div>
              </div>

              <div className="flex-1 space-y-2">
                {unassignedTasks.slice(0, 10).map(task => (
                  <div key={task.id} className="flex items-center justify-between p-3 bg-[var(--bg-900)] rounded-xl border border-[var(--border-subtle)]/50">
                    <span className="text-[11px] font-medium text-[var(--text-muted)] truncate pr-2">{task.title}</span>
                    <StatusBadge status={task.status} />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color = "text-[var(--text-muted)]" }: { label: string; value: number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-[var(--bg-900)] p-3 rounded-2xl border border-[var(--border-subtle)] flex flex-col items-center justify-center">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <span className="text-sm font-black text-[var(--text-primary)]">{value}</span>
      <span className="text-[8px] font-bold text-[var(--text-dim)] uppercase tracking-tighter">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    'todo': 'bg-slate-500/10 text-slate-500',
    'in-progress': 'bg-[var(--accent)]/10 text-[var(--accent)]',
    'completed': 'bg-emerald-500/10 text-emerald-500',
    'blocked': 'bg-rose-500/10 text-rose-500',
  };
  return (
    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${config[status] || config['todo']}`}>
      {status.replace('-', ' ')}
    </span>
  );
}
