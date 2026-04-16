import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { getAppSession } from "@/lib/auth/session";
import {
  buildWorkspaceToggleOptions,
  resolveWorkspaceSession
} from "@/lib/auth/workspace-role";
import { GoalForm } from "@/app/goals/new/goal-form";
import type { GoalScope } from "@/lib/db/types";
import {
  listAssignableGoalOwners,
  listGoalWeightageContexts
} from "@/lib/workflows/goal-service";

export default async function NewGoalPage({
  searchParams
}: {
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
  const weightageContexts = await listGoalWeightageContexts(workspaceSession);
  const assignableOwners =
    workspaceSession.role === "employee"
      ? []
      : await listAssignableGoalOwners(workspaceSession);
  const allowedScopes: GoalScope[] =
    workspaceSession.role === "admin"
      ? ["individual", "team", "company"]
      : workspaceSession.role === "manager"
        ? ["individual", "team"]
        : ["individual"];
  const workspaceToggle = buildWorkspaceToggleOptions(
    session,
    workspaceSession.role,
    "/goals/new",
    resolvedSearchParams
  );

  return (
    <AppShell
      role={workspaceSession.role}
      title="Create goal"
      subtitle="Employees can draft and submit goals; managers and Admin can create and assign active goals with balanced weightage."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
      workspaceToggle={workspaceToggle}
    >
      <SectionCard
        title="Draft goal form"
        description="Employees can draft freely, but submission and approval are blocked until the selected goal portfolio balances to 100%."
      >
        <GoalForm
          weightageContexts={weightageContexts}
          allowedScopes={allowedScopes}
          assignableOwners={assignableOwners}
          workspaceRole={workspaceSession.role}
        />
      </SectionCard>
    </AppShell>
  );
}
