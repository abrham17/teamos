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
import { PlanHistoryPanel } from "./components/PlanHistoryPanel";
import { WorkloadPanel } from "./components/WorkloadPanel";
import { AIPlannerOverlay } from "./components/AIPlannerOverlay";
import { usePlannerData } from "./hooks/usePlannerData";
import { usePlannerCalendar } from "./hooks/usePlannerCalendar";
import { useMultiplayer } from "./hooks/useMultiplayer";
import { getTeamMembers, updatePlanTask, createPlanTask, createPlanMilestone, createProjectMember, deletePlanProject, deletePlanTask, deleteProjectMember } from "./api";
import { LayoutGrid, Calendar, History, Columns, BarChartHorizontal, Users } from "lucide-react";
import { TeamMember, PlanTask, ActivityItem } from "./types";
import { AddTaskModal } from "./components/AddTaskModal";
import { AddMilestoneModal } from "./components/AddMilestoneModal";
import { AddMemberModal } from "./components/AddMemberModal";

type PlannerView = "overview" | "calendar" | "activity" | "board" | "timeline" | "team" | "history" | "workload";

export function PlannerWorkspace() {
  const { currentTeamId, zenMode, setZenMode } = useWikiStore();
  const searchParams = useSearchParams();
  const preferredProjectId = searchParams.get("project");
  const preferredSourceKind = searchParams.get("source_kind");
  const preferredSourceRefId = searchParams.get("source_ref_id");
  const citationSource = searchParams.get("source");

  const [query, setQuery] = useState("");
  const [isAIOverlayOpen, setIsAIOverlayOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"create" | "manage">("create");
  const [activeView, setActiveView] = useState<PlannerView>("overview");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>();
  const [prefilledStatus, setPrefilledStatus] = useState<string | undefined>();
  const [prefilledParentTaskId, setPrefilledParentTaskId] = useState<string | undefined>();
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMemberRole, setEditMemberRole] = useState<string | undefined>();

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

  const { cursors, sendCursorMove } = useMultiplayer(
    currentTeamId, 
    activeProjectId || null, 
    refreshProjectDetail
  );

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

  // Auto-navigate to entity referenced by citation params
  useEffect(() => {
    if (citationSource !== "chat" || !activeProject || !preferredSourceKind || !preferredSourceRefId) return;
    if (preferredSourceKind === "task" || preferredSourceKind === "milestone") {
      setActiveView("board");
    }
    const timer = setTimeout(() => {
      const el = document.getElementById(`plan-entity-${preferredSourceRefId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("citation-highlight");
      setTimeout(() => el?.classList.remove("citation-highlight"), 3000);
    }, 600);
    return () => clearTimeout(timer);
  }, [citationSource, activeProject, preferredSourceKind, preferredSourceRefId]);


  const handlePlanGenerated = async () => {
    if (!currentTeamId) return;
    try {
      // In the new streaming agent flow, the project is already created by the backend.
      // We just need to refresh the project list and close the overlay.
      refreshProjects();
      refreshProjectDetail();
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
    <div 
      className="flex h-full min-h-0 bg-[var(--bg-900)] relative"
      onMouseMove={sendCursorMove}
    >
      {/* Remote Cursors Overlay */}
      {Object.values(cursors).map((cursor) => (
        <div
          key={cursor.userId}
          className="pointer-events-none fixed z-[100] transition-transform duration-75 ease-linear"
          style={{
            transform: `translate(${cursor.x * window.innerWidth}px, ${cursor.y * window.innerHeight}px)`,
          }}
        >
          <svg width="24" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
            <path d="M5.65376 2.15376C5.40058 1.90058 5 2.08003 5 2.43807V28.3283C5 28.7523 5.51877 28.9566 5.80336 28.6416L12.4431 21.2917L18.1729 32.8449C18.3533 33.2088 18.7831 33.3562 19.1326 33.1741L21.5036 31.9392C21.8532 31.757 22.0006 31.3273 21.8202 30.9633L16.2947 19.8159L23.3619 19.429C23.7844 19.4059 23.9749 18.8837 23.6548 18.6293L5.65376 2.15376Z" fill={cursor.color} stroke="white" strokeWidth="2"/>
          </svg>
          <div 
            className="absolute left-6 top-6 px-2 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap shadow-sm"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.name}
          </div>
        </div>
      ))}

      {!zenMode && (
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
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b border-[var(--border-subtle)] px-6 flex items-center justify-between bg-[var(--surface-1)] shrink-0">
          <div className="flex items-center gap-0">
            <ViewTab active={activeView === "overview"} onClick={() => setActiveView("overview")} label="Overview" />
            <ViewTab active={activeView === "board"} onClick={() => setActiveView("board")} label="Board" />
            <ViewTab active={activeView === "calendar"} onClick={() => setActiveView("calendar")} label="Calendar" />
            <ViewTab active={activeView === "timeline"} onClick={() => setActiveView("timeline")} label="Timeline" />
            <ViewTab active={activeView === "team"} onClick={() => setActiveView("team")} label="Team" />
            <ViewTab active={activeView === "workload"} onClick={() => setActiveView("workload")} label="Workload" />
            <ViewTab active={activeView === "history"} onClick={() => setActiveView("history")} label="History" />
            <ViewTab active={activeView === "activity"} onClick={() => setActiveView("activity")} label="Activity" />
          </div>
          <button
            onClick={() => setZenMode(!zenMode)}
            className={`text-[12px] px-3 py-1.5 rounded-lg border transition-all font-medium ${
              zenMode
                ? "bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--border-subtle)]"
                : "bg-[var(--bg-700)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
            }`}
            title="Toggle Zen Mode"
          >
            Zen Mode
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {!currentTeamId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[var(--bg-950)]/50">
              <div className="max-w-md space-y-4">
                <div className="w-16 h-16 bg-[var(--surface-1)] rounded-2xl flex items-center justify-center mx-auto border border-[var(--border-subtle)] shadow-inner">
                  <LayoutGrid className="w-6 h-6 text-[var(--accent)]" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Select a Team</h3>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                    Select a team from the sidebar dropdown or create a new team to view active project boards, calendars, and strategic timelines.
                  </p>
                </div>
              </div>
            </div>
          ) : activeView === "overview" ? (
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
              onOpenAddTask={(parentTaskId) => {
                setPrefilledDate(undefined);
                setPrefilledStatus(undefined);
                setPrefilledParentTaskId(parentTaskId);
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
              onAddTask={(status) => {
                setPrefilledDate(undefined);
                setPrefilledStatus(status);
                setPrefilledParentTaskId(undefined);
                setIsAddTaskOpen(true);
              }}
            />
          ) : activeView === "calendar" ? (
            <CalendarPanel 
              events={events} 
              loading={loadingCalendar} 
              onAddEvent={(date) => {
                setPrefilledDate(date.toISOString().split('T')[0]);
                setPrefilledStatus("todo");
                setPrefilledParentTaskId(undefined);
                setIsAddTaskOpen(true);
              }}
            />
          ) : activeView === "timeline" ? (
            <TimelinePanel 
              tasks={activeProject?.tasks || []} 
              milestones={activeProject?.milestones || []} 
              onAddTask={() => {
                setPrefilledDate(undefined);
                setPrefilledStatus(undefined);
                setPrefilledParentTaskId(undefined);
                setIsAddTaskOpen(true);
              }}
              onAddMilestone={() => setIsAddMilestoneOpen(true)}
            />
          ) : activeView === "team" ? (
            <TeamPanel 
              tasks={activeProject?.tasks || []} 
              teamMembers={teamMembers} 
              projectMembers={activeProject?.members || []}
              onRemoveMember={handleRemoveMember}
              onOpenAddMember={() => {
                setEditMemberId(null);
                setEditMemberRole(undefined);
                setIsAddMemberOpen(true);
              }}
              onEditRole={(userId, role) => {
                setEditMemberId(userId);
                setEditMemberRole(role);
                setIsAddMemberOpen(true);
              }}
            />
          ) : activeView === "history" && activeProject ? (
            <PlanHistoryPanel
              teamId={currentTeamId}
              projectId={activeProject.id}
              onRestore={refreshProjectDetail}
            />
          ) : activeView === "workload" && activeProject ? (
            <div className="p-8 flex-1 overflow-y-auto">
              <WorkloadPanel project={activeProject} teamMembers={teamMembers} />
            </div>
          ) : (
            <ActivityPanel activity={activity} loading={loadingActivity} />
          )}
        </div>
      </div>

      {isAIOverlayOpen && (
        <AIPlannerOverlay
          teamId={currentTeamId || ""}
          mode={aiMode}
          projectId={aiMode === "manage" ? activeProject?.id ?? null : null}
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
        initialStatus={prefilledStatus}
        initialParentTaskId={prefilledParentTaskId}
      />

      <AddMilestoneModal
        isOpen={isAddMilestoneOpen}
        onClose={() => setIsAddMilestoneOpen(false)}
        onSubmit={handleCreateMilestone}
      />

      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        onSubmit={handleAssignRole}
        teamMembers={teamMembers}
        alreadyInProjectIds={activeProject?.members.map(m => m.user.id) || []}
        initialUserId={editMemberId}
        initialRole={editMemberRole}
      />
    </div>
  );
}

function ViewTab({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center px-4 h-14 text-[13px] font-medium transition-colors ${
        active
          ? "text-[var(--accent)] font-semibold"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </button>
  );
}
