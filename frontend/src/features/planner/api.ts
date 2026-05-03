import { api } from "@/lib/api";
import type {
  PlanCalendarEvent,
  PlanMilestone,
  PlanProjectDetail,
  PlanProjectListItem,
  PlanTask,
  TeamMember,
} from "./types";

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
  return api.get<unknown[]>(`/planning/${teamId}/activity/`);
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
