import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import {
  extendCycleCloseDateAction,
  syncCycleEnrollmentsAction,
  toggleCycleActivationAction
} from "@/app/admin/cycles/actions";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { listReviewCycles } from "@/lib/workflows/review-service";

export default async function AdminCyclesPage() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);
  const cycles = await listReviewCycles(session);

  return (
    <AppShell
      role={session.role}
      title="Admin cycle control"
      subtitle="This page is reserved for cycle activation, extension, waiver, acting reviewer assignment, and compliance monitoring."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard title="Cycle control center">
        <div className="mb-4 flex justify-end">
          <Link
            href="/admin/reports/overview.csv"
            className="rounded-full border border-border bg-white px-4 py-2 text-sm text-stone-700"
          >
            Download CSV overview
          </Link>
        </div>
        <div className="space-y-4">
          {cycles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
              No review cycles are configured yet.
            </div>
          ) : null}

          {cycles.map((cycle) => (
            <div key={cycle.id} className="rounded-2xl border border-border bg-stone-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{cycle.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {cycle.windowLabel} | closes {cycle.closeDate}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.15em] text-muted">
                    {cycle.cycleType} | {cycle.completedCount}/{cycle.enrollmentCount} complete
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">
                  {cycle.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <form action={toggleCycleActivationAction} className="rounded-2xl border border-border bg-white p-4">
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <input type="hidden" name="nextActive" value={cycle.isActive ? "false" : "true"} />
                  <p className="text-sm font-medium">Activation</p>
                  <button type="submit" className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
                    {cycle.isActive ? "Deactivate cycle" : "Activate cycle"}
                  </button>
                </form>

                <form action={syncCycleEnrollmentsAction} className="rounded-2xl border border-border bg-white p-4">
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <p className="text-sm font-medium">Enrollment sync</p>
                  <button type="submit" className="mt-3 rounded-full border border-border px-4 py-2 text-sm text-stone-700">
                    Sync eligible employees
                  </button>
                </form>

                <form action={extendCycleCloseDateAction} className="space-y-2 rounded-2xl border border-border bg-white p-4">
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <p className="text-sm font-medium">Extend close date</p>
                  <input
                    name="closeDate"
                    type="date"
                    defaultValue={cycle.closeDate}
                    className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                    required
                  />
                  <button type="submit" className="rounded-full border border-amber-300 px-4 py-2 text-sm text-amber-700">
                    Save date
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
