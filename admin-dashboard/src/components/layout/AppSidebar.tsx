"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  TrendingUp,
  Zap,
  Activity,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: React.ReactNode;
  group: "platform" | "finance" | "system";
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview",    path: "/",            label: "Overview",         icon: <LayoutDashboard size={16} />, group: "platform" },
  { id: "teams",       path: "/teams",       label: "Teams",            icon: <Building2 size={16} />,       group: "platform" },
  { id: "users",       path: "/users",       label: "Top Spenders",     icon: <Users size={16} />,           group: "platform" },
  { id: "trials",      path: "/trials",      label: "Trial Management", icon: <CreditCard size={16} />,      group: "finance"  },
  { id: "delinquent",  path: "/delinquent",  label: "Delinquent",       icon: <AlertTriangle size={16} />,   group: "finance"  },
  { id: "forecast",    path: "/forecast",    label: "Forecast",         icon: <TrendingUp size={16} />,      group: "finance"  },
  { id: "operations",  path: "/operations",  label: "Operations",       icon: <Zap size={16} />,             group: "system"   },
  { id: "health",      path: "/health",      label: "System Health",    icon: <Activity size={16} />,        group: "system"   },
];

const GROUPS: { id: NavItem["group"]; label: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "finance",  label: "Finance"  },
  { id: "system",   label: "System"   },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-lg">
            <ShieldAlert size={16} />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-bold leading-tight tracking-tight">TeamOS Admin</p>
            <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50 font-semibold">
              ops.team-os.tech
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group.id);
          return (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const isActive =
                      item.path === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.path);
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton tooltip={item.label} isActive={isActive}>
                          <Link href={item.path} className="flex items-center gap-2">
                            {item.icon}
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-4 py-3">
        <div className="group-data-[collapsible=icon]:hidden flex items-center gap-2 text-xs text-sidebar-foreground/50">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          All systems operational
        </div>
        <p className="group-data-[collapsible=icon]:hidden mt-1.5 text-[10px] uppercase tracking-widest font-semibold text-sidebar-foreground/30">
          v2.4.0-prod
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
