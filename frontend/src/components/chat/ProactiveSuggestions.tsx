"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Calendar, BookOpen, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";

interface Suggestion {
  type: string;
  priority: "high" | "medium" | "low";
  message: string;
  action?: string;
}

export function ProactiveSuggestions({ teamId }: { teamId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const data = await api.get<{ suggestions?: Suggestion[] }>(`/chat/${teamId}/suggestions/`);
        setSuggestions(data.suggestions || []);
      } catch {
        // Endpoint may not exist yet, silently fail
      }
    };

    fetchSuggestions();
    const interval = setInterval(fetchSuggestions, 60000);
    return () => clearInterval(interval);
  }, [teamId]);

  if (suggestions.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case "overdue_tasks":
        return <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />;
      case "upcoming_milestones":
        return <Calendar className="h-4 w-4 text-[var(--warning)]" />;
      case "stale_wiki":
        return <BookOpen className="h-4 w-4 text-[var(--accent)]" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-[var(--text-muted)]" />;
    }
  };

  return (
    <div className="space-y-2">
      {suggestions.slice(0, 3).map((s, idx) => (
        <motion.div
          key={s.type}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className={`rounded-xl border p-3 flex items-center gap-3 ${
            s.priority === "high"
              ? "border-[var(--danger)]/30 bg-[var(--danger)]/5"
              : s.priority === "medium"
              ? "border-[var(--warning)]/30 bg-[var(--warning)]/5"
              : "border-[var(--border-subtle)] bg-[var(--surface-1)]/50"
          }`}
        >
          {getIcon(s.type)}
          <p className="text-[12px] font-medium text-[var(--text-primary)] flex-1">{s.message}</p>
          {s.action && (
            <button className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline shrink-0">
              Review
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </motion.div>
      ))}
    </div>
  );
}
