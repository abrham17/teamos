"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Plug,
  ExternalLink,
  Trash2,
  RefreshCw,
  Plus,
  Edit3,
  Check,
  X,
  Server,
  Zap,
  Shield,
  ChevronDown,
  Activity,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

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
  has_token: boolean;
  connected_at: string;
  last_used_at: string | null;
  scopes: string[];
}

interface Provider {
  key: string;
  display_name: string;
  category: string;
  color: string;
  icon: string;
  scopes: string[];
  supports_refresh: boolean;
}

interface MCPServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  capabilities: string[];
  has_token: boolean;
  tool_count?: number;
  last_synced_at?: string;
}

interface AuditLog {
  provider: string;
  tool: string;
  success: boolean;
  latency_ms: number;
  timestamp: string;
}

// ── OAuth Integration Card ─────────────────────────────────────────────────

function IntegrationCard({
  integration,
  onDisconnect,
  onRefresh,
  isOwner,
}: {
  integration: Integration;
  onDisconnect: (id: string) => void;
  onRefresh: (id: string) => void;
  isOwner: boolean;
}) {
  const isConnected = integration.status === "connected";
  const isError = integration.status === "error";

  return (
    <div className={cn(
      "flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all",
      isConnected
        ? "border-[var(--border-subtle)] bg-[var(--bg-900)] hover:bg-[var(--bg-850)]"
        : isError
        ? "border-rose-500/20 bg-rose-500/5"
        : "border-[var(--border-subtle)] bg-[var(--bg-900)] opacity-60"
    )}>
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
        style={{ background: integration.color + "20", border: `1px solid ${integration.color}30` }}
      >
        {integration.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            {integration.display_name}
          </span>
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
            isConnected
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
              : isError
              ? "bg-rose-500/15 text-rose-400 border border-rose-500/20"
              : "bg-[var(--bg-700)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
          )}>
            {integration.status}
          </span>
        </div>
        {integration.external_user_name && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
            {integration.external_user_name}
            {integration.external_user_email && ` · ${integration.external_user_email}`}
          </p>
        )}
        {integration.last_used_at && (
          <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
            Last used {new Date(integration.last_used_at).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Actions */}
      {isOwner && isConnected && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onRefresh(integration.id)}
            title="Refresh token"
            className="p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-800)] transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDisconnect(integration.id)}
            title="Disconnect"
            className="p-2 rounded-xl text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── MCP Server Card ────────────────────────────────────────────────────────

function MCPServerCard({
  server,
  onEdit,
  onDelete,
  onSync,
  isOwner,
  isSyncing,
}: {
  server: MCPServer;
  onEdit: (s: MCPServer) => void;
  onDelete: (id: string, name: string) => void;
  onSync: (id: string, name: string) => void;
  isOwner: boolean;
  isSyncing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const toolsCount = server.tool_count ?? server.capabilities.length;

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-900)] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--bg-800)] border border-[var(--border-subtle)] shrink-0">
          <Server className="w-4 h-4 text-[var(--text-muted)]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-[13px] text-[var(--text-primary)]">
              {server.name}
            </span>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
              server.enabled
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                : "bg-[var(--bg-700)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
            )}>
              {server.enabled ? "Active" : "Disabled"}
            </span>
            {toolsCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                {toolsCount} tool{toolsCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5 truncate">
            {server.url}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isOwner && (
            <>
              <button
                onClick={() => onSync(server.id, server.name)}
                disabled={isSyncing || !server.enabled}
                title="Sync tools"
                className="p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-800)] disabled:opacity-30 transition-all"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin text-[var(--accent)]")} />
              </button>
              <button
                onClick={() => onEdit(server)}
                title="Edit"
                className="p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-800)] transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(server.id, server.name)}
                title="Delete"
                className="p-2 rounded-xl text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {toolsCount > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-800)] transition-all"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", expanded && "rotate-180")} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded tools list */}
      {expanded && toolsCount > 0 && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-950)] px-5 py-3">
          <p className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-3">
            Available Tools
          </p>
          <div className="space-y-1.5">
            {server.capabilities.map((cap) => {
              const isHighRisk = /delete|write|execute|destroy|remove|deploy/i.test(cap);
              const isMedRisk = /edit|update|patch|create|modify/i.test(cap);
              const riskColor = isHighRisk ? "#f87171" : isMedRisk ? "#fbbf24" : "#10b981";
              const riskLabel = isHighRisk ? "High" : isMedRisk ? "Med" : "Low";

              return (
                <div key={cap} className="flex items-center gap-2 py-1">
                  <Zap className="w-3 h-3 text-[var(--accent)] shrink-0" />
                  <span className="font-mono text-[12px] text-[var(--text-secondary)] flex-1 truncate">
                    {cap}
                  </span>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                    style={{ background: riskColor + "15", color: riskColor }}
                  >
                    {riskLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add MCP Server Form ────────────────────────────────────────────────────

function AddMCPForm({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, url: string, token: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !url.trim()) return;
    setLoading(true);
    try {
      await onAdd(name.trim(), url.trim(), token.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--bg-900)] p-5 space-y-4">
      <h3 className="text-[13px] font-bold text-[var(--text-primary)]">Add MCP Server</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">
            Server Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. github"
            className="w-full px-3 py-2 text-[12px] bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)] font-mono placeholder:text-[var(--text-dim)]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">
            Server URL
          </label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            type="url"
            className="w-full px-3 py-2 text-[12px] bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)] placeholder:text-[var(--text-dim)]"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">
            Auth Token <span className="text-[var(--text-dim)] normal-case">(optional)</span>
          </label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            placeholder="Bearer token…"
            className="w-full px-3 py-2 text-[12px] bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)] placeholder:text-[var(--text-dim)]"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || !name.trim() || !url.trim()}
          className="flex items-center gap-2 px-4 py-2 text-[11px] font-bold bg-[var(--accent)] text-[var(--bg-950)] rounded-xl disabled:opacity-50 transition-all"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Add Server
        </button>
      </div>
    </div>
  );
}

// ── Recent Activity ────────────────────────────────────────────────────────

function RecentActivity({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) return null;

  return (
    <div className="space-y-2">
      {logs.slice(0, 5).map((log, i) => (
        <div key={i} className="flex items-center gap-3 py-1.5 text-[11px]">
          {log.success ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-[var(--danger)] shrink-0" />
          )}
          <span className="font-medium text-[var(--text-secondary)] truncate flex-1">
            {log.provider} · <span className="font-mono">{log.tool}</span>
          </span>
          <span className="text-[var(--text-dim)] font-mono shrink-0">{log.latency_ms}ms</span>
          <span className="text-[var(--text-dim)] shrink-0">
            {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function IntegrationsSettings({ teamId }: { teamId: string }) {
  const { success, error } = useToast();

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showAddMCP, setShowAddMCP] = useState(false);
  const [isOwner] = useState(true); // simplified; derive from actual membership

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [intData, provData, mcpData, logData] = await Promise.allSettled([
        api.get<Integration[]>(`/integrations/${teamId}/connected/`),
        api.get<Provider[]>(`/integrations/${teamId}/providers/`),
        api.get<MCPServer[]>(`/integrations/${teamId}/mcp/`),
        api.get<{ logs: AuditLog[] }>(`/integrations/${teamId}/audit-log/`),
      ]);
      if (intData.status === "fulfilled") setIntegrations(intData.value);
      if (provData.status === "fulfilled") setProviders(provData.value);
      if (mcpData.status === "fulfilled") setMcpServers(mcpData.value);
      if (logData.status === "fulfilled") setAuditLogs(logData.value.logs || []);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleConnect = async (providerKey: string) => {
    try {
      const data = await api.post<{ oauth_url: string }>(
        `/integrations/${teamId}/connect/${providerKey}/`, {}
      );
      if (data.oauth_url) window.location.href = data.oauth_url;
    } catch { error("Failed to start OAuth flow"); }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await api.delete(`/integrations/${teamId}/connected/${id}/`);
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
      success("Integration disconnected");
    } catch { error("Failed to disconnect"); }
  };

  const handleRefresh = async (id: string) => {
    try {
      await api.post(`/integrations/${teamId}/connected/${id}/refresh/`, {});
      success("Token refreshed");
      loadData();
    } catch { error("Failed to refresh token"); }
  };

  const handleMcpAdd = async (name: string, url: string, token: string) => {
    try {
      await api.post(`/integrations/${teamId}/mcp/`, { name, url, auth_token: token || undefined });
      success(`MCP server "${name}" added`);
      loadData();
    } catch { error("Failed to add MCP server"); }
  };

  const handleMcpSync = async (id: string, name: string) => {
    setSyncingId(id);
    try {
      await api.post(`/integrations/${teamId}/mcp/${id}/sync/`, {});
      success(`Synced tools from "${name}"`);
      loadData();
    } catch { error("Failed to sync MCP server"); }
    finally { setSyncingId(null); }
  };

  const handleMcpDelete = async (id: string, name: string) => {
    if (!confirm(`Remove MCP server "${name}"?`)) return;
    try {
      await api.delete(`/integrations/${teamId}/mcp/${id}/`);
      setMcpServers((prev) => prev.filter((s) => s.id !== id));
      success("MCP server removed");
    } catch { error("Failed to remove server"); }
  };

  const connectedProviderKeys = new Set(integrations.map((i) => i.provider));
  const availableProviders = providers.filter((p) => !connectedProviderKeys.has(p.key));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-[var(--text-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading integrations…</span>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-3xl">

      {/* ── MCP Servers ─────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Server className="w-4 h-4 text-[var(--accent)]" />
              MCP Servers
            </h3>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
              All agent tools run through these MCP gateways
            </p>
          </div>
          {isOwner && (
            <button
              onClick={() => setShowAddMCP((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 hover:bg-[var(--accent)]/15 transition-all"
            >
              {showAddMCP ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showAddMCP ? "Cancel" : "Add Server"}
            </button>
          )}
        </div>

        {showAddMCP && (
          <div className="mb-4">
            <AddMCPForm onClose={() => setShowAddMCP(false)} onAdd={handleMcpAdd} />
          </div>
        )}

        {mcpServers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 rounded-2xl border border-dashed border-[var(--border-subtle)] text-center">
            <Server className="w-8 h-8 text-[var(--text-dim)]" />
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-secondary)]">No MCP servers yet</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Add a server to give agents external tool access</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {mcpServers.map((server) => (
              <MCPServerCard
                key={server.id}
                server={server}
                onEdit={() => {/* TODO: inline edit */}}
                onDelete={handleMcpDelete}
                onSync={handleMcpSync}
                isOwner={isOwner}
                isSyncing={syncingId === server.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── OAuth Integrations ─────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h3 className="text-[15px] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Plug className="w-4 h-4 text-[var(--accent)]" />
            Connected Accounts
          </h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            OAuth connections exposed as MCP tools to the agent
          </p>
        </div>

        {integrations.length > 0 && (
          <div className="space-y-2 mb-6">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onDisconnect={handleDisconnect}
                onRefresh={handleRefresh}
                isOwner={isOwner}
              />
            ))}
          </div>
        )}

        {availableProviders.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] mb-3">
              Available to connect
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableProviders.map((provider) => (
                <button
                  key={provider.key}
                  onClick={() => handleConnect(provider.key)}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[var(--border-subtle)] hover:border-[var(--accent)]/30 hover:bg-[var(--bg-800)] transition-all text-left group"
                >
                  <span className="text-xl shrink-0">{provider.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                      {provider.display_name}
                    </p>
                    <p className="text-[10px] text-[var(--text-dim)] capitalize">{provider.category}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-[var(--text-dim)] group-hover:text-[var(--accent)] ml-auto shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {integrations.length === 0 && availableProviders.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 rounded-2xl border border-dashed border-[var(--border-subtle)] text-center">
            <Plug className="w-8 h-8 text-[var(--text-dim)]" />
            <p className="text-[13px] font-semibold text-[var(--text-secondary)]">No OAuth providers configured</p>
          </div>
        )}
      </section>

      {/* ── Recent Activity ─────────────────────────────────────────────────── */}
      {auditLogs.length > 0 && (
        <section>
          <div className="mb-3">
            <h3 className="text-[15px] font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--accent)]" />
              Recent Activity
            </h3>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-900)] px-5 py-3">
            <RecentActivity logs={auditLogs} />
          </div>
        </section>
      )}
    </div>
  );
}
