export type ChatSession = { id: string; title: string };

export type Citation = {
  source?: "wiki" | "plan" | string;
  title?: string;
  page_slug?: string;
  page_title?: string;
  project_id?: string;
  project_name?: string;
  source_kind?: string;
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
};

export type ChatCapabilities = {
  can_edit_wiki: boolean;
  can_edit_plans: boolean;
  can_ingest: boolean;
  agent_mode_available: boolean;
  plan_mode_available: boolean;
};
