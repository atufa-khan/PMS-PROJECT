import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";

export default async function AdminCyclesPage() {
  const session = await getAppSession();

  return (
    <AppShell
      role={session.role}
      title="Admin cycle control"
      subtitle="This page is reserved for cycle activation, extension, waiver, acting reviewer assignment, and compliance monitoring."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard title="Cycle control center">
        <p className="text-sm leading-6 text-muted">
          The foundation sets up the route and app shell so the cycle orchestration workflow can be layered in without
          restructuring navigation later.
        </p>
      </SectionCard>
    </AppShell>
  );
}
