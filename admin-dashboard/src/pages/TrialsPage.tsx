import { useState } from "react";
import { Clock, CheckCircle, XCircle, TrendingUp, Plus, X } from "lucide-react";
import {
  RadialBarChart,
  RadialBar,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { mockTrialStats, mockTrials } from "@/lib/mock-data";
import { formatDate, formatPct } from "@/lib/formatters";
import type { Trial } from "@/types";
import { cn } from "@/lib/utils";

const statusStyle: Record<Trial["status"], string> = {
  active: "text-success border-success/30 bg-success/10",
  expiring: "text-warning border-warning/30 bg-warning/10",
  expired: "text-danger border-danger/30 bg-danger/10",
  converted: "text-info border-info/30 bg-info/10",
};

const radialData = [
  { name: "Converted", value: 53.4, fill: "#3fb950" },
  { name: "Active", value: 41.4, fill: "#388bfd" },
  { name: "Expiring", value: 12.1, fill: "#d29922" },
];

const chartConfig = { value: { label: "%" } };

export function TrialsPage() {
  const [trials, setTrials] = useState(mockTrials);
  const stats = mockTrialStats;

  function handleExtend(trialId: string, days: number) {
    setTrials((prev) =>
      prev.map((t) =>
        t.id === trialId ? { ...t, days_left: t.days_left + days, status: "active" as const } : t
      )
    );
  }

  function handleExpire(trialId: string) {
    setTrials((prev) =>
      prev.map((t) => (t.id === trialId ? { ...t, days_left: 0, status: "expired" as const } : t))
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Finance"
        title="Trial Management"
        description="Lifecycle management for all free trial accounts"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Active Trials"
          value={String(stats.active)}
          icon={<Clock size={18} />}
          accent="info"
        />
        <StatCard
          title="Expiring &lt; 7 days"
          value={String(stats.expiring_soon)}
          icon={<Clock size={18} />}
          accent="warning"
        />
        <StatCard
          title="Expired (held)"
          value={String(stats.expired)}
          icon={<XCircle size={18} />}
          accent="danger"
        />
        <StatCard
          title="Conversion Rate"
          value={formatPct(stats.conversion_rate)}
          trend="+4.2%"
          trendUp
          icon={<TrendingUp size={18} />}
          accent="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Table */}
        <Card className="lg:col-span-2 border-border/40 bg-card/50 overflow-hidden">
          <CardHeader>
            <CardTitle className="section-title">All Trials</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead>Team</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Days Left</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trials.map((trial) => (
                <TableRow key={trial.id} className="border-border/40 hover:bg-muted/20 transition-colors">
                  <TableCell className="font-semibold text-sm">
                    <div>
                      {trial.team_name}
                      <p className="text-xs text-muted-foreground font-normal">{trial.member_count} members</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{trial.owner_email}</TableCell>
                  <TableCell className="text-sm">{formatDate(trial.expires_at)}</TableCell>
                  <TableCell>
                    <span className={cn("font-bold text-sm", trial.days_left <= 2 ? "text-danger" : trial.days_left <= 7 ? "text-warning" : "text-foreground")}>
                      {trial.days_left}d
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize", statusStyle[trial.status])}>
                      {trial.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {(trial.status === "active" || trial.status === "expiring") && (
                      <div className="flex items-center justify-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-transparent px-2 text-xs font-medium hover:bg-muted transition-colors">
                            <Plus size={11} /> Extend
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleExtend(trial.id, 7)}>+7 days</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExtend(trial.id, 14)}>+14 days</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExtend(trial.id, 30)}>+30 days</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-danger border-danger/30 hover:bg-danger/10"
                          onClick={() => handleExpire(trial.id)}
                        >
                          <X size={11} />
                        </Button>
                      </div>
                    )}
                    {trial.status === "converted" && (
                      <Badge variant="outline" className="text-xs text-success border-success/30 bg-success/10">
                        <CheckCircle size={11} className="mr-1" /> Converted
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Funnel Chart */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="section-title">Trial Funnel</CardTitle>
            <CardDescription>Conversion breakdown</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <RadialBarChart
                innerRadius={30}
                outerRadius={90}
                data={radialData}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar
                  dataKey="value"
                  cornerRadius={4}
                  background={{ fill: "var(--muted)" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(v) => [`${v}%`, ""]}
                />
              </RadialBarChart>
            </ChartContainer>
            <ul className="w-full space-y-2 mt-2">
              {radialData.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.fill }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="mono-value text-xs">{d.value}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
