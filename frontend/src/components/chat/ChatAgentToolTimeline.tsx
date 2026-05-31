import {
  CheckCircle2,
  AlertCircle,
  Wrench,
  GitBranch,
  MessageCircle,
  Layout,
  BookOpen,
  HardDrive,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LottiePlayer } from "@/components/ui/LottiePlayer";
import { ICONSCOUT } from "@/lib/iconscoutAssets";
export type { AgentToolStep } from "@/components/chat/chatTypes";
import type { AgentToolStep } from "@/components/chat/chatTypes";

const MCP_PRESETS = {
  github: { Icon: GitBranch, color: "text-[#4078c0] bg-[#4078c0]/10 border-[#4078c0]/20" },
  slack: { Icon: MessageCircle, color: "text-[#7c3aed] bg-[#7c3aed]/10 border-[#7c3aed]/20" },
  trello: { Icon: Layout, color: "text-[#0079bf] bg-[#0079bf]/10 border-[#0079bf]/20" },
  notion: { Icon: BookOpen, color: "text-[#6b7280] bg-[#6b7280]/10 border-[#6b7280]/20" },
  gdrive: { Icon: HardDrive, color: "text-[#4285f4] bg-[#4285f4]/10 border-[#4285f4]/20" },
  gcalendar: { Icon: CalendarDays, color: "text-[#0f9d58] bg-[#0f9d58]/10 border-[#0f9d58]/20" },
} as const;

function getToolDisplay(name: string) {
  const match = name.match(/^mcp_([a-z0-9]+)_(.+)$/);
  if (match) {
    const [, key, tool] = match;
    const preset = MCP_PRESETS[key as keyof typeof MCP_PRESETS];
    if (preset) {
      return {
        isMcp: true,
        label: tool.replace(/_/g, " "),
        Icon: preset.Icon,
        className: preset.color,
      };
    }
  }
  return {
    isMcp: false,
    label: name,
    Icon: Wrench,
    className: "bg-[var(--surface-1)] text-[var(--text-muted)] border-[var(--border-subtle)]",
  };
}

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
          <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider mr-1 inline-flex items-center gap-1">
            <LottiePlayer
              src={ICONSCOUT.lottie.aiToolPending}
              width={16}
              height={16}
              aria-label="Agent tools running"
            />
            {completed}/{steps.length}
          </span>
        )}
        {steps.map((s, i) => {
          const isError = s.ok === false;
          const isDone = s.ok === true;
          const isPending = s.ok === undefined;
          const display = getToolDisplay(s.name);
          const ToolIcon = display.Icon;

          return (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md border transition-all",
                isError && "bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger)]/20",
                isDone && "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20",
                isPending && display.className
              )}
            >
              {isDone && <CheckCircle2 className="w-2.5 h-2.5" />}
              {isError && <AlertCircle className="w-2.5 h-2.5" />}
              {isPending && (
                <span className="flex items-center gap-1">
                  <LottiePlayer
                    src={ICONSCOUT.lottie.aiToolPending}
                    width={14}
                    height={14}
                    aria-label={`Running ${s.name}`}
                  />
                  <ToolIcon className="w-2.5 h-2.5" />
                </span>
              )}
              {isDone && <ToolIcon className="w-2.5 h-2.5" />}
              <span className="capitalize">{display.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
