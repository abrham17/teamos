"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { X, Search } from "lucide-react";
import type { CanvasNode } from "../../canvasApi";

interface EntityLinkDialogProps {
  node: CanvasNode;
  teamId: string;
  projectId: string;
  onLink: (nodeId: string, refId: string, meta: Record<string, unknown>) => void;
  onClose: () => void;
}

interface SearchResult {
  tasks?: Array<{ id: string; title: string; status: string; priority?: string }>;
  milestones?: Array<{ id: string; title: string; target_date?: string; status: string }>;
  members?: Array<{ id: string; user: { id: string; email: string; name?: string }; role: string }>;
  wiki?: Array<{ id: string; title: string }>;
}

const LINKABLE_TYPES: Record<string, string[]> = {
  task: ["task"],
  milestone: ["milestone"],
  member: ["member"],
  wiki: ["wiki"],
  trigger: [],
  output: [],
};

export function EntityLinkDialog({ node, teamId, projectId, onLink, onClose }: EntityLinkDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>({});
  const [loading, setLoading] = useState(false);
  const [selectedKind, setSelectedKind] = useState<string>("");

  const linkableKinds = LINKABLE_TYPES[node.type] || [];

  const search = useCallback(async (q: string, kind: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (kind) params.set("kind", kind);
      const data = await api.get<SearchResult>(
        `/api/planning/${teamId}/projects/${projectId}/canvas/entity-search/?${params}`,
      );
      setResults(data);
    } catch {
      setResults({});
    }
    setLoading(false);
  }, [teamId, projectId]);

  useEffect(() => {
    if (linkableKinds.length > 0) {
      setSelectedKind(linkableKinds[0]);
      search("", linkableKinds[0]);
    }
  }, [linkableKinds, search]);

  useEffect(() => {
    const timeout = setTimeout(() => search(query, selectedKind), 300);
    return () => clearTimeout(timeout);
  }, [query, selectedKind, search]);

  const handleSelect = (entity: { id: string; title?: string; name?: string; email?: string }, kind: string) => {
    const meta: Record<string, unknown> = { ...node.meta };
    if (!meta.name) meta.name = entity.title || entity.name || entity.email || "";
    onLink(node.id, entity.id, meta);
    onClose();
  };

  const handleUnlink = () => {
    onLink(node.id, "", { ...node.meta });
    onClose();
  };

  if (linkableKinds.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-[#0d0d12] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="text-[13px] text-[#a0a0b8] text-center">
            {node.type} nodes cannot be linked to entities.
          </div>
          <button onClick={onClose} className="mt-4 w-full px-3 py-2 bg-[rgba(255,255,255,0.07)] rounded-lg text-[12px] text-[#eeeef2]">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[#0d0d12] border border-[rgba(255,255,255,0.07)] rounded-xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#eeeef2]">Link {node.type} node</span>
            {node.ref_id && (
              <button onClick={handleUnlink} className="text-[10px] text-[#f87171] hover:text-[#fc8181]">
                Unlink
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-[#62627a] hover:text-[#a0a0b8]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-1.5">
            {linkableKinds.map((kind) => (
              <button
                key={kind}
                onClick={() => { setSelectedKind(kind); setQuery(""); }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  selectedKind === kind ? "bg-[#8b7ff4] text-white" : "bg-[#1a1a23] text-[#a0a0b8]"
                }`}
              >
                {kind === "task" ? "Tasks" : kind === "milestone" ? "Milestones" : kind === "member" ? "Members" : "Wiki"}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#62627a]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${selectedKind}s...`}
              className="w-full pl-8 pr-3 py-2 bg-[#13131a] border border-[rgba(255,255,255,0.07)] rounded-lg text-[12px] text-[#eeeef2] outline-none focus:border-[#8b7ff4] placeholder:text-[#62627a]"
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
            {loading && <div className="text-[11px] text-[#62627a] text-center py-4">Searching...</div>}
            {!loading && selectedKind === "task" && results.tasks?.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelect(t, "task")}
                className="w-full text-left px-3 py-2 bg-[#13131a] hover:bg-[#1a1a23] rounded-lg transition-colors"
              >
                <div className="text-[12px] font-medium text-[#eeeef2]">{t.title}</div>
                <div className="text-[9px] text-[#a0a0b8] mt-0.5">{t.status}{t.priority ? ` · ${t.priority}` : ""}</div>
              </button>
            ))}
            {!loading && selectedKind === "milestone" && results.milestones?.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSelect(m, "milestone")}
                className="w-full text-left px-3 py-2 bg-[#13131a] hover:bg-[#1a1a23] rounded-lg transition-colors"
              >
                <div className="text-[12px] font-medium text-[#eeeef2]">{m.title}</div>
                <div className="text-[9px] text-[#a0a0b8] mt-0.5">{m.status}{m.target_date ? ` · ${m.target_date}` : ""}</div>
              </button>
            ))}
            {!loading && selectedKind === "member" && results.members?.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSelect({ id: m.user.id, name: m.user.name || m.user.email }, "member")}
                className="w-full text-left px-3 py-2 bg-[#13131a] hover:bg-[#1a1a23] rounded-lg transition-colors"
              >
                <div className="text-[12px] font-medium text-[#eeeef2]">{m.user.name || m.user.email}</div>
                <div className="text-[9px] text-[#a0a0b8] mt-0.5">{m.role}</div>
              </button>
            ))}
            {!loading && selectedKind === "wiki" && results.wiki?.map((w) => (
              <button
                key={w.id}
                onClick={() => handleSelect(w, "wiki")}
                className="w-full text-left px-3 py-2 bg-[#13131a] hover:bg-[#1a1a23] rounded-lg transition-colors"
              >
                <div className="text-[12px] font-medium text-[#eeeef2]">{w.title}</div>
              </button>
            ))}
            {!loading && !results[`${selectedKind}s` as keyof SearchResult]?.length && (
              <div className="text-[11px] text-[#62627a] text-center py-4">No results found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
