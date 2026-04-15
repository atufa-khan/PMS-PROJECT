import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { approveGoalAction, rejectGoalAction } from "@/app/goals/actions";
import { getAppSession } from "@/lib/auth/session";
import { listPendingApprovals } from "@/lib/workflows/goal-service";

export default async function GoalApprovalsPage() {
  const session = await getAppSession();
  const approvals = await listPendingApprovals(session);

  return (
    <AppShell
      role={session.role}
      title="Goal approvals"
      subtitle="Approval, rejection, SLA visibility, and escalation timing are all first-class workflow states in this build."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard title="Pending requests">
        <div className="space-y-3">
          {approvals.map((approval) => (
            <div key={approval.id} className="rounded-2xl border border-border bg-stone-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{approval.goalTitle}</p>
                  <p className="mt-1 text-sm text-muted">
                    Requested by {approval.requestedBy} on {approval.submittedAt}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.15em] text-muted">
                    {approval.scope} goal • {approval.weightage}% weightage
                  </p>
                </div>
                <p className="text-sm text-accentWarm">{approval.status}</p>
              </div>

              {approval.canApprove ? (
                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                  <form action={approveGoalAction}>
                    <input type="hidden" name="goalId" value={approval.goalId} />
                    <button
                      type="submit"
                      className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
                    >
                      Approve
                    </button>
                  </form>

                  <form action={rejectGoalAction} className="flex flex-1 gap-2">
                    <input type="hidden" name="goalId" value={approval.goalId} />
                    <input
                      name="reason"
                      className="min-w-0 flex-1 rounded-full border border-border bg-white px-4 py-2 text-sm"
                      placeholder="Reason for rejection"
                      required
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-amber-300 px-4 py-2 text-sm text-amber-700"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
