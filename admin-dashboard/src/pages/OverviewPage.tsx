import {
  DollarSign,
  Activity,
  TrendingUp,
  Building2,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent, ChartTooltip } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { AlertFeed } from "@/components/shared/AlertFeed";
import { mockOverview } from "@/lib/mock-data";
import { formatUSD, formatPct, formatNumber } from "@/lib/formatters";

const CHART_COLORS = ["#388bfd", "#79c0ff", "#1f6feb", "#0d419d"];

const chartConfig = {
  revenue: { label: "Revenue", color: "#388bfd" },
  cost: { label: "API Cost", color: "#f85149" },
  margin: { label: "Margin %", color: "#3fb950" },
};

const pieConfig = {
  calls: { label: "API Calls" },
};

export function OverviewPage() {
  const d = mockOverview;

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow="Platform Control"
        title="Operational Overview"
        description={`Billing cycle: ${d.billing_month}`}
        action={
          <Button variant="outline" size="sm" className="gap-2">
            <RefreshCw size={14} />
            Refresh
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Monthly Revenue"
          value={formatUSD(d.total_revenue, true)}
          trend={`+${d.revenue_trend}%`}
          trendUp
          icon={<DollarSign size={18} />}
          accent="success"
        />
        <StatCard
          title="Infra Burn (LLM)"
          value={formatUSD(d.total_spend, true)}
          trend={`${d.cost_trend}%`}
          trendUp={d.cost_trend > 0}
          icon={<Activity size={18} />}
          accent={d.cost_trend > 0 ? "danger" : "success"}
        />
        <StatCard
          title="Gross Margin"
          value={formatPct(d.margin_pct)}
          trend={`+${d.margin_trend}%`}
          trendUp
          trendLabel="vs last month"
          icon={<TrendingUp size={18} />}
          accent={d.margin_pct >= 70 ? "success" : d.margin_pct >= 50 ? "warning" : "danger"}
        />
        <StatCard
          title="Active Teams"
          value={formatNumber(d.active_subscriptions)}
          trend={`+${d.teams_trend} new`}
          trendUp
          icon={<Building2 size={18} />}
          accent="info"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Trend Chart */}
        <Card className="lg:col-span-2 border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="section-title">Revenue vs Cost Trend</CardTitle>
            <CardDescription>30-day revenue and API spend comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <AreaChart data={d.trend_data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#388bfd" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#388bfd" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f85149" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#f85149" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
                  interval={2}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                  width={52}
                />
              <ChartTooltip
                  content={<ChartTooltipContent formatter={(v: unknown) => formatUSD(Number(v))} />}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#388bfd"
                  strokeWidth={2}
                  fill="url(#gradRevenue)"
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#f85149"
                  strokeWidth={2}
                  fill="url(#gradCost)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Model Split */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="section-title">Model Traffic Split</CardTitle>
            <CardDescription>API calls by model</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <ChartContainer config={pieConfig} className="h-[180px] w-full">
              <PieChart>
                <Pie
                  data={d.usage_by_model}
                  dataKey="total_calls"
                  nameKey="model_used"
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={5}
                  strokeWidth={0}
                >
                  {d.usage_by_model.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(v) => [formatNumber(Number(v)), "Calls"]}
                />
              </PieChart>
            </ChartContainer>

            <Separator className="my-3" />

            <ul className="w-full space-y-2">
              {d.usage_by_model.map((m, i) => (
                <li key={m.model_used} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-muted-foreground">{m.model_used}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="mono-value text-xs">{formatUSD(m.total_cost)}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{m.pct}%</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="section-title">Active Alerts</CardTitle>
            <CardDescription>Top 5 platform warnings and notifications</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertFeed alerts={d.alerts} />
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="section-title">Platform Snapshot</CardTitle>
            <CardDescription>Key operational metrics this cycle</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              {[
                { label: "Total API Calls (MTD)", value: formatNumber(d.usage_by_model.reduce((s, m) => s + m.total_calls, 0)) },
                { label: "Gross Profit", value: formatUSD(d.gross_margin) },
                { label: "Avg Cost / Team", value: formatUSD(d.total_spend / d.active_subscriptions) },
                { label: "Avg Revenue / Team", value: formatUSD(d.total_revenue / d.active_subscriptions) },
                { label: "Most Used Model", value: d.usage_by_model[0]?.model_used ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mono-value">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
