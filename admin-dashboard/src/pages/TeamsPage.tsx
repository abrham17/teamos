import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Search, Loader2, RefreshCw, MoreHorizontal } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { api } from "@/lib/api";
import { formatUSD, formatNumber } from "@/lib/formatters";
import { toast } from "sonner";

export function TeamsPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<any>(null);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const token = await getToken({ template: "backend" });
      const data = await api.getTeams(token);
      setTeams(data || []);
    } catch (e: any) {
      toast.error("Failed to load teams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTeams(); }, []);

  const handlePatch = async (teamId: string, patch: Record<string, unknown>) => {
    try {
      const token = await getToken({ template: "backend" });
      await api.patchTeam(teamId, patch, token);
      toast.success("Team updated");
      fetchTeams();
    } catch {
      toast.error("Failed to update team");
    }
  };

  const filtered = teams.filter((t) => t.name?.toLowerCase().includes(search.toLowerCase()));
  const totalRevenue = teams.reduce((s, t) => s + (t.revenue_mtd || 0), 0);

  if (loading) {
    return (
      <div className="space-y-8 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow="Teams"
        title="Team Economics"
        description={`${teams.length} teams`}
        action={
          <Button variant="outline" size="sm" onClick={fetchTeams} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Total Teams" value={formatNumber(teams.length)} trend="" trendUp icon={null} accent="info" />
        <StatCard title="Platform MRR" value={formatUSD(totalRevenue, true)} trend="" trendUp icon={null} accent="success" />
        <StatCard title="Avg Cost/Team" value={formatUSD(teams.length ? totalRevenue / teams.length : 0, true)} trend="" trendUp icon={null} accent="warning" />
        <StatCard title="Top Team Cost" value={formatUSD(teams[0]?.cost || 0, true)} trend="" trendUp icon={null} accent="danger" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Cost vs Revenue by Team</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={filtered.slice(0, 8)} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar dataKey="cost" fill="#f85149" name="Cost" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Top Teams</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filtered.slice(0, 5).map((t) => (
              <div key={t.id} className="flex justify-between items-center py-2 border-b border-border/20 last:border-0">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.plan}</p>
                </div>
                <span className="text-sm font-mono">{formatUSD(t.cost, true)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team Forensics</CardTitle>
            <CardDescription>Detailed cost breakdown per team</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search teams..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-64" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cost MTD</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((team) => (
                <TableRow key={team.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedTeam(team)}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell><Badge variant="outline">{team.plan}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={team.status === "active" ? "default" : "destructive"}>{team.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{formatUSD(team.cost, true)}</TableCell>
                  <TableCell>{team.member_count}</TableCell>
                  <TableCell>
                    <Progress value={team.budget_usage || 0} className="h-2 w-24" />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePatch(team.id, { status: "suspended" }); }}>
                          Suspend
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePatch(team.id, { status: "active" }); }}>
                          Reactivate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedTeam(team); }}>
                          View Details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!selectedTeam} onOpenChange={() => setSelectedTeam(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selectedTeam?.name}</SheetTitle>
            <SheetDescription>{selectedTeam?.plan} · {selectedTeam?.status}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <p className="text-sm font-medium">Cost MTD</p>
              <p className="text-2xl font-bold font-mono">{formatUSD(selectedTeam?.cost || 0, true)}</p>
            </div>
            <div>
              <p className="text-sm font-medium">API Calls</p>
              <p className="text-lg font-mono">{formatNumber(selectedTeam?.calls || 0)}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Members</p>
              <p className="text-lg">{selectedTeam?.member_count}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Budget Utilization</p>
              <Progress value={selectedTeam?.budget_usage || 0} className="h-3 mt-1" />
              <p className="text-xs text-muted-foreground mt-1">{selectedTeam?.budget_usage || 0}%</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
