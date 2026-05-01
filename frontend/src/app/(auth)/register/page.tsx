"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Command, UserPlus } from "lucide-react";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.post("/auth/register/", formData);
      // Auto create a personal team
      await api.post("/auth/teams/", { name: "Personal Team" });
      // Redirect
      window.location.href = "/wiki";
    } catch (err: any) {
      setError(err.message || "Registration failed. Please check your details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[var(--bg-950)] text-[var(--text-primary)]">
      {/* Left side form */}
      <div className="flex-1 flex flex-col justify-center items-center px-8 relative z-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden flex items-center justify-center gap-2">
            <Command className="w-8 h-8 text-[var(--accent)]" />
            <h1 className="text-2xl font-bold tracking-tight">TeamOS</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Create an account</h2>
            <p className="text-[var(--text-muted)]">Start building your team's knowledge graph</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="flex flex-col gap-5">
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-medium text-[var(--text-muted)]">First name</label>
                <input 
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={e => setFormData({...formData, first_name: e.target.value})}
                  className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                  placeholder="Jane"
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-medium text-[var(--text-muted)]">Last name</label>
                <input 
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={e => setFormData({...formData, last_name: e.target.value})}
                  className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-muted)]">Email address</label>
              <input 
                type="email"
                required
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                placeholder="name@company.com"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-muted)]">Password</label>
              <input 
                type="password"
                required
                minLength={8}
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                placeholder="Minimum 8 characters"
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-[var(--accent)] text-[var(--bg-950)] font-semibold rounded-xl py-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Creating account..." : (
                <>Get Started <UserPlus className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-[var(--text-muted)]">
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--accent)] font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right side decorative */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center relative overflow-hidden bg-[var(--bg-900)] border-l border-[var(--border-subtle)]">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute w-[600px] h-[600px] bg-[var(--accent)] rounded-full blur-[120px] opacity-10 animate-pulse"></div>
        
        <div className="relative z-10 text-center max-w-md px-8">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Command className="w-10 h-10 text-[var(--accent)]" />
            <h1 className="text-4xl font-bold tracking-tight">TeamOS</h1>
          </div>
          <p className="text-xl text-[var(--text-muted)] leading-relaxed">
            Stop searching. Start knowing. TeamOS automatically wires your knowledge together.
          </p>
        </div>
      </div>
    </div>
  );
}
