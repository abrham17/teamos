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
import { useToast } from "@/components/ui/Toast";

type PlannerPrimaryTab = "overview" | "work" | "team";
type PlannerWorkSubTab = "board" | "timeline" | "calendar";
type PlannerTeamSubTab = "members" | "workload" | "activity" | "history";

export function PlannerWorkspace() {
  const { currentTeamId } = useWikiStore();
  const searchParams = useSearchParams();
  const preferredProjectId = searchParams.get("project");
  const { error: toastError } = useToast();

  const [query, setQuery] = useState("");
  const [isAIOverlayOpen, setIsAIOverlayOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"create" | "manage">("create");
  const [initialManual, setInitialManual] = useState(false);
  
  const [primaryTab, setPrimaryTab] = useState<PlannerPrimaryTab>("overview");
  const [workSubTab, setWorkSubTab] = useState<PlannerWorkSubTab>("board");
  const [teamSubTab, setTeamSubTab] = useState<PlannerTeamSubTab>("members");

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
    if (primaryTab === "team" && teamSubTab === "activity" && currentTeamId) {
      setLoadingActivity(true);
      import("./api").then(({ getPlannerActivity }) => {
        getPlannerActivity(currentTeamId)
          .then(setActivity)
          .catch(console.error)
          .finally(() => setLoadingActivity(false));
      });
    }
  }, [primaryTab, teamSubTab, currentTeamId]);

  if (!currentTeamId) {
    return <div className="p-8 text-[var(--text-muted)]">Select a team first.</div>;
  }

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
      toastError("Failed to apply the generated changes.");
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

      <ProjectListPanel
        projects={projects}
        activeProjectId={activeProjectId}
        query={query}
        loading={loadingProjects}
        onQueryChange={setQuery}
        onSelectProject={(id) => {
          setActiveProjectId(id);
          setPrimaryTab("overview");
        }}
        onNewProject={() => {
          setAiMode("create");
          setInitialManual(false);
          setIsAIOverlayOpen(true);
        }}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b border-[var(--border-subtle)] px-6 flex items-center justify-between bg-[var(--surface-1)] shrink-0">
          <div className="flex items-center gap-1 bg-[var(--bg-900)] p-1 rounded-xl border border-[var(--border-subtle)]">
            <ViewTab active={primaryTab === "overview"} onClick={() => setPrimaryTab("overview")} icon={<LayoutGrid className="w-3.5 h-3.5" />} label="Overview" />
            <ViewTab active={primaryTab === "work"} onClick={() => setPrimaryTab("work")} icon={<Columns className="w-3.5 h-3.5" />} label="Work" />
            <ViewTab active={primaryTab === "team"} onClick={() => setPrimaryTab("team")} icon={<Users className="w-3.5 h-3.5" />} label="Team" />
          </div>

          {primaryTab === "work" && (
            <div className="flex items-center gap-1 bg-[var(--bg-900)] p-1 rounded-xl border border-[var(--border-subtle)]">
              <ViewTab active={workSubTab === "board"} onClick={() => setWorkSubTab("board")} icon={<Columns className="w-3.5 h-3.5" />} label="Board" />
              <ViewTab active={workSubTab === "timeline"} onClick={() => setWorkSubTab("timeline")} icon={<BarChartHorizontal className="w-3.5 h-3.5" />} label="Timeline" />
              <ViewTab active={workSubTab === "calendar"} onClick={() => setWorkSubTab("calendar")} icon={<Calendar className="w-3.5 h-3.5" />} label="Calendar" />
            </div>
          )}

          {primaryTab === "team" && (
            <div className="flex items-center gap-1 bg-[var(--bg-900)] p-1 rounded-xl border border-[var(--border-subtle)]">
              <ViewTab active={teamSubTab === "members"} onClick={() => setTeamSubTab("members")} icon={<Users className="w-3.5 h-3.5" />} label="Members" />
              <ViewTab active={teamSubTab === "workload"} onClick={() => setTeamSubTab("workload")} icon={<Users className="w-3.5 h-3.5" />} label="Workload" />
              <ViewTab active={teamSubTab === "activity"} onClick={() => setTeamSubTab("activity")} icon={<History className="w-3.5 h-3.5" />} label="Activity" />
              <ViewTab active={teamSubTab === "history"} onClick={() => setTeamSubTab("history")} icon={<History className="w-3.5 h-3.5" />} label="History" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {primaryTab === "overview" ? (
            <ProjectOverviewPanel
              activeProject={activeProject}
              loadingDetail={loadingProjectDetail}
              error={error}
              teamMembers={teamMembers}
              onAskAI={() => {
                setAiMode("manage");
                setInitialManual(false);
                setIsAIOverlayOpen(true);
              }}
              onCreateWithAI={() => {
                setAiMode("create");
                setInitialManual(false);
                setIsAIOverlayOpen(true);
              }}
              onCreateManually={() => {
                setAiMode("create");
                setInitialManual(true);
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
          ) : primaryTab === "work" ? (
            workSubTab === "board" ? (
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
            ) : workSubTab === "calendar" ? (
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
            ) : (
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
            )
          ) : (
            teamSubTab === "members" ? (
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
            ) : teamSubTab === "history" && activeProject ? (
              <PlanHistoryPanel
                teamId={currentTeamId}
                projectId={activeProject.id}
                onRestore={refreshProjectDetail}
              />
            ) : teamSubTab === "workload" && activeProject ? (
              <div className="p-8 flex-1 overflow-y-auto">
                <WorkloadPanel project={activeProject} teamMembers={teamMembers} />
              </div>
            ) : (
              <ActivityPanel activity={activity} loading={loadingActivity} />
            )
          )}
        </div>
      </div>

      {isAIOverlayOpen && (
        <AIPlannerOverlay
          teamId={currentTeamId}
          mode={aiMode}
          projectId={aiMode === "manage" ? activeProject?.id ?? null : null}
          onClose={() => setIsAIOverlayOpen(false)}
          onPlanGenerated={handlePlanGenerated}
          initialManual={initialManual}
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
