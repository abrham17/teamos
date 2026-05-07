import type { HealthStatus } from "@/types";
import { cn } from "@/lib/utils";

interface HealthBadgeProps {
  status: HealthStatus;
  showLabel?: boolean;
  size?: "sm" | "md";
}

const statusConfig: Record<HealthStatus, { color: string; bg: string; label: string }> = {
  healthy: { color: "bg-success", bg: "bg-success/20", label: "Healthy" },
  degraded: { color: "bg-warning", bg: "bg-warning/20", label: "Degraded" },
  down: { color: "bg-danger", bg: "bg-danger/20", label: "Down" },
};

export function HealthBadge({ status, showLabel = true, size = "md" }: HealthBadgeProps) {
  const cfg = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        cfg.bg,
        size === "sm" && "px-1.5 text-[11px]"
      )}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {status === "healthy" && (
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", cfg.color)} />
        )}
        <span className={cn("relative inline-flex rounded-full h-2 w-2", cfg.color)} />
      </span>
      {showLabel && (
        <span
          className={cn(
            status === "healthy" && "text-success",
            status === "degraded" && "text-warning",
            status === "down" && "text-danger"
          )}
        >
          {cfg.label}
        </span>
      )}
    </span>
  );
}
