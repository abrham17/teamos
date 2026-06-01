"use client";

import { useState } from "react";
import { X, Save } from "lucide-react";
import { api } from "@/lib/api";
import type { CanvasNode, CanvasEdge } from "../../canvasApi";

interface SaveTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export function SaveTemplateDialog({ isOpen, onClose, teamId, nodes, edges }: SaveTemplateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await api.post(`/api/planning/${teamId}/canvas-templates/`, {
        name: name.trim(),
        description: description.trim(),
        nodes,
        edges,
      });
      onClose();
      setName("");
      setDescription("");
    } catch (err) {
      console.error("Failed to save template:", err);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[#0d0d12] border border-[rgba(255,255,255,0.07)] rounded-xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[rgba(255,255,255,0.07)]">
          <span className="text-[13px] font-semibold text-[#eeeef2]">Save Canvas Template</span>
          <button onClick={onClose} className="text-[#62627a] hover:text-[#a0a0b8]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-wider text-[#62627a]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sprint Workflow"
              className="w-full px-3 py-2 bg-[#13131a] border border-[rgba(255,255,255,0.07)] rounded-lg text-[12px] text-[#eeeef2] outline-none focus:border-[#8b7ff4] placeholder:text-[#62627a]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-wider text-[#62627a]">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description"
              className="w-full px-3 py-2 bg-[#13131a] border border-[rgba(255,255,255,0.07)] rounded-lg text-[12px] text-[#eeeef2] outline-none focus:border-[#8b7ff4] placeholder:text-[#62627a] resize-none"
            />
          </div>
          <div className="text-[10px] text-[#62627a]">
            {nodes.length} nodes · {edges.length} edges
          </div>
        </div>
        <div className="p-4 border-t border-[rgba(255,255,255,0.07)] flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 bg-[rgba(255,255,255,0.07)] rounded-lg text-[11px] text-[#a0a0b8]">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 px-3 py-2 bg-[#8b7ff4] hover:bg-[#7c70e8] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
