import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import {
  assignProbationManagerAction,
  recordProbationDecisionAction,
  scheduleProbationDiscussionAction
} from "@/app/admin/probation/actions";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import {
  listAssignableManagers,
  listProbationCasesForAdmin
} from "@/lib/workflows/probation-service";

export default async function AdminProbationPage() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);
  const probationCases = await listProbationCasesForAdmin();
  const managers = await listAssignableManagers();

  return (
    <AppShell
      role={session.role}
      title="Admin probation control"
      subtitle="Blocked checkpoints, waivers, backdated DOJ review, and confirmation decision prep will live in this operational surface."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard title="Probation operations">
        <datalist id="manager-directory">
          {managers.map((manager) => (
            <option key={manager.email} value={manager.email}>
              {manager.full_name}
            </option>
          ))}
        </datalist>

        <div className="space-y-4">
          {probationCases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
              No probation cases are available right now.
            </div>
          ) : null}

          {probationCases.map((probationCase) => (
            <div key={probationCase.id} className="rounded-2xl border border-border bg-stone-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{probationCase.employeeName}</p>
                  <p className="mt-1 text-sm text-muted">
                    Manager: {probationCase.managerName} | Status: {probationCase.status}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Discussion: {probationCase.discussionStatus} | {probationCase.discussionAt}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Pending checkpoints: {probationCase.pendingCheckpoints}
                  </p>
                  <p className="mt-2 text-sm text-muted">{probationCase.adminBriefingNote}</p>
                  {probationCase.latestDecision ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.15em] text-muted">
                      Latest decision: {probationCase.latestDecision} on {probationCase.latestDecisionDate}
                    </p>
                  ) : null}
                </div>
                {probationCase.missingManager ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
                    Manager missing
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <form action={assignProbationManagerAction} className="space-y-2 rounded-2xl border border-border bg-white p-4">
                  <input type="hidden" name="caseId" value={probationCase.id} />
                  <p className="text-sm font-medium">Assign or replace manager</p>
                  <input
                    name="managerEmail"
                    list="manager-directory"
                    className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                    placeholder="manager@company.com"
                    required
                  />
                  <button type="submit" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
                    Save manager
                  </button>
                </form>

                <form action={scheduleProbationDiscussionAction} className="space-y-2 rounded-2xl border border-border bg-white p-4">
                  <input type="hidden" name="caseId" value={probationCase.id} />
                  <p className="text-sm font-medium">Schedule confirmation discussion</p>
                  <input
                    name="discussionAt"
                    type="datetime-local"
                    className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                    required
                  />
                  <button type="submit" className="rounded-full border border-border px-4 py-2 text-sm text-stone-700">
                    Schedule
                  </button>
                </form>

                <form action={recordProbationDecisionAction} className="space-y-2 rounded-2xl border border-border bg-white p-4">
                  <input type="hidden" name="caseId" value={probationCase.id} />
                  <p className="text-sm font-medium">Record decision</p>
                  <select
                    name="decision"
                    defaultValue="review_further"
                    className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                  >
                    <option value="confirm">Confirm</option>
                    <option value="extend_probation">Extend probation</option>
                    <option value="review_further">Review further</option>
                  </select>
                  <input
                    name="effectiveOn"
                    type="date"
                    className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                    required
                  />
                  <textarea
                    name="note"
                    className="min-h-24 w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                    placeholder="Decision context"
                    required
                  />
                  <button type="submit" className="rounded-full border border-amber-300 px-4 py-2 text-sm text-amber-700">
                    Save decision
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
