"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useWikiStore } from "@/stores/useWikiStore";
import { useTheme } from "@/components/ui/ThemeProvider";
import { api } from "@/lib/api";
import {
  Book,
  Share2,
  MessageSquare,
  Upload,
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

const NAV_ITEMS = [
  { href: "/wiki",    icon: Book,           label: "Wiki"   },
  { href: "/graph",   icon: Share2,         label: "Graph"  },
  { href: "/chat",    icon: MessageSquare,  label: "Chat"   },
  { href: "/ingest",  icon: Upload,         label: "Ingest" },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentTeamId, setCurrentTeamId } = useWikiStore();
  const { theme, toggle: toggleTheme } = useTheme();

  const [teams, setTeams]               = useState<Team[]>([]);
  const [collapsed, setCollapsed]       = useState(false);
  const [teamDropOpen, setTeamDropOpen] = useState(false);

  const teamDropRef = useRef<HTMLDivElement>(null);
  const currentTeam = teams.find(t => t.id === currentTeamId);

  /* ── Restore collapse state ── */
  useEffect(() => {
    setCollapsed(localStorage.getItem("teamos-sidebar-collapsed") === "true");
  }, []);

  /* ── Fetch teams ── */
  useEffect(() => {
    api
      .get("/auth/teams/")
      .then((data: Team[]) => {
        setTeams(data);
        if (data.length > 0 && !currentTeamId) setCurrentTeamId(data[0].id);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const clerk = (window as any).Clerk;
      if (clerk?.signOut) {
        await clerk.signOut({ redirectUrl: "/login" });
        return;
      }
    } catch (_) {}
    window.location.href = "/login";
  };

  const isActive = (href: string) =>
    href === "/wiki" ? pathname.startsWith("/wiki") : pathname.startsWith(href);

  /* ── Nav item class helper ── */
  const navCls = (href: string) => {
    const active = isActive(href);
    if (collapsed) {
      return [
        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-150 shrink-0",
        active
          ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]",
      ].join(" ");
    }
    return [
      "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm transition-colors duration-150",
      active
        ? "bg-[var(--accent-subtle)] text-[var(--accent)] font-medium"
        : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]",
    ].join(" ");
  };

  const bottomBtnCls = (danger = false) => {
    if (collapsed) {
      return [
        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-150 shrink-0",
        danger
          ? "text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]",
      ].join(" ");
    }
    return [
      "flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm transition-colors duration-150",
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
