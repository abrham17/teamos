import type { AgentStepEntry, ChatMessage, ReasoningStage } from "./types";

const STEP_LABELS: Record<string, string> = {
  reasoning_decompose: "Decomposing mission into sub-goals",
  reasoning_research: "Researching wiki knowledge per sub-goal",
  reasoning_synthesize: "Synthesizing domain context from wiki",
  reasoning_draft: "Drafting plan with reasoning traces",
  reasoning_critique: "Self-critiquing plan for issues",
  reasoning_finalize: "Inferring dependencies & scheduling",
  plan_generate_draft: "Generating plan draft",
  plan_search: "Searching plans & tasks",
  plan_read_entity: "Loading plan details",
  plan_create_project: "Creating project",
  plan_update_project: "Updating project",
  plan_update_task: "Updating task",
  plan_create_task: "Adding task",
  plan_create_milestone: "Adding milestone",
  plan_update_milestone: "Updating milestone",
  plan_detect_conflicts: "Detecting scheduling conflicts",
  plan_auto_resolve: "Auto-resolving conflicts",
  plan_risk_assessment: "Assessing timeline risk",
  plan_sync_wiki: "Syncing project to wiki",
  plan_reindex: "Updating search index",
  plan_check_overdue: "Checking for overdue items",
  wiki_search_pages: "Searching wiki",
  wiki_create_page: "Creating wiki page",
};

const REASONING_STAGE_LABELS: Record<string, string> = {
  reasoning_research: "Research",
  reasoning_synthesize: "Synthesize",
  reasoning_decompose: "Decompose",
  reasoning_draft: "Draft",
  reasoning_critique: "Critique",
  reasoning_finalize: "Finalize",
};

export function getStepLabel(name: string, args?: string): string {
  const base = STEP_LABELS[name] || name.replace(/_/g, " ");
  if (name === "plan_create_task" && args) {
    try {
      const parsed = JSON.parse(args);
      if (parsed.index && parsed.total) return `Adding task ${parsed.index}/${parsed.total}`;
    } catch { /* ignore */ }
  }
  if (name === "plan_update_task" && args) {
    try {
      const parsed = JSON.parse(args);
      if (parsed.index && parsed.total) return `Updating task ${parsed.index}/${parsed.total}`;
    } catch { /* ignore */ }
  }
  if (name === "plan_create_milestone" && args) {
    try {
      const parsed = JSON.parse(args);
      if (parsed.index && parsed.total) return `Adding milestone ${parsed.index}/${parsed.total}`;
    } catch { /* ignore */ }
  }
  return base;
}

export function clonePlanningState(
  state: NonNullable<ChatMessage["planningState"]>
): NonNullable<ChatMessage["planningState"]> {
  return {
    statusText: state.statusText,
    agentSteps: state.agentSteps.map((step) => ({ ...step })),
    planResult: state.planResult
      ? {
          ...state.planResult,
          risk: state.planResult.risk
            ? {
                ...state.planResult.risk,
                factors: [...(state.planResult.risk.factors ?? [])],
                suggestions: [...(state.planResult.risk.suggestions ?? [])],
              }
            : undefined,
          knowledgeGaps: state.planResult.knowledgeGaps
            ? [...state.planResult.knowledgeGaps]
            : undefined,
        }
      : state.planResult,
  };
}

export function buildPlanSummary(data: Record<string, unknown>): string {
  const parts: string[] = [];
  const description = typeof data.description === "string" ? data.description.trim() : "";
  if (description) parts.push(description);
  const suggestions = Array.isArray(data.critique_suggestions)
    ? data.critique_suggestions.filter((item): item is string => typeof item === "string")
    : [];
  if (suggestions.length > 0) {
    parts.push(`\n\n### Recommendations\n${suggestions.map((item) => `- ${item}`).join("\n")}`);
  }
  return parts.join("");
}

export function riskColor(score: number): string {
  if (score <= 30) return "text-[var(--success)]";
  if (score <= 60) return "text-[var(--warning)]";
  return "text-[var(--danger)]";
}

export function processSseLines(
  lines: string[],
  currentEventRef: { value: string },
  onEvent: (event: string, data: Record<string, unknown>) => void
) {
  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEventRef.value = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith("data:") || !currentEventRef.value) continue;
    const dataStr = line.slice(5).trim();
    if (!dataStr) continue;
    try {
      const data = JSON.parse(dataStr) as Record<string, unknown>;
      if (currentEventRef.value === "agent_error") {
        throw new Error(typeof data.detail === "string" ? data.detail : "Planning agent error");
      }
      onEvent(currentEventRef.value, data);
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        console.warn("Failed to parse planner SSE payload", parseErr);
        continue;
      }
      throw parseErr;
    }
    currentEventRef.value = "";
  }
}

export function groupAgentSteps(steps: AgentStepEntry[]) {
  const groups = {
    reasoning: [] as AgentStepEntry[],
    execution: [] as AgentStepEntry[],
    postProcessing: [] as AgentStepEntry[],
  };

  const reasoningPrefixes = ["reasoning_"];
  const executionPrefixes = ["plan_create_", "plan_update_", "plan_add_", "plan_search_", "plan_read_"];
  const postProcessingPrefixes = ["plan_detect_", "plan_risk_", "plan_sync_", "plan_reindex_", "plan_check_", "plan_auto_"];

  for (const step of steps) {
    if (reasoningPrefixes.some((p) => step.name.startsWith(p))) {
      groups.reasoning.push(step);
    } else if (executionPrefixes.some((p) => step.name.startsWith(p))) {
      groups.execution.push(step);
    } else if (postProcessingPrefixes.some((p) => step.name.startsWith(p))) {
      groups.postProcessing.push(step);
    } else {
      groups.execution.push(step);
    }
  }

  return groups;
}

export function initReasoningStages(): ReasoningStage[] {
  return Object.entries(REASONING_STAGE_LABELS).map(([name, label]) => ({
    name,
    label,
    status: "pending",
  }));
}

export function updateReasoningStage(
  stages: ReasoningStage[],
  eventName: string,
  data: Record<string, unknown>
): ReasoningStage[] {
  return stages.map((stage) => {
    if (stage.name !== eventName) return stage;

    if (eventName.startsWith("reasoning_") && eventName.endsWith("_done")) {
      const baseName = eventName.replace("_done", "");
      if (stage.name === baseName) {
        return {
          ...stage,
          status: "done",
          durationMs: typeof data.duration_ms === "number" ? data.duration_ms : stage.durationMs,
          summary: typeof data.summary === "string" ? data.summary : stage.summary,
          metrics: data.metrics as Record<string, unknown> | undefined,
        };
      }
    }

    if (data.status === "running" || eventName === `agent_step`) {
      return { ...stage, status: "running" as const };
    }

    if (data.ok === true || data.status === "done") {
      return { ...stage, status: "done" as const };
    }

    if (data.ok === false || data.status === "error") {
      return { ...stage, status: "error" as const };
    }

    return stage;
  });
}

export function getReasoningStageFromAgentStep(name: string): string | null {
  const mapping: Record<string, string> = {
    reasoning_research: "reasoning_research",
    reasoning_synthesize: "reasoning_synthesize",
    reasoning_decompose: "reasoning_decompose",
    reasoning_draft: "reasoning_draft",
    reasoning_critique: "reasoning_critique",
    reasoning_finalize: "reasoning_finalize",
  };
  return mapping[name] || null;
}
