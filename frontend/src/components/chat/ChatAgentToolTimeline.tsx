"use client";

export type AgentToolStep = {
  name: string;
  arguments?: string;
  ok?: boolean;
  result?: unknown;
};

function summarizeResult(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "object" && result !== null && "error" in result) {
    const o = result as { error?: string; ok?: boolean };
    if (o.error) return String(o.error);
  }
  try {
    const s = JSON.stringify(result);
    return s.length > 160 ? `${s.slice(0, 157)}…` : s;
  } catch {
    return "";
  }
}

export function ChatAgentToolTimeline({ steps }: { steps: AgentToolStep[] }) {
  if (!steps.length) return null;
  return (
    <div className="w-full max-w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)]/60 px-3 py-2 text-left">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-dim)]">Actions</div>
      <ul className="space-y-2 text-xs">
        {steps.map((s, i) => (
          <li key={i} className="border-b border-[var(--border-subtle)]/60 pb-2 last:border-0 last:pb-0">
            <div className="font-medium text-[var(--text-secondary)]">{s.name}</div>
            {s.ok === false ? (
              <div className="mt-0.5 text-amber-600/90">{summarizeResult(s.result)}</div>
            ) : s.ok === true ? (
              <div className="mt-0.5 text-[var(--text-dim)]">{summarizeResult(s.result)}</div>
            ) : (
              <div className="mt-0.5 italic text-[var(--text-dim)]">Running…</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
