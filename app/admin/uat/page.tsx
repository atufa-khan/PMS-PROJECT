import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import type { UatScenarioRecord } from "@/lib/db/types";
import { getReadinessLabel } from "@/lib/workflows/readiness-rules";
import { getUatOverview } from "@/lib/workflows/uat-service";

function ScenarioCard({ scenario }: { scenario: UatScenarioRecord }) {
  const content = (
    <div className="rounded-2xl border border-border bg-stone-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="font-medium">{scenario.title}</p>
          <p className="mt-1 text-sm text-muted">{scenario.description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            scenario.state === "ready"
              ? "bg-teal-50 text-teal-800"
              : scenario.state === "attention"
                ? "bg-amber-50 text-amber-800"
                : "bg-rose-50 text-rose-800"
          }`}
        >
          {getReadinessLabel(scenario.state)}
        </span>
      </div>

      <p className="mt-3 text-sm text-stone-700">{scenario.liveEvidence}</p>

      <div className="mt-4 space-y-2 text-sm text-muted">
        {scenario.steps.map((step, index) => (
          <p key={step}>
            {index + 1}. {step}
          </p>
        ))}
      </div>
    </div>
  );

  if (!scenario.href) {
    return content;
  }

  return (
    <Link href={scenario.href as Route} className="block">
      {content}
    </Link>
  );
}

export default async function AdminUatPage() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const overview = await getUatOverview();
  const groupedScenarios = [
    {
      title: "Role journeys",
      description:
        "These scenarios validate that the core employee, manager, and admin journeys are working with live data.",
      items: overview.scenarios.filter((scenario) =>
        ["employee", "manager", "admin"].includes(scenario.role)
      )
    },
    {
      title: "Cross-role and rollout checks",
      description:
        "These scenarios focus on multi-role behavior and operational rollout readiness.",
      items: overview.scenarios.filter((scenario) =>
        ["operations"].includes(scenario.role) || scenario.id === "player-coach"
      )
    }
  ];

  return (
    <AppShell
      role={session.role}
      title="UAT checklist"
      subtitle="Use this workspace to validate the implemented PMS journeys with real data before final rollout."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overview.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {groupedScenarios.map((group) => (
          <SectionCard
            key={group.title}
            title={group.title}
            description={group.description}
          >
            <div className="space-y-3">
              {group.items.map((scenario) => (
                <ScenarioCard key={scenario.id} scenario={scenario} />
              ))}
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard
        title="Rollout follow-through"
        description="These are the remaining real-environment actions surfaced from the live app state."
      >
        <div className="space-y-3">
          {overview.rolloutNotes.map((note) => (
            <div
              key={note}
              className="rounded-2xl border border-border bg-stone-50 p-4 text-sm text-muted"
            >
              {note}
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
