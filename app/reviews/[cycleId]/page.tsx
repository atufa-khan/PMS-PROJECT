import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import {
  completeReviewDiscussionAction,
  finalizeReviewAction,
  reassignActingReviewerAction,
  scheduleReviewDiscussionAction,
  submitManagerReviewAction,
  submitSelfReviewAction,
  waiveReviewAction
} from "@/app/reviews/actions";
import { getAppSession } from "@/lib/auth/session";
import {
  buildWorkspaceToggleOptions,
  resolveWorkspaceSession
} from "@/lib/auth/workspace-role";
import { listAssignableManagers } from "@/lib/workflows/probation-service";
import { getReviewCycleDetail } from "@/lib/workflows/review-service";

export default async function ReviewCycleDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ cycleId: string }>;
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
  const { cycleId } = await params;
  const { cycle, enrollments } = await getReviewCycleDetail(workspaceSession, cycleId);
  const assignableManagers =
    workspaceSession.role === "admin" ? await listAssignableManagers() : [];
  const workspaceToggle = buildWorkspaceToggleOptions(
    session,
    workspaceSession.role,
    `/reviews/${cycleId}`,
    resolvedSearchParams
  );

  return (
    <AppShell
      role={workspaceSession.role}
      title={cycle?.name ?? "Cycle detail"}
      subtitle="Self review, manager review, discussion scheduling, waivers, and finalization now run through one live cycle workspace."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
      workspaceToggle={workspaceToggle}
    >
      <SectionCard
        title={cycle?.windowLabel ?? cycleId}
        description={cycle ? `${cycle.cycleType} cycle | closes ${cycle.closeDate}` : "Cycle not found"}
      >
        {workspaceSession.role === "admin" ? (
          <datalist id="reviewer-directory">
            {assignableManagers.map((manager) => (
              <option key={manager.email} value={manager.email}>
                {manager.full_name}
              </option>
            ))}
          </datalist>
        ) : null}

        <div className="space-y-4">
          {enrollments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
              No enrollments are visible for this cycle.
            </div>
          ) : null}

          {enrollments.map((enrollment) => (
            <div key={enrollment.id} className="rounded-2xl border border-border bg-stone-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{enrollment.employeeName}</p>
                  <p className="mt-1 text-sm text-muted">
                    Reviewer: {enrollment.reviewerName} | Review status: {enrollment.reviewStatus}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Discussion: {enrollment.discussionStatus} | {enrollment.discussionDate}
                  </p>
                  <p className="mt-2 text-sm text-muted">{enrollment.eligibilityNote}</p>
                  <p className="mt-2 text-xs text-muted">{enrollment.crossShareStatus}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-sm font-medium">Self review</p>
                  <p className="mt-2 text-sm text-muted">Rating: {enrollment.selfRating}</p>
                  <p className="mt-2 text-sm text-muted">{enrollment.goalRequirementNote}</p>
                  {enrollment.visibleSelfSummary ? (
                    <p className="mt-2 text-sm leading-6 text-muted">{enrollment.visibleSelfSummary}</p>
                  ) : enrollment.selfSummary ? (
                    <p className="mt-2 text-xs text-muted">
                      The self-review narrative unlocks for others after both sides submit.
                    </p>
                  ) : null}

                  {enrollment.canSubmitSelf ? (
                    <form action={submitSelfReviewAction} className="mt-4 space-y-3">
                      <input type="hidden" name="enrollmentId" value={enrollment.id} />
                      <select
                        name="overallRating"
                        defaultValue="On Track"
                        className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                      >
                        <option value="Outstanding">Outstanding</option>
                        <option value="Strong">Strong</option>
                        <option value="On Track">On Track</option>
                        <option value="Needs Support">Needs Support</option>
                      </select>
                      <textarea
                        name="summary"
                        className="min-h-24 w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                        placeholder="Summarize achievements, blockers, and development goals"
                        required
                      />
                      <button type="submit" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
                        Submit self review
                      </button>
                    </form>
                  ) : enrollment.goalCount === 0 ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Self-rating is blocked because no approved goals exist for this cycle yet.
                      Contact your manager to align goals first.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="text-sm font-medium">Manager review</p>
                  <p className="mt-2 text-sm text-muted">Rating: {enrollment.managerRating}</p>
                  {enrollment.visibleManagerSummary ? (
                    <p className="mt-2 text-sm leading-6 text-muted">{enrollment.visibleManagerSummary}</p>
                  ) : enrollment.managerSummary ? (
                    <p className="mt-2 text-xs text-muted">
                      The manager narrative unlocks for the employee after both sides submit.
                    </p>
                  ) : null}

                  {enrollment.canSubmitManager ? (
                    <form action={submitManagerReviewAction} className="mt-4 space-y-3">
                      <input type="hidden" name="enrollmentId" value={enrollment.id} />
                      <select
                        name="overallRating"
                        defaultValue="On Track"
                        className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                      >
                        <option value="Outstanding">Outstanding</option>
                        <option value="Strong">Strong</option>
                        <option value="On Track">On Track</option>
                        <option value="Needs Support">Needs Support</option>
                      </select>
                      <textarea
                        name="summary"
                        className="min-h-24 w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                        placeholder="Summarize observed performance, feedback, and next expectations"
                        required
                      />
                      <button type="submit" className="rounded-full border border-border px-4 py-2 text-sm text-stone-700">
                        Submit manager review
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              {(enrollment.canScheduleDiscussion ||
                enrollment.canCompleteDiscussion ||
                enrollment.canFinalize ||
                enrollment.canWaive ||
                enrollment.canReassignReviewer) ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  {enrollment.canScheduleDiscussion ? (
                    <form action={scheduleReviewDiscussionAction} className="space-y-2 rounded-2xl border border-border bg-white p-4">
                      <input type="hidden" name="enrollmentId" value={enrollment.id} />
                      <p className="text-sm font-medium">Schedule discussion</p>
                      <input
                        name="discussionAt"
                        type="datetime-local"
                        className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                        required
                      />
                      <button type="submit" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
                        Schedule
                      </button>
                    </form>
                  ) : null}

                  {enrollment.canCompleteDiscussion ? (
                    <form action={completeReviewDiscussionAction} className="rounded-2xl border border-border bg-white p-4">
                      <input type="hidden" name="enrollmentId" value={enrollment.id} />
                      <p className="text-sm font-medium">Close scheduled discussion</p>
                      <button type="submit" className="mt-3 rounded-full border border-border px-4 py-2 text-sm text-stone-700">
                        Mark discussion completed
                      </button>
                    </form>
                  ) : null}

                  {enrollment.canFinalize ? (
                    <form action={finalizeReviewAction} className="rounded-2xl border border-border bg-white p-4">
                      <input type="hidden" name="enrollmentId" value={enrollment.id} />
                      <p className="text-sm font-medium">Finalize review</p>
                      <button type="submit" className="mt-3 rounded-full border border-emerald-300 px-4 py-2 text-sm text-emerald-700">
                        Finalize
                      </button>
                    </form>
                  ) : null}

                  {enrollment.canWaive ? (
                    <form action={waiveReviewAction} className="space-y-2 rounded-2xl border border-border bg-white p-4 xl:col-span-2">
                      <input type="hidden" name="enrollmentId" value={enrollment.id} />
                      <p className="text-sm font-medium">Waive cycle entry</p>
                      <input
                        name="reason"
                        className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                        placeholder="Reason for waiver"
                        required
                      />
                      <button type="submit" className="rounded-full border border-amber-300 px-4 py-2 text-sm text-amber-700">
                        Save waiver
                      </button>
                    </form>
                  ) : null}

                  {enrollment.canReassignReviewer ? (
                    <form action={reassignActingReviewerAction} className="space-y-2 rounded-2xl border border-border bg-white p-4 xl:col-span-2">
                      <input type="hidden" name="enrollmentId" value={enrollment.id} />
                      <p className="text-sm font-medium">Assign acting reviewer</p>
                      <input
                        name="reviewerEmail"
                        list="reviewer-directory"
                        className="w-full rounded-xl border border-border bg-stone-50 px-3 py-2 text-sm"
                        defaultValue={enrollment.reviewerEmail ?? ""}
                        placeholder="reviewer@company.com"
                        required
                      />
                      <button type="submit" className="rounded-full border border-border px-4 py-2 text-sm text-stone-700">
                        Save reviewer
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
