import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";

const flags = [
  {
    id: "flag-1",
    title: "Repeat flag: low probation sentiment",
    detail: "Employee flagged in two consecutive checkpoints with score <= 2 and negative comments.",
    age: "6 days"
  },
  {
    id: "flag-2",
    title: "Incomplete open-ended response",
    detail: "Manager submitted a numeric score but left the key context field blank.",
    age: "2 days"
  }
];

export default async function FlagsPage() {
  const session = await getAppSession();

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
          {flags.map((flag) => (
            <div key={flag.id} className="rounded-2xl border border-border bg-stone-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{flag.title}</p>
                <span className="rounded-full bg-white px-3 py-1 text-xs">Age {flag.age}</span>
              </div>
              <p className="mt-2 text-sm text-muted">{flag.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
