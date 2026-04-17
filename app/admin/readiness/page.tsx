import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import {
  getReadinessOverview,
  type ReadinessCheckRecord
} from "@/lib/workflows/readiness-service";
import { getReadinessLabel } from "@/lib/workflows/readiness-rules";

function ReadinessList({
  items
}: {
  items: ReadinessCheckRecord[];
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const content = (
          <div className="rounded-2xl border border-border bg-stone-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-sm text-muted">{item.description}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  item.state === "ready"
                    ? "bg-teal-50 text-teal-800"
                    : item.state === "attention"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-rose-50 text-rose-800"
                }`}
              >
                {getReadinessLabel(item.state)}
              </span>
            </div>
          </div>
        );

        if (!item.href) {
          return <div key={item.title}>{content}</div>;
        }

        return (
          <Link key={item.title} href={item.href as Route} className="block">
            {content}
          </Link>
        );
      })}
    </div>
  );
}

export default async function AdminReadinessPage() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const overview = await getReadinessOverview();

  return (
    <AppShell
      role={session.role}
      title="Implementation readiness"
      subtitle="This workspace checks whether the live PMS build is aligned with the implemented project goals and highlights what still needs operational follow-through."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overview.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard
          title="Environment readiness"
          description="These checks confirm whether the runtime is properly configured for live operations."
        >
          <ReadinessList items={overview.environmentChecks} />
        </SectionCard>

        <SectionCard
          title="Workflow health"
          description="These checks highlight data-routing or queue issues that can break alignment with the product goals."
        >
          <ReadinessList items={overview.workflowChecks} />
        </SectionCard>
      </div>

      <SectionCard
        title="Project-goal alignment"
        description="This view maps the current codebase to the main PMS product goals and shows which areas are live versus still requiring ops follow-through."
      >
        <ReadinessList items={overview.featureAlignmentChecks} />
      </SectionCard>

      <SectionCard
        title="Next actions"
        description="These are the remaining follow-ups based on the current live state."
      >
        <div className="space-y-3">
          {overview.nextActions.map((action) => (
            <div
              key={action}
              className="rounded-2xl border border-border bg-stone-50 p-4 text-sm text-muted"
            >
              {action}
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
