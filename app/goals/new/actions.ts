"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { resolveWorkspaceSession } from "@/lib/auth/workspace-role";
import { withDbTransaction } from "@/lib/db/server";
import {
  type GoalWorkflowRow,
  inferGoalParentId,
  queueCompanyGoalSuggestions,
  recalculateGoalHierarchy,
  summarizeGoalWeightage
} from "@/lib/workflows/goal-helpers";

const createGoalSchema = z.object({
  title: z.string().min(5),
  scope: z.enum(["individual", "team", "company"]),
  dueDate: z.string().min(1),
  weightage: z.coerce.number().min(0).max(100),
  description: z.string().min(10),
  ownerProfileId: z.string().uuid().optional()
});

const updateGoalSchema = createGoalSchema.extend({
  goalId: z.string().uuid()
});

export type GoalActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function allowedScopesForRole(role: string) {
  return role === "admin"
    ? ["individual", "team", "company"]
    : role === "manager"
      ? ["individual", "team"]
      : ["individual"];
}

async function resolveGoalOwner(
  client: import("pg").PoolClient,
  {
    sessionUserId,
    sessionRole,
    requestedOwnerId
  }: {
    sessionUserId: string;
    sessionRole: string;
    requestedOwnerId?: string;
  }
) {
  const ownerId =
    sessionRole === "employee" || !requestedOwnerId ? sessionUserId : requestedOwnerId;

  const ownerResult = await client.query<{
    id: string;
    team_id: string | null;
    is_active: boolean;
    is_direct_report: boolean;
  }>(
    `
      select
        p.id,
        p.team_id,
        p.is_active,
        exists (
          select 1
          from public.employee_records er
          where er.profile_id = p.id
            and er.manager_profile_id = $2
        ) as is_direct_report
      from public.profiles p
      where p.id = $1
      limit 1
    `,
    [ownerId, sessionUserId]
  );

  const owner = ownerResult.rows[0];

  if (!owner || !owner.is_active) {
    throw new Error("Choose a valid active goal owner.");
  }

  if (sessionRole === "manager" && owner.id !== sessionUserId && !owner.is_direct_report) {
    throw new Error("Managers can assign goals only to themselves or their direct reports.");
  }

  return owner;
}

export async function createGoalAction(
  _prevState: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const parsed = createGoalSchema.safeParse({
    title: formData.get("title"),
    scope: formData.get("scope"),
    dueDate: formData.get("dueDate"),
    weightage: formData.get("weightage"),
    description: formData.get("description"),
    ownerProfileId: formData.get("ownerProfileId") || undefined
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the goal details."
    };
  }

  const session = resolveWorkspaceSession(
    await getAppSession(),
    typeof formData.get("workspaceRole") === "string"
      ? String(formData.get("workspaceRole"))
      : undefined
  );

  try {
    await withDbTransaction(async (client) => {
      const allowedScopes = allowedScopesForRole(session.role);
      const owner = await resolveGoalOwner(client, {
        sessionUserId: session.userId,
        sessionRole: session.role,
        requestedOwnerId: parsed.data.ownerProfileId
      });
      const ownerProfileId = owner.id;
      const teamId = owner.team_id ?? null;

      if (!allowedScopes.includes(parsed.data.scope)) {
        throw new Error("Your role cannot create goals with that scope.");
      }

      if (parsed.data.scope === "team" && !teamId) {
        throw new Error("Assign the user to a team before creating a team goal.");
      }

      const cycleResult = await client.query<{ id: string }>(
        `
          select id
          from public.review_cycles
          where $1::date between period_start and period_end
          order by close_date asc
          limit 1
        `,
        [parsed.data.dueDate]
      );

      const goalId = randomUUID();
      const goalStatus = session.role === "employee" ? "draft" : "active";
      const parentGoalId = await inferGoalParentId(client, {
        scope: parsed.data.scope,
        cycleId: cycleResult.rows[0]?.id ?? null,
        teamId
      });

      if (session.role !== "employee") {
        const summary = await summarizeGoalWeightage(
          client,
          {
            scope: parsed.data.scope,
            cycle_id: cycleResult.rows[0]?.id ?? null,
            owner_profile_id: ownerProfileId,
            team_id: parsed.data.scope === "company" ? null : teamId
          },
          {
            candidateWeightage: parsed.data.weightage
          }
        );

        if (summary.assignedTotal > 100) {
          throw new Error(
            `${summary.contextLabel} would exceed 100%. Current projected total: ${summary.assignedTotal}%.`
          );
        }
      }

      await client.query(
        `
          insert into public.goals (
            id,
            parent_goal_id,
            owner_profile_id,
            team_id,
            cycle_id,
            scope,
            status,
            title,
            description,
            success_metric,
            weightage,
            completion_pct,
            created_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12)
        `,
        [
          goalId,
          parentGoalId,
          ownerProfileId,
          parsed.data.scope === "company" ? null : teamId,
          cycleResult.rows[0]?.id ?? null,
          parsed.data.scope,
          goalStatus,
          parsed.data.title,
          parsed.data.description,
          `Due by ${parsed.data.dueDate}`,
          parsed.data.weightage,
          session.userId
        ]
      );

      await client.query(
        `
          insert into public.goal_approval_events (id, goal_id, actor_profile_id, event_type, reason, metadata)
          values ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          randomUUID(),
          goalId,
          session.userId,
          session.role === "employee" ? "draft_created" : "create_active",
          session.role === "employee" ? "Draft created by employee" : "Goal created by manager/admin",
          JSON.stringify({
            dueDate: parsed.data.dueDate,
            weightage: parsed.data.weightage,
            parentGoalId
          })
        ]
      );

      await client.query(
        `
          insert into public.audit_logs (id, actor_profile_id, entity_type, entity_id, action, metadata)
          values ($1, $2, 'goal', $3, $4, $5::jsonb)
        `,
        [
          randomUUID(),
          session.userId,
          goalId,
          "goal_created",
          JSON.stringify({
            scope: parsed.data.scope,
            status: goalStatus,
            dueDate: parsed.data.dueDate,
            parentGoalId,
            ownerProfileId
          })
        ]
      );

      if (goalStatus === "active") {
        await recalculateGoalHierarchy(client, goalId);
      }
    });
  } catch (error) {
    console.error("createGoalAction failed:", error);

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to create the goal."
    };
  }

  revalidatePath("/goals");
  revalidatePath("/goals/approvals");
  revalidatePath("/dashboard");

  return {
    status: "success",
    message:
      session.role === "employee"
        ? "Goal draft created. Submit it for approval from the goals workspace."
        : "Goal created successfully."
  };
}

export async function updateGoalAction(
  _prevState: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const parsed = updateGoalSchema.safeParse({
    goalId: formData.get("goalId"),
    title: formData.get("title"),
    scope: formData.get("scope"),
    dueDate: formData.get("dueDate"),
    weightage: formData.get("weightage"),
    description: formData.get("description"),
    ownerProfileId: formData.get("ownerProfileId") || undefined
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the goal details."
    };
  }

  const session = resolveWorkspaceSession(
    await getAppSession(),
    typeof formData.get("workspaceRole") === "string"
      ? String(formData.get("workspaceRole"))
      : undefined
  );

  try {
    await withDbTransaction(async (client) => {
      const goalResult = await client.query<
        GoalWorkflowRow & {
          description: string | null;
          success_metric: string | null;
          is_current_manager: boolean;
        }
      >(
        `
          select
            g.id,
            g.parent_goal_id,
            g.owner_profile_id,
            g.team_id,
            g.cycle_id,
            g.scope,
            g.status,
            g.title,
            g.description,
            g.success_metric,
            g.weightage,
            g.completion_pct,
            g.created_by,
            exists (
              select 1
              from public.employee_records er
              where er.profile_id = g.owner_profile_id
                and er.manager_profile_id = $2
            ) as is_current_manager
          from public.goals g
          where g.id = $1
          limit 1
        `,
        [parsed.data.goalId, session.userId]
      );

      const goal = goalResult.rows[0];

      if (!goal) {
        throw new Error("Goal not found.");
      }

      const isOwner = goal.owner_profile_id === session.userId;
      const isCurrentManager = Boolean(goal.is_current_manager);
      const canEdit =
        session.role === "admin"
          ? goal.status !== "archived"
          : session.role === "manager"
            ? goal.scope !== "company" &&
              goal.status !== "archived" &&
              ((goal.status === "draft" || goal.status === "pending_approval")
                ? isOwner || isCurrentManager
                : goal.scope === "team")
            : isOwner && (goal.status === "draft" || goal.status === "pending_approval");

      if (!canEdit) {
        throw new Error("You cannot edit this goal.");
      }

      const allowedScopes = allowedScopesForRole(session.role);

      if (!allowedScopes.includes(parsed.data.scope)) {
        throw new Error("Your role cannot save goals with that scope.");
      }

      const owner = await resolveGoalOwner(client, {
        sessionUserId: session.userId,
        sessionRole: session.role,
        requestedOwnerId: parsed.data.ownerProfileId ?? goal.owner_profile_id ?? undefined
      });
      const ownerProfileId = owner.id;

      const nextTeamId =
        parsed.data.scope === "company"
          ? null
          : owner.team_id ?? goal.team_id ?? null;

      if (parsed.data.scope === "team" && !nextTeamId) {
        throw new Error("Assign the goal owner to a team before saving a team goal.");
      }

      const weightageSummary = await summarizeGoalWeightage(
        client,
        {
          scope: parsed.data.scope,
          cycle_id: goal.cycle_id,
          owner_profile_id: ownerProfileId,
          team_id: nextTeamId
        },
        {
          excludeGoalId: goal.id,
          candidateWeightage: parsed.data.weightage
        }
      );

      if (weightageSummary.assignedTotal > 100) {
        throw new Error(
          `${weightageSummary.contextLabel} would exceed 100%. Current projected total: ${weightageSummary.assignedTotal}%.`
        );
      }

      const parentGoalId = await inferGoalParentId(client, {
        scope: parsed.data.scope,
        cycleId: goal.cycle_id,
        teamId: nextTeamId
      });

      const nextSuccessMetric = `Due by ${parsed.data.dueDate}`;
      const materialCompanyUpdate =
        goal.scope === "company" &&
        (goal.status === "active" || goal.status === "completed") &&
        (goal.title !== parsed.data.title ||
          (goal.description ?? "") !== parsed.data.description ||
          (goal.success_metric ?? "") !== nextSuccessMetric);

      await client.query(
        `
          update public.goals
          set parent_goal_id = $2,
              team_id = $3,
              owner_profile_id = $4,
              scope = $5,
              title = $6,
              description = $7,
              success_metric = $8,
              weightage = $9,
              updated_at = timezone('utc', now())
          where id = $1
        `,
        [
          goal.id,
          parentGoalId,
          nextTeamId,
          ownerProfileId,
          parsed.data.scope,
          parsed.data.title,
          parsed.data.description,
          nextSuccessMetric,
          parsed.data.weightage
        ]
      );

      await client.query(
        `
          insert into public.goal_approval_events (id, goal_id, actor_profile_id, event_type, reason, metadata)
          values ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          randomUUID(),
          goal.id,
          session.userId,
          goal.status === "draft" ? "draft_updated" : "goal_updated",
          goal.status === "draft"
            ? "Goal draft updated"
            : "Goal updated after activation",
          JSON.stringify({
            scope: parsed.data.scope,
            weightage: parsed.data.weightage,
            dueDate: parsed.data.dueDate,
            ownerProfileId
          })
        ]
      );

      await client.query(
        `
          insert into public.audit_logs (id, actor_profile_id, entity_type, entity_id, action, metadata)
          values ($1, $2, 'goal', $3, 'goal_updated', $4::jsonb)
        `,
        [
          randomUUID(),
          session.userId,
          goal.id,
          JSON.stringify({
            scope: parsed.data.scope,
            status: goal.status,
            dueDate: parsed.data.dueDate,
            ownerProfileId
          })
        ]
      );

      if (materialCompanyUpdate) {
        await queueCompanyGoalSuggestions(client, {
          sourceGoalId: goal.id,
          sourceGoalTitle: parsed.data.title,
          actorProfileId: session.userId
        });
      }

      await recalculateGoalHierarchy(client, goal.id);
    });
  } catch (error) {
    console.error("updateGoalAction failed:", error);

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to update the goal."
    };
  }

  revalidatePath("/goals");
  revalidatePath("/goals/approvals");
  revalidatePath("/dashboard");
  revalidatePath(`/goals/${parsed.data.goalId}/edit`);

  return {
    status: "success",
    message:
      session.role === "employee"
        ? "Draft updated. Resubmit it once the portfolio is balanced."
        : "Goal updated successfully."
  };
}
