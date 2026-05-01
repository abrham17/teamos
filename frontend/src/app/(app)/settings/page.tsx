"use client";

import { useEffect, useState } from "react";
import { useWikiStore } from "@/stores/useWikiStore";
import { api } from "@/lib/api";
import { Download, Users, Plus, Shield, Settings2, AlertTriangle, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export default function SettingsPage() {
  const { currentTeamId } = useWikiStore();
  const { success, info, error } = useToast();
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");

  useEffect(() => {
    if (!currentTeamId) return;
    api.get(`/auth/teams/${currentTeamId}/`).then(setTeam).catch(console.error);
    api.get(`/auth/teams/${currentTeamId}/members/`).then(setMembers).catch(console.error);
    api.get(`/auth/teams/${currentTeamId}/invites/`).then(setInvites).catch(console.error);
  }, [currentTeamId]);

  const refreshInvites = async () => {
    if (!currentTeamId) return;
    const data = await api.get(`/auth/teams/${currentTeamId}/invites/`);
    setInvites(data);
  };

  const handleInviteMember = async () => {
    if (!currentTeamId) return;
    if (!inviteEmail.trim()) {
      error("Invite email is required.");
      return;
    }
    try {
      await api.post(`/auth/teams/${currentTeamId}/invite/`, {
        invitee_email: inviteEmail.trim(),
        role: inviteRole,
      });
      success("Invite created and email dispatch requested.");
      setInviteEmail("");
      setInviteRole("editor");
      await refreshInvites();
    } catch (e: any) {
      error(e?.message || "Failed to send invite.");
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    if (!currentTeamId) return;
    try {
      await api.post(`/auth/teams/${currentTeamId}/invites/${inviteId}/resend/`, {});
      info("Invite resend requested.");
      await refreshInvites();
    } catch (e: any) {
      error(e?.message || "Failed to resend invite.");
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!currentTeamId) return;
    try {
      await api.post(`/auth/teams/${currentTeamId}/invites/${inviteId}/revoke/`, {});
      success("Invite revoked.");
      await refreshInvites();
    } catch (e: any) {
      error(e?.message || "Failed to revoke invite.");
    }
  };

  const handleExportWiki = () => {
    if (!currentTeamId) return;
    info("Preparing your wiki export...");
    // We navigate to the backend endpoint which returns a ZIP attachment
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/export/${currentTeamId}/wiki/`;
    window.open(url, "_blank");
  };

  const handleDeleteTeam = () => {
    if (!confirm("Are you absolutely sure? This will delete all wiki pages, chat history, and semantic graph data for this team. This action is irreversible.")) return;
    // Implementation for delete...
    info("Delete requested. This would call the backend delete endpoint.");
  };

  if (!currentTeamId) return <div className="p-8">Select a team first</div>;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-900)] overflow-y-auto">
      <div className="flex items-center h-14 border-b border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--surface-1)]">
        <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Settings2 className="w-5 h-5" /> Team Settings
        </h2>
      </div>

      <div className="max-w-4xl mx-auto w-full p-8 flex flex-col gap-12">
        {/* Profile Section */}
        <section>
          <div className="mb-4">
            <h3 className="text-lg font-medium text-[var(--text-primary)]">Team Profile</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">Manage your team's identity and subscription plan.</p>
          </div>
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[var(--text-muted)] text-sm mb-1">Team Name</div>
                <div className="text-xl font-semibold">{team?.name || 'Loading...'}</div>
              </div>
              <div>
                <div className="text-[var(--text-muted)] text-sm mb-1">Current Plan</div>
                <div className="px-3 py-1 bg-[var(--accent)] text-[var(--bg-950)] text-sm font-bold rounded-full uppercase tracking-wide">
                  {team?.plan || 'FREE'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Members Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
                <Users className="w-5 h-5" /> Members
              </h3>
              <p className="text-sm text-[var(--text-muted)] mt-1">Add or remove team members and manage their roles.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
                className="px-3 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="px-3 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] text-sm capitalize"
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="owner">owner</option>
              </select>
              <button
                onClick={handleInviteMember}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-800)] border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-lg text-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Invite Member
              </button>
            </div>
          </div>
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-800)]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-900)] border border-[var(--border-subtle)] flex items-center justify-center font-bold text-[var(--accent)]">
                    {m.user?.email?.[0].toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">{m.user?.first_name} {m.user?.last_name}</div>
                    <div className="text-sm text-[var(--text-muted)]">{m.user?.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-950)] text-xs font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] capitalize">
                    {m.role === 'owner' && <Shield className="w-3 h-3 text-amber-500" />}
                    {m.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] text-sm font-medium">
              Pending / recent invites
            </div>
            {invites.length === 0 ? (
              <div className="px-4 py-4 text-sm text-[var(--text-muted)]">No invites yet.</div>
            ) : (
              invites.map((invite) => (
                <div key={invite.id} className="px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">{invite.invitee_email}</div>
                      <div className="text-[var(--text-muted)]">
                        Role: <span className="capitalize">{invite.role}</span> · Status: {invite.send_status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!invite.used_at && !invite.revoked_at && (
                        <>
                          <button
                            onClick={() => handleResendInvite(invite.id)}
                            className="px-3 py-1.5 rounded border border-[var(--border-subtle)] hover:border-[var(--accent)]"
                          >
                            Resend
                          </button>
                          <button
                            onClick={() => handleRevokeInvite(invite.id)}
                            className="px-3 py-1.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10"
                          >
                            Revoke
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Data & Export Section */}
        <section>
          <div className="mb-4">
            <h3 className="text-lg font-medium text-[var(--text-primary)]">Data Management</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">Export your data for portability or backup.</p>
          </div>
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Export Full Wiki</h4>
                <p className="text-sm text-[var(--text-muted)] mt-1 max-w-md">
                  Download a ZIP file containing all your wiki pages as Markdown files, including the semantic `_graph.json` mapping.
                </p>
              </div>
              <button 
                onClick={handleExportWiki}
                className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-[var(--bg-950)] font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                <Download className="w-4 h-4" /> Download ZIP
              </button>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="mb-12">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Danger Zone
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">Irreversible actions that affect your entire team.</p>
          </div>
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-red-500">Delete this team</h4>
                <p className="text-sm text-[var(--text-muted)] mt-1 max-w-md">
                  Once deleted, all data associated with this team will be permanently removed. This cannot be undone.
                </p>
              </div>
              <button 
                onClick={handleDeleteTeam}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-500/10 border border-red-500/20 text-red-500 font-medium rounded-lg hover:bg-red-500 hover:text-white transition-all"
              >
                <Trash2 className="w-4 h-4" /> Delete Team
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
