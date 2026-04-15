import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { SettingsForm } from "@/app/admin/settings/settings-form";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { getAdminSettings } from "@/lib/workflows/settings-service";

export default async function AdminSettingsPage() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);
  const settings = await getAdminSettings();

  return (
    <AppShell
      role={session.role}
      title="Admin settings"
      subtitle="Red-flag thresholds, escalation ownership, and onboarding checklist items are modeled as centralized settings."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard title="System controls">
        <SettingsForm
          redFlagThreshold={settings.redFlagThreshold}
          secondaryAdminName={settings.secondaryAdminName}
        />
      </SectionCard>
    </AppShell>
  );
}
