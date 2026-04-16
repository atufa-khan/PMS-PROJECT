import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";
import {
  buildWorkspaceToggleOptions,
  resolveWorkspaceSession
} from "@/lib/auth/workspace-role";
import { listReviewCycles } from "@/lib/workflows/review-service";

export default async function ReviewsPage({
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
  const cycles = await listReviewCycles(workspaceSession);
  const workspaceToggle = buildWorkspaceToggleOptions(
    session,
    workspaceSession.role,
    "/reviews",
    resolvedSearchParams
  );
  const viewQuery =
    workspaceSession.role !== session.role ? `?view=${workspaceSession.role}` : "";

  return (
    <AppShell
      role={workspaceSession.role}
      title="Performance reviews"
      subtitle="Cycle templates, self reviews, manager ratings, scheduling, waivers, and finalization now run as one shared workflow surface."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
      workspaceToggle={workspaceToggle}
    >
      <SectionCard title="Available cycles">
        <div className="space-y-3">
          {cycles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
              No review cycles are available for your role yet.
            </div>
          ) : null}

          {cycles.map((cycle) => (
            <Link
              href={`/reviews/${cycle.id}${viewQuery}`}
              key={cycle.id}
              className="block rounded-2xl border border-border bg-stone-50 p-4 transition hover:bg-stone-100"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{cycle.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {cycle.windowLabel} | closes {cycle.closeDate}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.15em] text-muted">
                    {cycle.cycleType} | {cycle.completedCount}/{cycle.enrollmentCount} complete | {cycle.myStatus}
                  </p>
                </div>
                {cycle.actionRequired ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
                    Action required
                  </span>
                ) : (
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">
                    Up to date
                  </span>
                )}
              </div>
              {/*
              <p className="font-medium">{cycle.name}</p>
              <p className="mt-1 text-sm text-muted">
                {cycle.window} • closes {cycle.close}
              </p>
              */}
            </Link>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
