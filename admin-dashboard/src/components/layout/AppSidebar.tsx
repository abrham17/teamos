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
  ChevronRight,
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

export type PageId =
  | "overview"
  | "teams"
  | "users"
  | "trials"
  | "delinquent"
  | "forecast"
  | "operations"
  | "health";

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  group: "platform" | "finance" | "system";
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={16} />, group: "platform" },
  { id: "teams", label: "Teams", icon: <Building2 size={16} />, group: "platform" },
  { id: "users", label: "Top Spenders", icon: <Users size={16} />, group: "platform" },
  { id: "trials", label: "Trial Management", icon: <CreditCard size={16} />, group: "finance" },
  { id: "delinquent", label: "Delinquent", icon: <AlertTriangle size={16} />, group: "finance" },
  { id: "forecast", label: "Forecast", icon: <TrendingUp size={16} />, group: "finance" },
  { id: "operations", label: "Operations", icon: <Zap size={16} />, group: "system" },
  { id: "health", label: "System Health", icon: <Activity size={16} />, group: "system" },
];

const GROUPS: { id: NavItem["group"]; label: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "finance", label: "Finance" },
  { id: "system", label: "System" },
];

interface AppSidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export function AppSidebar({ activePage, onNavigate }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-lg">
            <ShieldAlert size={16} />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-bold leading-tight tracking-tight">TeamOS Admin</p>
            <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50 font-semibold">
              ops.team-os.tech
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group.id);
          return (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={activePage === item.id}
                        tooltip={item.label}
                        onClick={() => onNavigate(item.id)}
                        className="cursor-pointer"
                      >
                        {item.icon}
                        <span>{item.label}</span>
                        {activePage === item.id && (
                          <ChevronRight size={12} className="ml-auto opacity-60" />
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
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
