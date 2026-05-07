import { AlertTriangle, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { mockUsers } from "@/lib/mock-data";
import { formatUSD, formatNumber } from "@/lib/formatters";

const MODEL_COLORS: Record<string, string> = {
  "GPT-4o": "bg-info text-white",
  "GPT-4o mini": "bg-primary/80 text-primary-foreground",
  "GPT-4o nano": "bg-secondary text-secondary-foreground",
  "o3": "bg-warning/80 text-white",
};

export function UsersPage() {
  const [search, setSearch] = useState("");
  const filtered = mockUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.team.toLowerCase().includes(search.toLowerCase())
  );

  const totalCost = mockUsers.reduce((s, u) => s + u.cost_mtd, 0);
  const anomalyCount = mockUsers.filter((u) => u.anomaly).length;
  const topUser = mockUsers[0];
  const avgCost = totalCost / mockUsers.length;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Platform"
        title="Top Spenders"
        description="Users with highest API cost attribution this billing cycle"
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Total User Spend" value={formatUSD(totalCost)} accent="info" />
        <StatCard title="Top Spender Cost" value={formatUSD(topUser.cost_mtd)} accent="warning" />
        <StatCard title="Avg Cost / User" value={formatUSD(avgCost)} accent="default" />
        <StatCard title="Anomaly Alerts" value={String(anomalyCount)} accent="danger" />
      </div>

      <Card className="border-border/40 bg-card/50 overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border/40">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-9 h-8 text-sm bg-muted/30 border-border/40"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead className="w-8">#</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Top Model</TableHead>
              <TableHead className="text-right">API Calls</TableHead>
              <TableHead className="text-right">Cost MTD</TableHead>
              <TableHead>Share</TableHead>
              <TableHead className="text-center">Anomaly</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user, idx) => (
              <TableRow key={user.id} className="border-border/40 hover:bg-muted/20 transition-colors">
                <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-semibold text-sm">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{user.team}</TableCell>
                <TableCell>
                  <Badge
                    className={`text-xs ${MODEL_COLORS[user.top_model] ?? "bg-secondary text-secondary-foreground"}`}
                  >
                    {user.top_model}
                  </Badge>
                </TableCell>
                <TableCell className="text-right mono-value">{formatNumber(user.calls)}</TableCell>
                <TableCell className="text-right mono-value text-foreground font-bold">
                  {formatUSD(user.cost_mtd)}
                </TableCell>
                <TableCell className="min-w-[120px]">
                  <div className="space-y-1">
                    <Progress
                      value={(user.cost_mtd / mockUsers[0].cost_mtd) * 100}
                      className="h-1.5"
                    />
                    <p className="text-xs text-muted-foreground">
                      {((user.cost_mtd / totalCost) * 100).toFixed(1)}% of total
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {user.anomaly ? (
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertTriangle size={15} className="text-warning mx-auto" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Spend is &gt;3× team average</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground/30">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <CardContent className="py-3 border-t border-border/40">
          <CardDescription className="text-xs">
            Showing {filtered.length} of {mockUsers.length} users · Sorted by cost (highest first)
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
