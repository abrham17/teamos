import { useState } from "react";
import { Search, Filter, AlertTriangle, ChevronRight, X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/shared/PageHeader";
import { mockTeams } from "@/lib/mock-data";
import { formatUSD, formatPct } from "@/lib/formatters";
import type { Team } from "@/types";
import { cn } from "@/lib/utils";

const planVariant: Record<Team["plan"], "default" | "secondary" | "outline"> = {
  enterprise: "default",
  growth: "secondary",
  starter: "secondary",
  free: "outline",
};

const statusColor: Record<Team["status"], string> = {
  active: "text-success border-success/30 bg-success/10",
  trial: "text-info border-info/30 bg-info/10",
  grace_period: "text-warning border-warning/30 bg-warning/10",
  blocked: "text-danger border-danger/30 bg-danger/10",
};

const chartConfig = {
  cost_mtd: { label: "Cost MTD", color: "#388bfd" },
  revenue: { label: "Revenue", color: "#3fb950" },
};

export function TeamsPage() {
  const [search, setSearch] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const filtered = mockTeams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Platform"
        title="Team Economics"
        description="Per-team revenue, cost, and margin analysis"
      />

      {/* Chart */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="section-title">Cost vs Revenue by Team</CardTitle>
          <CardDescription>Top 8 teams by monthly API spend</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <BarChart
              data={mockTeams.slice(0, 8).map((t) => ({ name: t.name.split(" ")[0], cost_mtd: t.cost_mtd, revenue: t.revenue }))}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.08} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} width={48} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v: unknown) => formatUSD(Number(v))} />} />
              <Bar dataKey="revenue" fill="#3fb950" radius={[3, 3, 0, 0]} opacity={0.7} />
              <Bar dataKey="cost_mtd" fill="#388bfd" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/40 bg-card/50 overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border/40">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              className="pl-9 h-8 text-sm bg-muted/30 border-border/40"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" className="gap-2 h-8">
            <Filter size={13} /> Filter
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead className="w-[200px]">Team</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Cost MTD</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((team) => (
              <TableRow
                key={team.id}
                className="cursor-pointer border-border/40 hover:bg-muted/20 transition-colors"
                onClick={() => setSelectedTeam(team)}
              >
                <TableCell className="font-semibold py-3">
                  <div className="flex items-center gap-2">
                    {team.alert && <AlertTriangle size={13} className="text-warning shrink-0" />}
                    {team.name}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={planVariant[team.plan]} className="capitalize text-xs">
                    {team.plan}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize", statusColor[team.status])}>
                    {team.status.replace("_", " ")}
                  </span>
                </TableCell>
                <TableCell className="text-right mono-value">{formatUSD(team.revenue)}</TableCell>
                <TableCell className="text-right mono-value text-danger/80">{formatUSD(team.cost_mtd)}</TableCell>
                <TableCell className="text-right">
                  <span className={cn("font-semibold text-sm", team.margin_pct >= 60 ? "text-success" : team.margin_pct >= 40 ? "text-warning" : "text-danger")}>
                    {team.revenue === 0 ? "—" : formatPct(team.margin_pct)}
                  </span>
                </TableCell>
                <TableCell className="min-w-[100px]">
                  <div className="space-y-1">
                    <Progress
                      value={team.budget_used_pct}
                      className={cn("h-1.5", team.budget_used_pct > 85 ? "[&>*]:bg-danger" : team.budget_used_pct > 65 ? "[&>*]:bg-warning" : "[&>*]:bg-success")}
                    />
                    <p className="text-xs text-muted-foreground">{team.budget_used_pct}%</p>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">{team.member_count}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-primary/10">
                    <ChevronRight size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Team Detail Sheet */}
      <Sheet open={!!selectedTeam} onOpenChange={() => setSelectedTeam(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selectedTeam?.alert && <AlertTriangle size={16} className="text-warning" />}
              {selectedTeam?.name}
            </SheetTitle>
          </SheetHeader>
          {selectedTeam && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Plan", value: selectedTeam.plan },
                  { label: "Status", value: selectedTeam.status.replace("_", " ") },
                  { label: "Revenue", value: formatUSD(selectedTeam.revenue) },
                  { label: "Cost MTD", value: formatUSD(selectedTeam.cost_mtd) },
                  { label: "Margin", value: selectedTeam.revenue === 0 ? "—" : formatPct(selectedTeam.margin_pct) },
                  { label: "Members", value: String(selectedTeam.member_count) },
                  { label: "API Calls", value: selectedTeam.calls.toLocaleString() },
                  { label: "Budget Used", value: `${selectedTeam.budget_used_pct}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-muted/30 p-3">
                    <p className="stat-label mb-0.5">{label}</p>
                    <p className="font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="section-title mb-1">Budget Utilization</p>
                <Progress value={selectedTeam.budget_used_pct} className="h-3" />
                <p className="mt-1 text-xs text-muted-foreground">{selectedTeam.budget_used_pct}% of monthly budget used</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">View Full Details</Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedTeam(null)}>
                  <X size={14} />
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
