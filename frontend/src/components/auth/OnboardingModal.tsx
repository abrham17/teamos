"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { ArrowRight } from "lucide-react";
import { Illustration } from "@/components/ui/Illustration";
import { ICONSCOUT } from "@/lib/iconscoutAssets";

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const { success, error } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !teamName.trim()) {
      error("All fields are required to continue.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/onboarding/finalize/", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        team_name: teamName.trim(),
      });
      success("Profile & Team created! Welcome to TeamOS.");
      
      // Reload to ensure all stores (wiki, etc) have the new team context
      window.location.reload();
      onComplete();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : "Failed to finalize onboarding.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--bg-950)]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-8">
          <Illustration
            src={ICONSCOUT.illustrations.onboardingWelcome}
            alt="Welcome to your team"
            width={200}
            height={150}
            className="mb-4 max-h-[140px]"
          />

          <h2 className="text-2xl font-bold text-center text-[var(--text-primary)] mb-2">
            Welcome to TeamOS
          </h2>
          <p className="text-[var(--text-muted)] text-center text-sm mb-8">
            Please enter your name to complete your professional profile.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-dim)] px-1">
                First Name
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. John"
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-dim)] px-1">
                Last Name
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Doe"
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-900)] border border-[var(--border-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all outline-none"
              />
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--accent)] px-1">
                First Team Name
              </label>
              <input
                type="text"
                required
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. My Awesome Team"
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-950)] border border-[var(--accent)]/30 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all outline-none"
              />
              <p className="text-[9px] text-[var(--text-dim)] px-1">
                You can change this later in settings.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-4 bg-[var(--accent)] text-[var(--bg-950)] font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              {loading ? "Saving..." : "Start Using TeamOS"}
              {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>
        </div>
        
        <div className="px-8 py-4 bg-[var(--bg-900)]/50 border-t border-[var(--border-subtle)] text-center">
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-tighter">
            Your name will be visible to your teammates
          </p>
        </div>
      </div>
    </div>
  );
}
