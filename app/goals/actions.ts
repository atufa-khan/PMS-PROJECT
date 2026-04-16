"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";
import {
  ensureGoalWeightageBalanced,
  inferGoalParentId,
  normalizeGoalStatus,
  queueGoalDecisionNotification,
  queueGoalSubmissionNotifications,
  recalculateGoalHierarchy,
  type GoalWorkflowRow
} from "@/lib/workflows/goal-helpers";
import { recordAudit } from "@/lib/workflows/workflow-helpers";

const goalIdSchema = z.object({
  goalId: z.string().uuid()
});

const submitGoalSchema = goalIdSchema.extend({
  returnTo: z.string().optional()
});

const progressSchema = z.object({
  goalId: z.string().uuid(),
  completionPct: z.coerce.number().min(0).max(100)
});

const approveSchema = z.object({
  goalId: z.string().uuid(),
  weightage: z.coerce.number().min(0).max(100)
});

const rejectSchema = z.object({
  goalId: z.string().uuid(),
  reason: z.string().min(3).max(300)
});

async function loadGoalForActor(goalId: string) {
  const session = await getAppSession();

  const result = await withDbTransaction(async (client) => {
    const goalResult = await client.query<GoalWorkflowRow>(
      `
        select
          id,
          parent_goal_id,
          owner_profile_id,
          team_id,
          cycle_id,
          scope,
          status,
          title,
          weightage,
          completion_pct,
          created_by
        from public.goals
        where id = $1
        limit 1
      `,
      [goalId]
    );

    return {
      session,
      goal: goalResult.rows[0] ?? null
    };
  });

  return result;
}

function buildGoalRedirectTarget(
  returnTo: string | undefined,
  fallbackPath: string,
  status: "success" | "error",
  message: string
) {
  const safeBase =
    typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : fallbackPath;
  const url = new URL(safeBase, "http://localhost");
  url.searchParams.set("goalStatus", status);
  url.searchParams.set("goalMessage", message);
  return `${url.pathname}${url.search}`;
}

function canManagerAct(sessionUserId: string, ownerProfileId: string | null) {
  return async (client: import("pg").PoolClient) => {
    if (!ownerProfileId) {
      return false;
    }

    const result = await client.query<{ allowed: boolean }>(
      `
        select exists (
          select 1
          from public.employee_records
          where profile_id = $1
            and manager_profile_id = $2
        ) as allowed
      `,
      [ownerProfileId, sessionUserId]
    );

    return Boolean(result.rows[0]?.allowed);
  };
}

export async function submitGoalForApprovalAction(formData: FormData) {
  const parsed = submitGoalSchema.safeParse({
    goalId: formData.get("goalId"),
    returnTo: formData.get("returnTo") || undefined
  });

  if (!parsed.success) {
    redirect(
      buildGoalRedirectTarget(
        typeof formData.get("returnTo") === "string"
          ? String(formData.get("returnTo"))
          : undefined,
        "/goals",
        "error",
        "We could not submit that goal. Please refresh and try again."
      ) as Route
    );
  }

  const { session, goal } = await loadGoalForActor(parsed.data.goalId);

  if (!goal || goal.owner_profile_id !== session.userId || goal.status !== "draft") {
    redirect(
      buildGoalRedirectTarget(
        parsed.data.returnTo,
        "/goals",
        "error",
        "Only your own draft goals can be submitted for approval."
      ) as Route
    );
  }

  try {
    await withDbTransaction(async (client) => {
      const currentGoalResult = await client.query<{
        id: string;
        owner_profile_id: string | null;
        status: GoalWorkflowRow["status"];
      }>(
        `
          select id, owner_profile_id, status
          from public.goals
          where id = $1
          limit 1
        `,
        [goal.id]
      );

      const currentGoal = currentGoalResult.rows[0];

      if (
        !currentGoal ||
        currentGoal.owner_profile_id !== session.userId ||
        currentGoal.status !== "draft"
      ) {
        throw new Error("This goal is no longer a draft you can submit.");
      }

      const priorSubmitResult = await client.query<{ has_prior_submit: boolean }>(
        `
          select exists (
            select 1
            from public.goal_approval_events
            where goal_id = $1
              and event_type in ('submit', 'resubmit', 'reject')
          ) as has_prior_submit
        `,
        [goal.id]
      );

      const submissionEventType = priorSubmitResult.rows[0]?.has_prior_submit
        ? "resubmit"
        : "submit";

      await client.query(
        `
          update public.goals
          set status = 'pending_approval',
              updated_at = timezone('utc', now())
          where id = $1
        `,
        [goal.id]
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
          submissionEventType,
          submissionEventType === "resubmit"
            ? "Goal resubmitted for approval"
            : "Goal submitted for approval",
          JSON.stringify({ submitted_from: "goals_page" })
        ]
      );

      await queueGoalSubmissionNotifications(client, goal);

      await recordAudit(client, session.userId, "goal", goal.id, "goal_submitted", {
        title: goal.title
      });
    });
  } catch (error) {
    redirect(
      buildGoalRedirectTarget(
        parsed.data.returnTo,
        "/goals",
        "error",
        error instanceof Error ? error.message : "Unable to submit the goal for approval."
      ) as Route
    );
  }

  revalidatePath("/goals");
  revalidatePath("/goals/approvals");
  revalidatePath("/dashboard");

  redirect(
    buildGoalRedirectTarget(
      parsed.data.returnTo,
      "/goals",
      "success",
      "Goal submitted for approval. Your manager can review it now."
    ) as Route
  );
}

export async function acknowledgeGoalSuggestionAction(formData: FormData) {
  const parsed = goalIdSchema.parse({
    goalId: formData.get("goalId")
  });

  const { session, goal } = await loadGoalForActor(parsed.goalId);

  if (!goal || goal.owner_profile_id !== session.userId) {
    return;
  }

  await withDbTransaction(async (client) => {
    const latestSuggestion = await client.query<{
      latest_suggestion_at: string | null;
      latest_ack_at: string | null;
    }>(
      `
        select
          (
            select created_at::text
            from public.goal_approval_events
            where goal_id = $1
              and event_type = 'company_goal_suggested'
            order by created_at desc
            limit 1
          ) as latest_suggestion_at,
          (
            select created_at::text
            from public.goal_approval_events
            where goal_id = $1
              and event_type = 'company_goal_acknowledged'
            order by created_at desc
            limit 1
          ) as latest_ack_at
      `,
      [goal.id]
    );

    const suggestionAt = latestSuggestion.rows[0]?.latest_suggestion_at;
    const ackAt = latestSuggestion.rows[0]?.latest_ack_at;

    if (
      !suggestionAt ||
      (ackAt && new Date(ackAt).getTime() >= new Date(suggestionAt).getTime())
    ) {
      return;
    }

    await client.query(
      `
        insert into public.goal_approval_events (id, goal_id, actor_profile_id, event_type, reason, metadata)
        values ($1, $2, $3, 'company_goal_acknowledged', 'Company goal change acknowledged', $4::jsonb)
      `,
      [
        randomUUID(),
        goal.id,
        session.userId,
        JSON.stringify({ acknowledgedAt: new Date().toISOString() })
      ]
    );

    await recordAudit(client, session.userId, "goal", goal.id, "company_goal_acknowledged", {
      title: goal.title
    });
  });

  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function updateGoalProgressAction(formData: FormData) {
  const parsed = progressSchema.parse({
    goalId: formData.get("goalId"),
    completionPct: formData.get("completionPct")
  });

  const { session, goal } = await loadGoalForActor(parsed.goalId);

  if (!goal) {
    return;
  }

  await withDbTransaction(async (client) => {
    const managerAllowed =
      session.role === "manager"
        ? await canManagerAct(session.userId, goal.owner_profile_id)(client)
        : false;

    const allowed = goal.owner_profile_id === session.userId || managerAllowed;

    if (!allowed) {
      return;
    }

    const nextStatus = normalizeGoalStatus(goal.status, parsed.completionPct);

    await client.query(
      `
        update public.goals
        set completion_pct = $2,
            status = $3,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [goal.id, parsed.completionPct, nextStatus]
    );

    await client.query(
      `
        insert into public.goal_updates (id, goal_id, actor_profile_id, progress_delta, note)
        values ($1, $2, $3, $4, $5)
      `,
      [
        randomUUID(),
        goal.id,
        session.userId,
        parsed.completionPct,
        `Progress updated to ${parsed.completionPct}%`
      ]
    );

    await recordAudit(client, session.userId, "goal", goal.id, "goal_progress_updated", {
      completionPct: parsed.completionPct
    });

    await recalculateGoalHierarchy(client, goal.id);
  });

  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function archiveGoalAction(formData: FormData) {
  const parsed = goalIdSchema.parse({
    goalId: formData.get("goalId")
  });

  const { session, goal } = await loadGoalForActor(parsed.goalId);

  if (!goal) {
    return;
  }

  await withDbTransaction(async (client) => {
    const managerAllowed =
      session.role === "manager"
        ? await canManagerAct(session.userId, goal.owner_profile_id)(client)
        : false;
    const managerOwnGoal =
      session.role === "manager" && goal.owner_profile_id === session.userId;
    const allowed = session.role === "admin" || managerAllowed || managerOwnGoal;

    if (!allowed) {
      return;
    }

    await client.query(
      `
        update public.goals
        set status = 'archived',
            archived_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [goal.id]
    );

    await client.query(
      `
        insert into public.goal_approval_events (id, goal_id, actor_profile_id, event_type, reason, metadata)
        values ($1, $2, $3, 'archive', 'Goal archived', $4::jsonb)
      `,
      [randomUUID(), goal.id, session.userId, JSON.stringify({ archived: true })]
    );

    await recordAudit(client, session.userId, "goal", goal.id, "goal_archived", {
      title: goal.title
    });

    await recalculateGoalHierarchy(client, goal.id);
  });

  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function approveGoalAction(formData: FormData) {
  const parsed = approveSchema.parse({
    goalId: formData.get("goalId"),
    weightage: formData.get("weightage")
  });

  const { session, goal } = await loadGoalForActor(parsed.goalId);

  if (!goal) {
    return;
  }

  await withDbTransaction(async (client) => {
    const managerAllowed =
      session.role === "manager"
        ? await canManagerAct(session.userId, goal.owner_profile_id)(client)
        : false;

    const allowed = session.role === "admin" || managerAllowed;

    if (!allowed || goal.status !== "pending_approval") {
      return;
    }

    await ensureGoalWeightageBalanced(client, goal, parsed.weightage);
    const parentGoalId =
      goal.parent_goal_id ??
      (await inferGoalParentId(client, {
        scope: goal.scope,
        cycleId: goal.cycle_id,
        teamId: goal.team_id
      }));

    await client.query(
      `
        update public.goals
        set status = 'active',
            parent_goal_id = coalesce(parent_goal_id, $3),
            weightage = $4,
            approved_by = $2,
            approved_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [goal.id, session.userId, parentGoalId, parsed.weightage]
    );

    await client.query(
      `
        insert into public.goal_approval_events (id, goal_id, actor_profile_id, event_type, reason, metadata)
        values ($1, $2, $3, 'approve', 'Goal approved', $4::jsonb)
      `,
      [
        randomUUID(),
        goal.id,
        session.userId,
        JSON.stringify({ approved: true, weightage: parsed.weightage })
      ]
    );

    await queueGoalDecisionNotification(client, {
      goal,
      decision: "approved",
      actorProfileId: session.userId,
      weightage: parsed.weightage
    });

    await recalculateGoalHierarchy(client, goal.id);
  });

  revalidatePath("/goals");
  revalidatePath("/goals/approvals");
  revalidatePath("/dashboard");
}

export async function rejectGoalAction(formData: FormData) {
  const parsed = rejectSchema.parse({
    goalId: formData.get("goalId"),
    reason: formData.get("reason")
  });

  const { session, goal } = await loadGoalForActor(parsed.goalId);

  if (!goal) {
    return;
  }

  await withDbTransaction(async (client) => {
    const managerAllowed =
      session.role === "manager"
        ? await canManagerAct(session.userId, goal.owner_profile_id)(client)
        : false;

    const allowed = session.role === "admin" || managerAllowed;

    if (!allowed || goal.status !== "pending_approval") {
      return;
    }

    await client.query(
      `
        update public.goals
        set status = 'draft',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [goal.id]
    );

    await client.query(
      `
        insert into public.goal_approval_events (id, goal_id, actor_profile_id, event_type, reason, metadata)
        values ($1, $2, $3, 'reject', $4, $5::jsonb)
      `,
      [
        randomUUID(),
        goal.id,
        session.userId,
        parsed.reason,
        JSON.stringify({ rejected: true })
      ]
    );

    await queueGoalDecisionNotification(client, {
      goal,
      decision: "rejected",
      actorProfileId: session.userId,
      reason: parsed.reason
    });
  });

  revalidatePath("/goals");
  revalidatePath("/goals/approvals");
  revalidatePath("/dashboard");
}
