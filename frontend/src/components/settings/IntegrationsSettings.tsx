"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Plug,
  AlertTriangle,
  ExternalLink,
  Trash2,
  RefreshCw,
  Activity,
  ChevronDown,
  ChevronRight,
  Zap,
  Shield,
  Link2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Provider {
  key: string;
  display_name: string;
  category: string;
  color: string;
  icon: string;
  scopes: string[];
  supports_refresh: boolean;
}

interface Integration {
  id: string;
  provider: string;
  display_name: string;
  category: string;
  color: string;
  icon: string;
  status: "connected" | "disconnected" | "error";
  external_user_name: string;
  external_user_email: string;
  scopes: string[];
  has_token: boolean;
  connected_at: string;
  last_used_at: string | null;
}

interface AuditLog {
  provider: string;
  tool: string;
  success: boolean;
  latency_ms: number;
  timestamp: string;
}

interface IntegrationsSettingsProps {
  teamId: string;
}

// ─── Provider Icons ────────────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, string> = {
  github: "⚙",
  gitlab: "🦊",
  notion: "📄",
  slack: "💬",
  google: "🔍",
  discord: "🎮",
  jira: "📋",
  linear: "◆",
  trello: "🗂",
  dropbox: "📦",
  hubspot: "🧲",
};

const CATEGORY_LABELS: Record<string, string> = {
  development: "Development",
  knowledge: "Knowledge",
  communication: "Communication",
  productivity: "Productivity",
  project: "Project Management",
  storage: "Storage",
  crm: "CRM",
  other: "Other",
};

// ─── Sub-Components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: Integration["status"] }) {
  if (status === "connected")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">
        <CheckCircle2 className="w-2.5 h-2.5" /> Live
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-widest">
        <AlertTriangle className="w-2.5 h-2.5" /> Error
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg-700)] text-[var(--text-muted)] border border-[var(--border-subtle)] uppercase tracking-widest">
      <XCircle className="w-2.5 h-2.5" /> Off
    </span>
  );
}

function ProviderCard({
  provider,
  integration,
  onConnect,
  onDisconnect,
  connecting,
}: {
  provider: Provider;
  integration: Integration | undefined;
  onConnect: (key: string) => void;
  onDisconnect: (key: string) => void;
  connecting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isConnected = integration?.status === "connected";
  const icon = PROVIDER_ICONS[provider.key] ?? "🔌";

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 overflow-hidden group ${
        isConnected
          ? "border-emerald-500/25 bg-emerald-500/3 shadow-sm shadow-emerald-500/5"
          : "border-[var(--border-subtle)] bg-[var(--surface-1)] hover:border-[var(--border-strong)]"
      }`}
    >
      {/* Card Header */}
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg border"
          style={{
            backgroundColor: provider.color + "18",
            borderColor: provider.color + "30",
          }}
        >
          {icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              {provider.display_name}
            </span>
            {integration && <StatusPill status={integration.status} />}
          </div>
          {isConnected && integration?.external_user_email ? (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
              {integration.external_user_email}
            </p>
          ) : (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 capitalize">
              {CATEGORY_LABELS[provider.category] ?? provider.category}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isConnected ? (
            <>
              <button
                onClick={() => setExpanded((e) => !e)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)] transition-all cursor-pointer"
                aria-label="Expand details"
              >
                {expanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => onDisconnect(provider.key)}
                disabled={connecting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-rose-400 border border-rose-500/20 rounded-xl hover:bg-rose-500/10 hover:border-rose-500/40 transition-all disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => onConnect(provider.key)}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border transition-all disabled:opacity-40 cursor-pointer"
              style={{
                backgroundColor: provider.color + "15",
                borderColor: provider.color + "30",
                color: provider.color,
              }}
            >
              {connecting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Link2 className="w-3 h-3" />
              )}
              {connecting ? "Opening…" : "Connect"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && isConnected && integration && (
        <div className="border-t border-[var(--border-subtle)] px-4 py-3 bg-[var(--bg-950)] space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {integration.external_user_name && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Account</p>
                <p className="text-[12px] text-[var(--text-primary)] mt-0.5">{integration.external_user_name}</p>
              </div>
            )}
            {integration.connected_at && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Connected</p>
                <p className="text-[12px] text-[var(--text-primary)] mt-0.5">
                  {new Date(integration.connected_at).toLocaleDateString()}
                </p>
              </div>
            )}
            {integration.last_used_at && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Last Used</p>
                <p className="text-[12px] text-[var(--text-primary)] mt-0.5">
                  {new Date(integration.last_used_at).toLocaleDateString()}
                </p>
              </div>
            )}
            {integration.scopes?.length > 0 && (
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Authorized Scopes</p>
                <div className="flex flex-wrap gap-1">
                  {integration.scopes.map((s) => (
                    <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-800)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AuditLogRow({ log }: { log: AuditLog }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[var(--border-subtle)] last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.success ? "bg-emerald-400" : "bg-rose-400"}`} />
      <span
        className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md border text-center w-16 flex-shrink-0 capitalize"
        style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
      >
        {log.provider}
      </span>
      <span className="flex-1 text-[12px] text-[var(--text-secondary)] font-mono truncate">{log.tool}</span>
      <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">{log.latency_ms}ms</span>
      <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 hidden sm:block">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function IntegrationsSettings({ teamId }: IntegrationsSettingsProps) {
  const { success, error: showError } = useToast();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [provList, intList] = await Promise.all([
        api.get<Provider[]>("/api/integrations/providers/"),
        api.get<Integration[]>("/api/integrations/"),
      ]);
      setProviders(Array.isArray(provList) ? provList : []);
      setIntegrations(Array.isArray(intList) ? intList : []);
    } catch {
      // Silently degrade
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      const logs = await api.get<AuditLog[]>("/api/integrations/logs/?limit=30");
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch {}
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (showLogs) loadAuditLogs();
  }, [showLogs, loadAuditLogs]);

  const handleConnect = async (providerKey: string) => {
    setConnecting(providerKey);
    try {
      const data = await api.post<{ authorization_url: string }>("/api/integrations/connect/", {
        provider: providerKey,
      });
      // Open OAuth popup
      const popup = window.open(
        data.authorization_url,
        `oauth_${providerKey}`,
        "width=600,height=700,scrollbars=yes,resizable=yes"
      );
      // Poll until popup closes, then refresh
      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll);
          setConnecting(null);
          loadData();
          success(`${providerKey} connected! AI agent tools are now available.`);
        }
      }, 800);
    } catch (e: any) {
      showError(e.message || "Failed to start OAuth flow.");
      setConnecting(null);
    }
  };

  const handleDisconnect = async (providerKey: string) => {
    try {
      await api.delete(`/api/integrations/${providerKey}/disconnect/`);
      setIntegrations((prev) => prev.filter((i) => i.provider !== providerKey));
      success(`${providerKey} disconnected.`);
    } catch (e: any) {
      showError(e.message || "Failed to disconnect.");
    }
  };

  // Group providers by category
  const categories = ["all", ...new Set(providers.map((p) => p.category))];
  const filteredProviders =
    activeCategory === "all"
      ? providers
      : providers.filter((p) => p.category === activeCategory);

  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Integrations</h2>
            {connectedCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                {connectedCount} active
              </span>
            )}
          </div>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            Connect external services. Your AI agent gains native tools automatically.
          </p>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)] transition-all cursor-pointer"
          aria-label="Refresh integrations"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Stats Strip ── */}
      {connectedCount > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3">
            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Connected</p>
            <p className="text-xl font-bold text-emerald-400 mt-0.5">{connectedCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3">
            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Available</p>
            <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{providers.length}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3">
            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Protocol</p>
            <p className="text-[13px] font-bold text-[var(--accent)] mt-1">OAuth 2.0</p>
          </div>
        </div>
      )}

      {/* ── Security Note ── */}
      <div className="flex items-start gap-3 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
        <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold text-indigo-400">Secure OAuth 2.0 · Encrypted at rest</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Credentials are encrypted with AES-256 Fernet. TeamOS never stores plain-text secrets.
          </p>
        </div>
      </div>

      {/* ── Category Tabs ── */}
      {categories.length > 2 && (
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer capitalize ${
                activeCategory === cat
                  ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                  : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              }`}
            >
              {cat === "all" ? "All" : CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      )}

      {/* ── Provider Grid ── */}
      <div className="space-y-2">
        {filteredProviders.length === 0 ? (
          <div className="border border-dashed border-[var(--border-subtle)] rounded-2xl p-8 text-center">
            <Plug className="w-7 h-7 text-[var(--text-muted)] mx-auto mb-2" />
            <p className="text-[13px] text-[var(--text-secondary)] font-medium">No providers in this category</p>
          </div>
        ) : (
          filteredProviders.map((provider) => {
            const integration = integrations.find((i) => i.provider === provider.key);
            return (
              <ProviderCard
                key={provider.key}
                provider={provider}
                integration={integration}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                connecting={connecting === provider.key}
              />
            );
          })
        )}
      </div>

      {/* ── Agent Context Note ── */}
      {connectedCount > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-emerald-400">AI Agent Tools Active</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Your agent can now use tools from connected services. Just ask — e.g. "Search my GitHub issues" or "Create a Notion page".
            </p>
          </div>
        </div>
      )}

      {/* ── Audit Logs Toggle ── */}
      <div>
        <button
          onClick={() => setShowLogs((s) => !s)}
          className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5" />
          Tool Execution Logs
          {showLogs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>

        {showLogs && (
          <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-950)]">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Recent Executions
              </span>
              <button onClick={loadAuditLogs} className="p-1 rounded-lg hover:bg-[var(--bg-800)] transition-all cursor-pointer">
                <RefreshCw className="w-3 h-3 text-[var(--text-muted)]" />
              </button>
            </div>
            <div className="px-4 py-1 max-h-56 overflow-y-auto">
              {auditLogs.length === 0 ? (
                <p className="text-[12px] text-[var(--text-muted)] text-center py-4">No executions recorded yet.</p>
              ) : (
                auditLogs.map((log, i) => <AuditLogRow key={i} log={log} />)
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MCP Legacy Note ── */}
      <div className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-950)]">
        <ExternalLink className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">MCP Servers</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            For self-hosted MCP gateway integrations, ask a team owner to configure them in MCP settings.
          </p>
        </div>
      </div>
    </div>
  );
}
