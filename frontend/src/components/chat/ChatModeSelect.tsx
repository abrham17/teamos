"use client";

export type ChatMode = "ask" | "plan" | "agent";

type Caps = {
  can_edit_wiki: boolean;
  can_edit_plans: boolean;
  agent_mode_available: boolean;
  plan_mode_available: boolean;
};

export function ChatModeSelect({
  value,
  onChange,
  capabilities,
}: {
  value: ChatMode;
  onChange: (m: ChatMode) => void;
  capabilities: Caps | null;
}) {
  const planDisabled = !capabilities?.can_edit_plans || !capabilities?.plan_mode_available;
  const agentDisabled = !capabilities?.can_edit_wiki || !capabilities?.agent_mode_available;
  const title =
    "Ask: read-only answers from wiki + plans. Plan: modify projects/tasks/milestones. Wiki agent: modify wiki pages.";

  return (
    <div className="flex shrink-0 items-center" title={title}>
      <label htmlFor="chat-mode" className="sr-only">
        Chat mode
      </label>
      <select
        id="chat-mode"
        value={value}
        disabled={!capabilities}
        onChange={(e) => onChange(e.target.value as ChatMode)}
        className="max-w-[10rem] cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 py-2 text-xs font-medium text-[var(--text-secondary)] outline-none focus:ring-1 focus:ring-[var(--border-subtle)] disabled:cursor-wait disabled:opacity-50"
      >
        <option value="ask">Ask</option>
        <option value="plan" disabled={planDisabled}>
          Plan
        </option>
        <option value="agent" disabled={agentDisabled}>
          Wiki agent
        </option>
      </select>
    </div>
  );
}
