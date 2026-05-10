import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
export type { AgentToolStep } from "@/components/chat/chatTypes";
import type { AgentToolStep } from "@/components/chat/chatTypes";

export function ChatAgentToolTimeline({ steps }: { steps: AgentToolStep[] }) {
  if (!steps.length) return null;

  const completed = steps.filter((s) => s.ok !== undefined).length;
  const hasError = steps.some((s) => s.ok === false);
  const isRunning = steps.some((s) => s.ok === undefined);

  return (
    <div className="w-full max-w-full">
      {/* Thin progress bar */}
      <div className="h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden mb-1.5">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            hasError
              ? "bg-[var(--danger)]"
              : isRunning
                ? "bg-[var(--accent)] animate-pulse"
                : "bg-[var(--success)]"
          )}
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>

      {/* One-line summary */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isRunning && (
          <span className="text-[10px] font-bold text-[var(--accent)] animate-pulse uppercase tracking-wider mr-1">
            <Loader2 className="w-3 h-3 inline mr-1" />
            {completed}/{steps.length}
          </span>
        )}
        {steps.map((s, i) => {
          const isError = s.ok === false;
          const isDone = s.ok === true;
          const isPending = s.ok === undefined;

          return (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded-md",
                isError && "bg-[var(--danger-bg)] text-[var(--danger)]",
                isDone && "bg-[var(--success-bg)] text-[var(--success)]",
                isPending && "bg-[var(--surface-1)] text-[var(--text-muted)]"
              )}
            >
              {isDone && <CheckCircle2 className="w-2.5 h-2.5" />}
              {isError && <AlertCircle className="w-2.5 h-2.5" />}
              {isPending && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
              {s.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
