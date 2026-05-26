"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  AlertCircle,
  Shield,
  FileText,
  Calendar,
  Users,
  Link2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { riskColor } from "./utils";

interface Task {
  id: string;
  title: string;
  description: string;
  status?: string;
  priority?: string;
  startDate?: string;
  endDate?: string;
  assignee_id?: string;
  reasoning?: string;
  wikiReferences?: string[];
  dependency_ids?: string[];
}

interface Milestone {
  id: string;
  title: string;
  date?: string;
  description?: string;
  status?: string;
}

interface PlanPreviewData {
  projectName: string;
  description: string;
  tasks: unknown[];
  milestones: unknown[];
  risk?: { score: number; factors: string[]; suggestions: string[] };
  knowledgeGaps?: string[];
  critiqueScore?: number;
  wikiPageUrl?: string;
  domain?: string;
  subDomain?: string;
}

interface PlanPreviewPanelProps {
  plan: PlanPreviewData;
  onApprove: () => void;
  onReject: () => void;
  onRevise: (feedback: string) => void;
  isProcessing: boolean;
}

export function PlanPreviewPanel({
  plan,
  onApprove,
  onReject,
  onRevise,
  isProcessing,
}: PlanPreviewPanelProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>("tasks");
  const [reviseFeedback, setReviseFeedback] = useState("");
  const [showReviseInput, setShowReviseInput] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "text-[var(--danger)] bg-[var(--danger)]/10";
      case "medium":
        return "text-[var(--warning)] bg-[var(--warning)]/10";
      case "low":
        return "text-[var(--success)] bg-[var(--success)]/10";
      default:
        return "text-[var(--text-muted)] bg-[var(--border-subtle)]";
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "done":
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />;
      case "in_progress":
        return <AlertCircle className="h-3.5 w-3.5 text-[var(--accent)]" />;
      default:
        return <div className="h-3.5 w-3.5 rounded-full border-2 border-[var(--border-strong)]" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mt-3 w-full"
    >
      <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--bg-950)]/80 shadow-none overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--accent)]/5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)]/20">
              <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] truncate">
                {plan.projectName}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {plan.tasks.length} tasks · {plan.milestones.length} milestones
                {plan.domain && ` · ${plan.domain}`}
              </p>
            </div>
            {plan.wikiPageUrl && (
              <a
                href={plan.wikiPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] hover:underline"
              >
                <FileText className="h-3 w-3" /> Wiki
              </a>
            )}
          </div>
        </div>

        {/* Description */}
        {plan.description && (
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
              {plan.description}
            </p>
          </div>
        )}

        {/* Stats Bar */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-1)]/50">
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-base font-black text-[var(--text-primary)]">{plan.tasks.length}</div>
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-base font-black text-[var(--text-primary)]">{plan.milestones.length}</div>
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">Milestones</div>
            </div>
            <div className="text-center">
              <div className={`text-base font-black ${plan.critiqueScore != null ? "text-[var(--text-primary)]" : "text-[var(--text-dim)]"}`}>
                {plan.critiqueScore != null ? `${plan.critiqueScore}/10` : "-"}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">Critique</div>
            </div>
            <div className="text-center">
              {plan.risk ? (
                <>
                  <div className={`text-base font-black ${riskColor(plan.risk.score)}`}>
                    {plan.risk.score}/100
                  </div>
                  <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">Risk</div>
                </>
              ) : (
                <>
                  <div className="text-base font-black text-[var(--text-dim)]">-</div>
                  <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">Risk</div>
                </>
              )}
            </div>
          </div>

          {/* Risk Bar */}
          {plan.risk && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                <div
                  className={`h-full rounded-full ${
                    plan.risk.score <= 30 ? "bg-[var(--success)]" :
                    plan.risk.score <= 60 ? "bg-[var(--warning)]" : "bg-[var(--danger)]"
                  }`}
                  style={{ width: `${plan.risk.score}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Expandable Sections */}
        <div className="divide-y divide-[var(--border-subtle)]">
          {/* Tasks Section */}
          <div>
            <button
              onClick={() => toggleSection("tasks")}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--surface-1)]/50 transition-colors"
            >
              {expandedSection === "tasks" ? (
                <ChevronUp className="h-4 w-4 text-[var(--text-dim)]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[var(--text-dim)]" />
              )}
              <span className="text-[12px] font-bold text-[var(--text-primary)]">Tasks</span>
              <span className="text-[10px] text-[var(--text-muted)]">({plan.tasks.length})</span>
            </button>

            <AnimatePresence>
              {expandedSection === "tasks" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-3 space-y-2">
                    {(plan.tasks as Task[]).map((task, idx) => (
                      <div
                        key={String((task as unknown as Record<string, unknown>).id ?? idx)}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 p-3"
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">
                            {getStatusIcon(task.status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] font-medium text-[var(--text-primary)]">
                                {task.title}
                              </span>
                              {task.priority && (
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${getPriorityColor(task.priority)}`}>
                                  {task.priority}
                                </span>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-dim)]">
                              {task.startDate && task.endDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(task.startDate)} → {formatDate(task.endDate)}
                                </span>
                              )}
                              {task.assignee_id && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  Assigned
                                </span>
                              )}
                              {task.wikiReferences && task.wikiReferences.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Link2 className="h-3 w-3" />
                                  {task.wikiReferences.length} refs
                                </span>
                              )}
                              {task.dependency_ids && task.dependency_ids.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {task.dependency_ids.length} deps
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Milestones Section */}
          {plan.milestones.length > 0 && (
            <div>
              <button
                onClick={() => toggleSection("milestones")}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--surface-1)]/50 transition-colors"
              >
                {expandedSection === "milestones" ? (
                  <ChevronUp className="h-4 w-4 text-[var(--text-dim)]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[var(--text-dim)]" />
                )}
                <span className="text-[12px] font-bold text-[var(--text-primary)]">Milestones</span>
                <span className="text-[10px] text-[var(--text-muted)]">({plan.milestones.length})</span>
              </button>

              <AnimatePresence>
                {expandedSection === "milestones" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 space-y-2">
                      {(plan.milestones as Milestone[]).map((milestone, idx) => (
                        <div
                          key={String((milestone as unknown as Record<string, unknown>).id ?? idx)}
                          className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                            <div className="flex-1">
                              <span className="text-[12px] font-medium text-[var(--text-primary)]">
                                {milestone.title}
                              </span>
                              {milestone.date && (
                                <span className="text-[10px] text-[var(--text-muted)] ml-2">
                                  {formatDate(milestone.date)}
                                </span>
                              )}
                            </div>
                          </div>
                          {milestone.description && (
                            <p className="text-[11px] text-[var(--text-muted)] mt-1 ml-4">
                              {milestone.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Risk & Suggestions Section */}
          {plan.risk && plan.risk.suggestions.length > 0 && (
            <div>
              <button
                onClick={() => toggleSection("risk")}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--surface-1)]/50 transition-colors"
              >
                {expandedSection === "risk" ? (
                  <ChevronUp className="h-4 w-4 text-[var(--text-dim)]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[var(--text-dim)]" />
                )}
                <span className="text-[12px] font-bold text-[var(--text-primary)]">Risk & Mitigations</span>
              </button>

              <AnimatePresence>
                {expandedSection === "risk" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 space-y-2">
                      {plan.risk.suggestions.slice(0, 5).map((suggestion, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
                          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Knowledge Gaps Section */}
          {plan.knowledgeGaps && plan.knowledgeGaps.length > 0 && (
            <div>
              <button
                onClick={() => toggleSection("gaps")}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--surface-1)]/50 transition-colors"
              >
                {expandedSection === "gaps" ? (
                  <ChevronUp className="h-4 w-4 text-[var(--text-dim)]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[var(--text-dim)]" />
                )}
                <span className="text-[12px] font-bold text-[var(--text-primary)]">Knowledge Gaps</span>
                <span className="text-[10px] text-[var(--warning)]">({plan.knowledgeGaps.length})</span>
              </button>

              <AnimatePresence>
                {expandedSection === "gaps" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 space-y-1.5">
                      {plan.knowledgeGaps.slice(0, 5).map((gap, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-[var(--warning)]/20 bg-[var(--warning)]/5 px-3 py-2 text-[11px] text-[var(--warning)]"
                        >
                          {gap}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-1)]/50">
          <div className="flex gap-2">
            <button
              onClick={onApprove}
              disabled={isProcessing}
              className="flex-1 flex h-9 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-[12px] font-bold text-[var(--bg-950)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve & Apply
            </button>
            <button
              onClick={() => setShowReviseInput(!showReviseInput)}
              disabled={isProcessing}
              className="flex h-9 px-4 items-center justify-center gap-2 rounded-xl bg-[var(--surface-2)] text-[12px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)] transition-all hover:bg-[var(--surface-3)] disabled:opacity-50"
            >
              Revise
            </button>
            <button
              onClick={onReject}
              disabled={isProcessing}
              className="flex h-9 px-4 items-center justify-center gap-2 rounded-xl bg-[var(--danger)]/10 text-[12px] font-bold text-[var(--danger)] border border-[var(--danger)]/20 transition-all hover:bg-[var(--danger)]/20 disabled:opacity-50"
            >
              Reject
            </button>
          </div>

          {/* Revise Feedback Input */}
          <AnimatePresence>
            {showReviseInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mt-3"
              >
                <div className="space-y-2">
                  <textarea
                    value={reviseFeedback}
                    onChange={(e) => setReviseFeedback(e.target.value)}
                    placeholder="Describe what needs to be changed..."
                    className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-3 text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 transition-all resize-none shadow-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (reviseFeedback.trim()) {
                          onRevise(reviseFeedback);
                          setReviseFeedback("");
                          setShowReviseInput(false);
                        }
                      }}
                      disabled={!reviseFeedback.trim() || isProcessing}
                      className="flex-1 h-8 rounded-lg bg-[var(--accent)] text-[11px] font-bold text-[var(--bg-950)] disabled:opacity-50"
                    >
                      Submit Revision Request
                    </button>
                    <button
                      onClick={() => {
                        setShowReviseInput(false);
                        setReviseFeedback("");
                      }}
                      className="h-8 px-3 rounded-lg bg-[var(--surface-2)] text-[11px] font-bold text-[var(--text-muted)] border border-[var(--border-subtle)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
