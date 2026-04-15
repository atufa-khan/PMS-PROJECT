import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import {
  archiveGoalAction,
  submitGoalForApprovalAction,
  updateGoalProgressAction
} from "@/app/goals/actions";
import { getAppSession } from "@/lib/auth/session";
import { listGoals } from "@/lib/workflows/goal-service";
import { percent } from "@/lib/utils";

export default async function GoalsPage() {
  const session = await getAppSession();
  const goals = await listGoals(session);

  return (
    <AppShell
      role={session.role}
      title="Goal management"
      subtitle="Hierarchy, weightage validation, approval state, and historical preservation are modeled from the implementation plan."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard
        title="Goal register"
        description="This starter view spans company, team, and individual goals using one unified structure."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-3">Goal</th>
                <th className="pb-3">Scope</th>
                <th className="pb-3">Owner</th>
                <th className="pb-3">Weightage</th>
                <th className="pb-3">Completion</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => (
                <tr key={goal.id} className="border-t border-border/70">
                  <td className="py-4 pr-4 font-medium">{goal.title}</td>
                  <td className="py-4 pr-4 capitalize">{goal.scope}</td>
                  <td className="py-4 pr-4">{goal.ownerName}</td>
                  <td className="py-4 pr-4">{goal.weightage}%</td>
                  <td className="py-4 pr-4">{percent(goal.completionPct)}</td>
                  <td className="py-4 pr-4 capitalize">{goal.status.replaceAll("_", " ")}</td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      {goal.canSubmit ? (
                        <form action={submitGoalForApprovalAction}>
                          <input type="hidden" name="goalId" value={goal.id} />
                          <button
                            type="submit"
                            className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white"
                          >
                            Submit
                          </button>
                        </form>
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

                      {!goal.canSubmit && !goal.canUpdateProgress && !goal.canArchive ? (
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
