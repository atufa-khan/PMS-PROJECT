import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";

const cycles = [
  { id: "cycle-biannual-2026-h1", name: "Bi-Annual Cycle 1", window: "Apr-Sep goals", close: "2026-08-25" },
  { id: "cycle-quarterly-2026-q2", name: "Quarterly Q2", window: "Apr-Jun goals", close: "2026-07-15" }
];

export default async function ReviewsPage() {
  const session = await getAppSession();

  return (
    <AppShell
      role={session.role}
      title="Performance reviews"
      subtitle="Cycle templates, discussion scheduling, eligibility, waivers, and final ratings are planned as a shared workflow surface."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard title="Available cycles">
        <div className="space-y-3">
          {cycles.map((cycle) => (
            <Link
              href={`/reviews/${cycle.id}`}
              key={cycle.id}
              className="block rounded-2xl border border-border bg-stone-50 p-4 transition hover:bg-stone-100"
            >
              <p className="font-medium">{cycle.name}</p>
              <p className="mt-1 text-sm text-muted">
                {cycle.window} • closes {cycle.close}
              </p>
            </Link>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
