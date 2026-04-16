import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { submitProbationFeedbackAction } from "@/app/probation/actions";
import { getAppSession } from "@/lib/auth/session";
import {
  buildWorkspaceToggleOptions,
  resolveWorkspaceSession
} from "@/lib/auth/workspace-role";
import type { ProbationCheckpointRecord } from "@/lib/db/types";
import { listProbationCheckpoints } from "@/lib/workflows/probation-service";

export default async function ProbationPage({
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
  const checkpoints = await listProbationCheckpoints(workspaceSession);
  const workspaceToggle = buildWorkspaceToggleOptions(
    session,
    workspaceSession.role,
    "/probation",
    resolvedSearchParams
  );

  return (
    <AppShell
      role={workspaceSession.role}
      title="Probation monitoring"
      subtitle="Day 30, Day 60, and Day 80 checkpoints are modeled as paired employee and manager feedback workflows with working-day due dates."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
      workspaceToggle={workspaceToggle}
    >
      <SectionCard
        title="Checkpoint queue"
        description="The first build carries waiting states, blocked manager assignment, and paused leave handling into the operational view."
      >
        <div className="space-y-3">
          {checkpoints.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
              No probation checkpoints are visible for your account right now.
            </div>
          ) : null}

          {checkpoints.map((checkpoint: ProbationCheckpointRecord) => (
            <div key={checkpoint.id} className="rounded-2xl border border-border bg-stone-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{checkpoint.employeeName}</p>
                  <p className="mt-1 text-sm text-muted">
                    {checkpoint.dayLabel} due on {checkpoint.dueDate}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.15em] text-muted">
                    Employee submitted: {checkpoint.employeeSubmitted ? "Yes" : "No"} | Manager submitted:{" "}
                    {checkpoint.managerSubmitted ? "Yes" : "No"}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs">{checkpoint.status}</span>
              </div>
              <p className="mt-3 text-sm text-muted">{checkpoint.waitingOn}</p>

              {checkpoint.canSubmitFeedback && checkpoint.myPendingRequestId ? (
                <form action={submitProbationFeedbackAction} className="mt-4 space-y-3">
                  <input type="hidden" name="requestId" value={checkpoint.myPendingRequestId} />
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm">
                      <span className="mb-1 block text-muted">Score</span>
                      <input
                        name="score"
                        type="number"
                        min="1"
                        max="5"
                        step="0.5"
                        defaultValue="3"
                        className="w-full rounded-xl border border-border bg-white px-3 py-2"
                        required
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-muted">Sentiment</span>
                      <select
                        name="sentimentLabel"
                        defaultValue="neutral"
                        className="w-full rounded-xl border border-border bg-white px-3 py-2"
                      >
                        <option value="positive">Positive</option>
                        <option value="neutral">Neutral</option>
                        <option value="negative">Negative</option>
                      </select>
                    </label>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white"
                      >
                        Submit {checkpoint.pendingRole} feedback
                      </button>
                    </div>
                  </div>
                  <textarea
                    name="summary"
                    className="min-h-24 w-full rounded-xl border border-border bg-white px-3 py-2"
                    placeholder="Summarize performance, blockers, and support needed"
                    required
                  />
                  <textarea
                    name="followUp"
                    className="min-h-20 w-full rounded-xl border border-border bg-white px-3 py-2"
                    placeholder="What follow-up actions should happen next?"
                    required
                  />
                </form>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
