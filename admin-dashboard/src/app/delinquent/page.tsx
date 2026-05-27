"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Loader2, RefreshCw, AlertTriangle, DollarSign, Ban, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { DelinquentTeam } from "@/types";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/formatters";
import { toast } from "sonner";

export default function DelinquentPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<DelinquentTeam[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const data = await api.getDelinquent(token);
      setAccounts(data || []);
    } catch {
      toast.error("Failed to load delinquent accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (teamId: string, patch: Record<string, unknown>) => {
    try {
      const token = await getToken();
      await api.patchTeam(teamId, patch, token);
      toast.success("Action applied");
      fetchData();
    } catch {
      toast.error("Failed to apply action");
    }
  };

  const pastDue = accounts.filter((a) => a.status === "past_due");
  const blocked = accounts.filter((a) => a.status === "blocked");
  const unpaid = accounts.filter((a) => a.status === "unpaid");

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
        eyebrow="Finance"
        title="Delinquent Accounts"
        description={`${accounts.length} accounts requiring attention`}
        action={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        }
      />

      <Card className="border-danger/30 bg-danger/5 border">
        <CardContent className="flex items-center gap-3 py-4">
          <AlertTriangle className="text-danger h-5 w-5" />
          <div>
            <p className="font-medium text-danger">{accounts.length} accounts need attention</p>
            <p className="text-sm text-muted-foreground">Revenue at risk from unpaid and blocked accounts</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Past Due" value={formatNumber(pastDue.length)} trend="" trendUp icon={<AlertTriangle size={18} />} accent="warning" />
        <StatCard title="Blocked" value={formatNumber(blocked.length)} trend="" trendUp icon={<Ban size={18} />} accent="danger" />
        <StatCard title="Unpaid" value={formatNumber(unpaid.length)} trend="" trendUp icon={<DollarSign size={18} />} accent="danger" />
        <StatCard title="Total Members Affected" value={formatNumber(accounts.reduce((s, a) => s + ((a.member_count as number) || 0), 0))} trend="" trendUp icon={<Users size={18} />} accent="warning" />
      </div>

      <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
        <CardHeader><CardTitle>Delinquent Accounts</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Since</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={String(a.id)}>
                  <TableCell className="font-medium">{String(a.team_name)}</TableCell>
                  <TableCell>{String(a.owner_name)}</TableCell>
                  <TableCell><Badge variant="outline">{String(a.plan)}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={a.status === "blocked" ? "destructive" : "default"}>{String(a.status)}</Badge>
                  </TableCell>
                  <TableCell>{String(a.member_count)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.subscription_since ? new Date(a.subscription_since as string).toLocaleDateString() : ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => handleAction(String(a.team_id), { status: "active" })}>Restore</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleAction(String(a.team_id), { status: "blocked" })}>Block</Button>
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
