import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";
import type { ProbationCheckpointRecord } from "@/lib/db/types";
import { getDashboardSummary } from "@/lib/workflows/dashboard-service";
import { listPendingApprovals } from "@/lib/workflows/goal-service";
import { listProbationCheckpoints } from "@/lib/workflows/probation-service";

export default async function DashboardPage() {
  const session = await getAppSession();
  const metrics = await getDashboardSummary(session);
  const approvals = await listPendingApprovals(session);
  const checkpoints = await listProbationCheckpoints(session);

  return (
    <AppShell
      role={session.role}
      title={`Good afternoon, ${session.fullName.split(" ")[0]}`}
      subtitle="The app shell is now aligned to the PMS PRD: goals, probation, review workflows, and HR monitoring are structured as one role-based experience."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Approval queue"
          description="Employee-submitted goals route to manager first and can auto-escalate to Admin after five business days."
        >
          <div className="space-y-3">
            {approvals.map((approval) => (
              <div key={approval.id} className="rounded-2xl border border-border bg-stone-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{approval.goalTitle}</p>
                    <p className="mt-1 text-sm text-muted">Requested by {approval.requestedBy}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">{approval.status}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Probation watchlist"
          description="Working-day checkpoints, paused leave periods, blocked manager assignments, and cross-share waiting states."
        >
          <div className="space-y-3">
            {checkpoints.map((checkpoint: ProbationCheckpointRecord) => (
              <div key={checkpoint.id} className="rounded-2xl border border-border bg-stone-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{checkpoint.employeeName}</p>
                    <p className="mt-1 text-sm text-muted">
                      {checkpoint.dayLabel} due {checkpoint.dueDate}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">{checkpoint.status}</span>
                </div>
                <p className="mt-3 text-sm text-muted">Waiting on: {checkpoint.waitingOn}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
