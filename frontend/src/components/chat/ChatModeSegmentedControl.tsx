"use client";

import { motion } from "motion/react";
import { Search, Layout, ShieldCheck, Globe2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatMode = "ask" | "plan" | "agent" | "research";

type Caps = {
  can_edit_wiki: boolean;
  can_edit_plans: boolean;
  agent_mode_available: boolean;
  plan_mode_available: boolean;
  research_mode_available: boolean;
};

interface ChatModeSegmentedControlProps {
  value: ChatMode;
  onChange: (m: ChatMode) => void;
  capabilities: Caps | null;
}

export function ChatModeSegmentedControl({
  value,
  onChange,
  capabilities,
}: ChatModeSegmentedControlProps) {
  const modes: { id: ChatMode; label: string; icon: LucideIcon; disabled: boolean; color: string }[] = [
    { 
        id: "ask", 
        label: "Ask", 
        icon: Search, 
        disabled: false,
        color: "var(--info)"
    },
    { 
        id: "plan", 
        label: "Plan", 
        icon: Layout, 
        disabled: !capabilities?.can_edit_plans || !capabilities?.plan_mode_available,
        color: "var(--warning)"
    },
    { 
        id: "agent", 
        label: "Agent", 
        icon: ShieldCheck, 
        disabled: !capabilities?.can_edit_wiki || !capabilities?.agent_mode_available,
        color: "var(--accent)"
    },
    {
        id: "research",
        label: "Research",
        icon: Globe2,
        disabled: !capabilities?.research_mode_available,
        color: "var(--success)",
    },
  ];

  return (
    <div className="flex p-1 bg-[var(--surface-2)] rounded-2xl border border-[var(--border-subtle)] shadow-inner relative overflow-hidden backdrop-blur-md">
      {modes.map((mode) => {
        const isActive = value === mode.id;
        const Icon = mode.icon;
        
        return (
          <button
            key={mode.id}
            onClick={() => !mode.disabled && onChange(mode.id)}
            disabled={mode.disabled}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2 text-xs font-semibold transition-all duration-300 rounded-xl z-10",
              isActive ? "text-[var(--bg-950)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              mode.disabled && "opacity-30 cursor-not-allowed"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-pill"
                className="absolute inset-0 bg-[var(--text-primary)] rounded-xl -z-10 shadow-lg"
                initial={false}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                style={{ backgroundColor: isActive ? mode.color : undefined }}
              />
            )}
            <Icon className={cn("w-3.5 h-3.5", isActive ? "text-[var(--bg-950)]" : "text-current")} />
            <span>{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
