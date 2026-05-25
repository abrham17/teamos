"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Check, RefreshCw, 
  MessageSquare, Layers, Flag, CheckSquare, Sparkles 
} from "lucide-react";

export interface ReviewMutation {
  id?: string;
  op: "create" | "update" | "delete" | "set_dependencies";
  entity_type: "task" | "milestone" | "project";
  fields?: Record<string, unknown>;
  depends_on?: string[];
  title?: string;
}

export interface ReviewPlanPreview {
  projectName: string;
  description: string;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    startDate?: string;
    endDate?: string;
    assignee_id?: string;
    reasoning?: string;
  }>;
  milestones: Array<{
    id: string;
    title: string;
    date: string;
    description: string;
    status: string;
  }>;
}

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

export function PlanReviewPanel({
  isOpen,
  onClose,
  mutations = [],
  planPreview,
  onApprove,
  onReject,
  onRevise,
  isProcessing = false
}: PlanReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<"changes" | "preview">("changes");
  const [feedback, setFeedback] = useState("");
  const [rejectedMutations, setRejectedMutations] = useState<Set<string>>(new Set());

  const toggleMutationSelect = (mutId: string) => {
    setRejectedMutations(prev => {
      const next = new Set(prev);
      if (next.has(mutId)) {
        next.delete(mutId);
      } else {
        next.add(mutId);
      }
      return next;
    });
  };

  const handleApprove = () => {
    // Pass indices or IDs of approved mutations
    const approved = mutations
      .map((m, idx) => ({ ...m, origIndex: idx }))
      .filter((_, idx) => !rejectedMutations.has(String(idx)));
    
    onApprove(approved.map(m => String(m.origIndex)));
  };

  const handleReviseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    onRevise(feedback);
    setFeedback("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[110] backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[520px] max-w-full bg-[var(--bg-950)] border-l border-[var(--border-subtle)] shadow-2xl z-[120] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <header className="p-6 border-b border-[var(--border-subtle)] bg-[var(--surface-1)] shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-base">Review Strategic Plan</h3>
                  <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-0.5">
                    {mutations.length} proposed adjustments
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[var(--surface-2)] rounded-lg text-[var(--text-muted)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            {/* Navigation Tabs */}
            <div className="flex bg-[var(--bg-900)] p-1.5 border-b border-[var(--border-subtle)] shrink-0">
              <button
                onClick={() => setActiveTab("changes")}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  activeTab === "changes"
                    ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Layers className="w-4 h-4" />
                Proposed Changes
              </button>
              {planPreview && (
                <button
                  onClick={() => setActiveTab("preview")}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                    activeTab === "preview"
                      ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                  Full Plan Preview
                </button>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              {activeTab === "changes" ? (
                <div className="space-y-4">
                  {mutations.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[var(--surface-1)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-dim)]">
                        <Check className="w-6 h-6" />
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">No proposed changes to review</p>
                    </div>
                  ) : (
                    mutations.map((mut, idx) => {
                      const mutId = String(idx);
                      const isRejected = rejectedMutations.has(mutId);
                      const title = String(mut.title || mut.fields?.title || mut.fields?.name || `Mutation #${idx + 1}`);
                      
                      return (
                        <div
                          key={idx}
                          className={`border rounded-2xl p-4 transition-all relative ${
                            isRejected
                              ? "bg-rose-500/5 border-rose-500/20 opacity-60"
                              : "bg-[var(--surface-1)] border-[var(--border-subtle)] hover:border-[var(--accent-subtle)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                mut.op === "create"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : mut.op === "update"
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-rose-500/10 text-rose-500"
                              }`}>
                                {mut.op} {mut.entity_type}
                              </span>
                            </div>

                            <button
                              onClick={() => toggleMutationSelect(mutId)}
                              className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg border transition-all ${
                                isRejected
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                  : "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                              }`}
                            >
                              {isRejected ? "Enable" : "Exclude"}
                            </button>
                          </div>

                          <h4 className={`text-sm font-bold mt-2.5 ${isRejected ? "line-through" : "text-[var(--text-primary)]"}`}>
                            {title}
                          </h4>

                          {typeof mut.fields?.description === "string" && (
                            <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                              {mut.fields.description}
                            </p>
                          )}

                          {/* Field Changes Table */}
                          {mut.op === "update" && mut.fields && (
                            <div className="mt-3 space-y-1 bg-[var(--bg-900)] p-2.5 rounded-xl border border-[var(--border-subtle)] text-[10px]">
                              {Object.entries(mut.fields).map(([key, val]) => {
                                if (key === "id" || key === "title") return null;
                                return (
                                  <div key={key} className="flex justify-between py-0.5 border-b border-[var(--border-subtle)]/35 last:border-0">
                                    <span className="font-bold text-[var(--text-dim)] uppercase">{key.replace("_", " ")}</span>
                                    <span className="font-semibold text-[var(--text-secondary)] truncate max-w-[200px]">{String(val)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* Plan Preview Mode */
                !planPreview ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[var(--surface-1)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-dim)]">
                      <CheckSquare className="w-6 h-6" />
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">Plan preview not available</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Project Header Card */}
                    <div className="p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)]">Project Scope</span>
                      <h4 className="text-lg font-black text-[var(--text-primary)] mt-1">{planPreview.projectName}</h4>
                      <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">{planPreview.description}</p>
                    </div>

                    {/* Tasks List */}
                    <div className="space-y-3">
                      <h5 className="text-xs font-black uppercase tracking-widest text-[var(--text-dim)] flex items-center gap-1.5">
                        <CheckSquare className="w-3.5 h-3.5 text-[var(--accent)]" />
                        Tasks ({planPreview.tasks.length})
                      </h5>
                      {planPreview.tasks.map((t, i) => (
                        <div key={i} className="p-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--text-primary)]">{t.title}</span>
                            <span className={`text-[8px] uppercase font-black px-1.5 rounded ${
                              t.priority === "high"
                                ? "bg-rose-500/10 text-rose-400"
                                : t.priority === "medium"
                                ? "bg-amber-500/10 text-amber-400"
                                : "bg-emerald-500/10 text-emerald-400"
                            }`}>
                              {t.priority}
                            </span>
                          </div>
                          {t.description && <p className="text-[11px] text-[var(--text-muted)] leading-normal">{t.description}</p>}
                          {t.reasoning && <p className="text-[9px] text-[var(--accent)] italic font-semibold mt-1">Reason: {t.reasoning}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Milestones List */}
                    {planPreview.milestones.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="text-xs font-black uppercase tracking-widest text-[var(--text-dim)] flex items-center gap-1.5">
                          <Flag className="w-3.5 h-3.5 text-[var(--accent)]" />
                          Milestones ({planPreview.milestones.length})
                        </h5>
                        {planPreview.milestones.map((m, i) => (
                          <div key={i} className="p-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl flex justify-between items-start gap-3">
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)]">{m.title}</span>
                              {m.description && <p className="text-[11px] text-[var(--text-muted)] mt-1">{m.description}</p>}
                            </div>
                            <span className="text-[10px] font-bold text-[var(--accent)] bg-[var(--accent-subtle)] px-2 py-0.5 rounded-lg whitespace-nowrap">
                              {m.date}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            {/* Iterative Revision Form */}
            <div className="p-6 border-t border-[var(--border-subtle)] bg-[var(--bg-900)] shrink-0">
              <form onSubmit={handleReviseSubmit} className="space-y-4">
                <div className="flex gap-2">
                  <input
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Suggest changes (e.g., 'Make task B high priority', 'Add a QA milestone')..."
                    className="flex-1 h-10 px-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]"
                    disabled={isProcessing}
                  />
                  <button
                    type="submit"
                    disabled={isProcessing || !feedback.trim()}
                    className="px-4 bg-[var(--surface-2)] text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-all rounded-xl text-xs font-bold border border-[var(--border-subtle)] flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Revise
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onReject}
                    disabled={isProcessing}
                    className="flex-1 h-11 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                  >
                    Reject Plan
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isProcessing}
                    className="flex-[2] h-11 bg-[var(--accent)] text-white hover:opacity-90 shadow-lg shadow-[var(--accent-glow)] rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Approve & Execute
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Loader2({ className }: { className?: string }) {
  return <RefreshCw className={`${className} animate-spin`} />;
}
