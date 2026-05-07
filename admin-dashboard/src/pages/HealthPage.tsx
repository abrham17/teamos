import { useState, useEffect } from "react";
import { RefreshCw, Database, Cpu, Cloud, Activity, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/shared/PageHeader";
import { HealthBadge } from "@/components/shared/HealthBadge";
import { mockHealth } from "@/lib/mock-data";
import { formatRelativeTime } from "@/lib/formatters";
import type { HealthService } from "@/types";
import { cn } from "@/lib/utils";

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  PostgreSQL: <Database size={20} />,
  Redis: <Server size={20} />,
  Qdrant: <Cpu size={20} />,
  "OpenAI API": <Cloud size={20} />,
  "Celery Workers": <Activity size={20} />,
};

const LATENCY_THRESHOLDS: Record<string, { warn: number; danger: number }> = {
  PostgreSQL: { warn: 20, danger: 100 },
  Redis: { warn: 10, danger: 50 },
  Qdrant: { warn: 200, danger: 600 },
  "OpenAI API": { warn: 500, danger: 1500 },
};

function latencyColor(service: HealthService) {
  const thresh = LATENCY_THRESHOLDS[service.name];
  if (!thresh || service.latency_ms === undefined) return "text-foreground";
  if (service.latency_ms > thresh.danger) return "text-danger";
  if (service.latency_ms > thresh.warn) return "text-warning";
  return "text-success";
}

export function HealthPage() {
  const [services, setServices] = useState(mockHealth);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const allHealthy = services.every((s) => s.status === "healthy");
  const anyDown = services.some((s) => s.status === "down");

  function refresh() {
    setRefreshing(true);
    setTimeout(() => {
      setServices([...mockHealth]);
      setLastRefreshed(new Date());
      setRefreshing(false);
    }, 800);
  }

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []);

  const overallStatus = anyDown ? "down" : allHealthy ? "healthy" : "degraded";

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="System"
        title="System Health"
        description={`Last refreshed: ${lastRefreshed.toLocaleTimeString()} · Auto-refreshes every 15s`}
        action={
          <Button variant="outline" size="sm" className="gap-2" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Overall Status Banner */}
      <div
        className={cn(
          "flex items-center justify-between rounded-xl border px-5 py-4",
          overallStatus === "healthy" && "border-success/30 bg-success/10",
          overallStatus === "degraded" && "border-warning/30 bg-warning/10",
          overallStatus === "down" && "border-danger/30 bg-danger/10"
        )}
      >
        <div className="flex items-center gap-3">
          <HealthBadge status={overallStatus} size="md" />
          <div>
            <p className="font-semibold">
              {overallStatus === "healthy" && "All Systems Operational"}
              {overallStatus === "degraded" && "Degraded Performance Detected"}
              {overallStatus === "down" && "Critical — Service Outage"}
            </p>
            <p className="text-xs text-muted-foreground">
              {services.filter((s) => s.status === "healthy").length}/{services.length} services healthy
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => (
          <Card
            key={service.name}
            className={cn(
              "border-border/40 bg-card/50 transition-all hover:shadow-md",
              service.status === "down" && "border-danger/30",
              service.status === "degraded" && "border-warning/30"
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  service.status === "healthy" && "bg-success/15 text-success",
                  service.status === "degraded" && "bg-warning/15 text-warning",
                  service.status === "down" && "bg-danger/15 text-danger"
                )}>
                  {SERVICE_ICONS[service.name] ?? <Server size={20} />}
                </div>
                <CardTitle className="text-base font-bold">{service.name}</CardTitle>
              </div>
              <HealthBadge status={service.status} showLabel={false} />
            </CardHeader>

            <CardContent className="space-y-3">
              {service.latency_ms !== undefined && (
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Latency (p95)</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className={cn("mono-value font-bold", latencyColor(service))}>
                          {service.latency_ms}ms
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Response time percentile 95</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Progress
                    value={Math.min((service.latency_ms / 1000) * 100, 100)}
                    className={cn(
                      "h-1.5 mt-1.5",
                      service.latency_ms > (LATENCY_THRESHOLDS[service.name]?.danger ?? 9999)
                        ? "[&>*]:bg-danger"
                        : service.latency_ms > (LATENCY_THRESHOLDS[service.name]?.warn ?? 9999)
                        ? "[&>*]:bg-warning"
                        : "[&>*]:bg-success"
                    )}
                  />
                </div>
              )}

              <Separator />

              <p className="text-xs text-muted-foreground leading-relaxed">{service.detail}</p>

              {service.uptime_pct !== undefined && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">30-day uptime</span>
                  <span className={cn("mono-value font-semibold", service.uptime_pct >= 99.9 ? "text-success" : service.uptime_pct >= 99 ? "text-warning" : "text-danger")}>
                    {service.uptime_pct}%
                  </span>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground/60">
                Checked {formatRelativeTime(service.checked_at)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Uptime summary */}
      <Card className="border-border/40 bg-card/50">
        <CardHeader>
          <CardTitle className="section-title">30-Day Uptime Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {services.map((service) => (
              <div key={service.name} className="flex items-center gap-4 text-sm">
                <span className="w-36 text-muted-foreground shrink-0">{service.name}</span>
                <Progress
                  value={service.uptime_pct ?? 100}
                  className={cn(
                    "flex-1 h-2",
                    (service.uptime_pct ?? 100) >= 99.9 ? "[&>*]:bg-success"
                    : (service.uptime_pct ?? 100) >= 99 ? "[&>*]:bg-warning"
                    : "[&>*]:bg-danger"
                  )}
                />
                <span className={cn(
                  "mono-value text-xs w-14 text-right",
                  (service.uptime_pct ?? 100) >= 99.9 ? "text-success" : (service.uptime_pct ?? 100) >= 99 ? "text-warning" : "text-danger"
                )}>
                  {service.uptime_pct ?? 100}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
