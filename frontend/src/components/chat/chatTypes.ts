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

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  metadata?: Record<string, unknown>;
  toolSteps?: AgentToolStep[];
};

export type ChatCapabilities = {
  can_edit_wiki: boolean;
  can_edit_plans: boolean;
  can_ingest: boolean;
  agent_mode_available: boolean;
  plan_mode_available: boolean;
};
