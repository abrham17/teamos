export type ChatSession = { id: string; title: string };

export type Citation = {
  source?: "wiki" | "plan" | "web" | string;
  title?: string;
  page_slug?: string;
  page_title?: string;
  project_id?: string;
  project_name?: string;
  source_kind?: string;
  source_ref_id?: string;
  url?: string;
  confidence?: number;
  anchor_hint?: string;
  chunk_id?: string;
  snippet?: string;
};

export type AgentToolStep = {
  name: string;
  arguments?: string;
  ok?: boolean;
  result?: unknown;
};

export type AgentThinking = {
  content: string;
  timestamp: number;
};

export type AgentReflection = {
  success: boolean;
  should_retry: boolean;
  should_replan: boolean;
  feedback: string;
  severity: "info" | "warning" | "critical";
};

export type AgentStep = {
  name: string;
  arguments?: string;
  ok?: boolean;
  result?: unknown;
};

export type AgentStrategy = {
  primary_agent: string;
  reasoning_depth: "lightweight" | "standard" | "deep";
  confidence: number;
  intent_type?: string;
  complexity?: string;
  domains?: string[];
  layer_used?: number;
  latency_ms?: number;
  is_crew?: boolean;
};

export type ActivityEntry = {
  id: string;
  timestamp: number;
  kind: "status" | "thinking" | "tool";
  message: string;
  detail?: Record<string, unknown>;
  status: "running" | "done" | "error";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
  toolSteps?: AgentToolStep[];
  agentSteps?: AgentStep[];
  strategy?: AgentStrategy;
  reasoning?: string;
  isStreaming?: boolean;
  activityFeed?: ActivityEntry[];
  crewProgress?: CrewProgress;
  guardianBlocks?: GuardianBlock[];
  question?: {
    question: string;
    options?: string[];
  };
};

export type GuardianBlock = {
  id: string;
  action: string;
  human_action?: string;
  reason: string;
  tier: 1 | 2;
  tier_label?: string;
  settings_path?: string;
  rephrase_suggestion?: string;
  /** Section 6.1 — which agent role triggered the Guardian block */
  triggered_by_agent?: string;
};

export type CrewAgentProgress = {
  role: string;
  status: "queued" | "thinking" | "executing" | "done";
  current_action?: string;
  duration_ms?: number;
};

export type CrewMessage = {
  from: string;
  to?: string;
  content: string;
  timestamp: number;
};

export type CrewProgress = {
  agents: CrewAgentProgress[];
  messages: CrewMessage[];
  isCompleted: boolean;
};

export type ChatCapabilities = {
  can_edit_wiki: boolean;
  can_edit_plans: boolean;
  can_ingest: boolean;
  agent_mode_available: boolean;
  plan_mode_available: boolean;
  research_mode_available: boolean;
  research_quota?: {
    limit: number;
    current: number;
    remaining: number;
    reason?: string | null;
  };
  research_save_available?: boolean;
};

export type ReviewMutation = {
  id?: string;
  op: "create" | "update" | "delete" | "set_dependencies" | "update_project";
  entity_type?: "task" | "milestone" | "project";
  entity_id?: string;
  semantic_key?: string;
  fields?: Record<string, unknown>;
  old_fields?: Record<string, unknown>;
  depends_on?: string[];
  title?: string;
  reason?: string;
};

export type ReviewPlanPreview = {
  projectName: string;
  description: string;
  tasks: unknown[];
  milestones: unknown[];
};
