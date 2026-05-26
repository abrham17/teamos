"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionCardProps {
  /** The clarifying question text from the AI */
  question: string;
  /** Optional preset answer options to show as clickable chips */
  options?: string[];
  /** Called when the user selects an option chip or submits free-text */
  onSelect: (answer: string) => void;
  /** Whether a response is currently being processed */
  isProcessing?: boolean;
}

/**
 * QuestionCard — inline clarification question component.
 *
 * Renders within the chat message flow as a flat, borderless card
 * matching the CollapsibleThoughtBlock aesthetic. Used by both
 * ChatInterface and AIPlannerOverlay.
 */
export function QuestionCard({
  question,
  options,
  onSelect,
  isProcessing = false,
}: QuestionCardProps) {
  const [freeText, setFreeText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the free-text input when no options are present
  useEffect(() => {
    if (!options?.length && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [options]);

  const handleOptionClick = (opt: string) => {
    if (isProcessing || selected) return;
    setSelected(opt);
    onSelect(opt);
  };

  const handleFreeSubmit = () => {
    const trimmed = freeText.trim();
    if (!trimmed || isProcessing || selected) return;
    setSelected(trimmed);
    onSelect(trimmed);
    setFreeText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFreeSubmit();
    }
  };

  const isAnswered = selected !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mt-3 w-full"
    >
      {/* Question text */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 mt-0.5 w-1 self-stretch rounded-full bg-[var(--accent)]/40" />
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <MessageSquare className="w-3.5 h-3.5 text-[var(--accent)]/70 flex-shrink-0" />
            <span className="text-[11px] font-medium text-[var(--accent)]/70 uppercase tracking-wide">
              Clarification needed
            </span>
          </div>
          <p className="text-[14px] leading-relaxed text-[var(--text-primary)] font-normal">
            {question}
          </p>
        </div>
      </div>

      {/* Option chips */}
      <AnimatePresence>
        {options && options.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-wrap gap-2 ml-4 mb-3"
          >
            {options.map((opt, i) => {
              const isChosen = selected === opt;
              const isDimmed = isAnswered && !isChosen;
              return (
                <motion.button
                  key={opt}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04, duration: 0.18 }}
                  onClick={() => handleOptionClick(opt)}
                  disabled={isProcessing || isAnswered}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-[13px] font-medium border transition-all duration-150",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
                    isChosen
                      ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm"
                      : isDimmed
                      ? "bg-transparent text-[var(--text-dim)] border-white/5 cursor-default opacity-40"
                      : "bg-[var(--bg-800)] text-[var(--text-secondary)] border-white/8 hover:bg-[var(--bg-700)] hover:border-[var(--accent)]/30 hover:text-[var(--text-primary)] cursor-pointer"
                  )}
                >
                  {opt}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Free-text fallback */}
      {!isAnswered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="ml-4 flex items-end gap-2"
        >
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={freeText}
              onChange={(e) => {
                setFreeText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                options?.length
                  ? "Or type a custom answer..."
                  : "Type your answer..."
              }
              disabled={isProcessing}
              rows={1}
              className={cn(
                "w-full resize-none overflow-hidden rounded-xl px-3.5 py-2.5 text-[13px]",
                "bg-[var(--bg-800)] border border-white/8 text-[var(--text-primary)]",
                "placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]/40",
                "transition-colors duration-150",
                isProcessing && "opacity-50 cursor-not-allowed"
              )}
            />
          </div>
          <button
            onClick={handleFreeSubmit}
            disabled={!freeText.trim() || isProcessing}
            aria-label="Submit answer"
            className={cn(
              "flex-shrink-0 mb-0.5 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150",
              freeText.trim() && !isProcessing
                ? "bg-[var(--accent)] text-white hover:opacity-90"
                : "bg-[var(--bg-700)] text-[var(--text-dim)] cursor-not-allowed opacity-50"
            )}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Answered confirmation */}
      {isAnswered && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="ml-4 text-[12px] text-[var(--text-dim)] italic"
        >
          Got it — proceeding with your answer.
        </motion.p>
      )}
    </motion.div>
  );
}
