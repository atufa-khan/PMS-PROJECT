import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";
import type { ProbationCheckpointRecord } from "@/lib/db/types";
import { listProbationCheckpoints } from "@/lib/workflows/probation-service";

export default async function ProbationPage() {
  const session = await getAppSession();
  const checkpoints = await listProbationCheckpoints(session);

  return (
    <AppShell
      role={session.role}
      title="Probation monitoring"
      subtitle="Day 30, Day 60, and Day 80 checkpoints are modeled as paired employee and manager feedback workflows with working-day due dates."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard
        title="Checkpoint queue"
        description="The first build carries waiting states, blocked manager assignment, and paused leave handling into the operational view."
      >
        <div className="space-y-3">
          {checkpoints.map((checkpoint: ProbationCheckpointRecord) => (
            <div key={checkpoint.id} className="rounded-2xl border border-border bg-stone-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{checkpoint.employeeName}</p>
                  <p className="mt-1 text-sm text-muted">
                    {checkpoint.dayLabel} due on {checkpoint.dueDate}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs">{checkpoint.status}</span>
              </div>
              <p className="mt-3 text-sm text-muted">{checkpoint.waitingOn}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
