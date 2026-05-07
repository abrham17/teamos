import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Users, 
  TrendingUp, 
  ShieldAlert, 
  LayoutDashboard, 
  CreditCard, 
  Activity,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  DollarSign,
  Lock,
  Unlock,
  RefreshCw,
  ExternalLink,
  MoreVertical,
  PieChart as PieChartIcon
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { useAuth, SignedIn, SignedOut, UserButton, SignIn } from "@clerk/clerk-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

interface Stats {
  billing_month: string;
  total_spend: number;
  total_revenue: number;
  mrr: number;
  gross_margin: number;
  margin_pct: number;
  usage_by_model: any[];
  plan_distribution: Record<string, number>;
  active_subscriptions: number;
}

interface TeamUsage {
  id: string;
  name: string;
  plan: string;
  status: string;
  usage_tier: string;
  seat_count: number;
  member_count: number;
  cost: number;
  calls: number;
  created_at: string;
}

const COLORS = ['#388bfd', '#79c0ff', '#1f6feb', '#0d419d', '#bc8cff'];

const DashboardContent: React.FC = () => {
  const { getToken } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [teams, setTeams] = useState<TeamUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const token = await getToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      const [statsRes, teamsRes] = await Promise.all([
        fetch('/api/admin/stats/', { headers }).then(res => res.json()),
        fetch('/api/admin/teams-usage/', { headers }).then(res => res.json())
      ]);

      if (statsRes.success) setStats(statsRes.data);
      if (teamsRes.success) setTeams(teamsRes.data);
    } catch (error) {
      console.error("Failed to fetch admin data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateTeamStatus = async (teamId: string, status: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/teams/${teamId}/`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      }).then(r => r.json());

      if (res.success) {
        fetchData(); // Refresh list
      }
    } catch (error) {
      console.error("Failed to update team status:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredTeams = teams.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const planData = stats?.plan_distribution ? Object.entries(stats.plan_distribution).map(([name, value]) => ({
    name, value
  })) : [];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Synchronizing with TeamOS Core...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-xl sticky top-0 h-screen flex flex-col">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg shadow-lg shadow-primary/20">
              <ShieldAlert size={20} className="text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Admin</h1>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem icon={<LayoutDashboard size={18} />} label="Overview" active />
          <SidebarItem icon={<Users size={18} />} label="Teams" />
          <SidebarItem icon={<CreditCard size={18} />} label="Subscriptions" />
          <SidebarItem icon={<Activity size={18} />} label="System Analytics" />
        </nav>

        <div className="p-6 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Operational · v2.5.0
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          <header className="flex justify-between items-end">
            <div>
              <p className="text-sm font-medium text-primary uppercase tracking-widest mb-1">Platform Control</p>
              <h2 className="text-4xl font-bold tracking-tight">Operational Insights</h2>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchData} 
                disabled={refreshing}
                className="bg-card/50"
              >
                <RefreshCw size={14} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Sync
              </Button>
              <Badge variant="outline" className="px-4 py-1.5 text-sm font-semibold bg-muted/50 border-border">
                Cycle: <span className="text-primary ml-1">{stats?.billing_month}</span>
              </Badge>
            </div>
          </header>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatsCard 
              title="Monthly Burn" 
              value={`$${(stats?.total_spend ?? 0).toLocaleString()}`} 
              trend="+12%" 
              trendUp={true} 
              icon={<DollarSign size={20} />}
            />
            <StatsCard 
              title="Current MRR" 
              value={`$${(stats?.mrr ?? 0).toLocaleString()}`} 
              trend="-2%" 
              trendUp={false} 
              icon={<CreditCard size={20} />}
            />
            <StatsCard 
              title="Gross Margin" 
              value={`${(stats?.margin_pct ?? 0).toFixed(1)}%`} 
              trend={`$${(stats?.gross_margin ?? 0).toLocaleString()}`} 
              trendUp={(stats?.margin_pct ?? 0) > 20} 
              icon={<TrendingUp size={20} />}
            />
            <StatsCard 
              title="Active Teams" 
              value={stats?.active_subscriptions.toString() || '0'} 
              trend="+8" 
              trendUp={true} 
              icon={<Users size={20} />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
                <div>
                  <CardTitle className="text-lg font-bold">Inference Distribution</CardTitle>
                  <CardDescription>Real-time model cost allocation</CardDescription>
                </div>
                <BarChart3 className="text-muted-foreground" size={20} />
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.usage_by_model || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis 
                        dataKey="model_used" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 11}} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 11}}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip 
                        cursor={{fill: 'hsl(var(--muted) / 0.5)'}}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          borderColor: 'hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="total_cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg font-bold">Tier Mix</CardTitle>
                  <CardDescription>Plan distribution</CardDescription>
                </div>
                <PieChartIcon className="text-muted-foreground" size={20} />
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={planData}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {planData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-2 mt-4">
                  {planData.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length]}} />
                        <span className="text-muted-foreground capitalize">{p.name}</span>
                      </div>
                      <span className="font-semibold">{p.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold tracking-tight">Team Forensics</h3>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search teams..." 
                    className="pl-9 w-72 bg-card/50 border-border/50" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon">
                  <Filter size={18} />
                </Button>
              </div>
            </div>

            <Card className="border-border/40 overflow-hidden bg-card/20 backdrop-blur-md">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[200px]">Entity</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead className="text-right">Burn</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTeams.map((team) => (
                    <TableRow key={team.id} className="hover:bg-muted/20 transition-colors border-border/50">
                      <TableCell className="font-bold py-4">
                        <div className="flex flex-col">
                          <span>{team.name}</span>
                          <span className="text-[10px] font-normal text-muted-foreground font-mono">{team.id.substring(0,8)}...</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize font-bold">{team.plan}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span className="capitalize">{team.usage_tier}</span>
                          <span className="text-muted-foreground">{team.seat_count} seats</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <Users size={12} /> {team.member_count}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-primary">
                        ${team.cost.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {team.calls.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={`font-bold ${
                          team.status === 'active' ? 'border-green-500/30 text-green-500' : 
                          team.status === 'suspended' ? 'border-red-500/30 text-red-500' :
                          'border-yellow-500/30 text-yellow-500'
                        }`}>
                          {team.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-card/90 backdrop-blur-lg">
                            <DropdownMenuItem className="gap-2">
                              <ExternalLink size={14} /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {team.status === 'active' ? (
                              <DropdownMenuItem 
                                className="text-red-500 gap-2" 
                                onClick={() => updateTeamStatus(team.id, 'suspended')}
                              >
                                <Lock size={14} /> Suspend Team
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem 
                                className="text-green-500 gap-2" 
                                onClick={() => updateTeamStatus(team.id, 'active')}
                              >
                                <Unlock size={14} /> Reactivate Team
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <>
      <SignedIn>
        <DashboardContent />
      </SignedIn>
      <SignedOut>
        <div className="flex h-screen items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md border-border/40 bg-card/30 backdrop-blur-xl">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto bg-primary w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 mb-2">
                <ShieldAlert size={28} className="text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">Restricted Access</CardTitle>
                <CardDescription>Authentication required for TeamOS Administrative Services</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center pb-8">
              <SignIn routing="hash" />
            </CardContent>
          </Card>
        </div>
      </SignedOut>
    </>
  );
};

const SidebarItem = ({ icon, label, active = false }: { icon: any, label: string, active?: boolean }) => (
  <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
    active 
      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`}>
    {icon}
    {label}
  </button>
);

const StatsCard = ({ title, value, trend, trendUp, icon }: { title: string, value: string, trend: string, trendUp: boolean, icon: any }) => (
  <Card className="border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden relative">
    <div className={`absolute top-0 left-0 w-1 h-full ${trendUp ? 'bg-green-500' : 'bg-red-500'}`} />
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
      <div className="text-primary/70">{icon}</div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-black tracking-tight">{value}</div>
      <p className={`flex items-center gap-1 text-xs font-bold mt-1 ${trendUp ? 'text-green-500' : 'text-red-500'}`}>
        {trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {trend}
        <span className="text-muted-foreground font-normal ml-1">cycle</span>
      </p>
    </CardContent>
  </Card>
);

export default App;
