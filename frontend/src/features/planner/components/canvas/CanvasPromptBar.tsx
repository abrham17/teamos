"use client";

import { useState } from "react";

interface CanvasPromptBarProps {
  onGenerate: (prompt: string) => void;
  isLoading: boolean;
  statusText: string;
  nodeCount: number;
}

const SAMPLE_PROMPTS = [
  { label: "Product Launch Sprint", text: "Create a product launch workflow with a PM, dev lead, designer, wiki docs for brand guidelines, and tasks for landing page, backend API, and QA review." },
  { label: "RAG Knowledge Pipeline", text: "Build a knowledge ingestion pipeline with an ingest trigger, wiki pages for source docs, an AI extraction task, and a review milestone before publishing to graph." },
  { label: "Onboarding Workflow", text: "Design an employee onboarding flow with HR team member, IT member, wiki pages for policies and tools, and sequential tasks for account setup, intro meetings, and first-week review." },
];

export function CanvasPromptBar({ onGenerate, isLoading, statusText, nodeCount }: CanvasPromptBarProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = () => {
    if (!prompt.trim() || isLoading) return;
    onGenerate(prompt);
    setPrompt("");
  };

  return (
    <footer className="px-5 py-3 bg-[rgba(8,8,12,0.95)] backdrop-blur-[20px] border-t border-[rgba(255,255,255,0.07)] z-30 shrink-0">
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
          placeholder={isLoading ? statusText : "Describe your project workflow — AI will generate the canvas..."}
          className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-[#eeeef2] min-w-0 placeholder:text-[#62627a]"
        />
        <button
          onClick={handleSubmit}
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
        <span>Drag canvas to pan · Scroll to zoom · Ctrl+click multi-select · Ctrl+G group · Delete to remove · Ctrl+Z undo · Ctrl+M toggle minimap</span>
      </div>
    </footer>
  );
}
