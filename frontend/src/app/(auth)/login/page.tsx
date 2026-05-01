"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, Command } from "lucide-react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.post("/auth/login/", { email, password });
      // Redirect to app
      window.location.href = "/wiki";
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[var(--bg-950)] text-[var(--text-primary)]">
      {/* Left side decorative */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center relative overflow-hidden bg-[var(--bg-900)] border-r border-[var(--border-subtle)]">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute w-[600px] h-[600px] bg-[var(--accent)] rounded-full blur-[120px] opacity-10 animate-pulse"></div>
        
        <div className="relative z-10 text-center max-w-md px-8">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Command className="w-10 h-10 text-[var(--accent)]" />
            <h1 className="text-4xl font-bold tracking-tight">TeamOS</h1>
          </div>
          <p className="text-xl text-[var(--text-muted)] leading-relaxed">
            Your team's intelligence, beautifully structured and seamlessly interlinked.
          </p>
        </div>
      </div>

      {/* Right side form */}
      <div className="flex-1 flex flex-col justify-center items-center px-8 relative z-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden flex items-center justify-center gap-2">
            <Command className="w-8 h-8 text-[var(--accent)]" />
            <h1 className="text-2xl font-bold tracking-tight">TeamOS</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Welcome back</h2>
            <p className="text-[var(--text-muted)]">Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-muted)]">Email address</label>
              <input 
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                placeholder="name@company.com"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-[var(--text-muted)]">Password</label>
                <Link href="/forgot-password" className="text-sm text-[var(--accent)] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input 
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-[var(--accent)] text-[var(--bg-950)] font-semibold rounded-xl py-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Signing in..." : (
                <>Sign in <LogIn className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-center justify-center gap-4">
            <div className="flex-1 h-px bg-[var(--border-subtle)]"></div>
            <span className="text-[var(--text-muted)] text-sm">OR</span>
            <div className="flex-1 h-px bg-[var(--border-subtle)]"></div>
          </div>

          <button className="mt-8 w-full bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium rounded-xl py-3 flex items-center justify-center gap-3 hover:bg-[var(--bg-800)] transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
              <path d="M12.0003 4.75C13.7703 4.75 15.3553 5.36 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86 8.87028 4.75 12.0003 4.75Z" fill="#EA4335" />
              <path d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z" fill="#4285F4" />
              <path d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z" fill="#FBBC05" />
              <path d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.26537 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z" fill="#34A853" />
            </svg>
            Sign in with Google
          </button>

          <p className="mt-10 text-center text-sm text-[var(--text-muted)]">
            Don't have an account?{" "}
            <Link href="/register" className="text-[var(--accent)] font-medium hover:underline">
              Create one now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
