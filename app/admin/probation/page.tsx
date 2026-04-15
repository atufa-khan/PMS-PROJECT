import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";

export default async function AdminProbationPage() {
  const session = await getAppSession();

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
        <p className="text-sm leading-6 text-muted">
          The next implementation step here is to wire live checkpoint actions, pre-call briefings, and decision history.
        </p>
      </SectionCard>
    </AppShell>
  );
}
