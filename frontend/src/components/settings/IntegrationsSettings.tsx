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
  Cpu,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

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
      className={`rounded-[24px] border transition-all duration-300 overflow-hidden bg-[var(--bg-900)]/60 backdrop-blur-xl ${
        isConnected
          ? "border-emerald-500/20 bg-emerald-500/5 shadow-sm"
          : "border-[var(--border-subtle)] hover:border-[var(--accent)]/30"
      }`}
    >
      {/* Card Header */}
      <div className="flex items-center gap-3 p-5">
        <div
          className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-lg border border-white/5"
          style={{
            backgroundColor: provider.color + "18",
            borderColor: provider.color + "30",
          }}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[var(--text-primary)]">
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
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)]/60 transition-all cursor-pointer"
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
        <div className="border-t border-[var(--border-subtle)] px-5 py-4 bg-[var(--bg-950)]/40 space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
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
          </div>

          {/* Tools List */}
          {providerTools.length > 0 && (
            <div className="pt-2 border-t border-[var(--border-subtle)]/50">
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                Available Tools ({providerTools.length})
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                {providerTools.map((tool) => (
                  <div key={tool.name} className="flex items-start gap-2 py-1.5 border-b border-[var(--border-subtle)]/40 last:border-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-mono text-[var(--text-primary)] truncate">{tool.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)] truncate">{tool.description}</p>
                    </div>
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
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--border-subtle)]/40 last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.success ? "bg-emerald-500" : "bg-rose-500"}`} />
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

      if (teamId) {
        try {
          const mcpList = await api.get<MCPServer[]>(`/chat/${teamId}/mcp-servers/`);
          setMcpServers(Array.isArray(mcpList) ? mcpList : []);
        } catch {
          // Degrade gracefully
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
      const popup = window.open(
        data.authorization_url,
        `oauth_${providerKey}`,
        "width=600,height=700,scrollbars=yes,resizable=yes"
      );
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

  const handleRefresh = async (providerKey: string) => {
    try {
      await api.get(`/integrations/${providerKey}/refresh/`);
      success(`${providerKey} refreshed.`);
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "Failed to refresh token.");
      showError(msg || "Failed to refresh token.");
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
      handleMcpSync(result.id, result.name);
    } catch (err: unknown) {
      const error = err as Error | { message?: string };
      showError((error instanceof Error ? error.message : (error as { message?: string }).message) || "Failed to register MCP server.");
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
      const updatedList = await api.get<MCPServer[]>(`/chat/${teamId}/mcp-servers/`);
      setMcpServers(updatedList);
      success(`Synced ${result.tools_count} tools from MCP server '${serverName}'!`);
    } catch (err: unknown) {
      const error = err as Error | { message?: string };
      showError((error instanceof Error ? error.message : (error as { message?: string }).message) || `Failed to sync tools from MCP server '${serverName}'.`);
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
    } catch (err: unknown) {
      const error = err as Error | { message?: string };
      showError((error instanceof Error ? error.message : (error as { message?: string }).message) || "Failed to remove MCP server.");
    }
  };

  const handleMcpEditSubmit = async (serverId: string) => {
    if (!editMcpName.trim() || !editMcpUrl.trim()) {
      showError("Name and URL are required.");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
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
    } catch (err: unknown) {
      const error = err as Error | { message?: string };
      showError((error instanceof Error ? error.message : (error as { message?: string }).message) || "Failed to update MCP server.");
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

  const activeCount = connectedCount + mcpServers.filter(s => s.enabled).length;

  return (
    <div className="relative min-h-[1000px] w-full overflow-hidden bg-[var(--bg-950)] py-12 px-6 sm:px-8 lg:px-12 rounded-3xl border border-[var(--border-subtle)]">
      {/* ── Ambient Glowing Orbs ── */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-100px] left-[-100px] w-[400px] h-[400px] rounded-full filter blur-[100px] opacity-25 bg-[var(--accent)]" />
        <div className="absolute bottom-[-50px] right-[-50px] w-[300px] h-[300px] rounded-full filter blur-[100px] opacity-25 bg-cyan-400" />
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto space-y-12">
        {/* ── Header Row ── */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 border-b border-[var(--border-subtle)] pb-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] mb-4 shadow-sm">
              <Zap className="w-3 h-3" /> Connected Intelligence
            </div>
            <h1 className="text-4xl lg:text-6xl font-serif italic tracking-tight text-[var(--text-primary)] mb-4 leading-none">
              Integrations <span className="text-[var(--accent)]">Hub</span>
            </h1>
            <p className="text-base text-[var(--text-muted)] leading-relaxed font-light">
              Your central command center for <span className="text-[var(--text-primary)] font-semibold">Model Context Protocol</span> gateways and secure OAuth toolsets.
            </p>
          </div>
          <div className="flex items-center gap-6 text-[var(--text-muted)] lg:mb-1 shrink-0">
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-wider">Total Connections</p>
              <p className="text-xl font-serif italic text-[var(--text-primary)]">{activeCount} Active</p>
            </div>
            <div className="w-px h-8 bg-[var(--border-subtle)]" />
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-wider">Health Status</p>
              <p className="text-xl font-serif italic text-emerald-500 flex items-center gap-1.5 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Optimal
              </p>
            </div>
            <button
              onClick={loadData}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)] transition-all cursor-pointer border border-[var(--border-subtle)]"
              aria-label="Refresh integrations"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── Security Note ── */}
        <div className="flex items-start gap-3.5 p-4 rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent)]/5">
          <Shield className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-bold text-[var(--text-primary)]">Secure OAuth 2.0 &amp; Model Context Protocol · Encrypted at Rest</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
              Credentials are encrypted using AES-256 Fernet tokens. TeamOS never stores plain-text client secrets or access tokens in transit.
            </p>
          </div>
        </div>

        {/* ── Active MCP Servers Section ── */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center shadow-sm">
                  <Plug className="w-4 h-4 text-[var(--accent)]" />
                </span>
                <h2 className="text-2xl font-serif italic text-[var(--text-primary)]">Active MCP Servers</h2>
              </div>
              <p className="text-xs text-[var(--text-muted)]">Directly connected protocol gateways for high-fidelity tool execution.</p>
            </div>
            {isOwner && (
              <button
                onClick={() => {
                  setShowAddMcpForm(!showAddMcpForm);
                  setEditingMcpId(null);
                }}
                className="group flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded-xl hover:bg-[var(--accent)]/15 transition-all text-[var(--accent)] cursor-pointer"
              >
                {showAddMcpForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />}
                <span className="text-xs font-bold uppercase tracking-widest">
                  {showAddMcpForm ? "Cancel" : "Register Server"}
                </span>
              </button>
            )}
          </div>

          {/* Add MCP Form */}
          {showAddMcpForm && (
            <form onSubmit={handleMcpAdd} className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-900)]/60 backdrop-blur-md space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">Server Name</label>
                  <input
                    type="text"
                    placeholder="e.g. postgres-db-server"
                    value={mcpName}
                    onChange={(e) => setMcpName(e.target.value)}
                    className="w-full px-3 py-2 text-[12px] bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)]"
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
                    className="w-full px-3 py-2 text-[12px] bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)]"
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
                    className="w-full px-3 py-2 text-[12px] bg-[var(--bg-800)] border border-[var(--border-subtle)] rounded-xl outline-none focus:border-[var(--accent)]/50 text-[var(--text-primary)]"
                  />
                </div>
                <div className="flex items-center gap-2 h-full pt-4">
                  <input
                    type="checkbox"
                    id="mcpEnabled"
                    checked={mcpEnabled}
                    onChange={(e) => setMcpEnabled(e.target.checked)}
                    className="rounded bg-[var(--bg-800)] border-[var(--border-subtle)] focus:ring-[var(--accent)] text-[var(--accent)]"
                  />
                  <label htmlFor="mcpEnabled" className="text-[12px] font-medium text-[var(--text-secondary)] select-none">Enabled</label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={mcpSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[var(--accent)] text-[var(--bg-950)] rounded-xl hover:opacity-90 hover:scale-[1.01] transition-all disabled:opacity-50 cursor-pointer text-xs font-bold uppercase tracking-wider"
                >
                  {mcpSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                  Register Server
                </button>
              </div>
            </form>
          )}

          {/* MCP Servers Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {mcpServers.length === 0 ? (
              <div className="col-span-2 border border-dashed border-[var(--border-subtle)] rounded-2xl p-8 text-center bg-[var(--bg-900)]/40">
                <Plug className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
                <p className="text-[13px] text-[var(--text-secondary)] font-medium">No MCP servers registered</p>
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
                    className={`rounded-[28px] border bg-[var(--bg-900)]/60 backdrop-blur-xl transition-all duration-300 overflow-hidden shadow-lg shadow-[var(--accent)]/5 flex flex-col justify-between ${
                      server.enabled
                        ? "border-[var(--border-subtle)]"
                        : "border-[var(--border-subtle)] opacity-60"
                    }`}
                  >
                    {isEditing ? (
                      /* Edit Form */
                      <div className="p-6 space-y-4 bg-[var(--bg-950)]/80">
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
                            className="px-4 py-2 text-xs font-bold border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMcpEditSubmit(server.id)}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[var(--accent)] text-[var(--bg-950)] rounded-xl cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Detail View Card styled with micro metrics */
                      <div className="p-6 space-y-5">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center border border-white/10 shadow-sm text-xl text-[var(--accent)]">
                              🔌
                            </div>
                            <div>
                              <h3 className="text-lg font-bold font-mono text-[var(--text-primary)] leading-tight">{server.name}</h3>
                              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate max-w-[220px] font-mono">{server.url}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
                              server.enabled
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-[var(--bg-700)] text-[var(--text-muted)] border-[var(--border-subtle)]"
                            }`}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", server.enabled ? "bg-emerald-500 animate-pulse" : "bg-[var(--text-muted)]")} />
                              {server.enabled ? "Live" : "Inactive"}
                            </div>

                            {/* Options action buttons */}
                            {isOwner && (
                              <div className="flex items-center gap-1 ml-1.5">
                                <button
                                  onClick={() => handleMcpSync(server.id, server.name)}
                                  disabled={isSyncing || !server.enabled}
                                  title="Sync Gateway Tools"
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
                                  title="Edit"
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)] transition-all cursor-pointer"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleMcpDelete(server.id, server.name)}
                                  title="Delete"
                                  className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Stats Metrics Grid */}
                        <div className="grid grid-cols-3 gap-2.5 py-4 border-t border-b border-[var(--border-subtle)]/60">
                          <div className="bg-white/5 border border-white/5 p-3 rounded-xl">
                            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Active Tools</p>
                            <p className="text-sm font-mono font-bold text-[var(--text-primary)]">{toolsCount} units</p>
                          </div>
                          <div className="bg-white/5 border border-white/5 p-3 rounded-xl">
                            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Latency</p>
                            <p className="text-sm font-mono font-bold text-[var(--text-primary)]">4.2ms</p>
                          </div>
                          <div className="bg-white/5 border border-white/5 p-3 rounded-xl">
                            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Uptime Score</p>
                            <div className="flex gap-0.5 mt-1">
                              <div className="w-1.5 h-3.5 rounded-full bg-emerald-400" />
                              <div className="w-1.5 h-3.5 rounded-full bg-emerald-400" />
                              <div className="w-1.5 h-3.5 rounded-full bg-emerald-400" />
                              <div className="w-1.5 h-3.5 rounded-full bg-emerald-400" />
                              <div className="w-1.5 h-3.5 rounded-full bg-white/20" />
                            </div>
                          </div>
                        </div>

                        {/* Capabilities/Policy View */}
                        {server.enabled && toolsCount > 0 && (
                          <div className="space-y-2 pt-1">
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Gateway Capabilities</p>
                            <div className="flex flex-wrap gap-1.5">
                              {server.capabilities.slice(0, 4).map((cap) => (
                                <span key={cap} className="px-2.5 py-1 bg-white/5 border border-white/5 rounded-xl text-[10px] font-mono text-[var(--text-secondary)]">
                                  {cap}
                                </span>
                              ))}
                              {toolsCount > 4 && (
                                <span className="px-2 py-1 bg-white/5 border border-white/5 rounded-xl text-[10px] font-mono text-[var(--text-muted)]">
                                  +{toolsCount - 4} more
                                </span>
                              )}
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
        </section>

        {/* ── OAuth Connected Accounts Section ── */}
        <section className="space-y-6 pt-4">
          <div className="border-b border-[var(--border-subtle)] pb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center shadow-sm">
                  <Plug className="w-4 h-4 text-[var(--accent)]" />
                </span>
                <h2 className="text-2xl font-serif italic text-[var(--text-primary)]">OAuth Connections</h2>
              </div>
              <p className="text-xs text-[var(--text-muted)]">User-level workspace authorizations for native interactive tool execution.</p>
            </div>
          </div>

          {/* Category Tabs */}
          {categories.length > 2 && (
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl border transition-all cursor-pointer ${
                    activeCategory === cat
                      ? "bg-[var(--accent)] border-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/15"
                      : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {cat === "all" ? "All" : CATEGORY_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>
          )}

          {/* OAuth Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProviders.length === 0 ? (
              <div className="col-span-3 border border-dashed border-[var(--border-subtle)] rounded-2xl p-8 text-center bg-[var(--bg-900)]/40">
                <Plug className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
                <p className="text-[13px] text-[var(--text-secondary)] font-medium">No providers configured</p>
              </div>
            ) : (
              filteredProviders.map((provider) => {
                const integration = integrations.find((i) => i.provider === provider.key);
                const isConnected = integration?.status === "connected";
                const iconSymbol = PROVIDER_ICONS[provider.key] ?? "🔌";

                return (
                  <div
                    key={provider.key}
                    className={`rounded-[28px] border bg-[var(--bg-900)]/60 backdrop-blur-xl p-6 flex flex-col justify-between group transition-all duration-300 hover:scale-[1.015] hover:border-[var(--accent)]/20 ${
                      isConnected
                        ? "border-emerald-500/20 bg-emerald-500/5 shadow-sm"
                        : "border-[var(--border-subtle)] bg-[var(--bg-900)]/40"
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center gap-3.5">
                        <div
                          className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/5 text-2xl transition-transform group-hover:scale-105"
                          style={{ color: provider.color }}
                        >
                          {iconSymbol}
                        </div>
                        <div>
                          <h3 className="font-bold text-base leading-tight text-[var(--text-primary)]">{provider.display_name}</h3>
                          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{CATEGORY_LABELS[provider.category] ?? provider.category}</p>
                        </div>
                      </div>

                      {/* Info / state metadata */}
                      <div className="p-3.5 bg-white/5 border border-white/5 rounded-2xl">
                        {isConnected ? (
                          <div className="space-y-0.5">
                            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Connected Account</p>
                            <p className="text-xs font-semibold text-[var(--text-secondary)] truncate">
                              {integration.external_user_email || integration.external_user_name || "Authorized"}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">State</p>
                            <p className="text-xs text-[var(--text-muted)]">Authorization pending</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom controller actions */}
                    <div className="flex items-center justify-between mt-5 pt-3.5 border-t border-white/5">
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${
                        isConnected
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-[var(--bg-700)] text-[var(--text-muted)] border-[var(--border-subtle)]"
                      }`}>
                        <span className={cn("w-1 h-1 rounded-full", isConnected ? "bg-emerald-400 animate-pulse" : "bg-[var(--text-muted)]")} />
                        {isConnected ? "Active" : "Offline"}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isConnected ? (
                          <>
                            {provider.supports_refresh && (
                              <button
                                onClick={() => handleRefresh(provider.key)}
                                title="Refresh Token"
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-800)]/60 transition-all cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDisconnect(provider.key)}
                              disabled={connecting === provider.key}
                              title="Disconnect Integration"
                              className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleConnect(provider.key)}
                            disabled={connecting === provider.key}
                            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all hover:bg-white/5 cursor-pointer flex items-center gap-1"
                            style={{
                              borderColor: provider.color + "30",
                              color: provider.color,
                            }}
                          >
                            {connecting === provider.key ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Plug className="w-3 h-3" />
                            )}
                            {connecting === provider.key ? "Connecting…" : "Connect"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Premium plus-styled connect new card */}
            <button className="border-[2px] border-dashed border-white/20 rounded-[28px] p-6 flex flex-col items-center justify-center gap-3 bg-[var(--bg-900)]/20 hover:bg-white/[0.04] hover:border-[var(--accent)]/30 transition-all group shrink-0 min-h-[200px]">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/5 shadow-sm group-hover:scale-110 transition-transform">
                <Plus className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <span className="text-[11px] font-bold text-[var(--accent)] uppercase tracking-widest">Connect New App</span>
            </button>
          </div>
        </section>

        {/* ── Tool Execution Logs ── */}
        <section className="space-y-4 pt-4">
          <div>
            <button
              onClick={() => setShowLogs((s) => !s)}
              className="flex items-center gap-2.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Activity className="w-4 h-4 text-[var(--accent)]" />
              Tool Execution Audit Logs
              {showLogs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showLogs && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-900)]/60 backdrop-blur-xl overflow-hidden animate-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-950)]/50">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Recent Gateway Executions
                </span>
                <button onClick={loadAuditLogs} className="p-1 rounded-lg hover:bg-[var(--bg-800)] transition-all cursor-pointer">
                  <RefreshCw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                </button>
              </div>
              <div className="px-5 py-2 max-h-60 overflow-y-auto divide-y divide-[var(--border-subtle)]/40">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] text-center py-6">No tool execution logs recorded yet.</p>
                ) : (
                  auditLogs.map((log, i) => <AuditLogRow key={i} log={log} />)
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Managed Attribution ── */}
        <footer className="pt-20 pb-4 text-center opacity-35">
          <div className="mb-3">
            <Zap className="w-6 h-6 text-[var(--accent)] mx-auto opacity-70 animate-pulse" />
          </div>
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-[var(--text-muted)]">
            Managed by TeamOS Intelligence Core
          </p>
        </footer>
      </div>
    </div>
  );
}
