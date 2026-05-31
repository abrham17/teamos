"use client";

import { useEffect, useRef, useState } from "react";
import { useWikiStore } from "@/stores/useWikiStore";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import { fetchBillingQuote, startTeamCheckout } from "@/lib/billingCheckout";
import {
  getPendingActionMessage,
  isConfirmActionDisabled,
  isConfirmationMatch,
  normalizeEmail,
  type PendingAction,
} from "@/lib/settingsConfirm";
import { Download, Users, Plus, Shield, Settings2, AlertTriangle, Trash2, Clock } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BillingSettings } from "@/components/settings/BillingSettings";
import { IntegrationsSettings } from "@/components/settings/IntegrationsSettings";
import { AVATAR_OPTIONS } from "@/lib/avatars";

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
  display_name?: string;
  avatar_url?: string;
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
  const [activeTab, setActiveTab] = useState<
    "profile" | "workspace" | "members" | "billing" | "instructions" | "integrations" | "api_keys"
  >("profile");
  const [billingCheckoutPrefs, setBillingCheckoutPrefs] = useState<{
    plan_key: "team" | "pro" | "enterprise";
    seat_count: number;
    usage_tier: "low" | "standard" | "high";
  }>({ plan_key: "team", seat_count: 8, usage_tier: "standard" });

  // Profile editing state
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const avatarOptions = AVATAR_OPTIONS;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const bp = sp.get("billing_plan");
    const seats = sp.get("seats");
    const usage = sp.get("usage");
    if (bp === "team" || bp === "pro" || bp === "enterprise" || bp === "free") {
      if (bp !== "free") setBillingCheckoutPrefs((prev) => ({ ...prev, plan_key: bp }));
      setActiveTab("billing");
    }
    if (seats && !Number.isNaN(Number(seats))) setBillingCheckoutPrefs((prev) => ({ ...prev, seat_count: Math.max(1, Number(seats)) }));
    if (usage === "low" || usage === "standard" || usage === "high") setBillingCheckoutPrefs((prev) => ({ ...prev, usage_tier: usage }));
  }, []);

  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!currentTeamId || !isLoaded || !isSignedIn) return;
    api
      .get<MeResponse & { first_name?: string; last_name?: string; avatar_url?: string }>("/auth/me/")
      .then((me) => {
        setMyUserId(me?.id || null);
        setMyEmail(normalizeEmail(me?.email || ""));
        if (me?.first_name) setProfileFirstName(me.first_name);
        if (me?.last_name) setProfileLastName(me.last_name);
        if (me?.avatar_url) setProfileAvatarUrl(me.avatar_url);
      })
      .catch(console.error);
    api.get<TeamData>(`/auth/teams/${currentTeamId}/`).then(setTeam).catch(console.error);
    api.get<TeamMemberRow[]>(`/auth/teams/${currentTeamId}/members/`).then(setMembers).catch(console.error);
    api.get<TeamInviteRow[]>(`/auth/teams/${currentTeamId}/invites/`).then(setInvites).catch(console.error);
  }, [currentTeamId, isLoaded, isSignedIn]);

  const handleSaveProfile = async () => {
    if (!profileFirstName.trim() || !profileLastName.trim()) {
      error("First and last names are required.");
      return;
    }
    setProfileSaving(true);
    try {
      await api.patch("/auth/me/profile/", {
        first_name: profileFirstName.trim(),
        last_name: profileLastName.trim(),
        avatar_url: profileAvatarUrl,
      });
      success("Profile saved!");
      if (myUserId) {
        setMembers((prev) =>
          prev.map((m) =>
            m.user.id === myUserId
              ? {
                  ...m,
                  user: {
                    ...m.user,
                    first_name: profileFirstName,
                    last_name: profileLastName,
                    display_name: `${profileFirstName} ${profileLastName}`,
                  },
                }
              : m
          )
        );
      }
    } catch (err: unknown) {
      error(toErrorMessage(err, "Failed to save profile."));
    } finally {
      setProfileSaving(false);
    }
  };

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

  const handleExportWiki = async () => {
    if (!currentTeamId) return;
    info("Preparing your wiki export...");
    try {
      const { getApiAuthHeaders } = await import("@/lib/api");
      const authHeaders = await getApiAuthHeaders();
      const url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/export/${currentTeamId}/wiki/`;
      const res = await fetch(url, {
        method: "GET",
        headers: { ...authHeaders },
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `teamos_export.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
      success("Wiki exported successfully!");
    } catch (err: unknown) {
      error(toErrorMessage(err, "Failed to export wiki."));
    }
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
    setActiveTab("members");
    setTimeout(() => {
      inviteEmailRef.current?.focus();
    }, 100);
  };

  if (!currentTeamId) return <div className="p-8">Select a team first</div>;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-950)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center h-14 border-b border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--bg-900)] z-20">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-[var(--accent)]" /> Settings
        </h2>
      </div>

      {/* Two Column Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar Navigation */}
        <div className="w-[200px] border-r border-[var(--border-subtle)] bg-[var(--bg-900)] p-4 shrink-0 flex flex-col gap-4 overflow-y-auto">
          <div>
            <div className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2 px-2">
              General
            </div>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => setActiveTab("profile")}
                className={`flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-left text-xs font-medium transition-all ${
                  activeTab === "profile"
                    ? "bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setActiveTab("workspace")}
                className={`flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-left text-xs font-medium transition-all ${
                  activeTab === "workspace"
                    ? "bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                Workspace
              </button>
              <button
                onClick={() => setActiveTab("members")}
                className={`flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-left text-xs font-medium transition-all ${
                  activeTab === "members"
                    ? "bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                Members
              </button>
              <button
                onClick={() => setActiveTab("billing")}
                className={`flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-left text-xs font-medium transition-all ${
                  activeTab === "billing"
                    ? "bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                Billing
              </button>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2 px-2">
              Agent
            </div>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => setActiveTab("instructions")}
                className={`flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-left text-xs font-medium transition-all ${
                  activeTab === "instructions"
                    ? "bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                Instructions
              </button>
              <button
                onClick={() => setActiveTab("integrations")}
                className={`flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-left text-xs font-medium transition-all ${
                  activeTab === "integrations"
                    ? "bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                Integrations
              </button>
              <button
                onClick={() => setActiveTab("api_keys")}
                className={`flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-left text-xs font-medium transition-all ${
                  activeTab === "api_keys"
                    ? "bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold shadow-sm"
                    : "text-[var(--text-muted)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                API Keys
              </button>
            </div>
          </div>
        </div>

        {/* Right Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-[var(--bg-950)]">
          <div className="max-w-4xl w-full mx-auto">
            {activeTab === "billing" && (
              <div className="w-full">
                <BillingSettings />
              </div>
            )}

            {activeTab === "members" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column: Active Team Members List */}
                <div className="lg:col-span-7 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 tracking-tight">
                      <Users className="w-5 h-5 text-[var(--accent)]" /> Active Team Members
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Manage role allocations and user access controls.</p>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden shadow-sm">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--sidebar-bg-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-800)] flex items-center justify-center shrink-0">
                            {m.user?.avatar_url ? (
                              <img src={m.user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center font-bold text-[13px] text-[var(--bg-950)] uppercase">
                                {(m.user?.display_name?.[0] || m.user?.email?.[0] || "?").toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-[var(--text-primary)] text-sm truncate">
                              {m.user?.display_name || "Anonymous User"}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate">{m.user?.email}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-900)] text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] border border-[var(--border-subtle)] capitalize">
                            {m.role === "owner" && <Shield className="w-3 h-3 text-amber-400" />}
                            {m.role}
                          </span>
                          {team?.my_role === "owner" && m.role !== "owner" && m.user?.id !== myUserId && (
                            <div className="flex items-center gap-1.5">
                              {m.role === "viewer" ? (
                                <button
                                  onClick={() => handleChangeMemberRole(m.user.id, "editor")}
                                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[11px] font-bold transition-all"
                                >
                                  Make editor
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleChangeMemberRole(m.user.id, "viewer")}
                                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[11px] font-bold transition-all"
                                >
                                  Make viewer
                                </button>
                              )}
                              <button
                                onClick={() => handleTransferOwnership(m.user.id)}
                                className="px-2.5 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:border-amber-400 hover:bg-amber-400/10 text-[11px] font-bold transition-all"
                              >
                                Make owner
                              </button>
                              <button
                                onClick={() => handleRemoveMember(m.user.id)}
                                className="px-2.5 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-bg)] text-[11px] font-bold transition-all"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: Invite Form & Pending Invites */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Invite Teammate Card */}
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5 space-y-4 shadow-sm">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 tracking-tight">
                        <Plus className="w-4 h-4 text-[var(--accent)]" /> Invite Teammate
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)]">Send an invite link to coordinate planning.</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase tracking-widest font-black text-[var(--text-dim)] px-1">
                          Email Address
                        </label>
                        <input
                          ref={inviteEmailRef}
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="px-3 py-2 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 transition-all w-full"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] uppercase tracking-widest font-black text-[var(--text-dim)] px-1">
                          Role Type
                        </label>
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className="px-3 py-2 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] capitalize outline-none w-full"
                        >
                          <option value="viewer">viewer</option>
                          <option value="editor">editor</option>
                          <option value="owner">owner</option>
                        </select>
                      </div>

                      <button
                        onClick={handleInviteMember}
                        className="flex items-center justify-center gap-2 px-4 py-2 w-full rounded-xl bg-[var(--accent)] text-[var(--bg-950)] text-[13px] font-extrabold hover:shadow-md transition-all active:scale-95 pt-2.5 pb-2.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Send Invitation
                      </button>
                    </div>
                  </div>

                  {/* Pending Invites Card */}
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden shadow-sm">
                    <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-900)] text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent)]" /> Pending invites
                    </div>
                    {invites.length === 0 ? (
                      <div className="p-5 text-center text-xs text-[var(--text-muted)] flex flex-col items-center gap-2">
                        <span>No pending invitations.</span>
                        <button
                          onClick={openInviteComposer}
                          className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)]/50 text-xs font-bold transition-all mt-1 cursor-pointer"
                        >
                          Invite first teammate
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {invites.map((invite) => (
                          <div key={invite.id} className="p-4 text-xs space-y-2">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="font-bold text-[var(--text-primary)] truncate">
                                  {invite.invitee_email}
                                </div>
                                <div className="text-[10px] font-semibold text-[var(--text-muted)] mt-1 space-y-0.5">
                                  <div>
                                    Role: <span className="capitalize text-[var(--text-secondary)]">{invite.role}</span>
                                  </div>
                                  <div>
                                    Delivery:{" "}
                                    <span className="capitalize text-[var(--text-secondary)]">
                                      {invite.send_status}
                                    </span>
                                  </div>
                                  <div>
                                    Status:{" "}
                                    <span className="capitalize text-[var(--text-secondary)]">
                                      {formatInviteStatus(invite)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!invite.used_at && !invite.revoked_at && (
                                  <>
                                    <button
                                      onClick={() => handleResendInvite(invite.id)}
                                      className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[10px] font-bold transition-all"
                                    >
                                      Resend
                                    </button>
                                    <button
                                      onClick={() => handleRevokeInvite(invite.id)}
                                      className="px-2.5 py-1 rounded-lg border border-[var(--danger)]/20 text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-bg)] text-[10px] font-bold transition-all"
                                    >
                                      Revoke
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "profile" && (
              <div className="max-w-2xl space-y-8">
                {/* Personal Profile Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Personal Profile</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Manage your unique digital identity across TeamOS.</p>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 space-y-6 shadow-sm">
                    {/* Avatar Section */}
                    <div className="space-y-3">
                      <label className="text-[10px] uppercase tracking-widest font-black text-[var(--text-dim)] px-1">
                        Avatar Selection
                      </label>
                      <div className="flex items-center gap-4 mb-3">
                        <div className="w-14 h-14 rounded-full overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-800)] flex items-center justify-center shrink-0">
                          {profileAvatarUrl ? (
                            <img src={profileAvatarUrl} alt="Avatar" className="w-full h-full object-cover animate-in fade-in duration-300" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center text-white font-bold text-xl uppercase">
                              {profileFirstName?.[0]?.toUpperCase() || "U"}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[var(--text-primary)]">
                            {profileFirstName || ""} {profileLastName || ""}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)]">Select from the DiceBear generator looks below.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 p-3 bg-[var(--bg-900)] rounded-xl border border-[var(--border-subtle)]">
                        {avatarOptions.map((avatar) => (
                          <button
                            key={avatar.id}
                            type="button"
                            onClick={() => setProfileAvatarUrl(avatar.svg)}
                            title={avatar.label}
                            className={`relative w-full aspect-square overflow-hidden rounded-lg border-2 transition-all hover:scale-105 active:scale-95 ${
                              profileAvatarUrl === avatar.svg
                                ? "border-[var(--accent)] shadow-sm"
                                : "border-transparent bg-[var(--bg-800)] hover:border-[var(--border-strong)]"
                            }`}
                          >
                            <img src={avatar.svg} alt={avatar.label} className="w-full h-full" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Name Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-widest font-black text-[var(--text-dim)] px-1">
                          First Name <span className="text-[var(--accent)]">*</span>
                        </label>
                        <input
                          type="text"
                          value={profileFirstName}
                          onChange={(e) => setProfileFirstName(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 outline-none text-[13px] text-[var(--text-primary)] transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-widest font-black text-[var(--text-dim)] px-1">
                          Last Name <span className="text-[var(--accent)]">*</span>
                        </label>
                        <input
                          type="text"
                          value={profileLastName}
                          onChange={(e) => setProfileLastName(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 outline-none text-[13px] text-[var(--text-primary)] transition-all"
                        />
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSaveProfile}
                        disabled={profileSaving}
                        className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--bg-950)] font-extrabold text-[13px] hover:shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                      >
                        {profileSaving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Workflow Shortcuts Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Workflow Shortcuts</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Quickly access primary workspaces and coordinate actions.</p>
                  </div>
                  <div className="border border-[var(--border-subtle)] rounded-2xl overflow-hidden grid grid-cols-2 md:grid-cols-4 bg-[var(--surface-1)] shadow-sm">
                    <button
                      onClick={openInviteComposer}
                      className="px-3 py-4 border-r border-b md:border-b-0 border-[var(--border-subtle)] hover:bg-[var(--sidebar-bg-hover)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-bold uppercase tracking-wider cursor-pointer text-center"
                    >
                      Invite teammate
                    </button>
                    <button
                      onClick={() => (window.location.href = "/wiki")}
                      className="px-3 py-4 border-r border-b md:border-b-0 border-[var(--border-subtle)] hover:bg-[var(--sidebar-bg-hover)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-bold uppercase tracking-wider cursor-pointer text-center"
                    >
                      Open wiki
                    </button>
                    <button
                      onClick={() => (window.location.href = "/chat")}
                      className="px-3 py-4 border-r border-[var(--border-subtle)] hover:bg-[var(--sidebar-bg-hover)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-bold uppercase tracking-wider cursor-pointer text-center"
                    >
                      Open chat
                    </button>
                    <button
                      onClick={handleExportWiki}
                      className="px-3 py-4 hover:bg-[var(--sidebar-bg-hover)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-bold uppercase tracking-wider cursor-pointer text-center"
                    >
                      Export wiki
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "workspace" && (
              <div className="max-w-2xl space-y-8">
                {/* Team Profile Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Team Settings</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Manage corporate identity, seats, and upgrades.</p>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 shadow-sm space-y-5">
                    <div className="flex flex-col gap-1">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-black">
                        Team Name
                      </div>
                      <div className="text-lg font-bold text-[var(--text-primary)]">{team?.name || "Loading..."}</div>
                    </div>

                    <div className="pt-2 border-t border-[var(--border-subtle)] space-y-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-black">
                            Current Plan
                          </div>
                          <div className="text-xs font-bold text-[var(--text-secondary)] mt-0.5 uppercase tracking-wider">
                            {team?.plan || "FREE"}
                          </div>
                        </div>
                        <div className="px-3 py-1 bg-[var(--accent)] text-[var(--bg-950)] text-[10px] font-black uppercase tracking-widest rounded-md shadow-sm">
                          {team?.plan || "FREE"}
                        </div>
                      </div>

                      {team?.my_role === "owner" && team?.plan !== "enterprise" && (
                        <div className="space-y-3 pt-3 bg-[var(--bg-900)] p-4 rounded-xl border border-[var(--border-subtle)]">
                          <p className="text-[10px] uppercase font-black tracking-widest text-[var(--text-dim)]">
                            Customize upgrade quote
                          </p>

                          <div className="grid grid-cols-1 gap-3">
                            <label className="flex items-center justify-between text-[11px] font-bold text-[var(--text-secondary)]">
                              <span>Plan Variant</span>
                              <select
                                value={billingCheckoutPrefs.plan_key}
                                onChange={(e) =>
                                  setBillingCheckoutPrefs((p) => ({
                                    ...p,
                                    plan_key: e.target.value as "team" | "pro" | "enterprise",
                                  }))
                                }
                                className="border border-[var(--border-subtle)] bg-[var(--bg-900)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] capitalize outline-none"
                              >
                                <option value="team">Team</option>
                                <option value="pro">Pro</option>
                                <option value="enterprise">Enterprise</option>
                              </select>
                            </label>

                            <label className="flex items-center justify-between text-[11px] font-bold text-[var(--text-secondary)]">
                              <span>Teammate Seats</span>
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
                                className="w-16 border border-[var(--border-subtle)] bg-[var(--bg-900)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] outline-none text-right"
                              />
                            </label>

                            <label className="flex items-center justify-between text-[11px] font-bold text-[var(--text-secondary)]">
                              <span>Usage Tier</span>
                              <select
                                value={billingCheckoutPrefs.usage_tier}
                                onChange={(e) =>
                                  setBillingCheckoutPrefs((p) => ({
                                    ...p,
                                    usage_tier: e.target.value as "low" | "standard" | "high",
                                  }))
                                }
                                className="border border-[var(--border-subtle)] bg-[var(--bg-900)] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] outline-none"
                              >
                                <option value="low">Light</option>
                                <option value="standard">Standard</option>
                                <option value="high">Heavy</option>
                              </select>
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={handleUpgradePlan}
                            className="w-full mt-3 px-4 py-2.5 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] text-[var(--bg-950)] text-xs font-black uppercase tracking-wider hover:shadow-md transition-all cursor-pointer text-center"
                          >
                            Checkout / Upgrade
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Data & Export Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Data Portability</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Manage team-wide backups and assets.</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5 shadow-sm space-y-4">
                    <div>
                      <h4 className="font-bold text-[13px] text-[var(--text-primary)] flex items-center gap-1.5">
                        <Download className="w-4 h-4 text-[var(--accent)]" /> Export Wiki Repository
                      </h4>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
                        Download a complete ZIP package containing all wiki docs formatted as Markdown, including graph matrices.
                      </p>
                    </div>
                    <button
                      onClick={handleExportWiki}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)] text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> Download Markdown ZIP
                    </button>
                  </div>
                </div>

                {/* Danger Zone Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-rose-500 flex items-center gap-2 tracking-tight">
                      <AlertTriangle className="w-5 h-5" /> Danger Zone
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">
                      Irreversible administrative actions affecting everything.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.02] p-5 shadow-sm space-y-4">
                    <div>
                      <h4 className="font-bold text-[13px] text-rose-400">Destroy this team</h4>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
                        Delete all planning details, documents, and historical team chats forever. This cannot be undone.
                      </p>
                    </div>
                    <button
                      onClick={handleDeleteTeam}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 font-extrabold text-[11px] uppercase tracking-wider hover:bg-rose-500 hover:text-[var(--bg-950)] transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Permanently Delete Team
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(activeTab === "instructions" || activeTab === "api_keys") && (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8 text-center max-w-xl">
                <h3 className="text-base font-semibold text-[var(--text-primary)] capitalize">
                  {activeTab.replace("_", " ")}
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-2">
                  This feature is coming soon in a future release of TeamOS Zen.
                </p>
              </div>
            )}

            {activeTab === "integrations" && currentTeamId && (
              <IntegrationsSettings
                teamId={currentTeamId}
                myRole={team?.my_role}
              />
            )}
          </div>
        </div>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg border border-[var(--border-strong)] bg-[var(--bg-800)] p-6 rounded-2xl">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Confirm Action</h3>
            <p className="text-[13px] text-[var(--text-muted)] mt-2">
              {getPendingActionMessage(pendingAction)}
            </p>
            <div className="mt-4 border border-amber-500/30 px-3 py-2 text-[12px] text-amber-400">
              Type your email <span className="font-semibold">{myEmail || "(loading...)"}</span> to confirm.
            </div>
            <input
              type="email"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder="your-email@company.com"
              className="mt-4 w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] text-[13px] outline-none focus:border-[var(--accent)]/50 rounded-xl"
              disabled={actionBusy}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={closeConfirmationModal}
                className="px-3 py-2 border border-[var(--border-subtle)] text-[13px] hover:bg-[var(--bg-700)] transition-colors rounded-xl cursor-pointer"
                disabled={actionBusy}
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                className="px-3 py-2 bg-[var(--danger)] text-white text-[13px] disabled:opacity-60 rounded-xl cursor-pointer"
                disabled={isConfirmActionDisabled({ actionBusy, myEmail, confirmationInput })}
              >
                {actionBusy ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
