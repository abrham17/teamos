export type ExportFormat = "html" | "markdown" | "json" | "ics";

export interface WikiPageExport {
  id: string;
  title: string;
  slug: string;
  content: string;
  created_at?: string;
  updated_at?: string;
  created_by_name?: string;
}

export interface RiskExport {
  score: number;
  factors: string[];
  suggestions: string[];
}

export interface ConflictExport {
  title: string;
  description: string;
  severity: string;
  assignee_name?: string;
  start_date?: string;
  end_date?: string;
}

export interface ChangesetExport {
  id: string;
  status: string;
  created_at: string;
  mutations: unknown[];
  impact_summary?: Record<string, unknown>;
}

export interface ExportData {
  project: {
    id: string;
    name: string;
    description: string;
    status: string;
    created_at: string;
    updated_at: string;
    task_count: number;
    completed_task_count: number;
    milestone_count: number;
    reached_milestone_count: number;
  };
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    assignee_name?: string;
    assignee_email?: string;
    start_date?: string;
    end_date?: string;
    parent_task_title?: string;
    dependency_titles?: string[];
    order_index: number;
  }>;
  milestones: Array<{
    id: string;
    title: string;
    description: string;
    target_date?: string;
    status: string;
    order_index: number;
  }>;
  members: Array<{
    user_id: string;
    name: string;
    email: string;
    role: string;
    joined_at: string;
  }>;
  wiki_pages: WikiPageExport[];
  risk?: RiskExport | null;
  conflicts: ConflictExport[];
  changesets: ChangesetExport[];
  dependencies: Array<{
    from_task_id: string;
    from_title: string;
    to_task_id: string;
    to_title: string;
  }>;
}

export interface ExportOptions {
  format: ExportFormat;
  includeWikiContent: boolean;
  includeToc: boolean;
  projectName: string;
}
