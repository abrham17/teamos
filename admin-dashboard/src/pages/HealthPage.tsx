import { useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Activity, Database, Brain, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { HealthBadge } from "@/components/shared/HealthBadge";
import { api } from "@/lib/api";
import { toast } from "sonner";

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  PostgreSQL: <Database size={18} />,
  Redis: <Server size={18} />,
  Qdrant: <Brain size={18} />,
  "Celery Workers": <Activity size={18} />,
};

function getStatusIcon(status: string) {
  switch (status) {
    case "healthy": return <CheckCircle2 className="h-5 w-5 text-success" />;
    case "degraded": return <AlertTriangle className="h-5 w-5 text-warning" />;
    case "down": return <XCircle className="h-5 w-5 text-destructive" />;
    default: return <AlertTriangle className="h-5 w-5 text-muted-foreground" />;
  }
}

export function HealthPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = async () => {
    try {
      const token = await getToken({ template: "backend" });
      const result = await api.getHealth(token);
      setData(result);
    } catch {
      toast.error("Health check failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    intervalRef.current = setInterval(fetchHealth, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-8 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const overallLabel = data.overall === "healthy" ? "All Systems Operational" : data.overall === "degraded" ? "System Degraded" : "System Down";

  return (
    <div className="space-y-8 p-6">
      <PageHeader
        eyebrow="Infrastructure"
        title="System Health"
        description={overallLabel}
        action={
          <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading} className="gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Check Now
          </Button>
        }
      />

      <Card className={`border-2 ${
        data.overall === "healthy" ? "border-success/30 bg-success/5" :
        data.overall === "degraded" ? "border-warning/30 bg-warning/5" :
        "border-destructive/30 bg-destructive/5"
      }`}>
        <CardContent className="flex items-center gap-4 py-4">
          {getStatusIcon(data.overall)}
          <div>
            <p className="font-medium">{overallLabel}</p>
            <p className="text-sm text-muted-foreground">Last checked: {new Date(data.checked_at).toLocaleTimeString()}</p>
          </div>
          <Badge variant={data.overall === "healthy" ? "default" : "destructive"} className="ml-auto">
            {data.overall}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(data.services || []).map((svc: any) => (
          <Card key={svc.name} className="border-border/40 bg-card/30 backdrop-blur-sm">
            <CardContent className="flex flex-col items-center text-center pt-6 pb-6 gap-3">
              <div className="flex items-center gap-2">
                {SERVICE_ICONS[svc.name] || <Server size={18} />}
                <span className="font-medium text-sm">{svc.name}</span>
              </div>
              <HealthBadge status={svc.status} />
              <div className="w-full space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Latency</span>
                  <span>{svc.latency_ms}ms</span>
                </div>
                <Progress
                  value={Math.min(100, (svc.latency_ms || 0) / 2)}
                  className={`h-1.5 ${
                    svc.latency_ms > 100 ? "[&>div]:bg-destructive" :
                    svc.latency_ms > 50 ? "[&>div]:bg-warning" : "[&>div]:bg-success"
                  }`}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                <span>Uptime: {svc.uptime}%</span>
              </div>
              {svc.detail && <p className="text-xs text-muted-foreground">{svc.detail}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Uptime Summary</CardTitle>
          <CardDescription>30-day rolling average</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(data.services || []).map((svc: any) => (
              <div key={svc.name} className="flex items-center gap-4 py-2 border-b border-border/20 last:border-0">
                <div className="w-32 text-sm font-medium">{svc.name}</div>
                <Progress value={svc.uptime || 0} className="flex-1 h-2" />
                <div className="w-16 text-right text-sm font-mono">{svc.uptime}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
