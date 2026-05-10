"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { PlanProjectDetail, PlanTask, TeamMember, PlanMilestone } from "../types";
import {
  Search,
  Plus,
  Clock,
  CheckCircle2,
  FileText,
  Download,
  Sparkles,
  PlusCircle,
  Flag,
  LayoutGrid,
  Users,
  Shield,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { updatePlanTask, updatePlanMilestone } from "../api";
import { useWikiStore } from "@/stores/useWikiStore";


interface ProjectOverviewPanelProps {
  activeProject: PlanProjectDetail | null;
  loadingDetail: boolean;
  error: string | null;
  teamMembers: TeamMember[];
  onAskAI: () => void;
  onRefreshDetail: () => void;
  onOpenAddTask: () => void;
  onOpenAddMilestone: () => void;
  onDeleteProject: (name: string) => void;
  onDeleteTask: (taskId: string) => void;
}

export function ProjectOverviewPanel({
  activeProject,
  loadingDetail,
  error,
  teamMembers,
  onAskAI,
  onRefreshDetail,
  onOpenAddTask,
  onOpenAddMilestone,
  onDeleteProject,
  onDeleteTask,
}: ProjectOverviewPanelProps) {
  const { currentTeamId } = useWikiStore();
  const [taskSearch, setTaskSearch] = useState("");

  if (loadingDetail) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-950)]/50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl border-4 border-[var(--accent-subtle)] border-t-[var(--accent)] animate-spin" />
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest animate-pulse">
            Syncing Roadmap...
          </p>
        </div>
      </div>
    );
  }

  if (error || !activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-center bg-[var(--bg-950)]/50">
        <div className="max-w-md space-y-6">
          <div className="w-20 h-20 bg-[var(--surface-1)] rounded-[32px] flex items-center justify-center mx-auto border border-[var(--border-subtle)] shadow-inner">
            <Sparkles className="w-10 h-10 text-[var(--accent)] opacity-20" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              {error ? "Deployment Error" : "Select a Strategy"}
            </h3>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              {error
                ? "Failed to fetch project data. Please verify your connection."
                : "Select a project from the sidebar or initialize a new strategic plan with the AI Architect."}
            </p>
          </div>
          {!error && (
            <button
              onClick={onAskAI}
              className="px-6 py-3 bg-[var(--accent)] text-white rounded-2xl font-bold flex items-center gap-2 mx-auto hover:opacity-90 transition-all shadow-xl shadow-[var(--accent-glow)]"
            >
              <Plus className="w-4 h-4" />
              Initialize Project
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleExportHTML = () => {
    if (!activeProject) return;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${activeProject.name} - Project Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #030712;
            --surface: #111827;
            --accent: #6366f1;
            --text: #f9fafb;
            --muted: #9ca3af;
            --border: rgba(255,255,255,0.1);
        }
        body {
            font-family: 'Inter', sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            margin: 0;
            padding: 40px 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        header {
            margin-bottom: 60px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 40px;
        }
        h1 { font-size: 48px; font-weight: 800; margin: 0 0 16px; letter-spacing: -0.05em; }
        .description { font-size: 18px; color: var(--muted); max-width: 600px; }
        
        .section { margin-bottom: 48px; }
        h2 { font-size: 24px; font-weight: 800; margin-bottom: 24px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; }
        
        .card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 24px;
            padding: 24px;
            margin-bottom: 16px;
        }
        .task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .task-title { font-weight: 600; font-size: 16px; }
        .badge { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 4px 8px; border-radius: 8px; background: rgba(255,255,255,0.05); }
        
        .team-grid { display: grid; grid-cols: 2; gap: 16px; }
        .member { display: flex; align-items: center; gap: 12px; }
        .avatar { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; }
        
        @media print {
            body { background: white; color: black; }
            .card { border: 1px solid #eee; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="badge" style="color: var(--accent)">Strategic Plan</div>
            <h1>${activeProject.name}</h1>
            <p class="description">${activeProject.description || 'No mission statement provided.'}</p>
            <p style="font-size: 12px; color: var(--muted)">Exported on ${new Date().toLocaleDateString()}</p>
        </header>

        <div class="section">
            <h2>Project Team</h2>
            <div class="card">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    ${activeProject.members.map(m => `
                        <div class="member">
                            <div class="avatar">${(m.user.first_name || m.user.email).substring(0, 2).toUpperCase()}</div>
                            <div>
                                <div style="font-weight: 600; font-size: 14px;">${m.user.first_name || m.user.email}</div>
                                <div style="font-size: 10px; color: var(--muted); text-transform: uppercase;">${m.role}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <div class="section">
            <h2>Strategic Roadmap</h2>
            ${activeProject.tasks.map(t => `
                <div class="card">
                    <div class="task-header">
                        <div class="task-title">${t.title}</div>
                        <div class="badge">${t.status}</div>
                    </div>
                    <p style="font-size: 13px; color: var(--muted); margin: 0;">${t.description || 'No additional details.'}</p>
                    <div style="margin-top: 12px; font-size: 11px; font-weight: 600; display: flex; gap: 12px;">
                        <span>Priority: ${t.priority}</span>
                        <span>End Date: ${t.end_date || 'TBD'}</span>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="section">
            <h2>Checkpoints</h2>
            <div class="card">
                ${activeProject.milestones.map(m => `
                    <div style="margin-bottom: 16px; display: flex; justify-content: space-between;">
                        <div style="font-weight: 600;">${m.title}</div>
                        <div style="font-size: 12px; color: var(--muted);">${m.target_date || 'TBD'}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.name.replace(/\\s+/g, '_')}_Report.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleToggleTask = async (task: PlanTask) => {
    if (!currentTeamId) return;
    const newStatus = task.status === "completed" ? "todo" : "completed";
    try {
      await updatePlanTask(currentTeamId, activeProject.id, task.id, { status: newStatus });
      onRefreshDetail();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleMilestone = async (m: PlanMilestone) => {
    if (!currentTeamId) return;
    const newStatus = m.status === "reached" ? "pending" : "reached";
    try {
      await updatePlanMilestone(currentTeamId, activeProject.id, m.id, { status: newStatus });
      onRefreshDetail();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteProject = () => {
    const email = prompt(`To delete this project, please type the project name: "${activeProject.name}"`);
    if (email === activeProject.name) {
      onDeleteProject(email);
    } else if (email !== null) {
      alert("Project name did not match. Deletion cancelled.");
    }
  };

  const filteredTasks = activeProject.tasks.filter((t) =>
    t.title.toLowerCase().includes(taskSearch.toLowerCase())
  );

  const completedTasks = activeProject.tasks.filter((t) => t.status === "completed").length;
  const progress = activeProject.tasks.length
    ? Math.round((completedTasks / activeProject.tasks.length) * 100)
    : 0;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--bg-950)]/50">
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-4 flex-1">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest border border-[var(--accent)]/20">
                {activeProject.status}
              </span>
              <span className="text-[10px] text-[var(--text-dim)] font-bold uppercase tracking-widest">
                Updated {new Date(activeProject.updated_at).toLocaleDateString()}
              </span>
            </div>
            <h1 className="text-4xl font-black text-[var(--text-primary)] tracking-tight">
              {activeProject.name}
            </h1>
            <div className="prose prose-invert prose-sm max-w-3xl">
              <ReactMarkdown>
                {activeProject.description || "No strategic mission defined."}
              </ReactMarkdown>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 pt-2">
            <button
              onClick={onAskAI}
              className="h-12 px-6 bg-[var(--surface-1)] text-[var(--text-primary)] rounded-2xl font-bold flex items-center gap-2 border border-[var(--border-subtle)] hover:border-[var(--accent-subtle)] transition-all group"
            >
              <Sparkles className="w-4 h-4 text-[var(--accent)] group-hover:scale-110 transition-transform" />
              Ask Architect
            </button>
            <button 
              onClick={handleDeleteProject}
              className="h-12 w-12 bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20 rounded-2xl hover:bg-[var(--danger)] hover:text-white transition-all group shadow-sm flex items-center justify-center"
              title="Delete Project"
            >
              <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
            <button 
              onClick={handleExportHTML}
              className="h-12 w-12 bg-[var(--surface-1)] text-[var(--text-muted)] rounded-2xl flex items-center justify-center border border-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-all"
              title="Export to HTML"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatBox label="Total Progress" value={`${progress}%`} subValue={`${completedTasks}/${activeProject.tasks.length} Tasks`} trend="up" />
          <StatBox label="Active Sprints" value={activeProject.tasks.filter(t => t.status === 'in-progress').length} subValue="Concurrent Workstreams" />
          <StatBox label="Milestones" value={activeProject.milestones.filter(m => m.status === 'reached').length} subValue={`of ${activeProject.milestones.length} Reached`} />
          <StatBox label="Team Size" value={teamMembers.length} subValue="Total Resources" />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
          {/* Tasks Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-[var(--accent)]" />
                Strategic Roadmap
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Filter tasks..."
                    className="h-10 pl-10 pr-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-subtle)] w-48 transition-all"
                  />
                </div>
                <button 
                  onClick={onOpenAddTask}
                  className="h-10 w-10 bg-[var(--accent)] text-white rounded-xl flex items-center justify-center hover:opacity-90 transition-all shadow-lg shadow-[var(--accent-glow)]"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {filteredTasks.map((task) => (
                <TaskItem 
                  key={task.id} 
                  task={task} 
                  onToggle={() => handleToggleTask(task)} 
                  onDelete={() => onDeleteTask(task.id)}
                />
              ))}
              {filteredTasks.length === 0 && (
                <div className="p-12 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-[32px] space-y-4">
                  <div className="w-12 h-12 bg-[var(--bg-900)] rounded-2xl flex items-center justify-center mx-auto">
                    <FileText className="w-6 h-6 text-[var(--text-dim)]" />
                  </div>
                  <p className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-widest">
                    No matching objectives found
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Column */}
          <div className="space-y-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Flag className="w-5 h-5 text-[var(--accent)]" />
                  Milestones
                </h3>
                <button 
                  onClick={onOpenAddMilestone}
                  className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg text-[var(--accent)] transition-all"
                >
                  <PlusCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                {activeProject.milestones.map((m) => (
                  <MilestoneItem key={m.id} milestone={m} onToggle={() => handleToggleMilestone(m)} />
                ))}
                {activeProject.milestones.length === 0 && (
                  <p className="text-xs text-[var(--text-dim)] font-bold uppercase tracking-widest py-4 text-center border border-dashed border-[var(--border-subtle)] rounded-2xl">
                    No checkpoints set
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Users className="w-5 h-5 text-[var(--accent)]" />
                  Project Team
                </h3>
              </div>
              <div className="space-y-3">
                {activeProject.members?.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl shadow-sm">
                    <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] font-bold text-[10px]">
                      {m.user.first_name?.substring(0, 2).toUpperCase() || m.user.email?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-[var(--text-primary)] truncate">{m.user.first_name || m.user.email}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                         <Shield className="w-2.5 h-2.5 text-[var(--accent)]" />
                         <p className="text-[9px] font-bold text-[var(--accent)] uppercase tracking-tight">{m.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {(!activeProject.members || activeProject.members.length === 0) && (
                   <p className="text-[10px] text-[var(--text-dim)] font-bold uppercase tracking-widest py-6 text-center border border-dashed border-[var(--border-subtle)] rounded-2xl">
                     No roles assigned
                   </p>
                )}
              </div>
            </div>

            <div className="p-6 bg-[var(--accent)]/5 border border-[var(--accent)]/10 rounded-[32px] space-y-4">
              <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                Plan Insights
              </h4>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Project is at {progress}% capacity. {activeProject.tasks.filter(t => t.priority === 'high' && t.status !== 'completed').length} high-priority tasks are currently pending.
              </p>
              <div className="h-1 bg-[var(--bg-900)] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-[var(--accent)]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, subValue, trend }: { label: string; value: string | number; subValue: string; trend?: "up" | "down" }) {
  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] p-6 rounded-[32px] shadow-sm hover:border-[var(--accent-subtle)] transition-all">
      <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-[var(--text-primary)]">{value}</span>
        {trend && (
          <span className="text-[10px] font-bold text-emerald-500">↑</span>
        )}
      </div>
      <p className="text-[10px] font-bold text-[var(--text-dim)] mt-1">{subValue}</p>
    </div>
  );
}

function TaskItem({ task, onToggle, onDelete }: { task: PlanTask; onToggle: () => void; onDelete: () => void }) {
  const isDone = task.status === "completed";
  return (
    <div className="group bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl p-4 flex items-center gap-4 hover:border-[var(--accent-subtle)] transition-all shadow-sm">
      <button
        onClick={onToggle}
        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
          isDone
            ? "bg-emerald-500 border-emerald-500"
            : "border-[var(--border-subtle)] group-hover:border-[var(--accent-subtle)]"
        }`}
      >
        {isDone && <CheckCircle2 className="w-4 h-4 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <h4
          className={`text-sm font-bold truncate transition-all ${
            isDone ? "text-[var(--text-dim)] line-through" : "text-[var(--text-primary)]"
          }`}
        >
          {task.title}
        </h4>
        <div className="flex items-center gap-3 mt-1">
          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
            task.priority === 'high' ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-500/10 text-[var(--text-dim)]'
          }`}>
            {task.priority}
          </span>
          <span className="text-[9px] font-bold text-[var(--text-dim)] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {task.end_date ? new Date(task.end_date).toLocaleDateString() : 'No date'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Permanently delete this task?")) onDelete();
          }}
          className="p-1.5 text-[var(--text-dim)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded-lg transition-all"
          title="Delete Task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <div className="flex -space-x-1.5 shrink-0 pl-2">
          {task.assignee_email ? (
             <div title={task.assignee_email} className="w-6 h-6 rounded-lg bg-[var(--accent)] flex items-center justify-center text-[7px] font-black text-white border-2 border-[var(--surface-1)]">
                {task.assignee_email.substring(0, 2).toUpperCase()}
             </div>
          ) : (
            <div className="w-6 h-6 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-dim)] border-2 border-[var(--surface-1)]">
              <Plus className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MilestoneItem({ milestone, onToggle }: { milestone: PlanMilestone; onToggle: () => void }) {
  const isReached = milestone.status === "reached";
  return (
    <div className="group flex items-start gap-4">
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={onToggle}
          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
            isReached
              ? "bg-[var(--accent)] border-[var(--accent)]"
              : "border-[var(--border-subtle)]"
          }`}
        >
          {isReached && <CheckCircle2 className="w-4 h-4 text-white" />}
        </button>
        <div className="w-0.5 h-full bg-[var(--border-subtle)] group-last:hidden" />
      </div>
      <div className="pb-6 flex-1 min-w-0">
        <h4 className={`text-sm font-bold ${isReached ? 'text-[var(--text-dim)] line-through' : 'text-[var(--text-primary)]'}`}>
          {milestone.title}
        </h4>
        <p className="text-[10px] text-[var(--text-dim)] font-bold mt-1">
          {milestone.target_date ? new Date(milestone.target_date).toLocaleDateString() : 'TBD'}
        </p>
      </div>
    </div>
  );
}
