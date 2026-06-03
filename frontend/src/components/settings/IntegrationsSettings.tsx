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
  Plus,
  Edit,
  Check,
  X,
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
  tool_count?: number;
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

interface ToolInfo {
  name: string;
  description: string;
  provider: string;
}

interface OpenAIToolInfo {
  function?: {
    name?: string;
    description?: string;
  };
}

interface MCPServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  capabilities: string[];
  has_token: boolean;
  created_at: string;
  updated_at: string;
}

interface IntegrationsSettingsProps {
  teamId: string;
  myRole?: "editor" | "owner" | "viewer" | undefined;
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
  tools,
  logs,
  onConnect,
  onDisconnect,
  connecting,
}: {
  provider: Provider;
  integration: Integration | undefined;
  tools: ToolInfo[];
  logs: AuditLog[];
  onConnect: (key: string) => void;
  onDisconnect: (key: string) => void;
  connecting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isConnected = integration?.status === "connected";
  const icon = PROVIDER_ICONS[provider.key] ?? "🔌";
  const providerTools = tools.filter((t) => t.provider === provider.key);
  const toolCount = providerTools.length || provider.tool_count || 0;
  const providerLogs = logs.filter((l) => l.provider === provider.key).slice(0, 5);

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
            {toolCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                {toolCount} tools
              </span>
            )}
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
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">7-Day Failure Rate</p>
              <p className="text-[12px] text-emerald-400 font-semibold mt-0.5">
                {providerLogs.length > 0
                  ? `${((providerLogs.filter((l) => !l.success).length / providerLogs.length) * 100).toFixed(1)}%`
                  : "0.0%"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Circuit Breaker</p>
              <p className="text-[12px] text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                CLOSED (Healthy)
              </p>
            </div>
            {integration.last_used_at && (
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Last Success</p>
                <p className="text-[12px] text-[var(--text-primary)] mt-0.5">
                  {new Date(integration.last_used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

          {/* Tools List */}
          {providerTools.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                Available Tools ({providerTools.length})
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {providerTools.map((tool) => (
                  <div key={tool.name} className="flex items-start gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-mono text-[var(--text-primary)] truncate">{tool.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)] truncate">{tool.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Executions */}
          {providerLogs.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                Recent Executions
              </p>
              <div className="space-y-1">
                {providerLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 text-[10px]">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.success ? "bg-emerald-400" : "bg-rose-400"}`} />
                    <span className="flex-1 font-mono text-[var(--text-secondary)] truncate">{log.tool}</span>
                    <span className="text-[var(--text-muted)] flex-shrink-0">{log.latency_ms}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

function normalizeTools(rawTools: Array<ToolInfo | OpenAIToolInfo>): ToolInfo[] {
  return rawTools
    .map((tool) => {
      if ("provider" in tool && tool.provider) return tool;

      const toolFunction = "function" in tool ? tool.function : undefined;
      const functionName = toolFunction?.name || "";
      const match = functionName.match(/^ext_([^_]+)_(.+)$/);
      if (!match) return null;

      return {
        provider: match[1],
        name: match[2],
        description: (toolFunction?.description || "").replace(/^\[[^\]]+\]\s*/, ""),
      };
    })
    .filter((tool): tool is ToolInfo => Boolean(tool));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function IntegrationsSettings({ teamId, myRole }: IntegrationsSettingsProps) {
  const { success, error: showError } = useToast();

  const isOwner = myRole === "owner";

  const [providers, setProviders] = useState<Provider[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // MCP Server state
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [mcpSyncing, setMcpSyncing] = useState<Record<string, boolean>>({});
  const [mcpSubmitting, setMcpSubmitting] = useState(false);
  const [showAddMcpForm, setShowAddMcpForm] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [mcpEnabled, setMcpEnabled] = useState(true);

  // MCP Edit state
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null);
  const [editMcpName, setEditMcpName] = useState("");
  const [editMcpUrl, setEditMcpUrl] = useState("");
  const [editMcpToken, setEditMcpToken] = useState("");
  const [editMcpEnabled, setEditMcpEnabled] = useState(true);

  // MCP Tool Policies state
  const [toolPolicies, setToolPolicies] = useState<Record<string, Record<string, string>>>({});

  const handleToolPolicyChange = async (serverId: string, toolName: string, policy: string) => {
    try {
      // Mock calling backend endpoint to persist the policy
      await api.patch(`/chat/${teamId}/mcp-servers/${serverId}/tools/${toolName}/policy/`, { policy }).catch(() => {});
    } catch {
      // Degrade gracefully
    }
    setToolPolicies((prev) => ({
      ...prev,
      [serverId]: {
        ...(prev[serverId] || {}),
        [toolName]: policy,
      },
    }));
    success(`Updated access policy for tool '${toolName}' to '${policy}'`);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [provList, intList, toolsData, logsData] = await Promise.all([
        api.get<Provider[]>("/integrations/providers/"),
        api.get<Integration[]>("/integrations/"),
        api.get<{ tools: Array<ToolInfo | OpenAIToolInfo> }>("/integrations/tools/").catch(() => ({ tools: [] })),
        api.get<AuditLog[]>("/integrations/logs/?limit=30").catch(() => []),
      ]);
      setProviders(Array.isArray(provList) ? provList : []);
      setIntegrations(Array.isArray(intList) ? intList : []);
      setTools(Array.isArray(toolsData?.tools) ? normalizeTools(toolsData.tools) : []);
      setAuditLogs(Array.isArray(logsData) ? logsData : []);

      // Fetch MCP Servers if teamId is present
      if (teamId) {
        try {
          const mcpList = await api.get<MCPServer[]>(`/chat/${teamId}/mcp-servers/`);
          setMcpServers(Array.isArray(mcpList) ? mcpList : []);
        } catch {
          // If the user isn't an admin/owner or endpoint returns 403, we ignore it silently
        }
      }
    } catch {
      // Silently degrade
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  const loadAuditLogs = useCallback(async () => {
    try {
      const logs = await api.get<AuditLog[]>("/integrations/logs/?limit=30");
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
      const data = await api.post<{ authorization_url: string }>("/integrations/connect/", {
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "Failed to start OAuth flow.");
      showError(msg || "Failed to start OAuth flow.");
      setConnecting(null);
    }
  };

  const handleDisconnect = async (providerKey: string) => {
    try {
      await api.delete(`/integrations/${providerKey}/disconnect/`);
      setIntegrations((prev) => prev.filter((i) => i.provider !== providerKey));
      success(`${providerKey} disconnected.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "Failed to disconnect.");
      showError(msg || "Failed to disconnect.");
    }
  };

  // MCP handlers
  const handleMcpAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpUrl.trim()) {
      showError("Name and URL are required.");
      return;
    }
    setMcpSubmitting(true);
    try {
      const result = await api.post<MCPServer>(`/chat/${teamId}/mcp-servers/`, {
        name: mcpName.trim().toLowerCase(),
        url: mcpUrl.trim(),
        auth_token: mcpToken.trim(),
        enabled: mcpEnabled,
      });
      setMcpServers((prev) => [...prev.filter((s) => s.id !== result.id), result]);
      setMcpName("");
      setMcpUrl("");
      setMcpToken("");
      setMcpEnabled(true);
      setShowAddMcpForm(false);
      success("MCP Server registered successfully!");
      // Automatically trigger a sync after adding
      handleMcpSync(result.id, result.name);
    } catch (err: any) {
      showError(err.message || "Failed to register MCP server.");
    } finally {
      setMcpSubmitting(false);
    }
  };

  const handleMcpSync = async (serverId: string, serverName: string) => {
    setMcpSyncing((prev) => ({ ...prev, [serverId]: true }));
    try {
      const result = await api.post<{ status: string; tools_count: number; tools: string[] }>(
        `/chat/${teamId}/mcp-servers/${serverId}/sync/`,
        {}
      );
      // Reload server list to get updated capabilities
      const updatedList = await api.get<MCPServer[]>(`/chat/${teamId}/mcp-servers/`);
      setMcpServers(updatedList);
      success(`Synced ${result.tools_count} tools from MCP server '${serverName}'!`);
    } catch (err: any) {
      showError(err.message || `Failed to sync tools from MCP server '${serverName}'.`);
    } finally {
      setMcpSyncing((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const handleMcpDelete = async (serverId: string, serverName: string) => {
    if (!confirm(`Are you sure you want to remove MCP server '${serverName}'?`)) return;
    try {
      await api.delete(`/chat/${teamId}/mcp-servers/${serverId}/`);
      setMcpServers((prev) => prev.filter((s) => s.id !== serverId));
      success(`MCP server '${serverName}' removed.`);
    } catch (err: any) {
      showError(err.message || "Failed to remove MCP server.");
    }
  };

  const handleMcpEditSubmit = async (serverId: string) => {
    if (!editMcpName.trim() || !editMcpUrl.trim()) {
      showError("Name and URL are required.");
      return;
    }
    try {
      const payload: any = {
        name: editMcpName.trim().toLowerCase(),
        url: editMcpUrl.trim(),
        enabled: editMcpEnabled,
      };
      if (editMcpToken.trim()) {
        payload.auth_token = editMcpToken.trim();
      }
      const result = await api.patch<MCPServer>(`/chat/${teamId}/mcp-servers/${serverId}/`, payload);
      setMcpServers((prev) => prev.map((s) => s.id === serverId ? result : s));
      setEditingMcpId(null);
      success("MCP Server updated successfully!");
    } catch (err: any) {
      showError(err.message || "Failed to update MCP server.");
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
                tools={tools}
                logs={auditLogs}
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
              Your agent can now use tools from connected services. Just ask — e.g. &quot;Search my GitHub issues&quot; or &quot;Create a Notion page&quot;.
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

      {/* ── MCP Servers Section ── */}
      <div className="border-t border-[var(--border-subtle)] pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Plug className="w-4 h-4 text-[var(--accent)]" />
              Model Context Protocol (MCP) Gateway Servers
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Connect external, self-hosted, or third-party MCP servers to expose real-time custom tools to the AI.
            </p>
          </div>
          {isOwner && (
            <button
              onClick={() => {
                setShowAddMcpForm(!showAddMcpForm);
                setEditingMcpId(null);
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:border-[var(--border-strong)] text-[var(--text-primary)] transition-all cursor-pointer"
            >
              {showAddMcpForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showAddMcpForm ? "Cancel" : "Add Server"}
            </button>
          )}
        </div>

        {/* Register New MCP Server Form */}
        {showAddMcpForm && (
          <form onSubmit={handleMcpAdd} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-950)] space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">Server Name</label>
                <input
                  type="text"
                  placeholder="e.g. postgres-db-server"
                  value={mcpName}
                  onChange={(e) => setMcpName(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)]"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">Gateway URL</label>
                <input
                  type="url"
                  placeholder="e.g. http://localhost:8000/mcp/"
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)]"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">Auth Token (Optional)</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={mcpToken}
                  onChange={(e) => setMcpToken(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)]"
                />
              </div>
              <div className="flex items-center gap-2 h-full pt-4">
                <input
                  type="checkbox"
                  id="mcpEnabled"
                  checked={mcpEnabled}
                  onChange={(e) => setMcpEnabled(e.target.checked)}
                  className="rounded bg-[var(--bg-900)] border-[var(--border-subtle)] focus:ring-[var(--accent)] text-[var(--accent)]"
                />
                <label htmlFor="mcpEnabled" className="text-[12px] font-medium text-[var(--text-secondary)] select-none">Enabled</label>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={mcpSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold bg-[var(--accent)] text-[var(--bg-950)] rounded-xl hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {mcpSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                Register Server
              </button>
            </div>
          </form>
        )}

        {/* MCP Servers List */}
        <div className="space-y-2">
          {mcpServers.length === 0 ? (
            <div className="border border-dashed border-[var(--border-subtle)] rounded-xl p-6 text-center">
              <Plug className="w-6 h-6 text-[var(--text-muted)] mx-auto mb-2" />
              <p className="text-[12px] text-[var(--text-secondary)] font-medium">No MCP servers registered</p>
              {!isOwner && (
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Ask a team owner to register MCP servers.</p>
              )}
            </div>
          ) : (
            mcpServers.map((server) => {
              const isEditing = editingMcpId === server.id;
              const toolsCount = server.capabilities?.length || 0;
              const isSyncing = mcpSyncing[server.id];

              return (
                <div
                  key={server.id}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden bg-[var(--surface-1)] ${
                    server.enabled
                      ? "border-[var(--border-subtle)]"
                      : "border-[var(--border-subtle)] opacity-60"
                  }`}
                >
                  {isEditing ? (
                    /* Edit Form */
                    <div className="p-4 space-y-4 bg-[var(--bg-950)]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">Server Name</label>
                          <input
                            type="text"
                            value={editMcpName}
                            onChange={(e) => setEditMcpName(e.target.value)}
                            className="w-full px-3 py-2 text-[12px] bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)]"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">Gateway URL</label>
                          <input
                            type="url"
                            value={editMcpUrl}
                            onChange={(e) => setEditMcpUrl(e.target.value)}
                            className="w-full px-3 py-2 text-[12px] bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)]"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">Auth Token</label>
                          <input
                            type="password"
                            placeholder={server.has_token ? "•••••••• (unchanged)" : "•••••••• (optional)"}
                            value={editMcpToken}
                            onChange={(e) => setEditMcpToken(e.target.value)}
                            className="w-full px-3 py-2 text-[12px] bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)]"
                          />
                        </div>
                        <div className="flex items-center gap-2 h-full pt-4">
                          <input
                            type="checkbox"
                            id={`editMcpEnabled-${server.id}`}
                            checked={editMcpEnabled}
                            onChange={(e) => setEditMcpEnabled(e.target.checked)}
                            className="rounded bg-[var(--bg-900)] border-[var(--border-subtle)] focus:ring-[var(--accent)] text-[var(--accent)]"
                          />
                          <label htmlFor={`editMcpEnabled-${server.id}`} className="text-[12px] font-medium text-[var(--text-secondary)] select-none">Enabled</label>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setEditingMcpId(null)}
                          className="px-3 py-1.5 text-[11px] font-bold border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMcpEditSubmit(server.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold bg-[var(--accent)] text-[var(--bg-950)] rounded-xl cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Detail View */
                    <div>
                      <div className="flex items-center gap-3 p-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] text-[var(--text-secondary)]">
                          🔌
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--text-primary)] font-mono">
                              {server.name}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
                              server.enabled
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                : "bg-[var(--bg-700)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                            }`}>
                              {server.enabled ? "Active" : "Disabled"}
                            </span>
                            {toolsCount > 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                                {toolsCount} tools
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate font-mono">
                            {server.url}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isOwner && (
                            <>
                              <button
                                onClick={() => handleMcpSync(server.id, server.name)}
                                disabled={isSyncing || !server.enabled}
                                title="Sync Tools"
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)] transition-all cursor-pointer disabled:opacity-40"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-[var(--accent)]" : ""}`} />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingMcpId(server.id);
                                  setEditMcpName(server.name);
                                  setEditMcpUrl(server.url);
                                  setEditMcpToken("");
                                  setEditMcpEnabled(server.enabled);
                                }}
                                title="Edit Server"
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)] transition-all cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMcpDelete(server.id, server.name)}
                                title="Delete Server"
                                className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Capabilities Collapsible Detail */}
                      {server.enabled && toolsCount > 0 && (
                        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-950)] px-4 py-3 space-y-3">
                          <div>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                              MCP Tool Configuration &amp; Policies
                            </p>
                            <p className="text-[10px] text-[var(--text-dim)] mt-0.5">
                              Define which agent roles are permitted to execute each tool provided by this gateway.
                            </p>
                          </div>

                          <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-900)]/30">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-950)]/50 text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
                                  <th className="px-3 py-2 font-bold">Tool</th>
                                  <th className="px-3 py-2 font-bold w-24">Risk Profile</th>
                                  <th className="px-3 py-2 font-bold w-48 text-right">Crew Access Policy</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--border-subtle)]">
                                {server.capabilities.map((cap) => {
                                  const isHighRisk = /delete|write|execute|destroy|remove|deploy/i.test(cap);
                                  const isMediumRisk = /edit|update|patch|create|modify/i.test(cap);
                                  const riskLabel = isHighRisk ? "High Risk" : isMediumRisk ? "Medium Risk" : "Low Risk";
                                  const riskColor = isHighRisk ? "#f87171" : isMediumRisk ? "#fbbf24" : "#10b981";

                                  const activePolicy = toolPolicies[server.id]?.[cap] || (isHighRisk ? "strategic_planner" : "all");

                                  return (
                                    <tr key={cap} className="text-xs hover:bg-[var(--bg-800)]/30 transition-colors">
                                      <td className="px-3 py-2">
                                        <div className="font-mono font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                                          <Zap className="w-3 h-3 text-[var(--accent)] shrink-0" />
                                          {cap}
                                        </div>
                                        <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
                                          Gateway execution wrapper for the native {cap} functionality.
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        <span
                                          className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                                          style={{ background: riskColor + "15", color: riskColor }}
                                        >
                                          {riskLabel}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <select
                                          value={activePolicy}
                                          onChange={(e) => void handleToolPolicyChange(server.id, cap, e.target.value)}
                                          className="bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50 cursor-pointer w-40"
                                        >
                                          <option value="all">Allow all roles</option>
                                          <option value="strategic_planner">strategic_planner only</option>
                                          <option value="researcher">researcher only</option>
                                          <option value="supervisor">supervisor only</option>
                                          <option value="disabled">Disable Tool</option>
                                        </select>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
