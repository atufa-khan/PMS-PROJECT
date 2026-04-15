import type { DashboardMetric } from "@/lib/db/types";
import { cn } from "@/lib/utils";

export function MetricCard({ metric }: { metric: DashboardMetric }) {
  return (
    <div className="rounded-xl2 border border-border/80 bg-white/85 p-5 shadow-card">
      <p className="text-sm text-muted">{metric.label}</p>
      <p
        className={cn("mt-3 text-3xl font-semibold text-ink", {
          "text-accent": metric.tone === "accent",
          "text-accentWarm": metric.tone === "warn"
        })}
      >
        {metric.value}
      </p>
      {metric.detail ? <p className="mt-2 text-sm text-muted">{metric.detail}</p> : null}
    </div>
  );
}
