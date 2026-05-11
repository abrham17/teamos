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
