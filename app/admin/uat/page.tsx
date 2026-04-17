import Link from "next/link";
import type { Route } from "next";
import { FormStatus } from "@/components/form-status";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import {
  prepareSeededUatAccessAction,
  recordUatExecutionAction
} from "@/app/admin/uat/actions";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import type {
  UatExecutionRecord,
  UatFixtureAccountRecord,
  UatScenarioRecord,
  UatSeededScenarioRecord
} from "@/lib/db/types";
import { getReadinessLabel } from "@/lib/workflows/readiness-rules";
import { getUatOverview } from "@/lib/workflows/uat-service";

function getExecutionTone(outcome: UatExecutionRecord["outcome"]) {
  if (outcome === "passed") {
    return "bg-teal-50 text-teal-800";
  }

  if (outcome === "follow_up") {
    return "bg-amber-50 text-amber-800";
  }

  return "bg-rose-50 text-rose-800";
}

function getExecutionLabel(outcome: UatExecutionRecord["outcome"]) {
  if (outcome === "follow_up") {
    return "Follow-up needed";
  }

  return outcome === "passed" ? "Passed" : "Blocked";
}

function ExecutionSummary({
  execution
}: {
  execution?: UatExecutionRecord | null;
}) {
  if (!execution) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white/70 p-3 text-sm text-muted">
        No execution has been recorded for this scenario yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white/70 p-3 text-sm text-muted">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs ${getExecutionTone(execution.outcome)}`}
        >
          {getExecutionLabel(execution.outcome)}
        </span>
        <span>
          Last checked by {execution.actorName} on {execution.testedAt}
        </span>
      </div>
      {execution.testedAccountEmail ? (
        <p className="mt-2 text-sm text-stone-700">
          Tested account: {execution.testedAccountEmail}
        </p>
      ) : null}
      {execution.note ? <p className="mt-2">{execution.note}</p> : null}
    </div>
  );
}

function ScenarioExecutionForm({
  scenarioKey,
  scenarioTitle,
  scenarioType,
  defaultEmail
}: {
  scenarioKey: string;
  scenarioTitle: string;
  scenarioType: "role" | "seeded";
  defaultEmail?: string;
}) {
  return (
    <form action={recordUatExecutionAction} className="space-y-3 rounded-2xl border border-border bg-white p-4">
      <input type="hidden" name="scenarioKey" value={scenarioKey} />
      <input type="hidden" name="scenarioTitle" value={scenarioTitle} />
      <input type="hidden" name="scenarioType" value={scenarioType} />

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <label className="text-sm text-muted">
          Tested account email
          <input
            name="testedAccountEmail"
            type="email"
            defaultValue={defaultEmail ?? ""}
            placeholder="tester@company.com"
            className="mt-1 w-full rounded-2xl border border-border bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-accent"
          />
        </label>

        <label className="text-sm text-muted">
          Outcome
          <select
            name="outcome"
            defaultValue="passed"
            className="mt-1 w-full rounded-2xl border border-border bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-accent"
          >
            <option value="passed">Passed</option>
            <option value="follow_up">Follow-up needed</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
      </div>

      <label className="block text-sm text-muted">
        Execution note
        <textarea
          name="note"
          rows={3}
          placeholder="Capture what was tested, what failed, or any follow-up needed."
          className="mt-1 w-full rounded-2xl border border-border bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-accent"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Record the latest real-user execution so rollout readiness reflects actual UAT, not just seeded data.
        </p>
        <button
          type="submit"
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Record execution
        </button>
      </div>
    </form>
  );
}

function ScenarioCard({ scenario }: { scenario: UatScenarioRecord }) {
  return (
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
      {scenario.recommendedEmail ? (
        <p className="mt-2 text-sm text-muted">
          Recommended seeded account: {scenario.recommendedEmail}
        </p>
      ) : null}

      <div className="mt-4 space-y-2 text-sm text-muted">
        {scenario.steps.map((step, index) => (
          <p key={step}>
            {index + 1}. {step}
          </p>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {scenario.href ? (
          <Link
            href={scenario.href as Route}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-accent hover:text-accent"
          >
            Open workspace
          </Link>
        ) : (
          <span className="text-sm text-muted">No direct workspace link</span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <ExecutionSummary execution={scenario.execution} />
        <ScenarioExecutionForm
          scenarioKey={scenario.id}
          scenarioTitle={scenario.title}
          scenarioType="role"
          defaultEmail={scenario.recommendedEmail}
        />
      </div>
    </div>
  );
}

function FixtureCard({ fixture }: { fixture: UatFixtureAccountRecord }) {
  return (
    <div className="rounded-2xl border border-border bg-stone-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="font-medium">{fixture.title}</p>
          <p className="mt-1 text-sm text-muted">{fixture.description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            fixture.status === "ready"
              ? "bg-teal-50 text-teal-800"
              : fixture.status === "attention"
                ? "bg-amber-50 text-amber-800"
                : "bg-rose-50 text-rose-800"
          }`}
        >
          {getReadinessLabel(fixture.status)}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-sm text-stone-700">
        <p>Email: {fixture.email}</p>
        <p>Roles: {fixture.roles.join(" | ")}</p>
        <p>Temporary password: {fixture.temporaryPassword}</p>
        <p>Auth linked: {fixture.authLinked ? "yes" : "no"}</p>
      </div>

      <div className="mt-4 space-y-2 text-sm text-muted">
        {fixture.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </div>
  );
}

function SeededScenarioCard({
  scenario
}: {
  scenario: UatSeededScenarioRecord;
}) {
  return (
    <div className="rounded-2xl border border-border bg-stone-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="font-medium">{scenario.title}</p>
          <p className="mt-1 text-sm text-muted">{scenario.description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            scenario.status === "ready"
              ? "bg-teal-50 text-teal-800"
              : scenario.status === "attention"
                ? "bg-amber-50 text-amber-800"
                : "bg-rose-50 text-rose-800"
          }`}
        >
          {getReadinessLabel(scenario.status)}
        </span>
      </div>

      <p className="mt-3 text-sm text-stone-700">
        Owner: {scenario.ownerEmail}
      </p>
      <p className="mt-2 text-sm text-muted">{scenario.evidence}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {scenario.linkedRoute ? (
          <Link
            href={scenario.linkedRoute as Route}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-accent hover:text-accent"
          >
            Open seeded flow
          </Link>
        ) : (
          <span className="text-sm text-muted">No direct workspace link</span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <ExecutionSummary execution={scenario.execution} />
        <ScenarioExecutionForm
          scenarioKey={scenario.key}
          scenarioTitle={scenario.title}
          scenarioType="seeded"
          defaultEmail={scenario.ownerEmail}
        />
      </div>
    </div>
  );
}

export default async function AdminUatPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const resolvedSearchParams = (await searchParams) ?? {};
  const status =
    typeof resolvedSearchParams.status === "string"
      ? resolvedSearchParams.status
      : undefined;
  const message =
    typeof resolvedSearchParams.message === "string"
      ? resolvedSearchParams.message
      : undefined;

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
      <FormStatus
        status={status === "success" || status === "error" ? status : "idle"}
        message={message}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overview.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <SectionCard
        title="Seeded realistic test accounts"
        description="These fixture accounts map to the PMS seed data so you can run repeatable UAT without inventing ad-hoc users each time."
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-3xl text-sm text-muted">
            Use the button below to prepare or refresh login-ready auth access for the seeded
            PMS sample users. This will sync known temporary passwords for the fixtures listed
            here.
          </p>
          <form action={prepareSeededUatAccessAction}>
            <button
              type="submit"
              className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-white"
            >
              Prepare seeded UAT access
            </button>
          </form>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {overview.fixtureAccounts.map((fixture) => (
            <FixtureCard key={fixture.key} fixture={fixture} />
          ))}
        </div>
      </SectionCard>

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
        title="Seeded realistic workflow scenarios"
        description="These scenarios are expected to exist in the sample PMS data so the prepared fixtures have meaningful flows to exercise."
      >
        <div className="space-y-3">
          {overview.seededScenarios.map((scenario) => (
            <SeededScenarioCard key={scenario.key} scenario={scenario} />
          ))}
        </div>
      </SectionCard>

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
