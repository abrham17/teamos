"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWikiStore } from "@/stores/useWikiStore";
import { ProjectListPanel } from "./components/ProjectListPanel";
import { ProjectOverviewPanel } from "./components/ProjectOverviewPanel";
import { CalendarPanel } from "./components/CalendarPanel";
import { ActivityPanel } from "./components/ActivityPanel";
import { BoardPanel } from "./components/BoardPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { TeamPanel } from "./components/TeamPanel";
import { AIPlannerOverlay } from "./components/AIPlannerOverlay";
import { usePlannerData } from "./hooks/usePlannerData";
import { usePlannerCalendar } from "./hooks/usePlannerCalendar";
import { createPlanProject, updatePlanProject, getTeamMembers, updatePlanTask, createPlanTask, createPlanMilestone, createProjectMember, deletePlanProject, deletePlanTask, deleteProjectMember } from "./api";
import { LayoutGrid, Calendar, History, Columns, BarChartHorizontal, Users } from "lucide-react";
import { TeamMember, PlanTask } from "./types";
import { AddTaskModal } from "./components/AddTaskModal";
import { AddMilestoneModal } from "./components/AddMilestoneModal";

type PlannerView = "overview" | "calendar" | "activity" | "board" | "timeline" | "team";

export function PlannerWorkspace() {
  const { currentTeamId } = useWikiStore();
  const searchParams = useSearchParams();
  const preferredProjectId = searchParams.get("project");

  const [query, setQuery] = useState("");
  const [isAIOverlayOpen, setIsAIOverlayOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"create" | "manage">("create");
  const [activeView, setActiveView] = useState<PlannerView>("overview");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activity, setActivity] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>();

  const {
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    loadingProjects,
    loadingProjectDetail,
    error,

    refreshProjects,
    refreshProjectDetail,
  } = usePlannerData(currentTeamId, query, preferredProjectId);

  const { events, loadingCalendar } = usePlannerCalendar(currentTeamId);

  useEffect(() => {
    if (currentTeamId) {
      getTeamMembers(currentTeamId).then(setTeamMembers).catch(console.error);
    }
  }, [currentTeamId]);

  useEffect(() => {
    if (activeView === "activity" && currentTeamId) {
      setLoadingActivity(true);
      import("./api").then(({ getPlannerActivity }) => {
        getPlannerActivity(currentTeamId)
          .then(setActivity)
          .catch(console.error)
          .finally(() => setLoadingActivity(false));
      });
    }
  }, [activeView, currentTeamId]);

  if (!currentTeamId) {
    return <div className="p-8 text-[var(--text-muted)]">Select a team first.</div>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePlanGenerated = async (plan: { projectName: string; description: string; tasks: any[]; milestones: any[] }) => {
    if (!currentTeamId) return;
    try {
      if (aiMode === "manage" && activeProjectId) {
        await updatePlanProject(currentTeamId, activeProjectId, {
          name: plan.projectName,
          description: plan.description,
          tasks: plan.tasks,
          milestones: plan.milestones,
        });
        refreshProjectDetail();
      } else {
        const res = await createPlanProject(currentTeamId, {
          name: plan.projectName,
          description: plan.description,
          status: "active",
          tasks: plan.tasks,
          milestones: plan.milestones,
        });
        refreshProjects();
        setActiveProjectId(res.id);
      }
      setIsAIOverlayOpen(false);
    } catch (e) {
      console.error("Failed to apply plan changes", e);
      alert("Failed to apply the generated changes.");
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<PlanTask>) => {
    if (!currentTeamId || !activeProjectId) return;
    try {
      await updatePlanTask(currentTeamId, activeProjectId, taskId, updates);
      refreshProjectDetail();
    } catch (e) {
      console.error("Failed to update task", e);
    }
  };

  const handleCreateTask = async (data: unknown) => {
    if (!currentTeamId || !activeProjectId) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createPlanTask(currentTeamId, activeProjectId, data as any);
      refreshProjectDetail();
      setIsAddTaskOpen(false);
    } catch (e) {
      console.error("Failed to create task", e);
    }
  };

  const handleCreateMilestone = async (data: unknown) => {
    if (!currentTeamId || !activeProjectId) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createPlanMilestone(currentTeamId, activeProjectId, data as any);
      refreshProjectDetail();
      setIsAddMilestoneOpen(false);
    } catch (e) {
      console.error("Failed to create milestone", e);
    }
  };

  const handleAssignRole = async (userId: string, role: string) => {
    if (!currentTeamId || !activeProjectId) return;
    try {
      await createProjectMember(currentTeamId, activeProjectId, userId, role);
      refreshProjectDetail();
    } catch (e) {
      console.error("Failed to assign project role", e);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentTeamId || !activeProjectId) return;
    try {
      await deletePlanProject(currentTeamId, activeProjectId);
      setActiveProjectId(null);
      refreshProjects();
    } catch (e) {
      console.error("Failed to delete project", e);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!currentTeamId || !activeProjectId) return;
    try {
      await deletePlanTask(currentTeamId, activeProjectId, taskId);
      refreshProjectDetail();
    } catch (e) {
      console.error("Failed to delete task", e);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!currentTeamId || !activeProjectId) return;
    try {
      await deleteProjectMember(currentTeamId, activeProjectId, userId);
      refreshProjectDetail();
    } catch (e) {
      console.error("Failed to remove member", e);
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg-900)]">
      <ProjectListPanel
        projects={projects}
        activeProjectId={activeProjectId}
        query={query}
        loading={loadingProjects}
        onQueryChange={setQuery}
        onSelectProject={(id) => {
          setActiveProjectId(id);
          setActiveView("overview");
        }}
        onNewProject={() => {
          setAiMode("create");
          setIsAIOverlayOpen(true);
        }}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b border-[var(--border-subtle)] px-6 flex items-center justify-between bg-[var(--surface-1)] shrink-0">
          <div className="flex items-center gap-1 bg-[var(--bg-900)] p-1 rounded-xl border border-[var(--border-subtle)]">
            <ViewTab active={activeView === "overview"} onClick={() => setActiveView("overview")} icon={<LayoutGrid className="w-3.5 h-3.5" />} label="Overview" />
            <ViewTab active={activeView === "board"} onClick={() => setActiveView("board")} icon={<Columns className="w-3.5 h-3.5" />} label="Board" />
            <ViewTab active={activeView === "calendar"} onClick={() => setActiveView("calendar")} icon={<Calendar className="w-3.5 h-3.5" />} label="Calendar" />
            <ViewTab active={activeView === "timeline"} onClick={() => setActiveView("timeline")} icon={<BarChartHorizontal className="w-3.5 h-3.5" />} label="Timeline" />
            <ViewTab active={activeView === "team"} onClick={() => setActiveView("team")} icon={<Users className="w-3.5 h-3.5" />} label="Team" />
            <ViewTab active={activeView === "activity"} onClick={() => setActiveView("activity")} icon={<History className="w-3.5 h-3.5" />} label="Activity" />
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {activeView === "overview" ? (
            <ProjectOverviewPanel
              activeProject={activeProject}
              loadingDetail={loadingProjectDetail}
              error={error}
              teamMembers={teamMembers}
              onAskAI={() => {
                setAiMode("manage");
                setIsAIOverlayOpen(true);
              }}
              onRefreshDetail={refreshProjectDetail}
              onOpenAddTask={() => {
                setPrefilledDate(undefined);
                setIsAddTaskOpen(true);
              }}
              onOpenAddMilestone={() => setIsAddMilestoneOpen(true)}
              onDeleteProject={handleDeleteProject}
              onDeleteTask={handleDeleteTask}
            />
          ) : activeView === "board" ? (
            <BoardPanel 
              tasks={activeProject?.tasks || []} 
              onUpdateTask={handleUpdateTask} 
            />
          ) : activeView === "calendar" ? (
            <CalendarPanel 
              events={events} 
              loading={loadingCalendar} 
              onAddEvent={(date) => {
                setPrefilledDate(date.toISOString().split('T')[0]);
                setIsAddTaskOpen(true);
              }}
            />
          ) : activeView === "timeline" ? (
            <TimelinePanel 
              tasks={activeProject?.tasks || []} 
              milestones={activeProject?.milestones || []} 
            />
          ) : activeView === "team" ? (
            <TeamPanel 
              tasks={activeProject?.tasks || []} 
              teamMembers={teamMembers} 
              projectMembers={activeProject?.members || []}
              onAssignRole={handleAssignRole}
              onRemoveMember={handleRemoveMember}
            />
          ) : (
            <ActivityPanel activity={activity} loading={loadingActivity} />
          )}
        </div>
      </div>

      {isAIOverlayOpen && (
        <AIPlannerOverlay
          teamId={currentTeamId}
          mode={aiMode}
          projectContext={activeProject}
          onClose={() => setIsAIOverlayOpen(false)}
          onPlanGenerated={handlePlanGenerated}
        />
      )}

      <AddTaskModal
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
        onSubmit={handleCreateTask}
        teamMembers={teamMembers}
        initialStartDate={prefilledDate}
      />

      <AddMilestoneModal
        isOpen={isAddMilestoneOpen}
        onClose={() => setIsAddMilestoneOpen(false)}
        onSubmit={handleCreateMilestone}
      />
    </div>
  );
}

function ViewTab({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
        active
          ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
