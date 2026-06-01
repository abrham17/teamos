"use client";

import { useState, useEffect } from "react";
import { X, Download, Search } from "lucide-react";
import { api } from "@/lib/api";

interface CanvasTemplate {
  id: string;
  name: string;
  description: string;
  nodes: unknown[];
  edges: unknown[];
  created_at: string;
}

interface LoadTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  projectId: string;
  onApply: () => void;
}

export function LoadTemplateDialog({ isOpen, onClose, teamId, projectId, onApply }: LoadTemplateDialogProps) {
  const [templates, setTemplates] = useState<CanvasTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.get<CanvasTemplate[]>(`/api/planning/${teamId}/canvas-templates/`)
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, teamId]);

  if (!isOpen) return null;

  const filtered = query
    ? templates.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : templates;

  const handleApply = async (templateId: string) => {
    setApplying(templateId);
    try {
      await api.post(`/api/planning/${teamId}/projects/${projectId}/canvas/apply-template/${templateId}/`, {});
      onApply();
      onClose();
    } catch (err) {
      console.error("Failed to apply template:", err);
    }
    setApplying(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[#0d0d12] border border-[rgba(255,255,255,0.07)] rounded-xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[rgba(255,255,255,0.07)]">
          <span className="text-[13px] font-semibold text-[#eeeef2]">Load Canvas Template</span>
          <button onClick={onClose} className="text-[#62627a] hover:text-[#a0a0b8]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#62627a]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-8 pr-3 py-2 bg-[#13131a] border border-[rgba(255,255,255,0.07)] rounded-lg text-[12px] text-[#eeeef2] outline-none focus:border-[#8b7ff4] placeholder:text-[#62627a]"
            />
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2 custom-scrollbar">
            {loading && <div className="text-[11px] text-[#62627a] text-center py-4">Loading...</div>}
            {!loading && filtered.length === 0 && (
              <div className="text-[11px] text-[#62627a] text-center py-4">
                {templates.length === 0 ? "No templates saved yet" : "No matching templates"}
              </div>
            )}
            {filtered.map((t) => (
              <div
                key={t.id}
                className="bg-[#13131a] rounded-lg p-3 border border-[rgba(255,255,255,0.07)] flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-[#eeeef2]">{t.name}</div>
                  {t.description && (
                    <div className="text-[10px] text-[#a0a0b8] mt-0.5 truncate">{t.description}</div>
                  )}
                  <div className="text-[9px] text-[#62627a] mt-1">
                    {Array.isArray(t.nodes) ? t.nodes.length : 0} nodes · {new Date(t.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleApply(t.id)}
                  disabled={applying === t.id}
                  className="px-3 py-1.5 bg-[#8b7ff4] hover:bg-[#7c70e8] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] font-semibold rounded-lg flex items-center gap-1 shrink-0"
                >
                  <Download className="w-3 h-3" />
                  {applying === t.id ? "Applying..." : "Apply"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
