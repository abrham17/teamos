"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { DollarSign, Activity, TrendingUp, Building2, RefreshCw, Loader2 } from "lucide-react";
import { OverviewStats, TrendPoint, AlertItem } from "@/types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent, ChartTooltip } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { AlertFeed } from "@/components/shared/AlertFeed";
import { api } from "@/lib/api";
import { formatUSD, formatPct, formatNumber } from "@/lib/formatters";
import { toast } from "sonner";

const CHART_COLORS = ["#388bfd", "#79c0ff", "#1f6feb", "#0d419d"];

const chartConfig = {
  revenue: { label: "Revenue", color: "#388bfd" },
  cost: { label: "API Cost", color: "#f85149" },
  margin: { label: "Margin %", color: "#3fb950" },
};

export default function OverviewPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ stats: OverviewStats; trend: TrendPoint[]; alerts: AlertItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [stats, trend, alerts] = await Promise.all([
        api.getOverview(token),
        api.getTrend(token).catch(() => [] as TrendPoint[]),
        api.getAlerts(token).catch(() => ({ alerts: [] as AlertItem[] })),
      ]);
      setData({ stats, trend, alerts: alerts.alerts });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      toast.error("Failed to load overview data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={fetchData}>Retry</Button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-8 p-6">
        <div className="space-y-2"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-48" /></div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const { stats } = data;
  const usageByModel = (stats.usage_by_model ?? []).map((m) => ({
    name: m.model_used ?? "Unknown",
    calls: m.total_calls ?? 0,
    fill: CHART_COLORS[0],
  }));
  const mrr = stats.total_revenue ?? 0;

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow="Platform Control"
        title="Operational Overview"
        description={`Billing cycle: ${stats.billing_month}`}
        action={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Monthly Revenue" value={formatUSD(mrr, true)} trend="" trendUp icon={<DollarSign size={18} />} accent="success" />
        <StatCard title="Infra Burn (LLM)" value={formatUSD(stats.total_spend, true)} trend="" trendUp={false} icon={<Activity size={18} />} accent="danger" />
        <StatCard title="Gross Margin" value={formatPct(stats.margin_pct)} trend="" trendUp icon={<TrendingUp size={18} />} accent="success" />
        <StatCard title="Active Teams" value={formatNumber(stats.active_subscriptions)} trend="" trendUp icon={<Building2 size={18} />} accent="info" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Revenue vs API Cost</CardTitle>
            <CardDescription>30-day rolling trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80 w-full">
              <AreaChart data={data.trend || []} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="created_at__date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="cost" stroke={chartConfig.cost.color} fill={chartConfig.cost.color} fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Model Traffic</CardTitle>
            <CardDescription>{usageByModel.length} active models</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-80 w-full">
              <PieChart>
                <Pie data={usageByModel} dataKey="calls" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2}>
                  {usageByModel.map((entry, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader><CardTitle>Active Alerts</CardTitle></CardHeader>
          <CardContent>
            <AlertFeed alerts={data.alerts} />
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader><CardTitle>Platform Snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Plan Distribution", value: "" },
              ...Object.entries(stats.plan_distribution ?? {}).map(([k, v]) => ({
                label: k,
                value: `${v} teams`,
              })),
              { label: "Active Subscriptions", value: formatNumber(stats.active_subscriptions) },
              { label: "MRR", value: formatUSD(mrr, true) },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-border/20 last:border-0">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-sm font-medium">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
