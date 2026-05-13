"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, AlertTriangle, Clock, FileWarning, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "@/lib/api";

interface ProactiveAlert {
  id: string;
  type: "overdue" | "conflict" | "stale_wiki" | "milestone_approaching" | "knowledge_gap";
  severity: "info" | "warning" | "critical";
  message: string;
  suggestedAction: string;
  autoFixable: boolean;
  createdAt: string;
}

const severityColors: Record<string, string> = {
  info: "border-blue-500/30 bg-blue-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  critical: "border-red-500/30 bg-red-500/5",
};

const severityIcons: Record<string, typeof Bell> = {
  info: Bell,
  warning: Clock,
  critical: AlertTriangle,
};

export function ProactiveAlertBanner({ teamId }: { teamId: string }) {
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchAlerts = useCallback(async () => {
    if (!teamId) return;
    try {
      const data = await api.get<{ alerts: ProactiveAlert[] }>(
        `/chat/${teamId}/alerts/`
      );
      setAlerts(data.alerts || []);
    } catch {
      // Silently fail — alerts are non-critical
    }
  }, [teamId]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const dismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  };

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));
  if (visibleAlerts.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pt-2">
      <AnimatePresence>
        {visibleAlerts.slice(0, 3).map(alert => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className={`flex items-start gap-3 p-3 rounded-lg border ${severityColors[alert.severity]}`}
          >
            {(() => {
              const Icon = severityIcons[alert.severity];
              return <Icon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-muted)]" />;
            })()}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--text-primary)]">{alert.message}</p>
              {alert.suggestedAction && (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Suggestion: {alert.suggestedAction}
                </p>
              )}
            </div>
            <button
              onClick={() => dismiss(alert.id)}
              className="shrink-0 p-1 rounded hover:bg-[var(--bg-800)]"
            >
              <X className="w-3 h-3 text-[var(--text-muted)]" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
