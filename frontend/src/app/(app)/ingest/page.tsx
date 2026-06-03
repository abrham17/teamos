"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useWikiStore } from "@/stores/useWikiStore";
import { api, extractErrorMessage, getApiAuthHeaders } from "@/lib/api";
import { 
  Upload, 
  FileText, 
  Globe, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Plus,
  ArrowRight,
  Code2,
  MessageSquare,
  HardDrive,
  Package,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { LottiePlayer } from "@/components/ui/LottiePlayer";
import { ICONSCOUT } from "@/lib/iconscoutAssets";
import { IntegrationSourcePicker } from "@/components/ingest/IntegrationSourcePicker";

interface IngestJob {
  id: string;
  source_type: string;
  source_filename?: string;
  source_url?: string;
  status: "pending" | "running" | "done" | "failed" | "review_required";
  ingest_stage?: string;
  ingest_stage_detail?: string;
  error?: string;
  auto_approve?: boolean;
  created_at: string;
}

interface Integration {
  provider: string;
  display_name: string;
  status: "connected" | "disconnected" | "error";
}

const INTEGRATION_SOURCES = [
  {
    key: "github",
    label: "GitHub",
    icon: Code2,
    placeholder: "Search repositories, e.g. teamos docs",
    helper: "Import repository URLs into the same pipeline used for crawled sources.",
  },
  {
    key: "notion",
    label: "Notion",
    icon: FileText,
    placeholder: "Search pages or databases",
    helper: "Find Notion pages you have granted to TeamOS and import their public source URL.",
  },
  {
    key: "google",
    label: "Google Drive",
    icon: HardDrive,
    placeholder: "Search Drive files",
    helper: "Search Drive by name or content, then import the selected file link.",
  },
  {
    key: "slack",
    label: "Slack",
    icon: MessageSquare,
    placeholder: "Search messages or channels",
    helper: "Search Slack results from your connected workspace.",
  },
  {
    key: "dropbox",
    label: "Dropbox",
    icon: Package,
    placeholder: "Search Dropbox files",
    helper: "Search Dropbox and import links for selected files.",
  },
] as const;

export default function IngestPage() {
  const { currentTeamId } = useWikiStore();
  const { success, error: toastError } = useToast();
  
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sourceIngesting, setSourceIngesting] = useState(false);
  const [autoApproveIngest, setAutoApproveIngest] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("file");
  
  // URL input state
  const [url, setUrl] = useState("");

  const fetchJobs = useCallback(() => {
    if (!currentTeamId) return;
    api.get<IngestJob[]>(`/ingest/${currentTeamId}/jobs/`)
      .then(setJobs)
      .catch(console.error);
  }, [currentTeamId]);

  useEffect(() => {
    if (!currentTeamId) return;
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [currentTeamId, fetchJobs]);

  useEffect(() => {
    api
      .get<Integration[]>("/api/integrations/")
      .then((data) => setIntegrations(Array.isArray(data) ? data : []))
      .catch(() => setIntegrations([]));
  }, []);

  useEffect(() => {
    if (!currentTeamId) return;
    try {
      const v = localStorage.getItem(`teamos-ingest-auto-approve-${currentTeamId}`);
      if (v === "0" || v === "false") setAutoApproveIngest(false);
      else if (v === "1" || v === "true") setAutoApproveIngest(true);
    } catch {
      /* ignore */
    }
  }, [currentTeamId]);

  const persistAutoApprove = useCallback(
    (next: boolean) => {
      setAutoApproveIngest(next);
      if (!currentTeamId) return;
      try {
        localStorage.setItem(`teamos-ingest-auto-approve-${currentTeamId}`, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [currentTeamId],
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentTeamId) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("auto_approve", autoApproveIngest ? "true" : "false");

    try {
      const auth = await getApiAuthHeaders();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/ingest/${currentTeamId}/file/`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
          headers: { ...auth },
        },
      );

      const raw = await res.text();
      let payload: unknown = raw;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = raw;
      }

      if (res.ok) {
        success("File uploaded successfully! Processing started.");
        fetchJobs();
      } else {
        toastError(extractErrorMessage(payload));
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : "An error occurred during upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !currentTeamId) return;

    setLoading(true);
    try {
      await api.post(`/ingest/${currentTeamId}/url/`, { url, auto_approve: autoApproveIngest });
      success("URL submitted! We're crawling the content.");
      setUrl("");
      fetchJobs();
    } catch {
      toastError("Failed to submit URL.");
    } finally {
      setLoading(false);
    }
  };

  const handleIntegrationImport = async (sourceUrl: string, metadata?: Record<string, unknown>) => {
    if (!sourceUrl.trim() || !currentTeamId) return;

    setSourceIngesting(true);
    try {
      await api.post(`/ingest/${currentTeamId}/url/`, {
        url: sourceUrl,
        auto_approve: autoApproveIngest,
        metadata,
      });
      success("Source submitted! Processing started.");
      fetchJobs();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to import source.");
    } finally {
      setSourceIngesting(false);
    }
  };

  const handleConnectIntegration = async (provider: string) => {
    try {
      const data = await api.post<{ authorization_url: string }>("/api/integrations/connect/", { provider });
      window.open(data.authorization_url, `oauth_${provider}`, "width=600,height=700,scrollbars=yes,resizable=yes");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to start OAuth flow.");
    }
  };

  if (!currentTeamId) return <div className="p-8">Select a team first</div>;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-950)] overflow-y-auto">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] px-6 z-20">
        <h2 className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
          <Upload className="h-5 w-5" /> Knowledge Ingestion
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={autoApproveIngest}
            onChange={(e) => persistAutoApprove(e.target.checked)}
            className="rounded border-[var(--border-subtle)]"
          />
          Auto-approve ingest (off = review required)
        </label>
      </div>

      <div className="max-w-5xl mx-auto w-full p-8 flex flex-col gap-10">
        
        {/* Intro */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Bring your data to TeamOS</h1>
          <p className="text-[var(--text-muted)] max-w-2xl">
            Upload documents or crawl websites. Our AI will analyze the content, generate semantic summaries, 
            and link them into your team&apos;s knowledge graph.
          </p>
        </div>

        {/* Input Methods */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 flex flex-col gap-6">
            
            {/* Tabs */}
            <div className="flex border-b border-[var(--border-subtle)] gap-3 overflow-x-auto">
              <button 
                onClick={() => setActiveTab("file")}
                className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${
                  activeTab === "file" ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                File Upload
                {activeTab === "file" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />}
              </button>
              <button 
                onClick={() => setActiveTab("url")}
                className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${
                  activeTab === "url" ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Crawl Website
                {activeTab === "url" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />}
              </button>
              {INTEGRATION_SOURCES.map((source) => {
                const Icon = source.icon;
                return (
                  <button
                    key={source.key}
                    onClick={() => setActiveTab(source.key)}
                    className={`flex items-center gap-1.5 pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${
                      activeTab === source.key ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {source.label}
                    {activeTab === source.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />}
                  </button>
                );
              })}
            </div>

            {/* Ingest Form */}
            <div className="bg-white/[0.02] border border-[var(--border-subtle)] rounded-2xl p-8 shadow-md backdrop-blur-md">
              {activeTab === "file" ? (
                <div className="flex flex-col items-center justify-center border border-dashed border-white/[0.08] hover:border-[var(--accent)]/50 rounded-2xl py-12 px-4 hover:bg-white/[0.01] transition-all cursor-pointer group relative">
                  <input 
                    type="file" 
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept=".md,.pdf,.docx,.txt"
                  />
                  <div className="mb-4 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                    {uploading ? (
                      <LottiePlayer
                        src={ICONSCOUT.lottie.loadingIngest}
                        width={64}
                        height={64}
                        aria-label="Uploading file"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-subtle)]">
                        <Upload className="h-8 w-8 text-[var(--accent)]" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold mb-1">
                    {uploading ? "Uploading..." : "Click or drag to upload"}
                  </h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Supports Markdown, PDF, DOCX and TXT (Max 50MB)
                  </p>
                </div>
              ) : activeTab === "url" ? (
                <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
                  <div className="relative">
                    <Globe className="absolute left-4 top-4 w-5 h-5 text-[var(--text-muted)]" />
                    <input 
                      type="url"
                      placeholder="https://docs.example.com/getting-started"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl py-3.5 pl-12 pr-4 text-[var(--text-primary)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 outline-none transition-all placeholder:text-[var(--text-dim)]"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !url.trim()}
                    className="flex items-center justify-center gap-2 py-3 bg-[var(--accent)] text-[var(--bg-950)] font-bold rounded-xl hover:shadow-[var(--shadow-glow)] hover:scale-[1.01] transition-all disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <LottiePlayer
                          src={ICONSCOUT.lottie.loadingIngest}
                          width={24}
                          height={24}
                          aria-label="Starting crawler"
                        />
                        Starting Crawler...
                      </>
                    ) : (
                      <>
                        Start Ingestion
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                (() => {
                  const source = INTEGRATION_SOURCES.find((item) => item.key === activeTab);
                  if (!source) return null;
                  const integration = integrations.find((item) => item.provider === source.key);
                  return (
                    <IntegrationSourcePicker
                      provider={source.key}
                      providerName={source.label}
                      isConnected={integration?.status === "connected"}
                      onConnect={() => handleConnectIntegration(source.key)}
                      onSelectSource={handleIntegrationImport}
                      isIngesting={sourceIngesting}
                      searchPlaceholder={source.placeholder}
                      helperText={source.helper}
                    />
                  );
                })()
              )}
            </div>
          </div>

          {/* Quick Tips */}
          <div className="bg-gradient-to-br from-[var(--bg-800)] to-[var(--bg-950)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-6 shadow-xl h-fit">
            <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--accent)]" /> Pro Tips
            </h4>
            <ul className="flex flex-col gap-4 text-sm text-[var(--text-muted)]">
              <li className="flex gap-3">
                <Plus className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                <span>Markdown files preserve formatting and internal links best.</span>
              </li>
              <li className="flex gap-3">
                <Plus className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                <span>Crawling is recursive for deep documentation sites.</span>
              </li>
              <li className="flex gap-3">
                <Plus className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                <span>Files are automatically categorized in your Graph.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Recent Jobs — live pipeline cards */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Ingestion Pipeline</h3>
            <button onClick={fetchJobs} className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Refresh
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="border border-dashed border-[var(--border-subtle)] rounded-2xl">
              <EmptyState
                compact
                illustrationSrc={ICONSCOUT.illustrations.emptyIngest}
                illustrationAlt="No ingestion jobs yet"
                title="No recent ingestion activity"
                description="Upload a file or crawl a URL to start building your team's knowledge base."
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {jobs.map((job) => (
                <IngestJobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   Pipeline stages definition
   ───────────────────────────────────────────────────── */
const PIPELINE_STAGES: { key: string; label: string; description: string; color: string }[] = [
  { key: "queued",        label: "Queued",          description: "Waiting in queue for a worker",          color: "#6b7280" },
  { key: "extracting",   label: "Extracting",       description: "Pulling text and structure from source",  color: "#3b82f6" },
  { key: "governance",   label: "Governance Review",description: "AI checking for contradictions & quality",color: "#f59e0b" },
  { key: "materializing",label: "Materializing",    description: "Writing new or updated wiki content",     color: "#8b7ff4" },
  { key: "vectorizing",  label: "Vectorizing",      description: "Encoding chunks into semantic vectors",   color: "#06b6d4" },
  { key: "graph_sync",   label: "Graph Sync",       description: "Linking knowledge into the graph",        color: "#10b981" },
  { key: "completed",    label: "Complete",         description: "All stages finished successfully",        color: "#10b981" },
];

function stageIndex(stage?: string): number {
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === stage);
  return idx === -1 ? 0 : idx;
}

function IngestJobCard({ job }: { job: IngestJob }) {
  const [expanded, setExpanded] = useState(job.status === "running" || job.status === "review_required");
  const currentIdx = stageIndex(job.ingest_stage);
  const isActive = job.status === "running" || job.status === "pending";
  const hasProblem = job.status === "failed" || job.status === "review_required";

  return (
    <div
      className={`rounded-2xl border transition-all overflow-hidden ${
        isActive
          ? "border-[var(--accent)]/30 bg-[var(--bg-800)] shadow-lg"
          : hasProblem
          ? "border-amber-500/20 bg-amber-500/5"
          : "border-[var(--border-subtle)] bg-[var(--bg-800)]"
      }`}
    >
      {/* Card header */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Source type icon */}
        <div
          className={`p-2 rounded-lg shrink-0 ${
            job.source_type === "url" || job.source_type === "youtube"
              ? "bg-blue-500/10 text-blue-400"
              : job.source_type === "pdf"
              ? "bg-red-500/10 text-red-400"
              : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {job.source_type === "url" || job.source_type === "youtube" ? (
            <Globe className="w-4 h-4" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {job.source_filename || job.source_url || "Unknown Source"}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{job.source_type}</span>
            <span className="text-[var(--text-dim)]">·</span>
            <span className="text-[10px] text-[var(--text-dim)]">{new Date(job.created_at).toLocaleString()}</span>
          </div>
        </div>

        {/* Status badge */}
        <StatusBadge status={job.status} />

        <ChevronDown
          className={`w-4 h-4 text-[var(--text-muted)] transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Expanded pipeline */}
      {expanded && (
        <div className="px-5 pb-5 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Review required conflict panel */}
          {job.status === "review_required" && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm mb-2">
                <AlertCircle className="w-4 h-4" />
                Governance Review Required
              </div>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                {job.ingest_stage_detail ||
                  "This document may contradict existing knowledge. Review the proposed changes in the Wiki changeset panel before approving."}
              </p>
              <div className="flex gap-2 mt-3">
                <button className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400 transition-all">
                  Review Changeset →
                </button>
              </div>
            </div>
          )}

          {/* Error panel */}
          {job.status === "failed" && job.error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-center gap-2 text-red-300 font-semibold text-sm mb-1">
                <AlertCircle className="w-4 h-4" /> Pipeline Failed
              </div>
              <p className="text-xs text-red-200/80 font-mono">{job.error}</p>
            </div>
          )}

          {/* Vertical pipeline */}
          <div className="relative pl-4">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isDone = idx < currentIdx || job.status === "done";
              const isCurrent = idx === currentIdx && job.status !== "done";
              const isPending = idx > currentIdx;

              return (
                <div key={stage.key} className="flex gap-4 relative">
                  {/* Connector line */}
                  {idx < PIPELINE_STAGES.length - 1 && (
                    <div
                      className="absolute left-[11px] top-[24px] bottom-0 w-[2px] transition-all duration-500"
                      style={{
                        background: isDone
                          ? stage.color
                          : "rgba(255,255,255,0.06)",
                        height: "calc(100% - 4px)",
                      }}
                    />
                  )}

                  {/* Stage dot */}
                  <div className="relative z-10 mt-[6px] shrink-0">
                    <div
                      className={`w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all duration-500 ${
                        isCurrent ? "ring-4 ring-offset-1 ring-offset-[var(--bg-800)]" : ""
                      }`}
                      style={{
                        background: isDone
                          ? stage.color
                          : isCurrent
                          ? stage.color + "40"
                          : "rgba(255,255,255,0.05)",
                        borderWidth: 2,
                        borderStyle: "solid",
                        borderColor: isDone || isCurrent ? stage.color : "rgba(255,255,255,0.08)",
                      }}
                    >
                      {isDone ? (
                        <CheckCircle2 size={11} style={{ color: "#fff" }} />
                      ) : isCurrent ? (
                        <div
                          className="w-2 h-2 rounded-full animate-pulse"
                          style={{ background: stage.color }}
                        />
                      ) : null}
                    </div>
                  </div>

                  {/* Stage label + detail */}
                  <div className={`pb-5 flex-1 ${isPending ? "opacity-30" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          isCurrent ? "text-white" : isDone ? "text-[var(--text-secondary)]" : "text-[var(--text-dim)]"
                        }`}
                      >
                        {stage.label}
                      </span>
                      {isCurrent && isActive && (
                        <span
                          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded animate-pulse"
                          style={{ background: stage.color + "25", color: stage.color }}
                        >
                          In Progress
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-dim)] mt-0.5">
                      {isCurrent && job.ingest_stage_detail ? job.ingest_stage_detail : stage.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-unused-vars */
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function StatusBadge({ status }: { status: IngestJob["status"] }) {
  const styles: Record<IngestJob["status"], string> = {
    pending: "bg-gray-500/10 text-gray-400",
    running: "bg-blue-500/10 text-blue-400 animate-pulse",
    done: "bg-[var(--success-bg)] text-[var(--success)]",
    failed: "bg-[var(--danger-bg)] text-[var(--danger)]",
    review_required: "bg-amber-500/10 text-amber-400",
  };

  const icons: Record<IngestJob["status"], ReactNode> = {
    pending: <Clock className="h-3 w-3" />,
    running: <Clock className="h-3 w-3" />,
    done: <CheckCircle2 className="h-3 w-3" />,
    failed: <AlertCircle className="h-3 w-3" />,
    review_required: <AlertCircle className="h-3 w-3" />,
  };

  const labels: Record<IngestJob["status"], string> = {
    pending: "Queued",
    running: "Running",
    done: "Done",
    failed: "Failed",
    review_required: "Review",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}
    >
      {icons[status]}
      {labels[status]}
    </span>
  );
}

