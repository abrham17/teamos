"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  GitBranch,
  MessageCircle,
  Layout,
  BookOpen,
  HardDrive,
  CalendarDays,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

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
  myRole?: "owner" | "editor" | "viewer";
}

const PRESET_INTEGRATIONS = [
  {
    key: "github",
    label: "GitHub",
    Icon: GitBranch,
    iconColor: "#4078c0",
    description: "Access repositories, issues, pull requests, and code search.",
    defaultPort: 9091,
  },
  {
    key: "slack",
    label: "Slack",
    Icon: MessageCircle,
    iconColor: "#7c3aed",
    description: "Send messages, read channels, and interact with workspaces.",
    defaultPort: 9092,
  },
  {
    key: "trello",
    label: "Trello",
    Icon: Layout,
    iconColor: "#0079bf",
    description: "Manage boards, cards, and lists in your Trello workspace.",
    defaultPort: 9093,
  },
  {
    key: "notion",
    label: "Notion",
    Icon: BookOpen,
    iconColor: "#6b7280",
    description: "Read and write pages, databases, and blocks in Notion.",
    defaultPort: 9094,
  },
  {
    key: "gdrive",
    label: "Google Drive",
    Icon: HardDrive,
    iconColor: "#4285f4",
    description: "Browse, read, and upload files in your Google Drive.",
    defaultPort: 9095,
  },
  {
    key: "gcalendar",
    label: "Google Calendar",
    Icon: CalendarDays,
    iconColor: "#0f9d58",
    description: "Create, update, and list events in Google Calendar.",
    defaultPort: 9096,
  },
] as const;

type PresetKey = (typeof PRESET_INTEGRATIONS)[number]["key"];

function ServerIcon({ name }: { name: string }) {
  const preset = PRESET_INTEGRATIONS.find((p) => p.key === name.toLowerCase() as PresetKey);
  if (!preset) return <Plug className="w-5 h-5 text-[var(--text-muted)]" />;
  const { Icon } = preset;
  return <Icon className="w-5 h-5" style={{ color: preset.iconColor }} />;
}

function StatusBadge({ enabled, synced }: { enabled: boolean; synced?: boolean }) {
  if (!enabled)
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-800)] text-[var(--text-muted)] uppercase tracking-wide">
        <XCircle className="w-3 h-3" /> Disabled
      </span>
    );
  if (synced)
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 uppercase tracking-wide">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 uppercase tracking-wide">
      <AlertTriangle className="w-3 h-3" /> Not Synced
    </span>
  );
}

function AddServerModal({
  onClose,
  onSave,
  teamId,
}: {
  onClose: () => void;
  onSave: (server: MCPServer) => void;
  teamId: string;
}) {
  const { error: showError } = useToast();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  const preset = PRESET_INTEGRATIONS.find((p) => p.key === name as PresetKey);

  const handleSelectPreset = (key: PresetKey) => {
    const p = PRESET_INTEGRATIONS.find((pr) => pr.key === key);
    if (p) {
      setName(p.key);
      setUrl(`http://localhost:${p.defaultPort}`);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) {
      showError("Name and URL are required.");
      return;
    }
    setSaving(true);
    try {
      const server = await api.post<MCPServer>(`/api/chat/${teamId}/mcp-servers/`, {
        name: name.trim(),
        url: url.trim(),
        auth_token: token.trim(),
        enabled: true,
      });
      onSave(server);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add integration.";
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-800)] border border-[var(--border-strong)] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Add MCP Integration
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Quick-select presets */}
          <div>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Quick Add
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_INTEGRATIONS.map((p) => {
                const { Icon } = p;
                const selected = name === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => handleSelectPreset(p.key)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <Icon className="w-5 h-5" style={{ color: p.iconColor }} />
                    <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. github, slack, notion"
                className="mt-1 w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 rounded-xl transition-colors placeholder:text-[var(--text-muted)]"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Gateway URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:9091"
                className="mt-1 w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 rounded-xl transition-colors placeholder:text-[var(--text-muted)]"
              />
              {preset && (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{preset.description}</p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Auth Token{" "}
                <span className="normal-case font-normal">(optional)</span>
              </label>
              <div className="relative mt-1">
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Bearer token or API key"
                  className="w-full px-3 py-2 pr-10 bg-[var(--bg-900)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 rounded-xl transition-colors placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] border border-[var(--border-subtle)] rounded-xl hover:bg-[var(--bg-700)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !url.trim()}
            className="px-4 py-2 text-[13px] bg-[var(--accent)] text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2 cursor-pointer"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save Integration"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ServerRow({
  server,
  teamId,
  onDelete,
  onUpdate,
}: {
  server: MCPServer;
  teamId: string;
  onDelete: (id: string) => void;
  onUpdate: (updated: MCPServer) => void;
}) {
  const { success, error: showError } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editToken, setEditToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);

  interface SyncResult {
    status: string;
    tools_count: number;
    tools: string[];
  }

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.post<SyncResult>(
        `/api/chat/${teamId}/mcp-servers/${server.id}/sync/`,
        {}
      );
      onUpdate({ ...server, capabilities: result.tools });
      success(`Synced ${result.tools_count} tools from ${server.name}.`);
    } catch {
      showError(`Failed to sync ${server.name}. Is the gateway running?`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const updated = await api.patch<MCPServer>(`/api/chat/${teamId}/mcp-servers/${server.id}/`, {
        enabled: !server.enabled,
      });
      onUpdate(updated);
      success(`${server.name} ${!server.enabled ? "enabled" : "disabled"}.`);
    } catch {
      showError("Failed to update integration.");
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/chat/${teamId}/mcp-servers/${server.id}/`);
      onDelete(server.id);
      success(`${server.name} integration removed.`);
    } catch {
      showError("Failed to remove integration.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveToken = async () => {
    if (!editToken.trim()) return;
    setSavingToken(true);
    try {
      const updated = await api.patch<MCPServer>(`/api/chat/${teamId}/mcp-servers/${server.id}/`, {
        auth_token: editToken.trim(),
      });
      onUpdate(updated);
      setEditToken("");
      success("Token updated.");
    } catch {
      showError("Failed to update token.");
    } finally {
      setSavingToken(false);
    }
  };

  const isSynced = server.capabilities.length > 0;

  return (
    <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden transition-all">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface-1)]">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--bg-900)]">
          <ServerIcon name={server.name} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--text-primary)] capitalize">
              {server.name}
            </span>
            <StatusBadge enabled={server.enabled} synced={isSynced} />
          </div>
          <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{server.url}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Sync */}
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Sync tools from gateway"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)] transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Sync integration"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          </button>

          {/* Toggle enable/disable */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            title={server.enabled ? "Disable" : "Enable"}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
              server.enabled ? "bg-emerald-500" : "bg-[var(--bg-700)]"
            }`}
            aria-label={server.enabled ? "Disable integration" : "Enable integration"}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                server.enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>

          {/* Expand details */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-800)] transition-colors cursor-pointer"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Remove integration"
          >
            {deleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] px-4 py-3 bg-[var(--bg-950)] space-y-3">
          {/* Discovered tools */}
          {isSynced && (
            <div>
              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Discovered Tools ({server.capabilities.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {server.capabilities.map((tool) => (
                  <span
                    key={tool}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--bg-800)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Token update */}
          <div>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              {server.has_token ? "Rotate Auth Token" : "Add Auth Token"}
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showToken ? "text" : "password"}
                  value={editToken}
                  onChange={(e) => setEditToken(e.target.value)}
                  placeholder={
                    server.has_token ? "Enter new token to rotate…" : "Paste token here…"
                  }
                  className="w-full px-3 py-1.5 pr-9 bg-[var(--bg-900)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 rounded-lg transition-colors placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={handleSaveToken}
                disabled={savingToken || !editToken.trim()}
                className="px-3 py-1.5 text-[12px] bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1.5 cursor-pointer"
              >
                {savingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>

          {/* Meta */}
          <p className="text-[10px] text-[var(--text-muted)]">
            Added {new Date(server.created_at).toLocaleDateString()} · Last updated{" "}
            {new Date(server.updated_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

export function IntegrationsSettings({ teamId, myRole }: IntegrationsSettingsProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const isOwner = myRole === "owner";

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<MCPServer[]>(`/api/chat/${teamId}/mcp-servers/`);
      setServers(Array.isArray(data) ? data : []);
    } catch {
      // Non-owners will get 403 — silently ignore
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (teamId && isOwner) loadServers();
    else setLoading(false);
  }, [teamId, isOwner, loadServers]);

  const handleDelete = (id: string) => setServers((prev) => prev.filter((s) => s.id !== id));
  const handleUpdate = (updated: MCPServer) =>
    setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  const handleAdd = (server: MCPServer) => {
    setServers((prev) => [...prev, server]);
    setShowAddModal(false);
  };

  if (!isOwner) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8 text-center max-w-xl">
        <Plug className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Integrations</h3>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Only team owners can manage MCP integrations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            MCP Integrations
          </h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            Connect external tools via Model Context Protocol gateways. The AI agent will use these
            tools automatically.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3 py-2 text-[12px] font-semibold bg-[var(--accent)] text-white rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Integration
        </button>
      </div>

      {/* Preset info cards */}
      <div className="grid grid-cols-2 gap-3">
        {PRESET_INTEGRATIONS.map((p) => {
          const { Icon } = p;
          const registered = servers.find((s) => s.name === p.key);
          return (
            <div
              key={p.key}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                registered
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-[var(--border-subtle)] bg-[var(--surface-1)]"
              }`}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--bg-900)]">
                <Icon className="w-4 h-4" style={{ color: p.iconColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                    {p.label}
                  </span>
                  {registered && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  {p.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Registered servers list */}
      <div>
        <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
          Registered Servers ({servers.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : servers.length === 0 ? (
          <div className="border border-dashed border-[var(--border-subtle)] rounded-xl p-8 text-center">
            <Plug className="w-7 h-7 text-[var(--text-muted)] mx-auto mb-2" />
            <p className="text-[13px] text-[var(--text-secondary)] font-medium">
              No integrations yet
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">
              Add a GitHub, Slack, Trello, Notion, Google Drive, or Google Calendar gateway to get started.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-3 px-3 py-1.5 text-[12px] font-semibold text-[var(--accent)] border border-[var(--accent)]/30 rounded-lg hover:bg-[var(--accent)]/10 transition-colors cursor-pointer"
            >
              + Add your first integration
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <ServerRow
                key={server.id}
                server={server}
                teamId={teamId}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Architecture note */}
      <div className="flex gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold text-amber-400">Gateway Required</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
            Each integration requires a running MCP HTTP gateway. The gateway bridges the agent to
            external APIs. See{" "}
            <span className="font-mono text-[10px] bg-[var(--bg-800)] px-1 rounded">
              MCP_INTEGRATION_PLAN.md
            </span>{" "}
            for setup instructions.
          </p>
        </div>
      </div>

      {showAddModal && (
        <AddServerModal
          teamId={teamId}
          onClose={() => setShowAddModal(false)}
          onSave={handleAdd}
        />
      )}
    </div>
  );
}
