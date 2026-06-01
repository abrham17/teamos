"use client";

import { useState } from "react";
import { Sparkles, Send, Loader2, X } from "lucide-react";
import { planAssistStream } from "../../api";
import type { CanvasNode } from "../../canvasApi";

interface NodeAIChatProps {
  node: CanvasNode;
  teamId: string;
  projectId: string;
  onClose: () => void;
}

export function NodeAIChat({ node, teamId, projectId, onClose }: NodeAIChatProps) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAsk = async () => {
    if (!query.trim() || loading) return;

    setLoading(true);
    setResponse("");
    setError("");

    const contextPrompt = buildNodeContext(node);
    const fullPrompt = `${contextPrompt}\n\nUser question: ${query}`;

    try {
      let accumulated = "";
      await planAssistStream(
        teamId,
        { prompt: fullPrompt, mode: "manage", project_id: projectId },
        {
          onStatus: (status) => {
            accumulated += status + "\n";
            setResponse(accumulated);
          },
          onDone: (data) => {
            accumulated += "\n✓ Complete";
            setResponse(accumulated);
          },
          onError: (err) => {
            setError(err);
          },
        },
      );
    } catch (err) {
      setError("Failed to get AI response");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute top-full left-0 mt-2 w-80 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--accent-subtle)]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-xs font-bold text-[var(--text-primary)]">AI Assistant</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[var(--surface-2)] rounded transition-colors"
        >
          <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="space-y-2">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAsk();
              }
            }}
            placeholder="Ask about this node..."
            className="w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] resize-none"
            rows={2}
          />
          <button
            onClick={handleAsk}
            disabled={!query.trim() || loading}
            className="w-full px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Ask AI
              </>
            )}
          </button>
        </div>

        {(response || error) && (
          <div className="space-y-2">
            {error && (
              <div className="p-2 bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-lg text-xs text-[var(--danger)]">
                {error}
              </div>
            )}
            {response && (
              <div className="p-3 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
                {response}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildNodeContext(node: CanvasNode): string {
  const meta = node.meta || {};
  let context = `Node type: ${node.type}\n`;
  context += `Node ID: ${node.id}\n`;

  if (node.ref_id) {
    context += `Reference ID: ${node.ref_id}\n`;
  }

  if (meta.name) context += `Name: ${meta.name}\n`;
  if (meta.description) context += `Description: ${meta.description}\n`;
  if (meta.status) context += `Status: ${meta.status}\n`;
  if (meta.priority) context += `Priority: ${meta.priority}\n`;
  if (meta.assignee) context += `Assignee: ${meta.assignee}\n`;
  if (meta.start_date) context += `Start Date: ${meta.start_date}\n`;
  if (meta.end_date) context += `End Date: ${meta.end_date}\n`;
  if (meta.target_date) context += `Target Date: ${meta.target_date}\n`;
  if (meta.role) context += `Role: ${meta.role}\n`;
  if (meta.email) context += `Email: ${meta.email}\n`;

  return context;
}
