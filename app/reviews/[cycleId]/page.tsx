import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";

export default async function ReviewCycleDetailPage({
  params
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const session = await getAppSession();
  const { cycleId } = await params;

  return (
    <AppShell
      role={session.role}
      title="Cycle detail"
      subtitle="This route is reserved for the self-review form, manager rating flow, discussion scheduling, and Admin compliance decisions."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard title={cycleId}>
        <p className="text-sm leading-6 text-muted">
          The route exists and is ready for data wiring. Next steps here are enrollment reads, goal snapshots, rating forms,
          and decision actions for extend, waive, or escalate.
        </p>
      </SectionCard>
    </AppShell>
  );
}
