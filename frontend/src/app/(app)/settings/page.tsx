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
import { Download, Users, Plus, Shield, Settings2, AlertTriangle, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BillingSettings } from "@/components/settings/BillingSettings";
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
  }> ({ plan_key: "team", seat_count: 8, usage_tier: "standard" });

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
      // Update local member list too
      if (myUserId) {
        setMembers(prev => prev.map(m => m.user.id === myUserId ? {
          ...m, user: { ...m.user, first_name: profileFirstName, last_name: profileLastName, display_name: `${profileFirstName} ${profileLastName}` }
        } : m));
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
      const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/export/${currentTeamId}/wiki/`;
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
    inviteEmailRef.current?.focus();
  };

  if (!currentTeamId) return <div className="p-8">Select a team first</div>;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-950)] overflow-y-auto">
      <div className="flex items-center h-14 border-b border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] justify-between z-20">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-[var(--accent)]" /> Settings
        </h2>
        <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl p-1">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-1.5 text-[12px] font-semibold rounded-lg transition-all ${activeTab === 'profile' ? 'bg-[var(--accent)] text-[var(--bg-950)] shadow-[var(--shadow-glow)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.04]'}`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`px-4 py-1.5 text-[12px] font-semibold rounded-lg transition-all ${activeTab === 'members' ? 'bg-[var(--accent)] text-[var(--bg-950)] shadow-[var(--shadow-glow)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.04]'}`}
          >
            Members
          </button>
          <button
            onClick={() => setActiveTab("billing")}
            className={`px-4 py-1.5 text-[12px] font-semibold rounded-lg transition-all ${activeTab === 'billing' ? 'bg-[var(--accent)] text-[var(--bg-950)] shadow-[var(--shadow-glow)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.04]'}`}
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
                  className="px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 transition-all"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[13px] text-[var(--text-primary)] capitalize outline-none"
                  style={{ colorScheme: "dark" }}
                >
                  <option value="viewer">viewer</option>
                  <option value="editor">editor</option>
                  <option value="owner">owner</option>
                </select>
                <button
                  onClick={handleInviteMember}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--bg-950)] text-[13px] font-bold hover:shadow-[var(--shadow-glow)] transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" /> Invite
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] overflow-hidden shadow-md backdrop-blur-md">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between p-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.01] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center font-semibold text-[13px] text-[var(--bg-950)]">
                      {(m.user?.display_name?.[0] || m.user?.email?.[0] || '?').toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">{m.user?.display_name || "Anonymous User"}</div>
                      <div className="text-sm text-[var(--text-muted)]">{m.user?.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] text-[11px] font-medium text-[var(--text-secondary)] border border-white/[0.05] capitalize">
                      {m.role === 'owner' && <Shield className="w-3 h-3 text-amber-400" />}
                      {m.role}
                    </span>
                    {team?.my_role === "owner" && m.role !== "owner" && m.user?.id !== myUserId && (
                      <>
                        {m.role === "viewer" ? (
                          <button
                            onClick={() => handleChangeMemberRole(m.user.id, "editor")}
                            className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[11px] transition-all"
                          >
                            Make editor
                          </button>
                        ) : (
                          <button
                            onClick={() => handleChangeMemberRole(m.user.id, "viewer")}
                            className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[11px] transition-all"
                          >
                            Make viewer
                          </button>
                        )}
                        <button
                          onClick={() => handleTransferOwnership(m.user.id)}
                          className="px-2.5 py-1 rounded-lg border border-amber-500/30 text-amber-400 hover:border-amber-400 hover:bg-amber-400/10 text-[11px] transition-all"
                        >
                          Make owner
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          className="px-2.5 py-1 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-bg)] text-[11px] transition-all"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] overflow-hidden shadow-md backdrop-blur-md">
              <div className="px-4 py-3 border-b border-white/[0.04] bg-white/[0.01] text-[11px] font-semibold uppercase tracking-widest text-[var(--text-dim)]">
                Pending invites
              </div>
              {invites.length === 0 ? (
                <div className="px-4 py-4 text-sm text-[var(--text-muted)] flex items-center justify-between gap-3">
                  <span>No invites yet.</span>
                  <button
                    onClick={openInviteComposer}
                    className="px-3.5 py-1.5 rounded-xl border border-white/[0.08] hover:border-[var(--accent)]/50 text-xs transition-all"
                  >
                    Invite first teammate
                  </button>
                </div>
              ) : (
                invites.map((invite) => (
                  <div key={invite.id} className="px-4 py-3 border-b border-white/[0.04] last:border-0 text-sm">
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
                              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[12px] transition-all"
                            >
                              Resend
                            </button>
                            <button
                              onClick={() => handleRevokeInvite(invite.id)}
                              className="px-3 py-1.5 rounded-lg border border-[var(--danger)]/20 text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-bg)] text-[12px] transition-all"
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
            {/* Personal Profile Section */}
            <section>
              <div className="mb-4">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">Personal Profile</h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">Manage your identity across TeamOS.</p>
              </div>
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 space-y-6 shadow-md backdrop-blur-md">
                {/* Avatar Section */}
                <div className="space-y-3">
                  <label className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-dim)] px-1">Avatar</label>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[var(--border-strong)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center text-white font-bold text-xl shrink-0">
                      {profileAvatarUrl
                        ? /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={profileAvatarUrl} alt="Avatar" className="w-full h-full" />
                        : (profileFirstName?.[0]?.toUpperCase() || "U")
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {profileFirstName || ""} {profileLastName || ""}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">Choose an avatar below</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                    {avatarOptions.map(avatar => (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => setProfileAvatarUrl(avatar.svg)}
                        title={avatar.label}
                        className={`relative w-full aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                          profileAvatarUrl === avatar.svg
                            ? "border-[var(--accent)] shadow-[var(--shadow-glow)]"
                            : "border-transparent hover:border-white/[0.2]"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={avatar.svg} alt={avatar.label} className="w-full h-full" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-dim)] px-1">
                      First Name <span className="text-[var(--accent)]">*</span>
                    </label>
                    <input
                      type="text"
                      value={profileFirstName}
                      onChange={(e) => setProfileFirstName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 outline-none text-[13px] text-[var(--text-primary)] transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-dim)] px-1">
                      Last Name <span className="text-[var(--accent)]">*</span>
                    </label>
                    <input
                      type="text"
                      value={profileLastName}
                      onChange={(e) => setProfileLastName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent)]/5 outline-none text-[13px] text-[var(--text-primary)] transition-all"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--bg-950)] font-bold text-[13px] hover:shadow-[var(--shadow-glow)] active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {profileSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </section>

            {/* Team Profile Section */}
            <section>
              <div className="mb-4">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">Team Profile</h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">Manage your team&apos;s identity and subscription plan.</p>
              </div>
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 shadow-md backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] text-[var(--text-muted)] mb-1 uppercase tracking-wider">Team Name</div>
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
                            className="border border-white/[0.06] bg-white/[0.02] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] capitalize outline-none"
                            style={{ colorScheme: "dark" }}
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
                            className="w-16 border border-white/[0.06] bg-white/[0.02] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] outline-none"
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
                            className="border border-white/[0.06] bg-white/[0.02] rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] outline-none"
                            style={{ colorScheme: "dark" }}
                          >
                            <option value="low">Light</option>
                            <option value="standard">Standard</option>
                            <option value="high">Heavy</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={handleUpgradePlan}
                          className="px-3 py-2 rounded-xl border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-subtle)] text-[12px] transition-colors"
                        >
                          Upgrade plan
                        </button>
                      </div>
                    )}
                    <div>
                      <div className="text-[var(--text-muted)] text-sm mb-1">Current Plan</div>
                      <div className="px-3 py-1.5 bg-[var(--accent)] text-[var(--bg-950)] text-[11px] font-bold uppercase tracking-wide rounded-lg">
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
              <div className="border border-white/[0.05] rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-4 bg-white/[0.02]">
                <button
                  onClick={openInviteComposer}
                  className="px-3 py-3.5 border-r border-white/[0.05] hover:bg-white/[0.02] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-medium"
                >
                  Invite teammate
                </button>
                <button
                  onClick={() => (window.location.href = "/wiki")}
                  className="px-3 py-3.5 border-r border-white/[0.05] hover:bg-white/[0.02] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-medium"
                >
                  Open wiki
                </button>
                <button
                  onClick={() => (window.location.href = "/chat")}
                  className="px-3 py-3.5 border-r border-white/[0.05] hover:bg-white/[0.02] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-medium"
                >
                  Open chat
                </button>
                <button
                  onClick={handleExportWiki}
                  className="px-3 py-3.5 hover:bg-white/[0.02] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-medium"
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
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 shadow-md backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-[13px] text-[var(--text-primary)]">Export Full Wiki</h4>
                    <p className="text-[12px] text-[var(--text-muted)] mt-1.5 max-w-md leading-relaxed">
                      Download a ZIP of all wiki pages as Markdown, including the semantic graph mapping.
                    </p>
                  </div>
                  <button 
                    onClick={handleExportWiki}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-[var(--bg-950)] font-bold text-[13px] rounded-xl hover:shadow-[var(--shadow-glow)] transition-all"
                  >
                    <Download className="w-4 h-4" /> Download ZIP
                  </button>
                </div>
              </div>
            </section>

            {/* Danger Zone */}
            <section className="mb-12">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-rose-500 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Danger Zone
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">Irreversible actions that affect your entire team.</p>
              </div>
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.02] p-6 shadow-md backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-[13px] text-rose-400">Delete this team</h4>
                    <p className="text-[12px] text-[var(--text-muted)] mt-1.5 max-w-md leading-relaxed">
                      All data will be permanently removed. This cannot be undone.
                    </p>
                  </div>
                  <button 
                    onClick={handleDeleteTeam}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 font-medium text-[13px] hover:bg-rose-500 hover:text-[var(--bg-950)] hover:font-bold transition-all"
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
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg border border-[var(--border-strong)] bg-[var(--bg-800)] p-6">
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
              className="mt-4 w-full px-3 py-2 bg-[var(--bg-900)] border border-[var(--border-subtle)] text-[13px] outline-none focus:border-[var(--accent)]/50"
              disabled={actionBusy}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={closeConfirmationModal}
                className="px-3 py-2 border border-[var(--border-subtle)] text-[13px] hover:bg-[var(--bg-700)] transition-colors"
                disabled={actionBusy}
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                className="px-3 py-2 bg-[var(--danger)] text-white text-[13px] disabled:opacity-60"
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
