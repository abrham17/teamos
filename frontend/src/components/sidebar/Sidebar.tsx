"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useWikiStore } from "@/stores/useWikiStore";
import { useTheme } from "@/components/ui/ThemeProvider";
import { api } from "@/lib/api";
import {
  Book,
  Share2,
  MessageSquare,
  Target,
  Upload,
  BarChart3,
  Settings,
  LogOut,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Sun,
  Moon,
  Command,
} from "lucide-react";

interface Team {
  id: string;
  name: string;
  plan?: string;
}

interface ClerkGlobal {
  Clerk?: {
    signOut?: (args?: { redirectUrl?: string }) => Promise<void>;
  };
}

const NAV_ITEMS = [
  { href: "/wiki",    icon: Book,           label: "Wiki"   },
  { href: "/plan",    icon: Target,         label: "Plan"   },
  { href: "/graph",   icon: Share2,         label: "Graph"  },
  { href: "/chat",    icon: MessageSquare,  label: "Chat"   },
  { href: "/ingest",  icon: Upload,         label: "Ingest" },
  { href: "/analytics", icon: BarChart3,    label: "Analytics" },
];

interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentTeamId, setCurrentTeamId } = useWikiStore();
  const { theme, toggle: toggleTheme } = useTheme();

  const [user, setUser]                 = useState<User | null>(null);
  const [teams, setTeams]               = useState<Team[]>([]);
  const [collapsed, setCollapsed]       = useState(false);
  const [teamDropOpen, setTeamDropOpen] = useState(false);
  const [teamLoadError, setTeamLoadError] = useState<string | null>(null);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [createTeamBusy, setCreateTeamBusy] = useState(false);
  const [createTeamError, setCreateTeamError] = useState<string | null>(null);

  const teamDropRef = useRef<HTMLDivElement>(null);
  const currentTeam = teams.find(t => t.id === currentTeamId);

  const { isLoaded, isSignedIn } = useAuth();

  /* ── Restore collapse state ── */
  useEffect(() => {
    setCollapsed(localStorage.getItem("teamos-sidebar-collapsed") === "true");
  }, []);

  /* ── Fetch teams & User ── */
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    api.get<User>("/auth/me/").then(setUser).catch(console.error);
    api
      .get<Team[]>("/auth/teams/")
      .then((data) => {
        setTeams(data);
        setTeamLoadError(null);
        if (data.length > 0 && !currentTeamId) setCurrentTeamId(data[0].id);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load teams.";
        setTeamLoadError(message);
        console.error(err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  /* ── Close team dropdown on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (teamDropRef.current && !teamDropRef.current.contains(e.target as Node)) {
        setTeamDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("teamos-sidebar-collapsed", String(next));
  };

  const handleLogout = async () => {
    try {
      const clerk = (window as Window & ClerkGlobal).Clerk;
      if (clerk?.signOut) {
        await clerk.signOut({ redirectUrl: "/login" });
        return;
      }
    } catch {
      // fall back to login redirect below
    }
    window.location.href = "/login";
  };

  const handleCreateTeam = async () => {
    const trimmed = newTeamName.trim();
    if (!trimmed) {
      setCreateTeamError("Team name is required.");
      return;
    }
    if (trimmed.length < 2) {
      setCreateTeamError("Team name must be at least 2 characters.");
      return;
    }

    setCreateTeamBusy(true);
    setCreateTeamError(null);
    try {
      const created = await api.post<Team>("/auth/teams/", { name: trimmed });
      setTeams((prev) => {
        const exists = prev.some((t) => t.id === created.id);
        return exists ? prev : [...prev, created];
      });
      setCurrentTeamId(created.id);
      setTeamLoadError(null);
      setCreateTeamOpen(false);
      setNewTeamName("");
      setTeamDropOpen(false);
      router.push("/wiki");
    } catch (err) {
      setCreateTeamError(err instanceof Error ? err.message : "Failed to create team.");
    } finally {
      setCreateTeamBusy(false);
    }
  };

  const isActive = (href: string) =>
    href === "/wiki" ? pathname.startsWith("/wiki") : pathname.startsWith(href);

  /* ── Nav item class helper ── */
  const navCls = (href: string) => {
    const active = isActive(href);
    if (collapsed) {
      return [
        "w-10 h-10 flex items-center justify-center transition-colors duration-150 shrink-0 relative",
        active
          ? "bg-[var(--surface-2)] text-[var(--accent)] border-l-2 border-l-[var(--accent)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]",
      ].join(" ");
    }
    return [
      "flex items-center gap-3 px-3 py-2 w-full text-sm transition-colors duration-150 border-l-2",
      active
        ? "bg-[var(--surface-2)] text-[var(--accent)] font-medium border-l-[var(--accent)]"
        : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] border-l-transparent",
    ].join(" ");
  };

  const bottomBtnCls = (danger = false) => {
    if (collapsed) {
      return [
        "w-10 h-10 flex items-center justify-center transition-colors duration-150 shrink-0",
        danger
          ? "text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]",
      ].join(" ");
    }
    return [
      "flex items-center gap-3 px-3 py-2 w-full text-sm transition-colors duration-150 border-l-2 border-l-transparent",
      danger
        ? "text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]"
        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]",
    ].join(" ");
  };

  return (
    <div
      style={{ width: collapsed ? "72px" : "240px" }}
      className="bg-[var(--bg-800)] border-r border-[var(--border-subtle)] flex flex-col h-full shrink-0 transition-[width] duration-[220ms] ease-in-out overflow-hidden"
    >
      {/* ── Logo + Collapse toggle ── */}
      <div
        className={`flex items-center h-14 border-b border-[var(--border-subtle)] shrink-0 ${
          collapsed ? "justify-center" : "px-4 justify-between"
        }`}
      >
        {collapsed ? (
          <Command className="w-5 h-5 text-[var(--accent)]" />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Command className="w-5 h-5 text-[var(--accent)]" />
              <span className="font-bold text-[var(--text-primary)] tracking-tight text-[15px]">
                TeamOS
              </span>
            </div>
            <button
              onClick={toggleCollapsed}
              title="Collapse sidebar"
              className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* ── Team selector ── */}
      <div
        className={`border-b border-[var(--border-subtle)] ${
          collapsed ? "py-3 flex justify-center" : "p-3"
        }`}
        ref={teamDropRef}
      >
        {collapsed ? (
          <button
            onClick={toggleCollapsed}
            title={currentTeam?.name || "Expand to switch team"}
            className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent)] font-bold text-sm hover:border-[var(--accent)] transition-colors"
          >
            {currentTeam?.name?.[0]?.toUpperCase() ?? "T"}
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => setTeamDropOpen(v => !v)}
              className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--surface-2)] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent)] font-bold text-sm shrink-0">
                {currentTeam?.name?.[0]?.toUpperCase() ?? "T"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
                  {currentTeam?.name ?? "Select Team"}
                </div>
                {currentTeam?.plan && (
                  <div className="text-[11px] text-[var(--text-muted)] capitalize leading-tight">
                    {currentTeam.plan} plan
                  </div>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[var(--text-dim)] transition-transform duration-200 ${
                  teamDropOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {teamDropOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl z-50 overflow-hidden"
                style={{ boxShadow: "var(--shadow-lg)" }}
              >
                {teamLoadError && (
                  <div className="px-3 py-2 text-xs text-red-300 border-b border-[var(--border-subtle)]">
                    {teamLoadError}
                  </div>
                )}
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setCurrentTeamId(t.id); setTeamDropOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-[var(--surface-2)] text-[var(--text-primary)] transition-colors"
                  >
                    <div className="w-6 h-6 rounded-md bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] text-xs font-bold">
                      {t.name[0].toUpperCase()}
                    </div>
                    <span className="flex-1 truncate">{t.name}</span>
                    {t.id === currentTeamId && (
                      <Check className="w-4 h-4 text-[var(--accent)]" />
                    )}
                  </button>
                ))}
                <div className="border-t border-[var(--border-subtle)] p-2">
                  {!createTeamOpen ? (
                    <button
                      onClick={() => {
                        setCreateTeamOpen(true);
                        setCreateTeamError(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Create Team
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        value={newTeamName}
                        onChange={(e) => {
                          setNewTeamName(e.target.value);
                          if (createTeamError) setCreateTeamError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleCreateTeam();
                          }
                          if (e.key === "Escape") {
                            setCreateTeamOpen(false);
                            setCreateTeamError(null);
                            setNewTeamName("");
                          }
                        }}
                        placeholder="New team name"
                        className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-900)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--accent)]"
                        autoFocus
                        disabled={createTeamBusy}
                      />
                      {createTeamError && (
                        <p className="text-xs text-red-300 px-1">{createTeamError}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void handleCreateTeam()}
                          disabled={createTeamBusy}
                          className="flex-1 px-3 py-2 rounded-lg text-sm bg-[var(--accent)] text-[var(--bg-950)] disabled:opacity-60"
                        >
                          {createTeamBusy ? "Creating..." : "Create"}
                        </button>
                        <button
                          onClick={() => {
                            if (createTeamBusy) return;
                            setCreateTeamOpen(false);
                            setCreateTeamError(null);
                            setNewTeamName("");
                          }}
                          disabled={createTeamBusy}
                          className="px-3 py-2 rounded-lg text-sm border border-[var(--border-subtle)] hover:border-[var(--text-muted)] disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav
        className={`flex-1 overflow-y-auto py-3 flex flex-col gap-0.5 ${
          collapsed ? "items-center px-0" : "px-2"
        }`}
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={navCls(href)}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </Link>
        ))}
      </nav>

      {/* ── New Page CTA ── */}
      <div className={`pb-2 ${collapsed ? "flex justify-center px-0" : "px-2"}`}>
        {collapsed ? (
          <button
            onClick={() => router.push("/wiki?action=new")}
            title="New Page"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => router.push("/wiki?action=new")}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--bg-950)] font-medium transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            New Page
          </button>
        )}
      </div>

      {/* ── Bottom actions ── */}
      <div
        className={`border-t border-[var(--border-subtle)] py-3 flex flex-col gap-0.5 ${
          collapsed ? "items-center px-0" : "px-2"
        }`}
      >
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={navCls("/settings")}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>

        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={bottomBtnCls(true)}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          className={bottomBtnCls()}
        >
          {theme === "dark"
            ? <Sun className="w-4 h-4 shrink-0" />
            : <Moon className="w-4 h-4 shrink-0" />
          }
          {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </button>

        {/* User Profile */}
        <div className={`pt-2 mt-2 border-t border-white/5 ${collapsed ? "flex justify-center" : "px-1"}`}>
          {collapsed ? (
            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-[var(--surface-2)] text-[var(--accent)] font-bold text-xs">
              {user?.avatar_url
                ? /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={user.avatar_url} alt="" className="w-full h-full" />
                : (user?.display_name?.[0]?.toUpperCase() || "U")
              }
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-[var(--accent-subtle)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent)] font-bold text-xs shrink-0">
                {user?.avatar_url
                  ? /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={user.avatar_url} alt="" className="w-full h-full" />
                  : (user?.display_name?.[0]?.toUpperCase() || "U")
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-[var(--text-primary)] truncate">
                  {user?.display_name || "Anonymous User"}
                </div>
                <div className="text-[10px] text-[var(--text-dim)] truncate">
                  {user?.email || "No email"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Expand button (only visible when collapsed) */}
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            title="Expand sidebar"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors mt-1"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
