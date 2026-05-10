import { Terminal, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentToolStep = {
  name: string;
  arguments?: string;
  ok?: boolean;
  result?: unknown;
};

function summarizeResult(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "object" && result !== null) {
      if ("error" in result) return String((result as any).error);
      if ("message" in result) return String((result as any).message);
  }
  try {
    const s = JSON.stringify(result);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "";
  }
}

export function ChatAgentToolTimeline({ steps }: { steps: AgentToolStep[] }) {
  if (!steps.length) return null;
  
  return (
    <div className="w-full max-w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-950)]/80 backdrop-blur-md overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2">
        <Terminal className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">System Execution Log</span>
      </div>
      <div className="p-3 space-y-3">
        {steps.map((s, i) => {
          const isError = s.ok === false;
          const isDone = s.ok === true;
          const isRunning = s.ok === undefined;
          
          return (
            <div key={i} className="flex gap-3 group">
              <div className="flex flex-col items-center">
                <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all duration-300",
                    isDone ? "bg-[var(--success-bg)] border-[var(--success)]/30 text-[var(--success)]" :
                    isError ? "bg-[var(--danger-bg)] border-[var(--danger)]/30 text-[var(--danger)]" :
                    "bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                )}>
                  {isDone && <CheckCircle2 className="w-3 h-3" />}
                  {isError && <AlertCircle className="w-3 h-3" />}
                  {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>
                {i < steps.length - 1 && <div className="w-px h-full bg-[var(--border-subtle)] mt-1" />}
              </div>
              
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--text-primary)] font-mono">{s.name}</span>
                    {isRunning && <span className="text-[9px] font-bold text-[var(--accent)] animate-pulse uppercase">Active</span>}
                </div>
                {s.arguments && (
                    <div className="text-[10px] text-[var(--text-dim)] font-mono truncate opacity-60 group-hover:opacity-100 transition-opacity">
                        args: {s.arguments}
                    </div>
                )}
                {(isDone || isError) && (
                   <div className={cn(
                       "mt-1 text-[11px] font-mono leading-relaxed break-words",
                       isError ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"
                   )}>
                     <span className="opacity-40">result: </span>{summarizeResult(s.result)}
                   </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
