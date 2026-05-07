import { AlertTriangle, Info, XCircle } from "lucide-react";
import type { AlertItem } from "@/types";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface AlertFeedProps {
  alerts: AlertItem[];
  className?: string;
}

const severityConfig = {
  critical: {
    icon: <XCircle size={14} />,
    color: "text-danger",
    bg: "bg-danger/10 border-danger/20",
    dot: "bg-danger",
  },
  warning: {
    icon: <AlertTriangle size={14} />,
    color: "text-warning",
    bg: "bg-warning/10 border-warning/20",
    dot: "bg-warning",
  },
  info: {
    icon: <Info size={14} />,
    color: "text-info",
    bg: "bg-info/10 border-info/20",
    dot: "bg-info",
  },
};

export function AlertFeed({ alerts, className }: AlertFeedProps) {
  return (
    <ul className={cn("space-y-2", className)}>
      {alerts.map((alert) => {
        const cfg = severityConfig[alert.severity];
        return (
          <li
            key={alert.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-sm",
              cfg.bg
            )}
          >
            <span className={cn("mt-0.5 shrink-0", cfg.color)}>{cfg.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-foreground leading-snug">{alert.message}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatRelativeTime(alert.created_at)}
                {alert.team && (
                  <> · <span className="font-medium">{alert.team}</span></>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
