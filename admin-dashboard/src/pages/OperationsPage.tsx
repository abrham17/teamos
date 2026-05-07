import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { mockOperations } from "@/lib/mock-data";
import { formatUSD, formatNumber, formatPct } from "@/lib/formatters";

const OP_COLORS = ["#388bfd", "#3fb950", "#d29922", "#f85149", "#a371f7", "#79c0ff"];

const chartConfig = {
  total_cost: { label: "Total Cost", color: "#388bfd" },
};

export function OperationsPage() {
  const totalCost = mockOperations.reduce((s, o) => s + o.total_cost, 0);
  const totalCalls = mockOperations.reduce((s, o) => s + o.total_calls, 0);
  const mostExpensive = [...mockOperations].sort((a, b) => b.avg_cost_per_call - a.avg_cost_per_call)[0];
  const highestVolume = [...mockOperations].sort((a, b) => b.total_calls - a.total_calls)[0];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="System"
        title="Operations Cost Breakdown"
        description="Per-operation API cost and call volume analysis"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Total Op Cost (MTD)" value={formatUSD(totalCost, true)} accent="info" />
        <StatCard title="Total API Calls" value={formatNumber(totalCalls)} accent="default" />
        <StatCard title="Costliest Op/Call" value={mostExpensive.operation.split(" ")[0]} accent="warning" />
        <StatCard title="Highest Volume" value={highestVolume.operation.split(" ")[0]} accent="success" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Horizontal bar chart */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="section-title">Cost by Operation</CardTitle>
            <CardDescription>Total API spend per operation type</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <BarChart
                layout="vertical"
                data={[...mockOperations].sort((a, b) => b.total_cost - a.total_cost)}
                margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" strokeOpacity={0.08} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="operation"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "currentColor", opacity: 0.7 }}
                  width={120}
                />
                <ChartTooltip content={<ChartTooltipContent formatter={(v: unknown) => formatUSD(Number(v))} />} />
                <Bar dataKey="total_cost" radius={[0, 4, 4, 0]}>
                  {mockOperations.map((_, i) => (
                    <Cell key={i} fill={OP_COLORS[i % OP_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Percentage breakdown */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="section-title">Cost Distribution</CardTitle>
            <CardDescription>Share of total spend per operation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[...mockOperations]
              .sort((a, b) => b.pct_of_total - a.pct_of_total)
              .map((op, i) => (
                <div key={op.operation} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: OP_COLORS[i % OP_COLORS.length] }} />
                      <span className="font-medium">{op.operation}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="mono-value text-xs">{formatUSD(op.total_cost)}</span>
                      <span className="text-muted-foreground text-xs w-10 text-right">{op.pct_of_total}%</span>
                    </div>
                  </div>
                  <Progress
                    value={op.pct_of_total}
                    className="h-1.5"
                    style={{ ["--progress-color" as string]: OP_COLORS[i % OP_COLORS.length] }}
                  />
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="border-border/40 bg-card/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40">
          <p className="section-title">Operation Details</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead>Operation</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead className="text-right">Total Calls</TableHead>
              <TableHead className="text-right">Avg Cost / Call</TableHead>
              <TableHead className="text-right">% of Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockOperations.map((op, i) => (
              <TableRow key={op.operation} className="border-border/40 hover:bg-muted/20 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: OP_COLORS[i % OP_COLORS.length] }} />
                    {op.operation}
                  </div>
                </TableCell>
                <TableCell className="text-right mono-value">{formatUSD(op.total_cost)}</TableCell>
                <TableCell className="text-right mono-value">{formatNumber(op.total_calls)}</TableCell>
                <TableCell className="text-right mono-value">${op.avg_cost_per_call.toFixed(4)}</TableCell>
                <TableCell className="text-right">
                  <span className="mono-value text-muted-foreground">{formatPct(op.pct_of_total)}</span>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-border/40 bg-muted/20 font-bold">
              <TableCell className="text-sm">Total</TableCell>
              <TableCell className="text-right mono-value">{formatUSD(totalCost)}</TableCell>
              <TableCell className="text-right mono-value">{formatNumber(totalCalls)}</TableCell>
              <TableCell className="text-right mono-value text-muted-foreground">—</TableCell>
              <TableCell className="text-right mono-value">100%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
