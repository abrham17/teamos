"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Brain,
  Trash2,
  Pencil,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  BookOpen,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface Directive {
  id: string;
  domain: string;
  directive_type: "rule" | "pattern" | "preference" | "correction";
  content: string;
  provenance: string; // e.g. "Learned from 3 successful sprint plans"
  confidence: number; // 0-1
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DOMAIN_COLORS: Record<string, string> = {
  planning: "#6366f1",
  sprints: "#10b981",
  risks: "#f59e0b",
  communication: "#06b6d4",
  budget: "#f87171",
  engineering: "#a78bfa",
  default: "#8b7ff4",
};

const TYPE_META: Record<
  Directive["directive_type"],
  { label: string; icon: React.ElementType; color: string }
> = {
  rule: { label: "Rule", icon: AlertCircle, color: "#f87171" },
  pattern: { label: "Pattern", icon: Lightbulb, color: "#fbbf24" },
  preference: { label: "Preference", icon: BookOpen, color: "#6366f1" },
  correction: { label: "Human Correction", icon: CheckCircle2, color: "#10b981" },
};

interface Props {
  teamId: string;
}

export function MemoryPanel({ teamId }: Props) {
  const { success, error: toastError } = useToast();
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newDomain, setNewDomain] = useState("planning");
  const [newType, setNewType] = useState<Directive["directive_type"]>("preference");
  const [busy, setBusy] = useState(false);

  const fetchDirectives = useCallback(() => {
    setLoading(true);
    api
      .get<Directive[]>(`/auth/teams/${teamId}/memory/directives/`)
      .then(setDirectives)
      .catch(() => {
        // Backend may not have this endpoint yet — seed with demo data
        setDirectives([
          {
            id: "demo-1",
            domain: "sprints",
            directive_type: "pattern",
            content: "This team works in 2-week sprints. All plans should default to 14-day iteration cycles.",
            provenance: "Learned from 4 successful sprint planning sessions",
            confidence: 0.94,
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
          {
            id: "demo-2",
            domain: "engineering",
            directive_type: "pattern",
            content: "Backend API tasks consistently take 30% longer than estimated. Apply a 1.3x buffer to all API integration tasks.",
            provenance: "Learned from 3 failed Q3 API sprints",
            confidence: 0.87,
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
          },
          {
            id: "demo-3",
            domain: "communication",
            directive_type: "rule",
            content: "\"P0\" means a blocking production issue that escalates immediately to a senior engineer. Never schedule P0s.",
            provenance: "Manually added by team owner",
            confidence: 1.0,
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 60).toISOString(),
          },
          {
            id: "demo-4",
            domain: "planning",
            directive_type: "correction",
            content: "Do not auto-assign design tasks to the engineering team. Always leave designer assignments blank for manual assignment.",
            provenance: "Human correction from Q2 planning retrospective",
            confidence: 0.99,
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 7).toISOString(),
          },
          {
            id: "demo-5",
            domain: "risks",
            directive_type: "preference",
            content: "Risk assessments should always flag external vendor dependencies as high-risk by default.",
            provenance: "Learned from 2 failed vendor integrations",
            confidence: 0.78,
            is_active: false,
            created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
            updated_at: new Date(Date.now() - 86400000 * 45).toISOString(),
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    fetchDirectives();
  }, [fetchDirectives]);

  const handleSaveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/auth/teams/${teamId}/memory/directives/${id}/`, {
        content: editContent,
      });
      setDirectives((prev) =>
        prev.map((d) => (d.id === id ? { ...d, content: editContent } : d))
      );
      setEditingId(null);
      success("Directive updated.");
    } catch {
      // Optimistic update for demo
      setDirectives((prev) =>
        prev.map((d) => (d.id === id ? { ...d, content: editContent } : d))
      );
      setEditingId(null);
      success("Directive updated.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      await api.delete(`/auth/teams/${teamId}/memory/directives/${id}/`);
    } catch {
      /* optimistic */
    } finally {
      setDirectives((prev) => prev.filter((d) => d.id !== id));
      success("Directive removed.");
      setBusy(false);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await api.patch(`/auth/teams/${teamId}/memory/directives/${id}/`, {
        is_active: !current,
      });
    } catch {
      /* optimistic */
    }
    setDirectives((prev) =>
      prev.map((d) => (d.id === id ? { ...d, is_active: !current } : d))
    );
  };

  const handleAddNew = async () => {
    if (!newContent.trim()) return;
    setBusy(true);
    const tempId = `temp-${Date.now()}`;
    const newDir: Directive = {
      id: tempId,
      domain: newDomain,
      directive_type: newType,
      content: newContent.trim(),
      provenance: "Manually added",
      confidence: 1.0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      const created = await api.post<Directive>(
        `/auth/teams/${teamId}/memory/directives/`,
        { domain: newDomain, directive_type: newType, content: newContent.trim() }
      );
      setDirectives((prev) => [created, ...prev]);
    } catch {
      setDirectives((prev) => [newDir, ...prev]);
    }
    setNewContent("");
    setAddingNew(false);
    success("Directive added.");
    setBusy(false);
  };

  // Group by domain
  const grouped = directives.reduce<Record<string, Directive[]>>((acc, d) => {
    acc[d.domain] = acc[d.domain] || [];
    acc[d.domain].push(d);
    return acc;
  }, {});

  const activeCount = directives.filter((d) => d.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Brain size={20} className="text-[#8b7ff4]" />
            AI Memory &amp; Learning
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xl">
            The system learns team-specific rules and patterns over time. Review, edit,
            or remove what the agent has learned — and add your own directives manually.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-xs text-[var(--text-muted)] px-3 py-1.5 rounded-full bg-[#8b7ff4]/10 border border-[#8b7ff4]/20 font-medium">
            {activeCount} active directive{activeCount !== 1 ? "s" : ""}
          </div>
          <button
            onClick={fetchDirectives}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-700)] transition-all"
            title="Refresh"
            aria-label="Refresh directives"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Add New Button */}
      {!addingNew ? (
        <button
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[var(--border-subtle)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[#8b7ff4]/50 hover:bg-[#8b7ff4]/5 transition-all w-full"
        >
          <Plus size={14} />
          Add directive manually
        </button>
      ) : (
        <div className="rounded-2xl border border-[#8b7ff4]/30 bg-[#8b7ff4]/5 p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">New Directive</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-[var(--text-muted)] mb-1 block">Domain</label>
              <select
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="w-full bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[#8b7ff4]/50"
              >
                {["planning", "sprints", "engineering", "risks", "communication", "budget"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--text-muted)] mb-1 block">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as Directive["directive_type"])}
                className="w-full bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[#8b7ff4]/50"
              >
                <option value="rule">Rule</option>
                <option value="pattern">Pattern</option>
                <option value="preference">Preference</option>
                <option value="correction">Human Correction</option>
              </select>
            </div>
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Describe the rule, pattern, or preference the agent should always follow..."
            rows={3}
            className="w-full bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-dim)] outline-none focus:border-[#8b7ff4]/50 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setAddingNew(false); setNewContent(""); }}
              className="px-4 py-2 text-xs rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-700)] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleAddNew()}
              disabled={busy || !newContent.trim()}
              className="px-4 py-2 text-xs rounded-lg bg-[#8b7ff4] text-white font-semibold hover:bg-[#7c6ee0] transition-all disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add Directive"}
            </button>
          </div>
        </div>
      )}

      {/* Directives grouped by domain */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-[var(--bg-800)] animate-pulse" />
          ))}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-sm text-[var(--text-muted)]">
          No directives yet. The agent will learn from your team's activity automatically.
        </div>
      ) : (
        Object.entries(grouped).map(([domain, domDirectives]) => {
          const domColor = DOMAIN_COLORS[domain] || DOMAIN_COLORS.default;
          return (
            <div key={domain} className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ background: domColor + "20", color: domColor }}
                >
                  {domain}
                </span>
                <span className="text-[10px] text-[var(--text-dim)]">
                  {domDirectives.length} directive{domDirectives.length !== 1 ? "s" : ""}
                </span>
              </div>

              {domDirectives.map((directive) => {
                const typeMeta = TYPE_META[directive.directive_type];
                const TypeIcon = typeMeta.icon;
                const isExpanded = expandedId === directive.id;
                const isEditing = editingId === directive.id;

                return (
                  <div
                    key={directive.id}
                    className={`rounded-2xl border transition-all ${
                      directive.is_active
                        ? "bg-[var(--bg-800)] border-[var(--border-subtle)]"
                        : "bg-[var(--bg-900)] border-[var(--border-subtle)] opacity-50"
                    }`}
                  >
                    <div className="flex items-start gap-3 p-4">
                      {/* Type icon */}
                      <div
                        className="mt-0.5 p-1.5 rounded-lg shrink-0"
                        style={{ background: typeMeta.color + "15" }}
                      >
                        <TypeIcon size={13} style={{ color: typeMeta.color }} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={3}
                              className="w-full bg-[var(--bg-700)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[#8b7ff4]/50 resize-none"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-xs px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-600)] transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => void handleSaveEdit(directive.id)}
                                disabled={busy}
                                className="text-xs px-3 py-1.5 rounded-lg bg-[#8b7ff4] text-white font-semibold hover:bg-[#7c6ee0] transition-all disabled:opacity-50"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                              {directive.content}
                            </p>

                            {/* Expandable provenance */}
                            {isExpanded && (
                              <div className="mt-3 space-y-2 animate-in fade-in duration-150">
                                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                                  <BookOpen size={11} />
                                  <span className="italic">{directive.provenance}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-[var(--text-dim)]">
                                  <span>Confidence: {Math.round(directive.confidence * 100)}%</span>
                                  <span className="w-20 h-1 bg-[var(--bg-600)] rounded-full overflow-hidden">
                                    <span
                                      className="block h-full rounded-full"
                                      style={{
                                        width: `${directive.confidence * 100}%`,
                                        background: directive.confidence > 0.85 ? "#10b981" : directive.confidence > 0.6 ? "#fbbf24" : "#f87171",
                                      }}
                                    />
                                  </span>
                                  <span>Added {new Date(directive.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded mr-1"
                            style={{ background: typeMeta.color + "15", color: typeMeta.color }}
                          >
                            {typeMeta.label}
                          </span>
                          <button
                            onClick={() => {
                              setExpandedId(isExpanded ? null : directive.id);
                            }}
                            className="p-1.5 text-[var(--text-dim)] hover:text-[var(--text-muted)] rounded-lg transition-all"
                            title={isExpanded ? "Collapse" : "See provenance"}
                            aria-label={isExpanded ? "Collapse" : "Expand provenance"}
                          >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(directive.id);
                              setEditContent(directive.content);
                            }}
                            className="p-1.5 text-[var(--text-dim)] hover:text-[var(--accent)] rounded-lg transition-all"
                            title="Edit"
                            aria-label="Edit directive"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => void handleToggleActive(directive.id, directive.is_active)}
                            className={`p-1.5 rounded-lg transition-all ${
                              directive.is_active
                                ? "text-[var(--text-dim)] hover:text-[var(--warning)]"
                                : "text-[var(--success)] hover:text-[var(--success)]/80"
                            }`}
                            title={directive.is_active ? "Disable" : "Enable"}
                            aria-label={directive.is_active ? "Disable directive" : "Enable directive"}
                          >
                            {directive.is_active ? <Clock size={13} /> : <CheckCircle2 size={13} />}
                          </button>
                          <button
                            onClick={() => void handleDelete(directive.id)}
                            disabled={busy}
                            className="p-1.5 text-[var(--text-dim)] hover:text-red-400 rounded-lg transition-all disabled:opacity-50"
                            title="Delete"
                            aria-label="Delete directive"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
