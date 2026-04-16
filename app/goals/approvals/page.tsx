import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { approveGoalAction, rejectGoalAction } from "@/app/goals/actions";
import { getAppSession } from "@/lib/auth/session";
import {
  buildWorkspaceToggleOptions,
  resolveWorkspaceSession
} from "@/lib/auth/workspace-role";
import { listPendingApprovals } from "@/lib/workflows/goal-service";

export default async function GoalApprovalsPage({
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
  const approvals = await listPendingApprovals(workspaceSession);
  const workspaceToggle = buildWorkspaceToggleOptions(
    session,
    workspaceSession.role,
    "/goals/approvals",
    resolvedSearchParams
  );

  return (
    <AppShell
      role={workspaceSession.role}
      title="Goal approvals"
      subtitle="Approval, rejection, SLA visibility, weightage confirmation, and escalation timing are all first-class workflow states in this build."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
      workspaceToggle={workspaceToggle}
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
                <div className="text-right">
                  <p className="text-sm text-accentWarm">{approval.status}</p>
                  <p className="mt-2 text-xs text-muted">
                    Assigned: {approval.assignedTotal}% | remaining: {approval.remaining}%
                  </p>
                </div>
              </div>

              {approval.canApprove ? (
                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                  <form action={approveGoalAction} className="flex items-center gap-2">
                    <input type="hidden" name="goalId" value={approval.goalId} />
                    <input
                      name="weightage"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue={approval.weightage}
                      className="w-28 rounded-full border border-border bg-white px-4 py-2 text-sm"
                      required
                    />
                    <button
                      type="submit"
                      className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
                    >
                      Approve + set weightage
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
