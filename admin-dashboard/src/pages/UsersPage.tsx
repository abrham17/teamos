import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Search, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { api } from "@/lib/api";
import { formatUSD, formatNumber } from "@/lib/formatters";
import { toast } from "sonner";

export function UsersPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = await getToken({ template: "backend" });
      const data = await api.getTopSpenders(token);
      setUsers(data || []);
    } catch (e: any) {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = users.filter((u) =>
    (u.user_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.user_email || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.team_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalSpend = users.reduce((s, u) => s + (u.total_cost || 0), 0);
  const topSpenderCost = users[0]?.total_cost || 0;
  const avgCost = users.length ? totalSpend / users.length : 0;

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
        eyebrow="Users"
        title="Top Spenders"
        description={`${users.length} users tracked`}
        action={
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Total User Spend" value={formatUSD(totalSpend, true)} trend="" trendUp icon={null} accent="info" />
        <StatCard title="Top Spender" value={formatUSD(topSpenderCost, true)} trend="" trendUp icon={null} accent="warning" />
        <StatCard title="Avg Cost/User" value={formatUSD(avgCost, true)} trend="" trendUp icon={null} accent="success" />
        <StatCard title="Users" value={formatNumber(users.length)} trend="" trendUp icon={null} accent="info" />
      </div>

      <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>User Leaderboard</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-64" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Top Model</TableHead>
                <TableHead className="text-right">API Calls</TableHead>
                <TableHead className="text-right">Cost MTD</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user, i) => (
                <TableRow key={user.user_id || i}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.user_name}</p>
                      <p className="text-xs text-muted-foreground">{user.user_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{user.team_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.model_used}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(user.total_calls)}</TableCell>
                  <TableCell className="text-right font-mono font-medium">{formatUSD(user.total_cost, true)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Progress value={totalSpend ? ((user.total_cost || 0) / totalSpend) * 100 : 0} className="h-2 w-16" />
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {totalSpend ? formatNumber(Math.round(((user.total_cost || 0) / totalSpend) * 100)) : 0}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
