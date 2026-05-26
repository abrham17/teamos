"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Brain,
  BookOpen,
  Layers,
  GitCompare,
  Copy,
  Check,
  ExternalLink,
  Search,
  Tag,
  AlertTriangle,
} from "lucide-react";

interface WikiSnippet {
  source: string;
  content: string;
  score: number;
  page_id?: string;
  page_url?: string;
  match?: string;
}

interface DomainContext {
  domain: string;
  sub_domain: string;
  expert_persona: string;
  vocabulary: string[];
  constraints: string[];
  dependency_patterns?: string[];
}

interface StrategyComparison {
  fast_track: { tasks: number; duration_days: number; description?: string };
  risk_mitigated: { tasks: number; duration_days: number; description?: string };
  selected: string;
  justification: string;
}

interface ReasoningPanelProps {
  thoughtProcess?: string;
  wikiSnippets?: WikiSnippet[];
  domainContext?: DomainContext | null;
  strategyComparison?: StrategyComparison | null;
  isStreaming?: boolean;
}

type TabId = "thought" | "wiki" | "domain" | "strategy";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: "thought", label: "Thought Process", icon: <Brain className="h-3.5 w-3.5" /> },
  { id: "wiki", label: "Wiki Sources", icon: <BookOpen className="h-3.5 w-3.5" /> },
  { id: "domain", label: "Domain Context", icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "strategy", label: "Strategy", icon: <GitCompare className="h-3.5 w-3.5" /> },
];

export function ReasoningPanel({
  thoughtProcess,
  wikiSnippets,
  domainContext,
  strategyComparison,
  isStreaming = false,
}: ReasoningPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("thought");
  const [copied, setCopied] = useState(false);

  const hasContent = thoughtProcess || wikiSnippets?.length || domainContext || strategyComparison;
  if (!hasContent) return null;

  const availableTabs = TABS.filter((tab) => {
    switch (tab.id) {
      case "thought":
        return !!thoughtProcess;
      case "wiki":
        return !!wikiSnippets?.length;
      case "domain":
        return !!domainContext;
      case "strategy":
        return !!strategyComparison;
      default:
        return false;
    }
  });

  if (availableTabs.length === 0) return null;

  const handleCopy = () => {
    if (thoughtProcess) {
      navigator.clipboard.writeText(thoughtProcess);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatScore = (score: number) => {
    return score.toFixed(2);
  };

  const getMatchBadge = (match?: string) => {
    switch (match) {
      case "semantic":
        return "Semantic";
      case "keyword":
        return "Keyword";
      case "graph":
        return "Graph";
      case "hyde":
        return "HyDE";
      default:
        return match;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "text-[var(--success)]";
    if (score >= 0.5) return "text-[var(--warning)]";
    return "text-[var(--text-muted)]";
  };

  return (
    <div className="mt-3 w-full">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-950)]/70 shadow-none overflow-hidden">
        {/* Tab Bar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-1)]/50 overflow-x-auto">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]/50 border border-transparent"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}

          {/* Copy button for thought process */}
          {activeTab === "thought" && thoughtProcess && (
            <button
              onClick={handleCopy}
              className="ml-auto flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]/50 transition-all"
              title="Copy to clipboard"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-[var(--success)]" />
                  <span className="text-[var(--success)]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-4 min-h-[120px] max-h-[400px] overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {/* Thought Process Tab */}
            {activeTab === "thought" && thoughtProcess && (
              <motion.div
                key="thought"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Brain className={`h-4 w-4 ${isStreaming ? "text-[var(--accent)] animate-pulse" : "text-[var(--text-dim)]"}`} />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    {isStreaming ? "Thinking..." : "Thought Process"}
                  </span>
                  {isStreaming && (
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />
                  )}
                </div>
                <div className="pl-4 border-l-2 border-[var(--border-subtle)]">
                  <p className="text-[12px] leading-relaxed text-[var(--text-dim)] whitespace-pre-wrap font-sans italic select-none">
                    {thoughtProcess}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Wiki Sources Tab */}
            {activeTab === "wiki" && wikiSnippets && wikiSnippets.length > 0 && (
              <motion.div
                key="wiki"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Search className="h-4 w-4 text-[var(--accent)]" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    Wiki Sources ({wikiSnippets.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {wikiSnippets.map((snippet, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 p-3 hover:bg-[var(--surface-1)] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <BookOpen className="h-3.5 w-3.5 text-[var(--text-dim)] shrink-0" />
                          <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                            {snippet.source}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {snippet.match && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)]">
                              {getMatchBadge(snippet.match)}
                            </span>
                          )}
                          <span className={`text-[11px] font-mono font-bold ${getScoreColor(snippet.score)}`}>
                            {formatScore(snippet.score)}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-3 mb-2">
                        {snippet.content}
                      </p>
                      {snippet.page_url && (
                        <a
                          href={snippet.page_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--accent)] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open page
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Domain Context Tab */}
            {activeTab === "domain" && domainContext && (
              <motion.div
                key="domain"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="h-4 w-4 text-[var(--accent)]" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    Domain Context
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Domain & Sub-domain */}
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span className="text-[11px] font-bold text-[var(--text-primary)]">
                        {domainContext.domain} / {domainContext.sub_domain}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {domainContext.expert_persona}
                    </p>
                  </div>

                  {/* Vocabulary */}
                  {domainContext.vocabulary.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
                        Task Vocabulary
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {domainContext.vocabulary.slice(0, 20).map((word, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-2 py-1 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20"
                          >
                            {word}
                          </span>
                        ))}
                        {domainContext.vocabulary.length > 20 && (
                          <span className="text-[10px] px-2 py-1 text-[var(--text-dim)]">
                            +{domainContext.vocabulary.length - 20} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Constraints */}
                  {domainContext.constraints.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
                        Domain Constraints
                      </p>
                      <div className="space-y-1.5">
                        {domainContext.constraints.map((constraint, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--warning)] mt-0.5" />
                            {constraint}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dependency Patterns */}
                  {domainContext.dependency_patterns && domainContext.dependency_patterns.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
                        Dependency Patterns
                      </p>
                      <div className="space-y-1.5">
                        {domainContext.dependency_patterns.map((pattern, idx) => (
                          <div
                            key={idx}
                            className="text-[11px] text-[var(--text-secondary)] pl-4 border-l-2 border-[var(--border-subtle)]"
                          >
                            {pattern}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Strategy Comparison Tab */}
            {activeTab === "strategy" && strategyComparison && (
              <motion.div
                key="strategy"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <GitCompare className="h-4 w-4 text-[var(--accent)]" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    Strategy Comparison
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* Fast Track */}
                  <div
                    className={`rounded-xl border p-3 ${
                      strategyComparison.selected === "fast_track"
                        ? "border-[var(--accent)] bg-[var(--accent)]/5"
                        : "border-[var(--border-subtle)] bg-[var(--surface-1)]/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          strategyComparison.selected === "fast_track"
                            ? "bg-[var(--accent)]"
                            : "bg-[var(--border-strong)]"
                        }`}
                      />
                      <span className="text-[11px] font-bold text-[var(--text-primary)]">
                        Fast Track
                      </span>
                      {strategyComparison.selected === "fast_track" && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-[10px] text-[var(--text-muted)]">
                      <div className="flex justify-between">
                        <span>Tasks</span>
                        <span className="text-[var(--text-primary)] font-medium">
                          {strategyComparison.fast_track.tasks}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Duration</span>
                        <span className="text-[var(--text-primary)] font-medium">
                          {strategyComparison.fast_track.duration_days} days
                        </span>
                      </div>
                    </div>
                    {strategyComparison.fast_track.description && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                        {strategyComparison.fast_track.description}
                      </p>
                    )}
                  </div>

                  {/* Risk Mitigated */}
                  <div
                    className={`rounded-xl border p-3 ${
                      strategyComparison.selected === "risk_mitigated"
                        ? "border-[var(--accent)] bg-[var(--accent)]/5"
                        : "border-[var(--border-subtle)] bg-[var(--surface-1)]/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          strategyComparison.selected === "risk_mitigated"
                            ? "bg-[var(--accent)]"
                            : "bg-[var(--border-strong)]"
                        }`}
                      />
                      <span className="text-[11px] font-bold text-[var(--text-primary)]">
                        Risk Mitigated
                      </span>
                      {strategyComparison.selected === "risk_mitigated" && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-[10px] text-[var(--text-muted)]">
                      <div className="flex justify-between">
                        <span>Tasks</span>
                        <span className="text-[var(--text-primary)] font-medium">
                          {strategyComparison.risk_mitigated.tasks}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Duration</span>
                        <span className="text-[var(--text-primary)] font-medium">
                          {strategyComparison.risk_mitigated.duration_days} days
                        </span>
                      </div>
                    </div>
                    {strategyComparison.risk_mitigated.description && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                        {strategyComparison.risk_mitigated.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Justification */}
                {strategyComparison.justification && (
                  <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] mb-1">
                      Selection Justification
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {strategyComparison.justification}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
