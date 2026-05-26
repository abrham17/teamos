export interface AgentStepEntry {
  name: string;
  label: string;
  status: "running" | "done" | "error";
  result?: Record<string, unknown>;
}

export interface PlanResult {
  projectId?: string;
  projectName?: string;
  taskCount?: number;
  milestoneCount?: number;
  conflictCount?: number;
  risk?: { score: number; factors: string[]; suggestions: string[] };
  wikiPageUrl?: string;
  knowledgeGaps?: string[];
  critiqueScore?: number;
}

export interface AIPlannerQuestion {
  question: string;
  options?: string[];
}

export interface ChatMessage {
  id: string;
  sender: "user" | "architect";
  text?: string;
  isStreaming?: boolean;
  question?: AIPlannerQuestion;
  planningState?: {
    statusText: string;
    agentSteps: AgentStepEntry[];
    planResult?: PlanResult | null;
    reasoningStages?: ReasoningStage[];
  };
  reasoningText?: string;
}

export interface ReasoningStage {
  name: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  durationMs?: number;
  summary?: string;
  metrics?: Record<string, unknown>;
}

export type { ReviewMutation, ReviewPlanPreview } from "@/components/chat/chatTypes";
