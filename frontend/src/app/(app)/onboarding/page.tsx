"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AVATAR_OPTIONS } from "@/lib/avatars";
import { ArrowRight, Check, Sparkles, Command } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const selectedAvatarObj = AVATAR_OPTIONS.find(a => a.id === selectedAvatar);

  const handleFinalize = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    if (!teamName.trim()) {
      setError("Team name is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/onboarding/finalize/", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        team_name: teamName.trim(),
        avatar_id: selectedAvatar || "av01",
      });

      // Update avatar URL if selected
      if (selectedAvatarObj) {
        await api.patch("/auth/me/profile/", {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          avatar_url: selectedAvatarObj.svg,
        }).catch(() => {});
      }

      router.push("/wiki");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-950)] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[var(--accent)]/[0.03] rounded-full blur-3xl -mt-[400px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-purple-500/[0.03] rounded-full blur-3xl -mb-[300px] -mr-[200px]" />
      </div>

      <div className="w-full max-w-2xl relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center">
            <Command className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <span className="text-xl font-bold text-[var(--text-primary)] tracking-tight">TeamOS</span>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className={`w-8 h-1 rounded-full transition-colors ${step >= 1 ? "bg-[var(--accent)]" : "bg-white/10"}`} />
          <div className={`w-8 h-1 rounded-full transition-colors ${step >= 2 ? "bg-[var(--accent)]" : "bg-white/10"}`} />
        </div>

        <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl overflow-hidden">
          {step === 1 ? (
            /* ── Step 1: Name & Avatar ── */
            <div className="p-8 md:p-12">
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded-full mb-4">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span className="text-[10px] font-black text-[var(--accent)] uppercase tracking-[0.2em]">Welcome Aboard</span>
                </div>
                <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-tight mb-2">
                  Set Up Your Profile
                </h1>
                <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
                  Tell us your name and pick an avatar. Your teammates will see this across TeamOS.
                </p>
              </div>

              {/* Name inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-dim)] px-1">
                    First Name <span className="text-[var(--accent)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setError(null); }}
                    placeholder="John"
                    className="w-full px-4 py-3.5 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all outline-none text-[var(--text-primary)] placeholder:text-[var(--text-dim)]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-dim)] px-1">
                    Last Name <span className="text-[var(--accent)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); setError(null); }}
                    placeholder="Doe"
                    className="w-full px-4 py-3.5 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all outline-none text-[var(--text-primary)] placeholder:text-[var(--text-dim)]"
                  />
                </div>
              </div>

              {/* Avatar picker */}
              <div className="space-y-4">
                <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-dim)] px-1">
                  Choose Your Avatar
                </label>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
                  {AVATAR_OPTIONS.map(avatar => (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => setSelectedAvatar(avatar.id)}
                      title={avatar.label}
                      className={`relative w-full aspect-square rounded-2xl overflow-hidden border-2 transition-all hover:scale-110 ${
                        selectedAvatar === avatar.id
                          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30 scale-110"
                          : "border-transparent hover:border-white/20"
                      }`}
                    >
                      <img src={avatar.svg} alt={avatar.label} className="w-full h-full" />
                      {selectedAvatar === avatar.id && (
                        <div className="absolute inset-0 bg-[var(--accent)]/20 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white drop-shadow-lg" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="mt-4 text-sm text-red-400 text-center bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>
              )}

              <button
                onClick={() => {
                  if (!firstName.trim() || !lastName.trim()) {
                    setError("First name and last name are required.");
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
                className="w-full mt-8 py-4 bg-[var(--accent)] text-[var(--bg-950)] font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 group text-sm"
              >
                Continue
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ) : (
            /* ── Step 2: Team Name ── */
            <div className="p-8 md:p-12">
              <div className="text-center mb-10">
                <div className="flex items-center justify-center gap-4 mb-6">
                  {selectedAvatarObj && (
                    <img src={selectedAvatarObj.svg} alt="Your avatar" className="w-16 h-16 rounded-2xl border-2 border-[var(--accent)]/30" />
                  )}
                  <div className="text-left">
                    <p className="text-lg font-bold text-[var(--text-primary)]">{firstName} {lastName}</p>
                    <p className="text-xs text-[var(--text-muted)]">Almost ready!</p>
                  </div>
                </div>
                <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-tight mb-2">
                  Create Your First Team
                </h1>
                <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
                  Every workspace in TeamOS belongs to a team. You can always create more later.
                </p>
              </div>

              <div className="space-y-2 mb-6">
                <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-dim)] px-1">
                  Team Name <span className="text-[var(--accent)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => { setTeamName(e.target.value); setError(null); }}
                  placeholder="e.g. Acme Engineering"
                  className="w-full px-4 py-3.5 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all outline-none text-[var(--text-primary)] text-lg placeholder:text-[var(--text-dim)]"
                  autoFocus
                />
                <p className="text-[10px] text-[var(--text-dim)] px-1">You can rename this later in Settings.</p>
              </div>

              {error && (
                <p className="mt-4 text-sm text-red-400 text-center bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-4 rounded-xl border border-[var(--border-subtle)] text-[var(--text-muted)] font-bold text-sm hover:bg-[var(--surface-2)] transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={loading}
                  className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-950)] font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 group text-sm disabled:opacity-50"
                >
                  {loading ? "Creating workspace..." : "Launch TeamOS"}
                  {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                </button>
              </div>
            </div>
          )}

          <div className="px-8 py-4 bg-[var(--bg-900)]/50 border-t border-[var(--border-subtle)] text-center">
            <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-[0.15em]">
              Your profile is visible to your teammates across all workspaces
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
