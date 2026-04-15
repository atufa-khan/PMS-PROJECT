import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";
import { GoalForm } from "@/app/goals/new/goal-form";

export default async function NewGoalPage() {
  const session = await getAppSession();

  return (
    <AppShell
      role={session.role}
      title="Create goal"
      subtitle="Employees can draft and submit goals; managers and Admin can create and assign active goals with balanced weightage."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <SectionCard
        title="Draft goal form"
        description="This form now validates and can persist to Supabase when your environment is connected."
      >
        <GoalForm />
      </SectionCard>
    </AppShell>
  );
}
