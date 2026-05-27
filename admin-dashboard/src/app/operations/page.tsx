"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Loader2, RefreshCw, Zap, DollarSign, Gauge } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { api } from "@/lib/api";
import { formatUSD, formatNumber } from "@/lib/formatters";
import { toast } from "sonner";

export default function OperationsPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ops, setOps] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const data = await api.getOperations(token);
      setOps(data || []);
    } catch {
      toast.error("Failed to load operations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const totalCost = ops.reduce((s, o) => s + (o.total_cost || 0), 0);
  const totalCalls = ops.reduce((s, o) => s + (o.total_calls || 0), 0);

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
        eyebrow="System"
        title="Operations Cost"
        description={`${ops.length} operations tracked`}
        action={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Total Op Cost" value={formatUSD(totalCost, true)} trend="" trendUp icon={<DollarSign size={18} />} accent="danger" />
        <StatCard title="Total API Calls" value={formatNumber(totalCalls)} trend="" trendUp icon={<Zap size={18} />} accent="info" />
        <StatCard title="Avg Cost/Call" value={formatUSD(totalCalls ? totalCost / totalCalls : 0, true)} trend="" trendUp icon={<Gauge size={18} />} accent="warning" />
        <StatCard title="Operations" value={formatNumber(ops.length)} trend="" trendUp icon={<Zap size={18} />} accent="info" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader><CardTitle>Cost by Operation</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={ops.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 10, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis type="category" dataKey="operation" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={80} />
                <Tooltip />
                <Bar dataKey="total_cost" fill="#388bfd" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader><CardTitle>Cost Distribution</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {ops.slice(0, 8).map((op) => (
              <div key={op.operation}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{op.operation}</span>
                  <span className="font-mono text-muted-foreground">{formatUSD(op.total_cost, true)}</span>
                </div>
                <Progress value={totalCost ? ((op.total_cost || 0) / totalCost) * 100 : 0} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
        <CardHeader><CardTitle>All Operations</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operation</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Total Calls</TableHead>
                <TableHead className="text-right">Avg Cost/Call</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ops.map((op) => (
                <TableRow key={op.operation}>
                  <TableCell className="font-medium">{op.operation}</TableCell>
                  <TableCell className="text-right font-mono">{formatUSD(op.total_cost, true)}</TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(op.total_calls)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatUSD(op.total_calls ? (op.total_cost || 0) / op.total_calls : 0, true)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-medium">{totalCost ? formatNumber(Math.round(((op.total_cost || 0) / totalCost) * 100)) : 0}%</span>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-medium">
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono">{formatUSD(totalCost, true)}</TableCell>
                <TableCell className="text-right font-mono">{formatNumber(totalCalls)}</TableCell>
                <TableCell className="text-right font-mono">{formatUSD(totalCalls ? totalCost / totalCalls : 0, true)}</TableCell>
                <TableCell className="text-right">100%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
