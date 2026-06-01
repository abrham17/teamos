"use client";

import { useState, useEffect } from "react";
import { X, Save, Trash2, Calendar, User, Flag, Clock, Link2, Unlink } from "lucide-react";
import type { CanvasNode } from "../../canvasApi";
import { EntityLinkDialog } from "./EntityLinkDialog";

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
