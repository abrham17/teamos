import { api } from "@/lib/api";

export interface CanvasNode {
  id: string;
  type: "task" | "milestone" | "member" | "wiki" | "trigger" | "output";
  ref_id: string | null;
  x: number;
  y: number;
  meta: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface CanvasViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface CanvasLayout {
  id: string;
  project_id: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
  updated_by_id: string | null;
  updated_at: string;
}

export interface ProjectIntegrationConfig {
  project_id: string;
  auto_calendar_sync: boolean;
  auto_slack_notify: boolean;
  auto_github_issues: boolean;
  auto_jira_issues: boolean;
  auto_linear_issues: boolean;
  slack_channel: string;
  github_repo: string;
  jira_project_key: string;
  linear_team_id: string;
  notify_on_assign: boolean;
  notify_on_overdue: boolean;
  notify_on_complete: boolean;
  notify_on_milestone: boolean;
}

export interface IntegrationAction {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  provider: string;
  external_ref: string;
  status: string;
  error_message: string;
  created_at: string;
}

export async function getCanvasLayout(teamId: string, projectId: string) {
  return api.get<CanvasLayout>(`/api/planning/${teamId}/projects/${projectId}/canvas/`);
}

export async function saveCanvasLayout(
  teamId: string,
  projectId: string,
  data: { nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: CanvasViewport },
) {
  return api.put<CanvasLayout>(`/api/planning/${teamId}/projects/${projectId}/canvas/`, data);
}

export async function patchCanvasLayout(
  teamId: string,
  projectId: string,
  data: Partial<{ nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: CanvasViewport }>,
) {
  return api.patch<CanvasLayout>(`/api/planning/${teamId}/projects/${projectId}/canvas/`, data);
}

export async function getIntegrationConfig(teamId: string, projectId: string) {
  return api.get<ProjectIntegrationConfig>(
    `/api/planning/${teamId}/projects/${projectId}/integrations/`,
  );
}

export async function updateIntegrationConfig(
  teamId: string,
  projectId: string,
  data: Partial<ProjectIntegrationConfig>,
) {
  return api.put<ProjectIntegrationConfig>(
    `/api/planning/${teamId}/projects/${projectId}/integrations/`,
    data,
  );
}

export async function getIntegrationActions(teamId: string, projectId: string) {
  return api.get<IntegrationAction[]>(
    `/api/planning/${teamId}/projects/${projectId}/integration-actions/`,
  );
}
