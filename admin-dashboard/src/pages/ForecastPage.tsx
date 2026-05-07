import { TrendingUp, TrendingDown, Calendar, Flame } from "lucide-react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { mockForecast } from "@/lib/mock-data";
import { formatUSD, formatPct } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const chartConfig = {
  actual: { label: "Actual Spend", color: "#388bfd" },
  projected: { label: "Projected", color: "#79c0ff" },
  upper: { label: "Upper Bound", color: "#d29922" },
  lower: { label: "Lower Bound", color: "#d29922" },
};

export function ForecastPage() {
  const f = mockForecast;
  const budgetUsedPct = (f.current_spend / f.budget_ceiling) * 100;
  const projectedPct = (f.projected_month_end / f.budget_ceiling) * 100;
  const isOverBudget = f.projected_month_end > f.budget_ceiling;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Finance"
        title="Spend Forecast"
        description="Projected month-end API cost with confidence intervals"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Projected Month-End"
          value={formatUSD(f.projected_month_end, true)}
          trend={isOverBudget ? "Over budget!" : `${formatPct(100 - projectedPct)} headroom`}
          trendUp={!isOverBudget}
          accent={isOverBudget ? "danger" : "success"}
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          title="Budget Ceiling"
          value={formatUSD(f.budget_ceiling, true)}
          accent="default"
          icon={<Calendar size={18} />}
        />
        <StatCard
          title="Daily Burn Rate"
          value={formatUSD(f.burn_rate_daily)}
          trend={`+${f.burn_trend}%`}
          trendUp={false}
          accent="warning"
          icon={<Flame size={18} />}
        />
        <StatCard
          title="Days Until Exhaustion"
          value={`${f.days_until_exhaustion}d`}
          accent={f.days_until_exhaustion < 10 ? "danger" : "info"}
          icon={<TrendingDown size={18} />}
        />
      </div>

      {/* Main Chart */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="section-title">Actual vs Projected Spend</CardTitle>
          <CardDescription>Shaded band represents 90% confidence interval</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <ComposedChart data={f.chart_data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#388bfd" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#388bfd" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d29922" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#d29922" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.08} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} interval={2} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} width={52} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v: unknown) => v !== undefined ? formatUSD(Number(v)) : "—"} />} />
              {/* Budget ceiling reference line */}
              <ReferenceLine
                y={f.budget_ceiling}
                stroke="#f85149"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{ value: "Budget Ceiling", position: "insideTopRight", fill: "#f85149", fontSize: 11 }}
              />
              {/* Today divider */}
              <ReferenceLine x="May 7" stroke="currentColor" strokeOpacity={0.3} strokeDasharray="3 3" />
              {/* Confidence band */}
              <Area type="monotone" dataKey="upper" stroke="transparent" fill="url(#gradBand)" connectNulls />
              <Area type="monotone" dataKey="lower" stroke="transparent" fill="white" fillOpacity={0.01} connectNulls />
              {/* Actual line */}
              <Area type="monotone" dataKey="actual" stroke="#388bfd" strokeWidth={2.5} fill="url(#gradActual)" connectNulls dot={{ fill: "#388bfd", r: 3 }} />
              {/* Projected line */}
              <Line type="monotone" dataKey="projected" stroke="#79c0ff" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Budget progress */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="section-title">Budget Utilization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Current spend</span>
                <span className="mono-value">{formatUSD(f.current_spend)} / {formatUSD(f.budget_ceiling)}</span>
              </div>
              <Progress
                value={budgetUsedPct}
                className={cn("h-3", budgetUsedPct > 85 ? "[&>*]:bg-danger" : budgetUsedPct > 65 ? "[&>*]:bg-warning" : "[&>*]:bg-success")}
              />
              <p className="text-xs text-muted-foreground mt-1">{budgetUsedPct.toFixed(1)}% of budget used (May 7)</p>
            </div>

            <Separator />

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Projected month-end</span>
                <span className={cn("mono-value font-bold", isOverBudget ? "text-danger" : "text-success")}>
                  {formatUSD(f.projected_month_end)} / {formatUSD(f.budget_ceiling)}
                </span>
              </div>
              <Progress
                value={Math.min(projectedPct, 100)}
                className={cn("h-3", projectedPct > 100 ? "[&>*]:bg-danger" : projectedPct > 80 ? "[&>*]:bg-warning" : "[&>*]:bg-info")}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isOverBudget
                  ? `⚠ Projected to exceed budget by ${formatUSD(f.projected_month_end - f.budget_ceiling)}`
                  : `${formatPct(100 - projectedPct)} headroom remaining`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="section-title">Burn Rate Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              {[
                { label: "Current daily burn", value: formatUSD(f.burn_rate_daily) },
                { label: "Burn rate trend", value: `+${f.burn_trend}%/day`, danger: true },
                { label: "Days until budget exhausted", value: `${f.days_until_exhaustion} days` },
                { label: "Spend so far (May)", value: formatUSD(f.current_spend) },
                { label: "Remaining budget", value: formatUSD(f.budget_ceiling - f.current_spend) },
              ].map(({ label, value, danger }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className={cn("mono-value", danger && "text-danger")}>{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
