import { api, getApiAuthHeaders } from "@/lib/api";
import type {
  PlanCalendarEvent,
  PlanMilestone,
  PlanProjectDetail,
  PlanProjectListItem,
  PlanTask,
  TeamMember,
  ActivityItem,
  PlanSnapshot,
  PlanConflict,
  PlanRisk,
  RiskAction,
  RiskResolutionProposal,
  RiskResolutionApplyResult,
  ProjectRemediationResult,
  OverdueTask,
  MissedMilestone,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface PlannerAgentStep {
  name: string;
  arguments: string;
}

export interface PlannerAgentResult {
  name: string;
  ok: boolean;
  result: Record<string, unknown>;
}

export interface PlannerAgentDone {
  project_id: string | null;
  project_name: string;
  description: string;
  task_count: number;
  milestone_count: number;
  conflict_count: number;
  conflicts: Array<Record<string, unknown>>;
  risk: { score: number; factors: string[]; suggestions: string[] };
  wiki_page_url: string | null;
  overdue_count?: number;
  knowledge_gaps: string[];
  reasoning_traces?: string[];
  critique_score?: number;
  critique_suggestions?: string[];
}

export interface PlannerReasoningDone {
  projectName: string;
  description: string;
  tasks: Array<Record<string, unknown>>;
  milestones: Array<Record<string, unknown>>;
  knowledge_gaps: string[];
  reasoning_traces: string[];
  critique_score: number;
  critique_suggestions: string[];
}

export interface PlannerStreamCallbacks {
  onStep?: (step: PlannerAgentStep) => void;
  onResult?: (result: PlannerAgentResult) => void;
  onStatus?: (status: string) => void;
  onDone?: (data: PlannerAgentDone) => void;
  onError?: (detail: string) => void;
  onReasoningDone?: (data: PlannerReasoningDone) => void;
  onQuestion?: (question: string, options?: string[]) => void;
}

export async function planAssistStream(
  teamId: string,
  payload: { prompt: string; mode?: "create" | "manage"; project_id?: string },
  callbacks: PlannerStreamCallbacks,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getApiAuthHeaders()),
  };

  const response = await fetch(`${API_BASE}/planning/${teamId}/assist/stream/`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.body) {
    callbacks.onError?.("No response body from server.");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        const rawData = line.slice(6);
        try {
          const data = JSON.parse(rawData);
          switch (currentEvent) {
            case "agent_step":
              callbacks.onStep?.({ name: data.name, arguments: data.arguments });
              break;
            case "agent_result":
              callbacks.onResult?.({ name: data.name, ok: data.ok, result: data.result });
              break;
            case "agent_status":
              callbacks.onStatus?.(data.status);
              break;
            case "agent_done":
              callbacks.onDone?.(data as PlannerAgentDone);
              break;
            case "agent_error":
              callbacks.onError?.(data.detail || "Agent execution failed");
              break;
            case "reasoning_done":
              callbacks.onReasoningDone?.(data as PlannerReasoningDone);
              break;
            case "ask_user":
              callbacks.onQuestion?.(
                typeof data.question === "string" ? data.question : "Can you provide more details?",
                Array.isArray(data.options) ? (data.options as string[]) : undefined,
              );
              break;
          }
        } catch {
          // skip malformed JSON
        }
        currentEvent = "";
      }
    }
  }
}

export async function listPlanProjects(teamId: string, query?: string) {
  const q = query?.trim();
  const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
  return api.get<PlanProjectListItem[]>(`/planning/${teamId}/projects/${suffix}`);
}

export async function getPlanProject(teamId: string, projectId: string) {
  return api.get<PlanProjectDetail>(`/planning/${teamId}/projects/${projectId}/`);
}

export async function createPlanProject(
  teamId: string,
  payload: {
    name: string;
    description?: string;
    status?: PlanProjectListItem["status"];
    tasks?: unknown[];
    milestones?: unknown[];
  },
) {
  return api.post<PlanProjectDetail>(`/planning/${teamId}/projects/`, payload);
}

export async function updatePlanProject(
  teamId: string,
  projectId: string,
  payload: Partial<PlanProjectListItem> & {
    tasks?: unknown[];
    milestones?: unknown[];
  },
) {
  return api.patch<PlanProjectDetail>(`/planning/${teamId}/projects/${projectId}/`, payload);
}

export async function createPlanTask(
  teamId: string,
  projectId: string,
  payload: Partial<PlanTask>,
) {
  return api.post<PlanTask>(`/planning/${teamId}/projects/${projectId}/tasks/`, payload);
}

export async function updatePlanTask(
  teamId: string,
  projectId: string,
  taskId: string,
  payload: Partial<PlanTask> & { dependency_ids?: string[] },
) {
  return api.patch<PlanTask>(`/planning/${teamId}/projects/${projectId}/tasks/${taskId}/`, payload);
}

export async function createPlanMilestone(
  teamId: string,
  projectId: string,
  payload: Partial<PlanMilestone>,
) {
  return api.post<PlanMilestone>(`/planning/${teamId}/projects/${projectId}/milestones/`, payload);
}

export async function updatePlanMilestone(
  teamId: string,
  projectId: string,
  milestoneId: string,
  payload: Partial<PlanMilestone>,
) {
  return api.patch<PlanMilestone>(
    `/planning/${teamId}/projects/${projectId}/milestones/${milestoneId}/`,
    payload,
  );
}

export async function getPlannerCalendarFeed(teamId: string, fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  if (fromDate) params.set("from", fromDate);
  if (toDate) params.set("to", toDate);
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  return api.get<PlanCalendarEvent[]>(`/planning/${teamId}/calendar/feed/${suffix}`);
}

export async function getPlannerActivity(teamId: string) {
  return api.get<ActivityItem[]>(`/planning/${teamId}/activity/`);
}

export async function getTeamMembers(teamId: string) {
  return api.get<TeamMember[]>(`/auth/teams/${teamId}/members/`);
}

export async function planAssistDraft(
  teamId: string,
  payload: { prompt: string; mode?: "create" | "manage"; project_id?: string },
) {
  return api.post<unknown>(`/planning/${teamId}/assist/`, payload);
}

export async function createProjectMember(teamId: string, projectId: string, userId: string, role: string) {
  return api.patch<PlanProjectDetail>(`/planning/${teamId}/projects/${projectId}/`, {
    members: [{ user_id: userId, role }]
  });
}

export async function deleteProjectMember(teamId: string, projectId: string, userId: string) {
  return api.patch<PlanProjectDetail>(`/planning/${teamId}/projects/${projectId}/`, {
    members: [{ user_id: userId, remove: true }]
  });
}

export async function deletePlanProject(teamId: string, projectId: string) {
  return api.delete(`/planning/${teamId}/projects/${projectId}/`);
}

export async function deletePlanTask(teamId: string, projectId: string, taskId: string) {
  return api.delete(`/planning/${teamId}/projects/${projectId}/tasks/${taskId}/`);
}

export async function deletePlanMilestone(teamId: string, projectId: string, milestoneId: string) {
  return api.delete(`/planning/${teamId}/projects/${projectId}/milestones/${milestoneId}/`);
}

export async function getProjectConflicts(teamId: string, projectId?: string) {
  const url = projectId 
    ? `/planning/${teamId}/projects/${projectId}/conflicts/` 
    : `/planning/${teamId}/conflicts/`;
  return api.get<PlanConflict[]>(url);
}

export async function resolveProjectConflicts(teamId: string, projectId: string) {
  return api.post<{
    status: string;
    resolved_count: number;
    skipped_count: number;
    remaining_conflicts: number;
  }>(`/planning/${teamId}/projects/${projectId}/conflicts/resolve/`, {});
}

export async function getProjectRisk(teamId: string, projectId: string) {
  return api.get<PlanRisk>(`/planning/${teamId}/projects/${projectId}/risk/`);
}

export async function generateRiskResolutionProposal(teamId: string, projectId: string) {
  return api.post<RiskResolutionProposal>(
    `/planning/${teamId}/projects/${projectId}/risk/resolve/proposal/`,
    {},
  );
}

export async function applyRiskResolutionActions(teamId: string, projectId: string, actions: RiskAction[]) {
  return api.post<RiskResolutionApplyResult>(
    `/planning/${teamId}/projects/${projectId}/risk/resolve/apply/`,
    { actions },
  );
}

export async function remediateProjectRisk(teamId: string, projectId: string) {
  return api.post<ProjectRemediationResult>(
    `/planning/${teamId}/projects/${projectId}/remediate/`,
    { apply_conflicts: true, apply_risk: true },
  );
}

export async function getTeamOverdue(teamId: string) {
  return api.get<{ 
    overdue_tasks: OverdueTask[]; 
    missed_milestones: MissedMilestone[];
  }>(`/planning/${teamId}/overdue/`);
}

export async function listPlanSnapshots(teamId: string, projectId: string) {
  return api.get<PlanSnapshot[]>(`/planning/${teamId}/projects/${projectId}/snapshots/`);
}

export async function createPlanSnapshot(teamId: string, projectId: string, type: "auto" | "manual" | "agent" = "manual") {
  return api.post(`/planning/${teamId}/projects/${projectId}/snapshots/`, { snapshot_type: type });
}

export async function restorePlanSnapshot(teamId: string, projectId: string, snapshotId: string) {
  return api.post(`/planning/${teamId}/projects/${projectId}/snapshots/${snapshotId}/restore/`, {});
}

export async function listPlanVersions(teamId: string, projectId: string) {
  return api.get<import("./types").PlanVersion[]>(`/planning/${teamId}/projects/${projectId}/versions/`);
}

export async function listPendingChangeSets(teamId: string, projectId: string) {
  return api.get<import("./types").PlanChangeSet[]>(
    `/planning/${teamId}/projects/${projectId}/changesets/?status=pending`,
  );
}

export async function listApprovedChangeSets(teamId: string, projectId: string) {
  return api.get<import("./types").PlanChangeSet[]>(
    `/planning/${teamId}/projects/${projectId}/changesets/?status=approved`,
  );
}

export async function restorePlanVersion(teamId: string, projectId: string, versionId: string) {
  return api.post(`/planning/${teamId}/projects/${projectId}/versions/${versionId}/restore/`, {});
}

export async function getChangeSet(teamId: string, projectId: string, changesetId: string) {
  return api.get<import("./types").PlanChangeSet>(
    `/planning/${teamId}/projects/${projectId}/changesets/${changesetId}/`,
  );
}

export async function approveChangeSet(
  teamId: string,
  projectId: string,
  changesetId: string,
  applyRemediation = false,
) {
  return api.post(`/planning/${teamId}/projects/${projectId}/changesets/${changesetId}/approve/`, {
    apply_remediation: applyRemediation,
  });
}

export async function rejectChangeSet(teamId: string, projectId: string, changesetId: string) {
  return api.post(`/planning/${teamId}/projects/${projectId}/changesets/${changesetId}/reject/`, {});
}
