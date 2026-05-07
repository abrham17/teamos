import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  trendLabel?: string;
  icon?: React.ReactNode;
  accent?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

const accentMap: Record<NonNullable<StatCardProps["accent"]>, string> = {
  default: "bg-primary/80",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function StatCard({
  title,
  value,
  trend,
  trendUp,
  trendLabel = "vs last cycle",
  icon,
  accent = "default",
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/40 bg-card/60 backdrop-blur-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      {/* accent stripe */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] rounded-l-xl",
          accentMap[accent]
        )}
      />

      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pl-6">
        <CardTitle className="stat-label">{title}</CardTitle>
        {icon && (
          <span className="text-muted-foreground/60">{icon}</span>
        )}
      </CardHeader>

      <CardContent className="pl-6">
        <p className="stat-value">{value}</p>
        {trend !== undefined && (
          <p
            className={cn(
              "mt-1.5 flex items-center gap-1 text-xs font-semibold",
              trendUp ? "text-success" : "text-danger"
            )}
          >
            {trendUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {trend}
            <span className="text-muted-foreground font-normal ml-0.5">{trendLabel}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
