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
  ArrowRight
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";

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

export default function IngestPage() {
  const { currentTeamId } = useWikiStore();
  const { success, error: toastError } = useToast();
  
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autoApproveIngest, setAutoApproveIngest] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<"file" | "url">("file");
  
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

  if (!currentTeamId) return <div className="p-8">Select a team first</div>;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-900)] overflow-y-auto">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-6">
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
            <div className="flex border-b border-[var(--border-subtle)] gap-6">
              <button 
                onClick={() => setActiveTab("file")}
                className={`pb-3 text-sm font-medium transition-colors relative ${
                  activeTab === "file" ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                File Upload
                {activeTab === "file" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />}
              </button>
              <button 
                onClick={() => setActiveTab("url")}
                className={`pb-3 text-sm font-medium transition-colors relative ${
                  activeTab === "url" ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Crawl Website
                {activeTab === "url" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)]" />}
              </button>
            </div>

            {/* Ingest Form */}
            <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl p-8 shadow-sm">
              {activeTab === "file" ? (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--border-strong)] rounded-xl py-12 px-4 hover:border-[var(--accent)] transition-colors cursor-pointer group relative">
                  <input 
                    type="file" 
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept=".md,.pdf,.docx,.txt"
                  />
                  <div className="w-16 h-16 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8 text-[var(--accent)]" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">
                    {uploading ? "Uploading..." : "Click or drag to upload"}
                  </h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Supports Markdown, PDF, DOCX and TXT (Max 50MB)
                  </p>
                </div>
              ) : (
                <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
                  <div className="relative">
                    <Globe className="absolute left-4 top-4 w-5 h-5 text-[var(--text-muted)]" />
                    <input 
                      type="url"
                      placeholder="https://docs.example.com/getting-started"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      className="w-full bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-xl py-3.5 pl-12 pr-4 text-[var(--text-primary)] focus:border-[var(--accent)] outline-none transition-colors"
                      required
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={loading || !url.trim()}
                    className="flex items-center justify-center gap-2 py-3 bg-[var(--accent)] text-[var(--bg-950)] font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {loading ? "Starting Crawler..." : "Start Ingestion"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
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

        {/* Recent Jobs */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Ingestion History</h3>
            <button onClick={fetchJobs} className="text-xs text-[var(--accent)] hover:underline">Refresh List</button>
          </div>
          
          {jobs.length === 0 ? (
            <div className="py-12 border border-dashed border-[var(--border-subtle)] rounded-2xl flex flex-col items-center justify-center text-[var(--text-muted)]">
              <Clock className="w-8 h-8 mb-2 opacity-20" />
              <p>No recent ingestion activity</p>
            </div>
          ) : (
            <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-[var(--bg-800)] border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">Source</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">Type</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">Status</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">Stage</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {jobs.map(job => (
                    <tr key={job.id} className="hover:bg-[var(--bg-800)] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${job.source_type === 'url' ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {job.source_type === 'url' ? <Globe className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                          </div>
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate max-w-[240px]">
                            {job.source_filename || job.source_url || "Unknown Source"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-[var(--text-muted)] uppercase">{job.source_type}</span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-[var(--text-primary)] capitalize">{job.ingest_stage || "queued"}</div>
                        {job.ingest_stage_detail && (
                          <div className="text-[10px] text-[var(--text-muted)]">{job.ingest_stage_detail}</div>
                        )}
                        {job.error ? (
                          <div className="mt-1 max-w-xs text-[10px] text-[var(--danger)]">{job.error}</div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--text-muted)]">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: IngestJob["status"] }) {
  const styles: Record<IngestJob["status"], string> = {
    pending: "bg-gray-500/10 text-gray-500",
    running: "bg-blue-500/10 text-blue-500 animate-pulse",
    done: "bg-[var(--success-bg)] text-[var(--success)]",
    failed: "bg-[var(--danger-bg)] text-[var(--danger)]",
    review_required: "bg-amber-500/10 text-amber-500",
  };

  const icons: Record<IngestJob["status"], ReactNode> = {
    pending: <Clock className="h-3 w-3" />,
    running: <Clock className="h-3 w-3" />,
    done: <CheckCircle2 className="h-3 w-3" />,
    failed: <AlertCircle className="h-3 w-3" />,
    review_required: <AlertCircle className="h-3 w-3" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}
    >
      {icons[status]}
      {status === "review_required" ? "review" : status}
    </span>
  );
}
