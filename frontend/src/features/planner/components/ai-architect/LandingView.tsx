"use client";

import { motion } from "motion/react";
import { Bot, Sparkles, Target, BookOpen } from "lucide-react";

interface LandingViewProps {
  mode: "create" | "manage";
  onSend: (text: string) => void;
}

export function LandingView({ mode, onSend }: LandingViewProps) {
  const suggestions = [
    { icon: Sparkles, text: "Create a marketing launch strategy for our KYC feature" },
    { icon: Target,   text: "Analyze our team timeline risks and draft a mitigation roadmap" },
    { icon: BookOpen, text: "List our active wiki pages and suggest strategic updates" },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center space-y-2 mb-6"
    >
      <Bot size={40} className="mx-auto text-[var(--accent)] animate-pulse" />
      <h3 className="text-lg font-bold text-white">AI Planner Architect</h3>
      <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
        {mode === "manage"
          ? "Hello! Ask questions about your active projects, request a complete project plan, or assign tasks."
          : "Welcome! Let's build a new strategic project plan together. Tell me what you'd like to build."
        }
      </p>

      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 gap-2 w-full max-w-xl mt-6"
      >
        {suggestions.map(({ icon: Icon, text }, idx) => (
          <button
            key={idx}
            onClick={() => onSend(text)}
            className="p-3 text-left text-xs text-[var(--text-muted)] bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-[var(--accent)]/20 rounded-xl transition-all flex items-center gap-2.5 group"
          >
            <Icon className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 group-hover:scale-110 transition-transform" />
            <span>{text}</span>
          </button>
        ))}
      </motion.div>
    </motion.div>
  );
}
