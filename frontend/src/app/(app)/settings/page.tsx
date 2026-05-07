"use client";

import { useEffect, useRef, useState } from "react";
import { useWikiStore } from "@/stores/useWikiStore";
import { api } from "@/lib/api";
import { fetchBillingQuote, startTeamCheckout } from "@/lib/billingCheckout";
import {
  getPendingActionMessage,
  isConfirmActionDisabled,
  isConfirmationMatch,
  normalizeEmail,
  type PendingAction,
} from "@/lib/settingsConfirm";
import { Download, Users, Plus, Shield, Settings2, AlertTriangle, Trash2, CreditCard } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BillingSettings } from "@/components/settings/BillingSettings";

interface TeamData {
  id: string;
  name: string;
  slug: string;
  plan: string;
  my_role?: "owner" | "editor" | "viewer";
}

interface TeamUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

interface TeamMemberRow {
  id: string;
  role: "owner" | "editor" | "viewer";
  user: TeamUser;
}

interface TeamInviteRow {
  id: string;
  invitee_email: string;
  role: "owner" | "editor" | "viewer";
  send_status?: string;
  lifecycle_status?: string;
  revoked_at?: string | null;
  used_at?: string | null;
}

interface MeResponse {
  id: string;
  email: string;
}

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function SettingsPage() {
  const { currentTeamId } = useWikiStore();
  const { success, info, error } = useToast();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string>("");
  const [team, setTeam] = useState<TeamData | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [invites, setInvites] = useState<TeamInviteRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const inviteEmailRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "members" | "billing">("profile");
  const [billingCheckoutPrefs, setBillingCheckoutPrefs] = useState<{
    plan_key: "team" | "pro" | "enterprise";
    seat_count: number;
    usage_tier: "low" | "standard" | "high";
  }>({ plan_key: "team", seat_count: 8, usage_tier: "standard" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const bp = sp.get("billing_plan");
    const seats = sp.get("seats");
    const usage = sp.get("usage");
    if (bp === "team" || bp === "pro" || bp === "enterprise") {
      setBillingCheckoutPrefs((prev) => ({ ...prev, plan_key: bp }));
      setActiveTab("billing");
    }
    if (seats && !Number.isNaN(Number(seats))) setBillingCheckoutPrefs((prev) => ({ ...prev, seat_count: Math.max(1, Number(seats)) }));
    if (usage === "low" || usage === "standard" || usage === "high") setBillingCheckoutPrefs((prev) => ({ ...prev, usage_tier: usage }));
  }, []);

  useEffect(() => {
    if (!currentTeamId) return;
    api
      .get<MeResponse>("/auth/me/")
      .then((me) => {
        setMyUserId(me?.id || null);
        setMyEmail(normalizeEmail(me?.email || ""));
      })
      .catch(console.error);
    api.get<TeamData>(`/auth/teams/${currentTeamId}/`).then(setTeam).catch(console.error);
    api.get<TeamMemberRow[]>(`/auth/teams/${currentTeamId}/members/`).then(setMembers).catch(console.error);
    api.get<TeamInviteRow[]>(`/auth/teams/${currentTeamId}/invites/`).then(setInvites).catch(console.error);
  }, [currentTeamId]);

  const refreshMembers = async () => {
    if (!currentTeamId) return;
    const data = await api.get<TeamMemberRow[]>(`/auth/teams/${currentTeamId}/members/`);
    setMembers(data);
  };

  const refreshInvites = async () => {
    if (!currentTeamId) return;
    const data = await api.get<TeamInviteRow[]>(`/auth/teams/${currentTeamId}/invites/`);
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
    } catch (e: unknown) {
      error(toErrorMessage(e, "Failed to send invite."));
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    if (!currentTeamId) return;
    try {
      await api.post(`/auth/teams/${currentTeamId}/invites/${inviteId}/resend/`, {});
      info("Invite resend requested.");
      await refreshInvites();
    } catch (e: unknown) {
      error(toErrorMessage(e, "Failed to resend invite."));
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!currentTeamId) return;
    try {
      await api.post(`/auth/teams/${currentTeamId}/invites/${inviteId}/revoke/`, {});
      success("Invite revoked.");
      await refreshInvites();
    } catch (e: unknown) {
      error(toErrorMessage(e, "Failed to revoke invite."));
    }
  };

  const handleRemoveMember = async (userId: string) => {
    const member = members.find((m) => m.user?.id === userId);
    if (!member) return;
    setPendingAction({
      type: "remove_member",
      userId,
      label: member.user?.email || "this member",
    });
    setConfirmationInput("");
  };

  const handleTransferOwnership = async (userId: string) => {
    const member = members.find((m) => m.user?.id === userId);
    if (!member) return;
    setPendingAction({
      type: "transfer_owner",
      userId,
      label: member.user?.email || "this member",
    });
    setConfirmationInput("");
  };

  const handleChangeMemberRole = async (userId: string, role: "viewer" | "editor") => {
    if (!currentTeamId) return;
    try {
      await api.patch(`/auth/teams/${currentTeamId}/members/`, {
        user_id: userId,
        role,
      });
      success(`Member role updated to ${role}.`);
      await refreshMembers();
    } catch (e: unknown) {
      error(toErrorMessage(e, "Failed to update member role."));
    }
  };

  const formatInviteStatus = (invite: TeamInviteRow) => {
    if (invite.lifecycle_status) return invite.lifecycle_status;
    if (invite.revoked_at) return "revoked";
    if (invite.used_at) return "accepted";
    return "pending";
  };

  const handleExportWiki = () => {
    if (!currentTeamId) return;
    info("Preparing your wiki export...");
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/export/${currentTeamId}/wiki/`;
    window.open(url, "_blank");
  };

  const handleDeleteTeam = () => {
    setPendingAction({ type: "delete_team" });
    setConfirmationInput("");
  };

  const handleUpgradePlan = async () => {
    if (!currentTeamId) return;
    if (team?.my_role !== "owner") {
      error("Only the team owner can start checkout.");
      return;
    }
    try {
      await api.post(`/analytics/${currentTeamId}/events/upgrade-clicked/`, {
        surface: "settings_team_profile",
      });
      const quote = await fetchBillingQuote({
        plan_key: billingCheckoutPrefs.plan_key,
        seat_count: billingCheckoutPrefs.seat_count,
        usage_tier: billingCheckoutPrefs.usage_tier,
      });
      const successUrl = `${window.location.origin}/settings?billing=success`;
      const cancelUrl = `${window.location.origin}/settings?billing=cancel`;
      const checkout = await startTeamCheckout(currentTeamId, {
        plan_key: quote.plan_key,
        seat_count: quote.seat_count,
        usage_tier: quote.usage_tier,
        monthly_total_cents: quote.monthly_total_cents,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (checkout?.checkout_url) {
        window.open(checkout.checkout_url, "_blank");
        info("Opening checkout...");
      } else {
        info("Upgrade intent recorded.");
      }
    } catch (e: unknown) {
      error(toErrorMessage(e, "Unable to start upgrade flow."));
    }
  };

  const closeConfirmationModal = () => {
    if (actionBusy) return;
    setPendingAction(null);
    setConfirmationInput("");
  };

  const executeConfirmedAction = async () => {
    if (!currentTeamId || !pendingAction || !myEmail) return;
    if (!isConfirmationMatch(confirmationInput, myEmail)) return;
    setActionBusy(true);
    try {
      if (pendingAction.type === "remove_member") {
        await api.delete(`/auth/teams/${currentTeamId}/members/`, {
          user_id: pendingAction.userId,
          confirmation_email: myEmail,
        });
        success("Member removed.");
        await refreshMembers();
      } else if (pendingAction.type === "transfer_owner") {
        await api.post(`/auth/teams/${currentTeamId}/transfer-ownership/`, {
          new_owner_user_id: pendingAction.userId,
          confirmation_email: myEmail,
        });
        success("Ownership transferred.");
        const teamData = await api.get<TeamData>(`/auth/teams/${currentTeamId}/`);
        setTeam(teamData);
        await refreshMembers();
      } else {
        await api.delete(`/auth/teams/${currentTeamId}/`, {
          confirmation_email: myEmail,
        });
        success("Team scheduled for deletion.");
        window.location.href = "/wiki";
      }
      setPendingAction(null);
      setConfirmationInput("");
    } catch (e: unknown) {
      error(toErrorMessage(e, "Action failed."));
    } finally {
      setActionBusy(false);
    }
  };

  const openInviteComposer = () => {
    inviteEmailRef.current?.focus();
  };

  if (!currentTeamId) return <div className="p-8">Select a team first</div>;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-900)] overflow-y-auto">
      <div className="flex items-center h-14 border-b border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--surface-1)] justify-between">
        <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Settings2 className="w-5 h-5" /> Team Settings
        </h2>
        <div className="flex items-center bg-[var(--bg-900)] rounded-lg p-1 border border-[var(--border-subtle)]">
          <button 
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${activeTab === 'profile' ? 'bg-[var(--accent)] text-[var(--bg-950)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            Profile
          </button>
          <button 
            onClick={() => setActiveTab("members")}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${activeTab === 'members' ? 'bg-[var(--accent)] text-[var(--bg-950)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            Members
          </button>
          <button 
            onClick={() => setActiveTab("billing")}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${activeTab === 'billing' ? 'bg-[var(--accent)] text-[var(--bg-950)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            Billing
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full p-8 flex flex-col gap-12">
        {activeTab === "billing" && <BillingSettings />}

        {activeTab === "members" && (
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
                  ref={inviteEmailRef}
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
                    {team?.my_role === "owner" && m.role !== "owner" && m.user?.id !== myUserId && (
                      <>
                        {m.role === "viewer" ? (
                          <button
                            onClick={() => handleChangeMemberRole(m.user.id, "editor")}
                            className="px-2.5 py-1 rounded border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs"
                          >
                            Make editor
                          </button>
                        ) : (
                          <button
                            onClick={() => handleChangeMemberRole(m.user.id, "viewer")}
                            className="px-2.5 py-1 rounded border border-slate-500/30 text-slate-300 hover:bg-slate-500/10 text-xs"
                          >
                            Make viewer
                          </button>
                        )}
                        <button
                          onClick={() => handleTransferOwnership(m.user.id)}
                          className="px-2.5 py-1 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs"
                        >
                          Make owner
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          className="px-2.5 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] text-sm font-medium">
                Pending / recent invites
              </div>
              {invites.length === 0 ? (
                <div className="px-4 py-4 text-sm text-[var(--text-muted)] flex items-center justify-between gap-3">
                  <span>No invites yet.</span>
                  <button
                    onClick={openInviteComposer}
                    className="px-3 py-1.5 rounded border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs"
                  >
                    Invite first teammate
                  </button>
                </div>
              ) : (
                invites.map((invite) => (
                  <div key={invite.id} className="px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium">{invite.invitee_email}</div>
                        <div className="text-[var(--text-muted)]">
                          Role: <span className="capitalize">{invite.role}</span> · Delivery: {invite.send_status} · Invite:{" "}
                          <span className="capitalize">{formatInviteStatus(invite)}</span>
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
        )}

        {activeTab === "profile" && (
          <>
            {/* Profile Section */}
            <section>
              <div className="mb-4">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">Team Profile</h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">Manage your team&apos;s identity and subscription plan.</p>
              </div>
              <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[var(--text-muted)] text-sm mb-1">Team Name</div>
                    <div className="text-xl font-semibold">{team?.name || 'Loading...'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {team?.my_role === "owner" && team?.plan !== "enterprise" && (
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">
                          Plan
                          <select
                            value={billingCheckoutPrefs.plan_key}
                            onChange={(e) =>
                              setBillingCheckoutPrefs((p) => ({
                                ...p,
                                plan_key: e.target.value as "team" | "pro" | "enterprise",
                              }))
                            }
                            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2 py-1.5 text-xs text-[var(--text-primary)] capitalize"
                          >
                            <option value="team">Team</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">
                          Seats
                          <input
                            type="number"
                            min={1}
                            max={250}
                            value={billingCheckoutPrefs.seat_count}
                            onChange={(e) =>
                              setBillingCheckoutPrefs((p) => ({
                                ...p,
                                seat_count: Math.max(1, Math.min(250, Number(e.target.value) || 1)),
                              }))
                            }
                            className="w-16 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">
                          Usage
                          <select
                            value={billingCheckoutPrefs.usage_tier}
                            onChange={(e) =>
                              setBillingCheckoutPrefs((p) => ({
                                ...p,
                                usage_tier: e.target.value as "low" | "standard" | "high",
                              }))
                            }
                            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-900)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                          >
                            <option value="low">Light</option>
                            <option value="standard">Standard</option>
                            <option value="high">Heavy</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={handleUpgradePlan}
                          className="px-3 py-2 rounded border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10 text-sm"
                        >
                          Upgrade plan
                        </button>
                      </div>
                    )}
                    <div>
                      <div className="text-[var(--text-muted)] text-sm mb-1">Current Plan</div>
                      <div className="px-3 py-1 bg-[var(--accent)] text-[var(--bg-950)] text-sm font-bold rounded-full uppercase tracking-wide">
                        {team?.plan || 'FREE'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Workflow Shortcuts */}
            <section>
              <div className="mb-4">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">Workflow Shortcuts</h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">Quickly continue common team workflows.</p>
              </div>
              <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-2">
                <button
                  onClick={openInviteComposer}
                  className="px-3 py-2 rounded border border-[var(--border-subtle)] hover:border-[var(--accent)] text-sm"
                >
                  Invite teammate
                </button>
                <button
                  onClick={() => (window.location.href = "/wiki")}
                  className="px-3 py-2 rounded border border-[var(--border-subtle)] hover:border-[var(--accent)] text-sm"
                >
                  Open wiki
                </button>
                <button
                  onClick={() => (window.location.href = "/chat")}
                  className="px-3 py-2 rounded border border-[var(--border-subtle)] hover:border-[var(--accent)] text-sm"
                >
                  Open chat
                </button>
                <button
                  onClick={handleExportWiki}
                  className="px-3 py-2 rounded border border-[var(--border-subtle)] hover:border-[var(--accent)] text-sm"
                >
                  Export wiki
                </button>
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
          </>
        )}
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Confirm Sensitive Action</h3>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              {getPendingActionMessage(pendingAction)}
            </p>
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Type your email <span className="font-semibold">{myEmail || "(loading...)"}</span> to confirm.
            </div>
            <input
              type="email"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder="your-email@company.com"
              className="mt-4 w-full px-3 py-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] text-sm"
              disabled={actionBusy}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={closeConfirmationModal}
                className="px-3 py-2 rounded border border-[var(--border-subtle)] text-sm"
                disabled={actionBusy}
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                className="px-3 py-2 rounded bg-red-500 text-white text-sm disabled:opacity-60"
                disabled={isConfirmActionDisabled({ actionBusy, myEmail, confirmationInput })}
              >
                {actionBusy ? "Processing..." : "Confirm action"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
