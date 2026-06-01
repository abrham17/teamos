"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check, X, RefreshCw, ChevronDown, ChevronRight,
  Plus, Pencil, Trash2, Link2, Sparkles, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewMutation, ReviewPlanPreview } from "./chatTypes";

export type { ReviewMutation, ReviewPlanPreview } from "./chatTypes";

interface PlanReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mutations: ReviewMutation[];
  planPreview?: ReviewPlanPreview | null;
  onApprove: (approvedIds?: string[]) => void | Promise<void>;
  onReject: () => void | Promise<void>;
  onRevise: (feedback: string) => void | Promise<void>;
  isProcessing?: boolean;
}

const OP_CONFIG = {
  create: { icon: Plus, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Create" },
  update: { icon: Pencil, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", label: "Update" },
  delete: { icon: Trash2, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", label: "Delete" },
  set_dependencies: { icon: Link2, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20", label: "Link" },
  update_project: { icon: Pencil, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", label: "Project" },
};

function FieldDiff({
  field,
  oldVal,
  newVal,
}: {
  field: string;
  oldVal?: unknown;
  newVal: unknown;
}) {
  const fmt = (v: unknown) =>
    v == null ? <span className="opacity-40 italic">none</span> : <span>{String(v)}</span>;

  const hasOld = oldVal !== undefined && oldVal !== null && oldVal !== newVal;

  return (
    <div className="flex flex-col gap-0.5 py-1 border-b border-[var(--border-subtle)]/40 last:border-0">
      <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-dim)]">
        {field.replace(/_/g, " ")}
      </span>
      {hasOld ? (
        <div className="flex items-start gap-1.5">
          <span className="text-[11px] text-rose-400/80 line-through truncate max-w-[140px]">
            {fmt(oldVal)}
          </span>
          <ArrowRight className="w-2.5 h-2.5 text-[var(--text-dim)] shrink-0 mt-0.5" />
          <span className="text-[11px] text-emerald-400 truncate max-w-[140px]">
            {fmt(newVal)}
          </span>
        </div>
      ) : (
        <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[260px]">
          {fmt(newVal)}
        </span>
      )}
    </div>
  );
}

function MutationCard({
  mutation,
  index,
  excluded,
  onToggle,
}: {
  mutation: ReviewMutation;
  index: number;
  excluded: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = OP_CONFIG[mutation.op] ?? OP_CONFIG.update;
  const Icon = cfg.icon;

  const title =
    String(
      mutation.title ||
        mutation.fields?.title ||
        mutation.fields?.name ||
        (mutation.op === "update_project" ? "Project" : `Item #${index + 1}`)
    );

  const diffableFields = mutation.fields
    ? Object.entries(mutation.fields).filter(
        ([k]) => !["id", "title", "name"].includes(k)
      )
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        "rounded-2xl border transition-all",
        excluded
          ? "opacity-40 bg-[var(--surface-1)]/30 border-[var(--border-subtle)]"
          : "bg-[var(--surface-1)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <span className={cn("inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0", cfg.bg, cfg.color)}>
          <Icon className="w-2.5 h-2.5" />
          {cfg.label} {mutation.entity_type || ""}
        </span>

        <span className={cn("flex-1 text-[12px] font-semibold truncate", excluded && "line-through text-[var(--text-dim)]")}>
          {title}
        </span>

        {/* Expand/collapse diff */}
        {diffableFields.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Exclude toggle */}
        <button
          onClick={onToggle}
          className={cn(
            "shrink-0 text-[9px] font-bold uppercase px-2 py-1 rounded-lg border transition-all",
            excluded
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
          )}
        >
          {excluded ? "Include" : "Exclude"}
        </button>
      </div>

      {/* Delete reason */}
      {mutation.op === "delete" && mutation.reason && (
        <p className="px-4 pb-2 text-[11px] text-[var(--text-dim)] italic">
          Reason: {mutation.reason}
        </p>
      )}

      {/* Field-level diff */}
      <AnimatePresence>
        {expanded && diffableFields.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mx-4 mb-3 mt-1 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] px-3 py-2 space-y-0">
              {diffableFields.map(([key, val]) => (
                <FieldDiff
                  key={key}
                  field={key}
                  oldVal={mutation.old_fields?.[key]}
                  newVal={val}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Inline chat review panel — rendered as a message bubble inside the chat,
 * NOT as a slideout sidebar. Shows field-level diffs with before/after values.
 */
export function PlanReviewPanel({
  isOpen,
  onClose,
  mutations = [],
  planPreview,
  onApprove,
  onReject,
  onRevise,
  isProcessing = false,
}: PlanReviewPanelProps) {
  const [feedback, setFeedback] = useState("");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [showRevise, setShowRevise] = useState(false);

  if (!isOpen) return null;

  const toggleExclude = (idx: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleApprove = () => {
    const approvedIds = mutations
      .map((_, i) => i)
      .filter((i) => !excluded.has(i))
      .map(String);
    onApprove(approvedIds);
  };

  const handleRevise = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    onRevise(feedback);
    setFeedback("");
    setShowRevise(false);
  };

  const includedCount = mutations.length - excluded.size;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 4 }}
      transition={{ duration: 0.2 }}
      className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-950)] overflow-hidden shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {planPreview?.projectName ? `Review: ${planPreview.projectName}` : "Review Plan Changes"}
            </h3>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider mt-0.5">
              {mutations.length} proposed changes &middot; {includedCount} included
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close review panel"
          className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-dim)] transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Mutations list */}
      <div className="p-4 space-y-2.5 max-h-[400px] overflow-y-auto custom-scrollbar">
        {mutations.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-dim)] text-sm">
            No changes proposed
          </div>
        ) : (
          mutations.map((mut, idx) => (
            <MutationCard
              key={idx}
              mutation={mut}
              index={idx}
              excluded={excluded.has(idx)}
              onToggle={() => toggleExclude(idx)}
            />
          ))
        )}
      </div>

      {/* Revise form */}
      <AnimatePresence>
        {showRevise && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[var(--border-subtle)]"
          >
            <form onSubmit={handleRevise} className="p-4 flex gap-2">
              <input
                autoFocus
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe changes (e.g. 'Make the QA task high priority')..."
                className="flex-1 h-9 px-3 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]"
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={isProcessing || !feedback.trim()}
                className="px-3 h-9 bg-[var(--accent)] text-white rounded-xl text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action footer */}
      <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-900)] flex items-center gap-2">
        <button
          onClick={onReject}
          disabled={isProcessing}
          className="h-9 px-4 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40"
        >
          Reject
        </button>

        <button
          onClick={() => setShowRevise((v) => !v)}
          disabled={isProcessing}
          className="h-9 px-4 bg-[var(--surface-2)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Revise
        </button>

        <button
          onClick={handleApprove}
          disabled={isProcessing || includedCount === 0}
          className="flex-1 h-9 bg-[var(--accent)] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent-glow)]"
        >
          {isProcessing ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Approve {includedCount > 0 ? `(${includedCount})` : ""}
        </button>
      </div>
    </motion.div>
  );
}
