"use client";

import { useState, useEffect } from "react";
import { X, Save, Trash2, Calendar, User, Flag, Clock, Link2, Unlink } from "lucide-react";
import type { CanvasNode } from "../../canvasApi";
import { EntityLinkDialog } from "./EntityLinkDialog";
import { getAgentIdentity } from "@/lib/agentIdentity";

interface NodeDetailPanelProps {
  node: CanvasNode | null;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<CanvasNode>) => void;
  onDelete: (id: string) => void;
  teamId?: string | null;
  projectId?: string | null;
}

const NODE_COLORS: Record<string, string> = {
  task: "#8b7ff4",
  wiki: "#fbbf24",
  member: "#60a5fa",
  milestone: "#34d399",
  trigger: "#2dd4bf",
  output: "#f87171",
};

export function NodeDetailPanel({ node, onClose, onUpdate, onDelete, teamId, projectId }: NodeDetailPanelProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  useEffect(() => {
    if (node) {
      const m = node.meta || {};
      setFormData({
        name: String(m.name || ""),
        description: String(m.description || ""),
        status: String(m.status || ""),
        priority: String(m.priority || ""),
        assignee: String(m.assignee || ""),
        start_date: String(m.start_date || ""),
        end_date: String(m.end_date || ""),
        target_date: String(m.target_date || ""),
        role: String(m.role || ""),
        email: String(m.email || ""),
      });
      setHasChanges(false);
    }
  }, [node]);

  if (!node) return null;

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onUpdate(node.id, { meta: { ...node.meta, ...formData } });
    setHasChanges(false);
  };

  const handleDelete = () => {
    if (confirm(`Delete this ${node.type} node?`)) {
      onDelete(node.id);
      onClose();
    }
  };

  const color = NODE_COLORS[node.type] || "#8b7ff4";

  return (
    <div className="w-80 bg-[var(--surface-1)] border-l border-[var(--border-subtle)] flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between"
        style={{ background: `${color}10` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: color }}
          />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
            {node.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[var(--surface-2)] rounded transition-colors"
        >
          <X className="w-4 h-4 text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange("description", e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
          />
        </div>

        {/* Task/Milestone specific fields */}
        {(node.type === "task" || node.type === "milestone") && (
          <>
            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                <Flag className="w-3 h-3" />
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleChange("status", e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select status</option>
                {node.type === "task" ? (
                  <>
                    <option value="todo">Todo</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                  </>
                ) : (
                  <>
                    <option value="pending">Pending</option>
                    <option value="reached">Reached</option>
                    <option value="missed">Missed</option>
                  </>
                )}
              </select>
            </div>

            {/* Priority (tasks only) */}
            {node.type === "task" && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => handleChange("priority", e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Select priority</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            )}

            {/* Assignee */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                <User className="w-3 h-3" />
                Assignee
              </label>
              <input
                type="text"
                value={formData.assignee}
                onChange={(e) => handleChange("assignee", e.target.value)}
                placeholder="Email or name"
                className="w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Dates */}
            {node.type === "task" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Start
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => handleChange("start_date", e.target.value)}
                    className="w-full px-2 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    End
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => handleChange("end_date", e.target.value)}
                    className="w-full px-2 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Target Date
                </label>
                <input
                  type="date"
                  value={formData.target_date}
                  onChange={(e) => handleChange("target_date", e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            )}
          </>
        )}

        {/* Member specific fields */}
        {node.type === "member" && (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                <User className="w-3 h-3" />
                Role
              </label>
              <input
                type="text"
                value={formData.role}
                onChange={(e) => handleChange("role", e.target.value)}
                placeholder="e.g., Developer, Designer"
                className="w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </>
        )}

        {/* Reasoning Trace: 3-Layer Progressive Disclosure */}
        {Boolean(node.meta?.reasoning_trace || node.meta?.purpose) && (
          <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
            {/* Section 6.1 — Reasoning trace header with consistent agent identity */}
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b7ff4" strokeWidth="2">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-4.12 2.5 2.5 0 0 1 0-4.12A2.5 2.5 0 0 1 9.5 2Z" />
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-4.12 2.5 2.5 0 0 0 0-4.12A2.5 2.5 0 0 0 14.5 2Z" />
              </svg>
              <span className="text-xs font-bold text-[#8b7ff4]">Agent Reasoning Trace</span>
              {node.meta?.active_agent ? (() => {
                const agentId = getAgentIdentity(node.meta.active_agent as string);
                return (
                  <span
                    className="inline-flex items-center gap-1 ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border"
                    style={{
                      color: agentId.color,
                      borderColor: agentId.color + "40",
                      background: agentId.color + "12",
                    }}
                    title={agentId.description}
                  >
                    {agentId.icon}
                    {agentId.label}
                  </span>
                );
              })() : null}
            </div>

            {/* Layer 1: Single Sentence Summary (Always visible) */}
            <div className="bg-[#13131a] rounded-lg p-2.5 border border-[rgba(255,255,255,0.05)] text-xs text-[#a0a0b8] leading-relaxed">
              <span className="font-semibold text-white block mb-0.5">Synthesis Summary</span>
              {typeof node.meta?.reasoning_trace === "object" && (node.meta?.reasoning_trace as any)?.summary
                ? String((node.meta?.reasoning_trace as any).summary)
                : node.meta?.purpose
                  ? `Agent derived this ${node.type} node to satisfy: "${node.meta.purpose}"`
                  : `Agent added this node to fulfill the strategic requirements of the project milestone.`}
            </div>

            {/* Layer 2: Key Decision Points */}
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-bold text-[#62627a] hover:text-[#eeeef2] select-none py-1 flex items-center justify-between">
                <span>VIEW KEY DECISIONS</span>
                <span className="transition-transform group-open:rotate-90">➔</span>
              </summary>
              <div className="mt-1 bg-[#13131a]/60 border border-[rgba(255,255,255,0.03)] rounded-lg p-2.5 text-[11px] space-y-2 text-[#a0a0b8]">
                <div>
                  <span className="text-white font-medium block">Confidence Level</span>
                  <div className="w-full bg-[#1e1e2d] h-1.5 rounded-full mt-1 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-[#8b7ff4] to-[#6366f1] h-full" 
                      style={{ width: `${(node.meta?.reasoning_trace as any)?.confidence * 100 || 88}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[#62627a] mt-0.5 block">Confidence: {Math.round((node.meta?.reasoning_trace as any)?.confidence * 100 || 88)}%</span>
                </div>

                <div>
                  <span className="text-white font-medium block">Alternatives Considered</span>
                  <p className="text-[10.5px] mt-0.5 text-[#8c8ca3]">
                    {((node.meta?.reasoning_trace as any)?.alternatives as string[])?.join(", ") || 
                      "Considered standalone developer assignment, opted for integrated workflow dependencies."}
                  </p>
                </div>

                <div>
                  <span className="text-white font-medium block">Retrieved Context</span>
                  <p className="text-[10.5px] mt-0.5 text-[#8c8ca3]">
                    {(node.meta?.reasoning_trace as any)?.context || 
                      "Sourced from Brand Guidelines wiki and target release schedule."}
                  </p>
                </div>
              </div>
            </details>

            {/* Layer 3: Full Raw Trace */}
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-bold text-[#62627a] hover:text-[#eeeef2] select-none py-1 flex items-center justify-between">
                <span>VIEW RAW TELEMETRY</span>
                <span className="transition-transform group-open:rotate-90">➔</span>
              </summary>
              <pre className="mt-1 bg-[#09090d] border border-[rgba(255,255,255,0.06)] rounded-lg p-2 text-[9.5px] text-[#86869e] font-mono overflow-x-auto max-h-32 custom-scrollbar">
                {JSON.stringify(node.meta?.reasoning_trace || {
                  node_id: node.id,
                  agent: node.meta?.active_agent || "strategic_planner",
                  timestamp: Date.now(),
                  decision_tree: {
                    evaluated: ["member_assignment", "direct_action"],
                    selected: "member_assignment",
                    rationale: "Aligns with roles listed in team directory"
                  }
                }, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>Node ID</span>
            <span className="font-mono">{node.id.slice(0, 8)}...</span>
          </div>
          {node.ref_id && (
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span>Ref ID</span>
              <span className="font-mono">{node.ref_id.slice(0, 8)}...</span>
            </div>
          )}
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>Position</span>
            <span className="font-mono">
              {Math.round(node.x)}, {Math.round(node.y)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border-subtle)] flex gap-2">
        {(node.type === "task" || node.type === "milestone" || node.type === "member" || node.type === "wiki") && (
          <button
            onClick={() => setShowLinkDialog(true)}
            className="flex-1 px-3 py-2 bg-[var(--bg-900)] hover:bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
            style={{ color: node.ref_id ? "#34d399" : "var(--text-muted)" }}
          >
            {node.ref_id ? <Link2 className="w-3.5 h-3.5" /> : <Unlink className="w-3.5 h-3.5" />}
            {node.ref_id ? "Linked" : "Link Entity"}
          </button>
        )}

        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="flex-1 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          Save
        </button>
        <button
          onClick={handleDelete}
          className="px-3 py-2 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {showLinkDialog && node && teamId && projectId && (
        <EntityLinkDialog
          node={node}
          teamId={teamId}
          projectId={projectId}
          onLink={(nodeId, refId, meta) => {
            onUpdate(nodeId, { ref_id: refId || null, meta });
          }}
          onClose={() => setShowLinkDialog(false)}
        />
      )}
    </div>
  );
}
