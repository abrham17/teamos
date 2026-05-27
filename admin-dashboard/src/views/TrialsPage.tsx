"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/formatters";
import { toast } from "sonner";

export function TrialsPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const fetchTrials = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const result = await api.getTrials(token);
      setData(result);
    } catch {
      toast.error("Failed to load trials");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrials(); }, []);

  const handleExtend = async (teamId: string, days: number) => {
    try {
      const token = await getToken();
      await api.extendTrial(teamId, days, token);
      toast.success(`Trial extended by ${days} days`);
      fetchTrials();
    } catch {
      toast.error("Failed to extend trial");
    }
  };

  const handleExpire = async (teamId: string) => {
    try {
      const token = await getToken();
      await api.expireTrial(teamId, token);
      toast.success("Trial expired");
      fetchTrials();
    } catch {
      toast.error("Failed to expire trial");
    }
  };

  if (loading || !data) {
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

  const { stats, trials } = data;
  const getDaysLeftColor = (days: number) => {
    if (days <= 3) return "text-destructive";
    if (days <= 7) return "text-warning";
    return "text-success";
  };

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow="Trials"
        title="Trial Management"
        description={`${stats.active_trials} active, ${stats.expiring_soon} expiring soon`}
        action={
          <Button variant="outline" size="sm" onClick={fetchTrials} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Active Trials" value={formatNumber(stats.active_trials)} trend="" trendUp icon={null} accent="info" />
        <StatCard title="Expiring <7 days" value={formatNumber(stats.expiring_soon)} trend="" trendUp icon={null} accent="warning" />
        <StatCard title="Expired (held)" value={formatNumber(stats.expired_held)} trend="" trendUp icon={null} accent="danger" />
        <StatCard title="Total Trials" value={formatNumber(stats.total_trials)} trend="" trendUp icon={null} accent="info" />
      </div>

      <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
        <CardHeader><CardTitle>Active Trials</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Days Left</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(trials || []).map((trial: any) => (
                <TableRow key={trial.id}>
                  <TableCell className="font-medium">{trial.team_name}</TableCell>
                  <TableCell>{trial.owner_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {trial.trial_end ? new Date(trial.trial_end).toLocaleDateString() : "N/A"}
                  </TableCell>
                  <TableCell>
                    <span className={`font-medium ${getDaysLeftColor(trial.days_left)}`}>
                      {trial.days_left} days
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={trial.status === "active" ? "default" : "destructive"}>{trial.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button variant="ghost" size="sm">Actions</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleExtend(trial.team_id, 7)}>Extend 7 days</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExtend(trial.team_id, 14)}>Extend 14 days</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExtend(trial.team_id, 30)}>Extend 30 days</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExpire(trial.team_id)} className="text-destructive">Expire Now</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
