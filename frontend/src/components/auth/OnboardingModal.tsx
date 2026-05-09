"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { User, ArrowRight } from "lucide-react";

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const { success, error } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      error("Both names are required to continue.");
      return;
    }

    setLoading(true);
    try {
      await api.patch("/auth/me/profile/", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      success("Profile updated! Welcome to TeamOS.");
      onComplete();
    } catch (err: any) {
      error(err.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--bg-950)]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-8">
          <div className="w-16 h-16 bg-[var(--accent)]/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <User className="w-8 h-8 text-[var(--accent)]" />
          </div>
          
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
