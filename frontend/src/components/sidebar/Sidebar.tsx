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
  Plug,
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
  { href: "/wiki", icon: Book, label: "Wiki" },
  { href: "/plan", icon: Target, label: "Plan" },
  { href: "/graph", icon: Share2, label: "Graph" },
  { href: "/chat", icon: MessageSquare, label: "Chat", badge: "3" },
  { href: "/ingest", icon: Upload, label: "Ingest" },
  { href: "/integrations", icon: Plug, label: "Integrations" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
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
  const { currentTeamId, setCurrentTeamId, zenMode } = useWikiStore();
  const { theme, toggle: toggleTheme } = useTheme();

  const [user, setUser] = useState<User | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [teamDropOpen, setTeamDropOpen] = useState(false);
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  useEffect(() => {
    const handleToggle = () => setIsOpenMobile(v => !v);
    window.addEventListener("toggle-sidebar", handleToggle);
    return () => window.removeEventListener("toggle-sidebar", handleToggle);
  }, []);

  useEffect(() => {
    setIsOpenMobile(false);
  }, [pathname]);
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

    api.get<User>("/auth/me/")
      .then(setUser)
      .catch(console.error);

    api
      .get<Team[]>("/auth/teams/")
      .then((data) => {
        setTeams(data);
        setTeamLoadError(null);
        if (data.length > 0) {
          if (!currentTeamId || !data.some(t => t.id === currentTeamId)) {
            setCurrentTeamId(data[0].id);
          }
        }
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
        "w-11 h-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 relative group",
        active
          ? "text-[var(--sidebar-text-primary)] font-medium bg-[var(--sidebar-bg-active)] border border-[var(--sidebar-border-active)]"
          : "text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--sidebar-text-primary)]",
      ].join(" ");
    }
    return [
      "flex items-center gap-3 px-3.5 py-2.5 w-full text-[13px] rounded-xl transition-all duration-200 relative group border border-transparent",
      active
        ? "text-[var(--sidebar-text-primary)] font-semibold bg-[var(--sidebar-bg-active)] border-[var(--sidebar-border-active)]"
        : "text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--sidebar-text-primary)]",
    ].join(" ");
  };

  const bottomBtnCls = (danger = false) => {
    if (collapsed) {
      return [
        "w-11 h-10 flex items-center justify-center rounded-xl transition-all duration-200 shrink-0",
        danger
          ? "text-[var(--sidebar-text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]"
          : "text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-primary)] hover:bg-[var(--sidebar-bg-hover)]",
      ].join(" ");
    }
    return [
      "flex items-center gap-3 px-3.5 py-2.5 w-full text-[13px] rounded-xl transition-all duration-200",
      danger
        ? "text-[var(--sidebar-text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]"
        : "text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-primary)] hover:bg-[var(--sidebar-bg-hover)]",
    ].join(" ");
  };

  if (zenMode) return null;

  return (
    <>
      {/* Backdrop on mobile screens */}
      {isOpenMobile && (
        <div
          onClick={() => setIsOpenMobile(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      <div
        style={{ width: collapsed ? "64px" : "var(--sidebar-w)" }}
        className={`bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out overflow-hidden
          fixed md:static top-0 bottom-0 left-0 z-45 md:z-auto
          ${isOpenMobile ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
      {/* ── Logo + Collapse toggle ── */}
      <div
        className={`flex items-center h-[56px] border-b border-[var(--sidebar-border)] shrink-0 ${collapsed ? "justify-center px-2" : "px-4 justify-between"
          }`}
      >
        {collapsed ? (
          <button onClick={toggleCollapsed} title="Expand sidebar" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[var(--sidebar-bg-hover)] transition-colors">
            <div className="w-7 h-7 rounded-lg bg-transparent border border-[var(--sidebar-border-strong)] flex items-center justify-center">
              <span className="text-[var(--sidebar-text-primary)] font-bold text-[10px]">T</span>
            </div>
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--sidebar-accent)] flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-[11px]">T</span>
              </div>
              <span className="font-semibold text-[var(--sidebar-text-primary)] tracking-tight text-[15px] leading-none">
                TeamOS
              </span>
            </div>
            <button
              onClick={toggleCollapsed}
              title="Collapse sidebar"
              className="p-1.5 rounded-lg text-[var(--sidebar-text-dim)] hover:text-[var(--sidebar-text-primary)] hover:bg-[var(--sidebar-bg-hover)] transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* ── Team selector ── */}
      <div
        className={`border-b border-[var(--sidebar-border)] ${collapsed ? "py-2 flex justify-center" : "p-2"
          }`}
        ref={teamDropRef}
      >
        {collapsed ? (
          <button
            onClick={toggleCollapsed}
            title={currentTeam?.name || "Expand to switch team"}
            className="w-10 h-10 rounded-xl bg-[var(--sidebar-bg-hover)] border border-[var(--sidebar-border)] flex items-center justify-center text-[var(--sidebar-text-secondary)] font-semibold text-xs hover:bg-[var(--sidebar-bg-hover)] transition-colors"
          >
            {currentTeam?.name?.[0]?.toUpperCase() ?? "T"}
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => setTeamDropOpen(v => !v)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-[var(--sidebar-bg-hover)] border border-[var(--sidebar-border)] hover:bg-[var(--sidebar-bg-hover)]/80 transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--sidebar-accent)] to-[var(--sidebar-accent)]/80 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-[0_2px_8px_rgba(108,92,231,0.25)]">
                {currentTeam?.name?.[0]?.toUpperCase() ?? "T"}
              </div>
              <span className="text-[13px] font-semibold text-[var(--sidebar-text-primary)] truncate flex-1">
                {currentTeam?.name ?? "Select Team"}
              </span>
              {currentTeam?.plan && (
                <span className="text-[10px] font-semibold tracking-wider bg-[rgba(108,92,231,0.25)] text-[var(--sidebar-accent)] px-1.5 py-0.5 rounded capitalize shrink-0">
                  {currentTeam.plan}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-[var(--sidebar-text-dim)] shrink-0 transition-transform duration-200 ${teamDropOpen ? "rotate-180" : ""
                  }`}
              />
            </button>

            {teamDropOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--sidebar-bg)] border border-[var(--sidebar-border)] rounded-lg z-50 overflow-hidden py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
                {teamLoadError && (
                  <div className="px-3 py-2 text-xs text-[var(--danger)] border-b border-[var(--sidebar-border)]">
                    {teamLoadError}
                  </div>
                )}
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setCurrentTeamId(t.id); setTeamDropOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[var(--sidebar-bg-hover)] text-[var(--sidebar-text-primary)] transition-colors"
                  >
                    <div className="w-6 h-6 rounded-md bg-[var(--sidebar-bg-active)] border border-[var(--sidebar-border-active)] flex items-center justify-center text-[var(--sidebar-accent)] text-[10px] font-bold">
                      {t.name[0].toUpperCase()}
                    </div>
                    <span className="flex-1 truncate text-left">{t.name}</span>
                    {t.id === currentTeamId && (
                      <Check className="w-3.5 h-3.5 text-[var(--sidebar-accent)]" />
                    )}
                  </button>
                ))}
                <div className="border-t border-[var(--sidebar-border)] mt-1.5 pt-1.5 px-1.5">
                  {!createTeamOpen ? (
                    <button
                      onClick={() => {
                        setCreateTeamOpen(true);
                        setCreateTeamError(null);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-[13px] text-[var(--sidebar-accent)] hover:bg-[var(--sidebar-bg-hover)] rounded-lg transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Create Team
                    </button>
                  ) : (
                    <div className="space-y-2 p-1">
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
                        className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-900)] border border-[var(--sidebar-border)] text-[var(--sidebar-text-primary)] focus:outline-none focus:border-[var(--sidebar-accent)] focus:ring-1 focus:ring-[var(--sidebar-accent)]/30"
                        autoFocus
                        disabled={createTeamBusy}
                      />
                      {createTeamError && (
                        <p className="text-xs text-[var(--danger)] px-1">{createTeamError}</p>
                      )}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => void handleCreateTeam()}
                          disabled={createTeamBusy}
                          className="flex-1 px-3 py-1.5 text-[13px] bg-[var(--sidebar-accent)] text-white rounded-lg font-medium disabled:opacity-60 hover:bg-[var(--sidebar-accent)]/90 transition-colors"
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
                          className="px-3 py-1.5 text-[13px] rounded-lg border border-[var(--sidebar-border)] hover:bg-[var(--sidebar-bg-hover)] text-[var(--sidebar-text-muted)] disabled:opacity-60 transition-colors"
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
        className={`flex-1 overflow-y-auto py-3 flex flex-col ${collapsed ? "items-center px-2 gap-0.5" : "px-2 gap-0.5"
          }`}
        aria-label="Main navigation"
      >
        {!collapsed && (
          <div className="px-3 pb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-text-dim)]">Workspace</span>
          </div>
        )}
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          // Cast item to support badge property if needed or access it directly
          const badge = (item as typeof item & { badge?: string }).badge;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={navCls(item.href)}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && badge && (
                <span className="text-[10px] font-bold bg-[rgba(108,92,231,0.25)] text-[var(--sidebar-accent)] px-1.5 py-0.5 rounded ml-auto">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* New Page button inline in nav */}
        {!collapsed && (
          <div className="pt-3 mt-1 border-t border-[var(--sidebar-border)]">
            <button
              onClick={() => router.push("/wiki?action=new")}
              className="flex items-center gap-3 w-full px-3 py-2 text-[13px] rounded-lg bg-[var(--sidebar-bg-active)] text-[var(--sidebar-accent)] hover:bg-[var(--sidebar-accent)] hover:text-white font-medium transition-all duration-150 border border-[var(--sidebar-border-active)]"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              New Page
            </button>
          </div>
        )}
        {collapsed && (
          <button
            onClick={() => router.push("/wiki?action=new")}
            title="New Page"
            className="w-10 h-9 flex items-center justify-center rounded-lg text-[var(--sidebar-accent)] hover:bg-[var(--sidebar-bg-active)] transition-colors mt-1"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        )}
      </nav>

      {/* ── Bottom actions ── */}
      <div
        className={`border-t border-[var(--sidebar-border)] pt-2 pb-3 flex flex-col gap-0.5 ${collapsed ? "items-center px-2" : "px-2"
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
          onClick={toggleTheme}
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          className={bottomBtnCls()}
        >
          {theme === "dark"
            ? <Sun className="w-4 h-4 shrink-0" />
            : <Moon className="w-4 h-4 shrink-0" />
          }
          {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>

        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={bottomBtnCls(true)}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>

        {/* User Profile */}
        <div className={`mt-3 pt-3 border-t border-[var(--sidebar-border)] ${collapsed ? "flex flex-col items-center gap-2" : ""}`}>
          {collapsed ? (
            <>
              <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-[var(--sidebar-accent)] to-[var(--sidebar-accent)]/80 text-white font-bold text-[11px] border border-[var(--sidebar-border)] shadow-sm shrink-0">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (user?.display_name?.[0]?.toUpperCase() || "U")
                )}
              </div>
              <button
                onClick={toggleCollapsed}
                title="Expand sidebar"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-[var(--sidebar-text-dim)] hover:text-[var(--sidebar-text-primary)] hover:bg-[var(--sidebar-bg-hover)] transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg hover:bg-[var(--sidebar-bg-hover)] transition-colors cursor-default">
              <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-[var(--sidebar-accent)] to-[var(--sidebar-accent)]/80 flex items-center justify-center text-white font-bold text-[11px] border border-[var(--sidebar-border)] shadow-sm shrink-0">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (user?.display_name?.[0]?.toUpperCase() || "U")
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--sidebar-text-primary)] truncate leading-tight">
                  {user?.display_name || "Anonymous"}
                </div>
                <div className="text-[10px] text-[var(--sidebar-text-muted)] truncate leading-tight mt-0.5">
                  Admin
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
