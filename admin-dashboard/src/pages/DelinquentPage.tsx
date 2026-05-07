import { AlertTriangle, ShieldOff, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
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
import { mockDelinquent } from "@/lib/mock-data";
import { formatUSD, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export function DelinquentPage() {
  const grace = mockDelinquent.filter((t) => t.status === "grace_period");
  const blocked = mockDelinquent.filter((t) => t.status === "blocked");
  const revenueAtRisk = grace.reduce((s, t) => s + t.revenue, 0);
  const revenueBlocked = blocked.reduce((s, t) => s + t.revenue, 0);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Finance"
        title="Delinquent Subscriptions"
        description="Teams in grace period or fully blocked due to payment failure"
      />

      {/* Alert Banner */}
      <Alert variant="destructive" className="border-danger/30 bg-danger/10">
        <AlertTriangle className="h-4 w-4 text-danger" />
        <AlertTitle>Revenue at Risk</AlertTitle>
        <AlertDescription>
          {formatUSD(revenueAtRisk)} MRR is in grace period and will be lost if payment is not resolved.
          {blocked.length > 0 && ` ${formatUSD(revenueBlocked)} is already blocked.`}
        </AlertDescription>
      </Alert>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Grace Period" value={String(grace.length)} icon={<Clock size={18} />} accent="warning" />
        <StatCard title="Blocked" value={String(blocked.length)} icon={<ShieldOff size={18} />} accent="danger" />
        <StatCard title="Revenue at Risk" value={formatUSD(revenueAtRisk, true)} accent="warning" />
        <StatCard title="Revenue Blocked" value={formatUSD(revenueBlocked, true)} accent="danger" />
      </div>

      {/* Grace Period */}
      <Card className="border-border/40 bg-card/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div>
            <p className="section-title">Grace Period</p>
            <p className="text-xs text-muted-foreground mt-0.5">7-day window after payment failure</p>
          </div>
          <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">
            {grace.length} teams
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead>Team</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">MRR</TableHead>
              <TableHead>Days in Grace</TableHead>
              <TableHead>Grace Expires</TableHead>
              <TableHead>Failure Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grace.map((team) => (
              <TableRow key={team.id} className="border-border/40 hover:bg-muted/20 transition-colors">
                <TableCell className="font-semibold text-sm">{team.team_name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize text-xs">{team.plan}</Badge>
                </TableCell>
                <TableCell className="text-right mono-value">{formatUSD(team.revenue)}</TableCell>
                <TableCell>
                  <span className={cn("font-semibold text-sm", (team.days_in_grace ?? 0) >= 5 ? "text-danger" : "text-warning")}>
                    {team.days_in_grace}d
                  </span>
                </TableCell>
                <TableCell className="text-sm">{team.grace_expires_at ? formatDate(team.grace_expires_at) : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{team.failure_reason}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs">Extend Grace</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs text-danger border-danger/30 hover:bg-danger/10">Force Block</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Blocked */}
      <Card className="border-border/40 bg-card/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div>
            <p className="section-title">Blocked Teams</p>
            <p className="text-xs text-muted-foreground mt-0.5">Access fully suspended</p>
          </div>
          <Badge variant="outline" className="text-danger border-danger/30 bg-danger/10">
            {blocked.length} teams
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead>Team</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Lost MRR</TableHead>
              <TableHead>Blocked Since</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocked.map((team) => (
              <TableRow key={team.id} className="border-border/40 hover:bg-muted/20 transition-colors">
                <TableCell className="font-semibold text-sm">{team.team_name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize text-xs">{team.plan}</Badge>
                </TableCell>
                <TableCell className="text-right mono-value text-danger/80">{formatUSD(team.revenue)}</TableCell>
                <TableCell className="text-sm">{team.blocked_at ? formatDate(team.blocked_at) : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{team.failure_reason}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs">Manual Override</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs text-success border-success/30 hover:bg-success/10">Restore</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <CardContent className="py-2 border-t border-border/40">
          <CardDescription className="text-xs">Data is held for 30 days post-block before deletion.</CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
