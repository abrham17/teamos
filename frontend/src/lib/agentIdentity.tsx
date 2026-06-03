/**
 * agentIdentity.tsx
 *
 * Single source of truth for agent visual identities across the TeamOS interface.
 * Used by: CrewActivityPanel, GuardianBlockCard, CanvasNode, NodeDetailPanel reasoning trace headers.
 *
 * Section 6.1 — Agent Avatars: Consistent Identity Across the Interface
 */

import {
  Brain,
  Compass,
  ShieldCheck,
  FlaskConical,
  Cpu,
  Zap,
  Users,
  ScanSearch,
} from "lucide-react";
import type { JSX } from "react";

export interface AgentIdentity {
  /** JSX icon element at w-3.5 h-3.5 scale */
  icon: JSX.Element;
  /** Hex color for the agent — used for text, dots, borders */
  color: string;
  /** Human-readable display label */
  label: string;
  /** Short description for tooltips */
  description: string;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const AGENT_IDENTITY_MAP: Record<string, AgentIdentity> = {
  researcher: {
    icon: <Compass className="w-3.5 h-3.5" />,
    color: "#60a5fa",
    label: "Researcher",
    description: "Searches wiki, web, and knowledge base for relevant context.",
  },
  research: {
    icon: <Compass className="w-3.5 h-3.5" />,
    color: "#60a5fa",
    label: "Research Specialist",
    description: "Deep research across structured and unstructured sources.",
  },
  strategic_planner: {
    icon: <Brain className="w-3.5 h-3.5" />,
    color: "#a78bfa",
    label: "Strategic Planner",
    description: "Decomposes goals into structured task sequences and milestones.",
  },
  planner: {
    icon: <Brain className="w-3.5 h-3.5" />,
    color: "#a78bfa",
    label: "Planner",
    description: "Creates and sequences task plan.",
  },
  risk_critic: {
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
    color: "#f97316",
    label: "Risk Critic",
    description: "Identifies dependency conflicts, delivery risks, and blockers.",
  },
  wiki_writer: {
    icon: <FlaskConical className="w-3.5 h-3.5" />,
    color: "#34d399",
    label: "Wiki Writer",
    description: "Produces and updates wiki content based on team knowledge.",
  },
  task_manager: {
    icon: <Cpu className="w-3.5 h-3.5" />,
    color: "#fb923c",
    label: "Task Manager",
    description: "Assigns, tracks, and closes tasks and blockers.",
  },
  lightweight: {
    icon: <Zap className="w-3.5 h-3.5" />,
    color: "#fbbf24",
    label: "Fast-Track Agent",
    description: "Flash-model specialist for low-complexity, high-speed operations.",
  },
  supervisor: {
    icon: <Users className="w-3.5 h-3.5" />,
    color: "#94a3b8",
    label: "Supervisor",
    description: "Orchestrates crew, resolves inter-agent conflicts, synthesizes output.",
  },
  analyst: {
    icon: <ScanSearch className="w-3.5 h-3.5" />,
    color: "#e879f9",
    label: "Analyst",
    description: "Synthesizes data and extracts insights from structured datasets.",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get identity for any role, with a generic fallback. */
export function getAgentIdentity(role: string): AgentIdentity {
  return (
    AGENT_IDENTITY_MAP[role] ?? {
      icon: <Cpu className="w-3.5 h-3.5" />,
      color: "#94a3b8",
      label: role
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      description: `Specialized agent for ${role} operations.`,
    }
  );
}

/**
 * Returns Tailwind-compatible CSS variables for an agent's color pulse dot.
 * Usage: <span style={agentDotStyle("researcher")} className="w-2 h-2 rounded-full" />
 */
export function agentDotStyle(role: string): React.CSSProperties {
  const identity = getAgentIdentity(role);
  return { background: identity.color };
}
