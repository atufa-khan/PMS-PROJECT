import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { GoalForm } from "@/app/goals/new/goal-form";
import { updateGoalAction } from "@/app/goals/new/actions";
import { getAppSession } from "@/lib/auth/session";
import {
  buildWorkspaceToggleOptions,
  resolveWorkspaceSession
} from "@/lib/auth/workspace-role";
import type { GoalScope } from "@/lib/db/types";
import { getGoalForEditing } from "@/lib/workflows/goal-service";

export default async function EditGoalPage({
  params,
  searchParams
}: {
  params: Promise<{ goalId: string }>;
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
  const { goalId } = await params;
  const goalEditor = await getGoalForEditing(workspaceSession, goalId);

  if (!goalEditor) {
    notFound();
  }

  const allowedScopes: GoalScope[] =
    workspaceSession.role === "admin"
      ? ["individual", "team", "company"]
      : workspaceSession.role === "manager"
        ? ["individual", "team"]
        : ["individual"];
  const workspaceToggle = buildWorkspaceToggleOptions(
    session,
    workspaceSession.role,
    `/goals/${goalId}/edit`,
    resolvedSearchParams
  );

  return (
    <AppShell
      role={workspaceSession.role}
      title="Edit goal"
      subtitle="Draft refinement, resubmission prep, and mid-cycle goal maintenance all run through this edit workspace."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
      workspaceToggle={workspaceToggle}
    >
      <SectionCard
        title={goalEditor.goal.title}
        description={
          goalEditor.goal.status === "draft"
            ? "Update the draft, then resubmit it from the goals workspace when the portfolio is balanced."
            : "Active goal changes are saved immediately and company-goal edits will notify downstream owners."
        }
      >
        <GoalForm
          action={updateGoalAction}
          initialValues={{
            id: goalEditor.goal.id,
            title: goalEditor.goal.title,
            scope: goalEditor.goal.scope,
            dueDate: goalEditor.goal.dueDate,
            weightage: goalEditor.goal.weightage,
            description: goalEditor.goal.description,
            ownerProfileId: goalEditor.goal.ownerId ?? undefined
          }}
          submitLabel="Save goal changes"
          pendingLabel="Saving goal..."
          allowedScopes={allowedScopes}
          workspaceRole={workspaceSession.role}
          assignableOwners={
            workspaceSession.role === "employee" ? [] : goalEditor.assignableOwners
          }
          weightageContexts={goalEditor.weightageContexts}
        />
      </SectionCard>
    </AppShell>
  );
}
