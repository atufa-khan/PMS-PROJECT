import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import {
  escalateFlagAction,
  resolveFlagAction,
  startFlagReviewAction
} from "@/app/flags/actions";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { listFlags } from "@/lib/workflows/flag-service";

export default async function FlagsPage() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);
  const flags = await listFlags();

  return (
    <AppShell
      role={session.role}
      title="Flags and HR review"
      subtitle="Threshold-based alerts, repeat patterns, and aging indicators are represented here as the single review queue for Admin."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard title="Weekly review queue">
        <div className="space-y-3">
          {flags.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
              No workflow flags are open right now.
            </div>
          ) : null}

          {flags.map((flag) => (
            <div key={flag.id} className="rounded-2xl border border-border bg-stone-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{flag.employeeName}</p>
                  <p className="mt-1 text-sm text-muted">{flag.reason}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs">Age {flag.ageLabel}</span>
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.15em] text-muted">
                {flag.severity} severity | {flag.status.replaceAll("_", " ")} | repeat flag: {flag.isRepeatFlag ? "yes" : "no"}
              </p>
              {flag.workflowLabel ? (
                <p className="mt-2 text-xs text-muted">{flag.workflowLabel}</p>
              ) : null}
              {flag.currentContext ? (
                <div className="mt-3 rounded-2xl border border-border bg-white p-3 text-sm text-muted">
                  <p className="font-medium text-stone-800">Current context</p>
                  <p className="mt-1">{flag.currentContext}</p>
                </div>
              ) : null}
              {flag.previousContext ? (
                <div className="mt-3 rounded-2xl border border-border bg-white p-3 text-sm text-muted">
                  <p className="font-medium text-stone-800">Previous cycle context</p>
                  <p className="mt-1">{flag.previousContext}</p>
                </div>
              ) : null}
              {flag.repeatContext ? (
                <p className="mt-2 text-xs text-amber-700">{flag.repeatContext}</p>
              ) : null}
              <p className="mt-3 text-sm text-muted">{flag.latestActionNote}</p>

              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                {flag.canReview ? (
                  <form action={startFlagReviewAction}>
                    <input type="hidden" name="flagId" value={flag.id} />
                    <button type="submit" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
                      Start review
                    </button>
                  </form>
                ) : null}

                {flag.canResolve ? (
                  <form action={resolveFlagAction} className="flex flex-1 gap-2">
                    <input type="hidden" name="flagId" value={flag.id} />
                    <input
                      name="note"
                      className="min-w-0 flex-1 rounded-full border border-border bg-white px-4 py-2 text-sm"
                      placeholder="Resolution note"
                      required
                    />
                    <button type="submit" className="rounded-full border border-emerald-300 px-4 py-2 text-sm text-emerald-700">
                      Resolve
                    </button>
                  </form>
                ) : null}

                {flag.canEscalate ? (
                  <form action={escalateFlagAction} className="flex flex-1 gap-2">
                    <input type="hidden" name="flagId" value={flag.id} />
                    <input
                      name="note"
                      className="min-w-0 flex-1 rounded-full border border-border bg-white px-4 py-2 text-sm"
                      placeholder="Escalation note"
                      required
                    />
                    <button type="submit" className="rounded-full border border-amber-300 px-4 py-2 text-sm text-amber-700">
                      Escalate
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
