import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Loader2, RefreshCw, TrendingUp, DollarSign, Zap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { api } from "@/lib/api";
import { formatUSD, formatNumber } from "@/lib/formatters";
import { toast } from "sonner";

export function ForecastPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await getToken({ template: "backend" });
      const result = await api.getForecast(token);
      setData(result);
    } catch {
      toast.error("Failed to load forecast");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading || !data) {
    return (
      <div className="space-y-8 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow="Finance"
        title="Spend Forecast"
        description={`${data.month} projection`}
        action={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Projected Month-End" value={formatUSD(data.projected_month_end, true)} trend="" trendUp icon={<TrendingUp size={18} />} accent="warning" />
        <StatCard title="Budget Ceiling" value={formatUSD(data.budget_ceiling, true)} trend="" trendUp icon={<DollarSign size={18} />} accent="info" />
        <StatCard title="Daily Burn Rate" value={formatUSD(data.daily_burn, true)} trend="" trendUp icon={<Zap size={18} />} accent="danger" />
        <StatCard title={`Days Left (${data.days_remaining})`} value={""} trend="" trendUp icon={<Clock size={18} />} accent="info" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Budget Utilization</CardTitle>
            <CardDescription>Spend-to-date vs budget ceiling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Current Spend (Day {data.days_elapsed})</span>
                <span>{formatUSD(data.today_spend, true)} / {formatUSD(data.budget_ceiling, true)}</span>
              </div>
              <Progress
                value={data.budget_ceiling ? (data.today_spend / data.budget_ceiling) * 100 : 0}
                className="h-3"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Projected Month-End</span>
                <span>{formatUSD(data.projected_month_end, true)} / {formatUSD(data.budget_ceiling, true)}</span>
              </div>
              <Progress
                value={data.budget_ceiling ? (data.projected_month_end / data.budget_ceiling) * 100 : 0}
                className="h-3"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Burn Rate Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Daily burn", value: formatUSD(data.daily_burn, true) },
              { label: "Today's spend", value: formatUSD(data.today_spend, true) },
              { label: "Days elapsed", value: formatNumber(data.days_elapsed) },
              { label: "Days remaining", value: formatNumber(data.days_remaining) },
              { label: "Budget utilization", value: `${data.budget_utilization}%` },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-border/20 last:border-0">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-sm font-medium font-mono">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
