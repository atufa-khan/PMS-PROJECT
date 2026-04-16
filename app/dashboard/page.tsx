import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import { acknowledgeAdminCatchUpAction } from "@/app/dashboard/actions";
import { getAppSession } from "@/lib/auth/session";
import {
  buildWorkspaceToggleOptions,
  resolveWorkspaceSession
} from "@/lib/auth/workspace-role";
import { getDashboardDetail, getDashboardSummary } from "@/lib/workflows/dashboard-service";

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAppSession();
  const resolvedSearchParams = (await searchParams) ?? {};
  const workspaceSession = resolveWorkspaceSession(
    session,
    typeof resolvedSearchParams.view === "string"
      ? resolvedSearchParams.view
      : undefined
  );
  const metrics = await getDashboardSummary(workspaceSession);
  const detail = await getDashboardDetail(workspaceSession);
  const workspaceToggle = buildWorkspaceToggleOptions(
    session,
    workspaceSession.role,
    "/dashboard",
    resolvedSearchParams
  );

  return (
    <AppShell
      role={workspaceSession.role}
      title={`Good afternoon, ${session.fullName.split(" ")[0]}`}
      subtitle="The app shell is now aligned to the PMS PRD: goals, probation, review workflows, and HR monitoring are structured as one role-based experience."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
      workspaceToggle={workspaceToggle}
    >
      {detail.adminCatchUp ? (
        <SectionCard
          title={detail.adminCatchUp.title}
          description={detail.adminCatchUp.description}
        >
          <div className="space-y-3">
            {detail.adminCatchUp.items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-stone-50 p-4">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-sm text-muted">{item.subtitle}</p>
                {item.detail ? (
                  <p className="mt-2 text-xs text-muted">{item.detail}</p>
                ) : null}
              </div>
            ))}
            {detail.adminCatchUp.canAcknowledge ? (
              <form action={acknowledgeAdminCatchUpAction}>
                <button
                  type="submit"
                  className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
                >
                  Acknowledge briefing
                </button>
              </form>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title={detail.primaryTitle}
          description={detail.primaryDescription}
        >
          <div className="space-y-3">
            {detail.primaryItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
                No dashboard records are available yet.
              </div>
            ) : null}
            {detail.primaryItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-border bg-stone-50 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {item.href ? (
                      <Link
                        href={item.href as Route}
                        className="font-medium text-accent hover:underline"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <p className="font-medium">{item.title}</p>
                    )}
                    <p className="mt-1 text-sm text-muted">{item.subtitle}</p>
                    {item.detail ? (
                      <p className="mt-2 text-xs text-muted">{item.detail}</p>
                    ) : null}
                  </div>
                  {item.tone ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">
                      {item.tone === "warn" ? "Attention" : "Live"}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title={detail.secondaryTitle}
          description={detail.secondaryDescription}
        >
          <div className="space-y-3">
            {detail.secondaryItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
                No dashboard records are available yet.
              </div>
            ) : null}
            {detail.secondaryItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-border bg-stone-50 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {item.href ? (
                      <Link
                        href={item.href as Route}
                        className="font-medium text-accent hover:underline"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <p className="font-medium">{item.title}</p>
                    )}
                    <p className="mt-1 text-sm text-muted">{item.subtitle}</p>
                    {item.detail ? (
                      <p className="mt-2 text-xs text-muted">{item.detail}</p>
                    ) : null}
                  </div>
                  {item.tone ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">
                      {item.tone === "warn" ? "Attention" : "Live"}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
