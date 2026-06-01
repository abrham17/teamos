"use client";

import { LayoutGrid, CheckCircle2, Clock, AlertCircle, UserPlus, Shield, Trash2 } from "lucide-react";
import { DrawerContainer } from "./DrawerContainer";
import { PlanTask, TeamMember, ProjectMember } from "../../types";

interface TeamDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: PlanTask[];
  teamMembers: TeamMember[];
  projectMembers: ProjectMember[];
  onRemoveMember?: (userId: string) => void;
  onOpenAddMember?: () => void;
  onEditRole?: (userId: string, role: string) => void;
}

export function TeamDrawer({
  isOpen,
  onClose,
  tasks,
  teamMembers,
  projectMembers,
  onRemoveMember,
  onOpenAddMember,
  onEditRole,
}: TeamDrawerProps) {
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

  const sortedMembers = [...membersWithContext].sort((a, b) => {
    if (a.isProjectMember && !b.isProjectMember) return -1;
    if (!a.isProjectMember && b.isProjectMember) return 1;
    return 0;
  });

  const unassignedTasks = tasks.filter(t => !t.assignee_id && !t.assignee_email);

  if (!isOpen) return null;

  return (
    <DrawerContainer isOpen={isOpen} onClose={onClose} title="Team Workload">
      <div className="space-y-4">
        {onOpenAddMember && (
          <button
            onClick={onOpenAddMember}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--accent)] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:opacity-90 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Project Member
          </button>
        )}

        <div className="space-y-3">
          {sortedMembers.map((member) => (
            <div
              key={member.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/json", JSON.stringify({
                  entityType: "member",
                  entityId: member.user.id,
                  name: member.user.first_name || member.user.email,
                  role: member.projectRole || member.role || "",
                }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-4 hover:border-[var(--accent-subtle)] transition-all"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm border ${
                    member.isProjectMember 
                      ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/20" 
                      : "bg-[var(--surface-2)] text-[var(--text-dim)] border-[var(--border-subtle)]"
                  }`}>
                    {member.user.first_name?.substring(0, 2).toUpperCase() || member.user.email?.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-[12px] text-[var(--text-primary)] truncate">
                      {member.user.first_name || member.user.email}
                    </h4>
                    <div className="flex items-center gap-1 mt-0.5">
                      {member.isProjectMember && <Shield className="w-2 h-2 text-[var(--accent)]" />}
                      <p className={`text-[9px] font-bold uppercase tracking-wider ${member.isProjectMember ? "text-[var(--accent)]" : "text-[var(--text-dim)]"}`}>
                        {member.projectRole || member.role || 'Contributor'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  {member.isProjectMember && onEditRole && (
                    <button 
                      onClick={() => onEditRole(member.user.id, member.projectRole || "")}
                      className="p-1.5 hover:bg-[var(--accent-subtle)] rounded-lg text-[var(--text-dim)] hover:text-[var(--accent)] transition-all"
                      title="Update Role"
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {member.isProjectMember && onRemoveMember && (
                    <button 
                      onClick={() => {
                        if (confirm(`Remove ${member.user.first_name || member.user.email} from this project?`)) {
                          onRemoveMember(member.user.id);
                        }
                      }}
                      className="p-1.5 hover:bg-[var(--danger)]/10 rounded-lg text-[var(--text-dim)] hover:text-[var(--danger)] transition-all"
                      title="Remove from Project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!member.isProjectMember && onEditRole && (
                    <button 
                      onClick={() => onEditRole(member.user.id, "Contributor")}
                      className="p-1.5 hover:bg-[var(--accent-subtle)] rounded-lg text-[var(--text-dim)] hover:text-[var(--accent)] transition-all"
                      title="Assign to Project"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <StatCard 
                  label="Tasks" 
                  value={member.tasks.length} 
                  icon={<LayoutGrid className="w-2.5 h-2.5" />} 
                />
                <StatCard 
                  label="Done" 
                  value={member.tasks.filter(t => t.status === 'completed').length} 
                  icon={<CheckCircle2 className="w-2.5 h-2.5" />} 
                  color="text-emerald-500"
                />
                <StatCard 
                  label="Active" 
                  value={member.tasks.filter(t => t.status === 'in-progress').length} 
                  icon={<Clock className="w-2.5 h-2.5" />} 
                  color="text-[var(--accent)]"
                />
              </div>

              {member.tasks.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[8px] font-black text-[var(--text-dim)] uppercase tracking-wider">Recent Tasks</p>
                  {member.tasks.slice(0, 3).map(task => (
                    <div key={task.id} className="flex items-center justify-between p-2 bg-[var(--bg-900)] rounded-lg border border-[var(--border-subtle)]/50">
                      <span className="text-[10px] font-medium text-[var(--text-muted)] truncate pr-2 flex-1">{task.title}</span>
                      <StatusBadge status={task.status} />
                    </div>
                  ))}
                  {member.tasks.length > 3 && (
                    <p className="text-[9px] text-[var(--text-dim)] text-center font-semibold">
                      +{member.tasks.length - 3} more
                    </p>
                  )}
                </div>
              )}

              {member.tasks.length === 0 && (
                <div className="py-4 text-center text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wider border-2 border-dashed border-[var(--border-subtle)] rounded-lg">
                  No tasks assigned
                </div>
              )}
            </div>
          ))}

          {unassignedTasks.length > 0 && (
            <div className="bg-[var(--surface-1)] border border-dashed border-[var(--danger)]/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3 text-[var(--danger)]">
                <div className="w-8 h-8 rounded-lg bg-[var(--danger)]/10 flex items-center justify-center border border-[var(--danger)]/20">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-[12px] text-[var(--text-primary)]">Unassigned</h4>
                  <p className="text-[9px] text-[var(--danger)] font-bold uppercase tracking-wider">Needs Owner</p>
                </div>
              </div>

              <div className="space-y-1.5">
                {unassignedTasks.slice(0, 5).map(task => (
                  <div key={task.id} className="flex items-center justify-between p-2 bg-[var(--bg-900)] rounded-lg border border-[var(--border-subtle)]/50">
                    <span className="text-[10px] font-medium text-[var(--text-muted)] truncate pr-2 flex-1">{task.title}</span>
                    <StatusBadge status={task.status} />
                  </div>
                ))}
                {unassignedTasks.length > 5 && (
                  <p className="text-[9px] text-[var(--text-dim)] text-center font-semibold">
                    +{unassignedTasks.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DrawerContainer>
  );
}

function StatCard({ label, value, icon, color = "text-[var(--text-muted)]" }: { label: string; value: number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-[var(--bg-900)] p-2 rounded-lg border border-[var(--border-subtle)] flex flex-col items-center justify-center">
      <div className={`mb-0.5 ${color}`}>{icon}</div>
      <span className="text-xs font-black text-[var(--text-primary)]">{value}</span>
      <span className="text-[7px] font-bold text-[var(--text-dim)] uppercase tracking-tighter">{label}</span>
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
    <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded ${config[status] || config['todo']}`}>
      {status.replace('-', ' ')}
    </span>
  );
}
