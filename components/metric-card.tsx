import Link from "next/link";
import type { Route } from "next";
import type { DashboardMetric } from "@/lib/db/types";
import { cn } from "@/lib/utils";

export function MetricCard({ metric }: { metric: DashboardMetric }) {
  const content = (
    <div className="rounded-xl2 border border-border/80 bg-white/85 p-5 shadow-card transition hover:border-border hover:bg-white">
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

  if (!metric.href) {
    return content;
  }

  return (
    <Link href={metric.href as Route} className="block">
      {content}
    </Link>
  );
}
