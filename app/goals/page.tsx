import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { FormStatus } from "@/components/form-status";
import { SectionCard } from "@/components/section-card";
import {
  acknowledgeGoalSuggestionAction,
  archiveGoalAction,
  submitGoalForApprovalAction,
  updateGoalProgressAction
} from "@/app/goals/actions";
import { getAppSession } from "@/lib/auth/session";
import {
  buildWorkspaceToggleOptions,
  resolveWorkspaceSession
} from "@/lib/auth/workspace-role";
import { listGoals } from "@/lib/workflows/goal-service";
import { percent } from "@/lib/utils";

export default async function GoalsPage({
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
  const viewQuery =
    workspaceSession.role !== session.role ? `?view=${workspaceSession.role}` : "";
  const goals = await listGoals(workspaceSession);
  const workspaceToggle = buildWorkspaceToggleOptions(
    session,
    workspaceSession.role,
    "/goals",
    resolvedSearchParams
  );
  const goalStatus =
    typeof resolvedSearchParams.goalStatus === "string"
      ? resolvedSearchParams.goalStatus
      : undefined;
  const goalMessage =
    typeof resolvedSearchParams.goalMessage === "string"
      ? resolvedSearchParams.goalMessage
      : undefined;
  const returnTo = `/goals${viewQuery}`;

  return (
    <AppShell
      role={workspaceSession.role}
      title="Goal management"
      subtitle="Hierarchy, weightage validation, approval state, and historical preservation are modeled from the implementation plan."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
      workspaceToggle={workspaceToggle}
    >
      <SectionCard
        title="Goal register"
        description="This starter view spans company, team, and individual goals using one unified structure."
      >
        <FormStatus
          status={goalStatus === "success" || goalStatus === "error" ? goalStatus : "idle"}
          message={goalMessage}
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-stone-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-stone-900">
              {workspaceSession.role === "employee"
                ? "Create your individual goal drafts from here."
                : "Create a new goal from the shared workspace."}
            </p>
            <p className="mt-1 text-xs text-muted">
              {workspaceSession.role === "employee"
                ? "Employee drafts stay editable until you submit them for approval."
                : "Managers and Admin can create goals directly for the active cycle."}
            </p>
          </div>
          <Link
            href={`/goals/new${viewQuery}` as Route}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            {workspaceSession.role === "employee" ? "Create goal draft" : "Create goal"}
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-3">Goal</th>
                <th className="pb-3">Scope</th>
                <th className="pb-3">Owner</th>
                <th className="pb-3">Weightage</th>
                <th className="pb-3">Completion</th>
                <th className="pb-3">Rating</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => (
                <tr key={goal.id} className="border-t border-border/70">
                  <td className="py-4 pr-4">
                    <p className="font-medium">{goal.title}</p>
                    {goal.description ? (
                      <p className="mt-1 max-w-xl text-xs text-muted">{goal.description}</p>
                    ) : null}
                    {goal.hasPendingSuggestion && goal.suggestionContext ? (
                      <p className="mt-2 text-xs text-amber-700">{goal.suggestionContext}</p>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4 capitalize">{goal.scope}</td>
                  <td className="py-4 pr-4">{goal.ownerName}</td>
                  <td className="py-4 pr-4">
                    <p>{goal.weightage}%</p>
                    <p className="mt-1 text-xs text-muted">
                      Portfolio: {goal.portfolioWeightage}% assigned
                    </p>
                  </td>
                  <td className="py-4 pr-4">{percent(goal.completionPct)}</td>
                  <td className="py-4 pr-4">{goal.rating}</td>
                  <td className="py-4 pr-4">
                    <p className="capitalize">{goal.status.replaceAll("_", " ")}</p>
                    {goal.approvalSlaLabel ? (
                      <p className="mt-1 text-xs text-muted">{goal.approvalSlaLabel}</p>
                    ) : null}
                  </td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      {goal.canSubmit ? (
                        <form action={submitGoalForApprovalAction}>
                          <input type="hidden" name="goalId" value={goal.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <button
                            type="submit"
                            className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white"
                          >
                            Submit
                          </button>
                        </form>
                      ) : null}

                      {goal.canEdit ? (
                        <Link
                          href={`/goals/${goal.id}/edit${viewQuery}` as Route}
                          className="rounded-full border border-border px-3 py-1.5 text-xs text-stone-700"
                        >
                          Edit
                        </Link>
                      ) : null}

                      {goal.canUpdateProgress ? (
                        <form action={updateGoalProgressAction} className="flex items-center gap-2">
                          <input type="hidden" name="goalId" value={goal.id} />
                          <input
                            name="completionPct"
                            type="number"
                            min="0"
                            max="100"
                            defaultValue={goal.completionPct}
                            className="w-20 rounded-full border border-border bg-white px-3 py-1 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded-full border border-border px-3 py-1.5 text-xs text-stone-700"
                          >
                            Update
                          </button>
                        </form>
                      ) : null}

                      {goal.canArchive ? (
                        <form action={archiveGoalAction}>
                          <input type="hidden" name="goalId" value={goal.id} />
                          <button
                            type="submit"
                            className="rounded-full border border-amber-300 px-3 py-1.5 text-xs text-amber-700"
                          >
                            Archive
                          </button>
                        </form>
                      ) : null}

                      {goal.canAcknowledgeSuggestion ? (
                        <form action={acknowledgeGoalSuggestionAction}>
                          <input type="hidden" name="goalId" value={goal.id} />
                          <button
                            type="submit"
                            className="rounded-full border border-amber-300 px-3 py-1.5 text-xs text-amber-700"
                          >
                            Acknowledge suggestion
                          </button>
                        </form>
                      ) : null}

                      {!goal.canSubmit &&
                      !goal.canEdit &&
                      !goal.canUpdateProgress &&
                      !goal.canArchive &&
                      !goal.canAcknowledgeSuggestion ? (
                        <span className="text-xs text-muted">No actions</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
