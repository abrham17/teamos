"use client";

import { useState } from "react";

interface CanvasPromptBarProps {
  onGenerate: (prompt: string, contextNodeIds?: string[]) => void;
  isLoading: boolean;
  statusText: string;
  nodeCount: number;
  selectedNodes?: Array<{ id: string; type: string; meta?: any }>;
}

const SAMPLE_PROMPTS = [
  { label: "Product Launch Sprint", text: "Create a product launch workflow with a PM, dev lead, designer, wiki docs for brand guidelines, and tasks for landing page, backend API, and QA review." },
  { label: "RAG Knowledge Pipeline", text: "Build a knowledge ingestion pipeline with an ingest trigger, wiki pages for source docs, an AI extraction task, and a review milestone before publishing to graph." },
  { label: "Onboarding Workflow", text: "Design an employee onboarding flow with HR team member, IT member, wiki pages for policies and tools, and sequential tasks for account setup, intro meetings, and first-week review." },
];

export function CanvasPromptBar({
  onGenerate,
  isLoading,
  statusText,
  nodeCount,
  selectedNodes = [],
}: CanvasPromptBarProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (overridePrompt?: string) => {
    const textToSend = overridePrompt || prompt;
    if (!textToSend.trim() || isLoading) return;
    
    // Pass selected node IDs as contextual scope
    onGenerate(textToSend, selectedNodes.map(n => n.id));
    if (!overridePrompt) {
      setPrompt("");
    }
  };

  const handleChipAction = (action: string) => {
    if (selectedNodes.length > 0) {
      const selectedNames = selectedNodes.map(n => n.meta?.name || n.type).join(", ");
      handleSubmit(`${action} for selected nodes: ${selectedNames}`);
    } else {
      handleSubmit(`${action} for the entire plan canvas`);
    }
  };

  return (
    <footer className="px-5 py-3 bg-[rgba(8,8,12,0.95)] backdrop-blur-[20px] border-t border-[rgba(255,255,255,0.07)] z-30 shrink-0">
      {/* Context Action Chips (Resolve conflicts, Assess risks, Verify dependencies) */}
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        {selectedNodes.length > 0 && (
          <div className="text-[10px] bg-[#8b7ff4]/10 border border-[#8b7ff4]/30 rounded-lg px-2.5 py-1 text-[#8b7ff4] flex items-center gap-1.5 font-semibold mr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8b7ff4] animate-pulse" />
            {selectedNodes.length} selected ({selectedNodes[0].meta?.name || selectedNodes[0].type})
          </div>
        )}

        <button
          onClick={() => handleChipAction("Assess risks & dependencies")}
          disabled={isLoading}
          className="bg-[#181824] hover:bg-[#252538] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1 cursor-pointer text-[#eeeef2] text-[10px] font-bold transition-all flex items-center gap-1 disabled:opacity-40"
        >
          🛡️ Assess risks
        </button>

        <button
          onClick={() => handleChipAction("Resolve schedule conflicts")}
          disabled={isLoading}
          className="bg-[#181824] hover:bg-[#252538] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1 cursor-pointer text-[#eeeef2] text-[10px] font-bold transition-all flex items-center gap-1 disabled:opacity-40"
        >
          ⚡ Resolve conflicts
        </button>

        {nodeCount > 0 && (
          <button
            onClick={() => handleChipAction("Simulate execution paths")}
            disabled={isLoading}
            className="bg-[#181824] hover:bg-[#252538] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1 cursor-pointer text-[#eeeef2] text-[10px] font-bold transition-all flex items-center gap-1 disabled:opacity-40"
          >
            📊 Simulate paths
          </button>
        )}
      </div>

      {nodeCount === 0 && !isLoading && (
        <div className="flex gap-2 mb-2.5 flex-wrap">
          {SAMPLE_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => setPrompt(p.text)}
              className="bg-[#13131a] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-1.5 cursor-pointer text-[#a0a0b8] text-[11px] hover:bg-[#1a1a23]"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2.5 bg-[#0d0d12] border border-[rgba(255,255,255,0.12)] rounded-full px-4 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b7ff4" strokeWidth="1.5">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={isLoading}
          placeholder={isLoading ? statusText : selectedNodes.length > 0 ? `Apply change to selected nodes (e.g. "expand into subtasks")...` : "Describe your project workflow — AI will generate the canvas..."}
          className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-[#eeeef2] min-w-0 placeholder:text-[#62627a]"
        />
        <button
          onClick={() => handleSubmit()}
          disabled={isLoading || !prompt.trim()}
          className="border-none rounded-full px-4 py-1.5 cursor-pointer text-white text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: isLoading
              ? "#1a1a23"
              : "linear-gradient(135deg, #8b7ff4, #6366f1)",
          }}
        >
          {isLoading ? statusText : "Generate"}
        </button>
      </div>

      <div className="mt-2 flex gap-4 text-[10px] text-[#62627a] pl-1">
        <span>Right-click for menu · Ctrl+click multi-select · Ctrl+G group · Ctrl+D duplicate · Ctrl+L auto-layout · Delete to remove · Ctrl+Z undo · Ctrl+M minimap</span>
      </div>
    </footer>
  );
}
