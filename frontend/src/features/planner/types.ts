export interface PlanProjectListItem {
  id: string;
  name: string;
  description: string;
  status: "active" | "on_hold" | "completed" | "archived";
  task_count: number;
  milestone_count: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "todo" | "in-progress" | "completed" | "blocked";
export type TaskPriority = "low" | "medium" | "high";

export interface TeamMember {
  id: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
  };
  role: string;
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in-progress" | "completed" | "blocked";
  priority: "low" | "medium" | "high";
  assignee_id: string | null;
  assignee_email: string | null;
  start_date: string | null;
  end_date: string | null;
  parent_task_id?: string | null;
  dependencies: string[];
  order_index: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanMilestone {
  id: string;
  title: string;
  description: string;
  target_date: string | null;
  status: "pending" | "reached" | "missed";
  order_index: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanChunk {
  id: string;
  chunk_index: number;
  source_kind: "project" | "task" | "milestone";
  source_ref_id: string | null;
  title: string;
  content: string;
  created_at: string;
}

export interface PlanCalendarEvent {
  kind: "task" | "milestone";
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

export interface ProjectMember {
  id: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
  };
  role: string;
  joined_at: string;
}

export interface PlanProjectDetail {
  id: string;
  name: string;
  description: string;
  status: "active" | "on_hold" | "completed" | "archived";
  tasks: PlanTask[];
  milestones: PlanMilestone[];
  members: ProjectMember[];
  chunks: PlanChunk[];
  related_wiki_pages?: Array<{
    id: string;
    title: string;
    slug: string;
    page_type: string;
  }>;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface ActivityItem {
  kind: string;
  title: string;
  updated_at: string;
  user: string;
  project_name?: string;
  status: string;
}

export interface PlanSnapshot {
  id: string;
  snapshot_type: string;
  created_at: string;
  created_by: string;
}

export interface TaskOverlapConflict {
  type: "task_overlap";
  severity: "low" | "medium" | "high";
  same_assignee: boolean;
  task_1: { id: string; title: string; project: string; start: string; end: string; assignee: string | null };
  task_2: { id: string; title: string; project: string; start: string; end: string; assignee: string | null };
}

export interface MilestoneClashConflict {
  type: "milestone_clash";
  severity: "low" | "medium" | "high";
  milestone_1: { id: string; title: string; project: string; date: string };
  milestone_2: { id: string; title: string; project: string; date: string };
}

export type PlanConflict = TaskOverlapConflict | MilestoneClashConflict;

export interface PlanRisk {
  score: number;
  factors: string[];
  suggestions: string[];
}

export type RiskActionType =
  | "update_task_dates"
  | "update_task_priority"
  | "add_dependency"
  | "update_milestone_date";

export interface RiskAction {
  action: RiskActionType;
  task_id?: string;
  milestone_id?: string;
  depends_on_task_id?: string;
  start_date?: string;
  end_date?: string;
  target_date?: string;
  priority?: "low" | "medium" | "high";
  reason?: string;
}

export interface RiskResolutionProposal {
  status: "proposed";
  risk: PlanRisk;
  proposed_count: number;
  actions: RiskAction[];
}

export interface RiskResolutionApplyResult {
  status: "applied";
  applied_count: number;
  skipped_count: number;
  warnings: Array<Record<string, unknown>>;
  remaining_risk_score: number;
  remaining_conflicts: number;
}

export interface ProjectRemediationResult {
  status: string;
  project_id: string;
  initial_conflict_count: number;
  conflict_resolved_count: number;
  remaining_conflicts: number;
  initial_risk_score: number;
  remaining_risk_score: number;
  risk: PlanRisk;
  risk_actions_applied: number;
  skipped_count: number;
  warnings: Array<Record<string, unknown>>;
  applied_actions: Array<Record<string, unknown>>;
  proposed_actions: RiskAction[];
}

export interface OverdueTask {
  id: string;
  title: string;
  project: string;
  end_date: string;
  days_overdue: number;
  assignee: string | null;
  status: string;
}

export interface MissedMilestone {
  id: string;
  title: string;
  project: string;
  target_date: string;
  days_overdue: number;
}
