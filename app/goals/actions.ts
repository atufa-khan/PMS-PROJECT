"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";

type GoalAccessRow = {
  id: string;
  owner_profile_id: string | null;
  scope: "company" | "team" | "individual";
  status: "draft" | "pending_approval" | "active" | "completed" | "archived";
  title: string;
  weightage: number | string;
  created_by: string | null;
};

const goalIdSchema = z.object({
  goalId: z.string().uuid()
});

const progressSchema = z.object({
  goalId: z.string().uuid(),
  completionPct: z.coerce.number().min(0).max(100)
});

const rejectSchema = z.object({
  goalId: z.string().uuid(),
  reason: z.string().min(3).max(300)
});

async function loadGoalForActor(goalId: string) {
  const session = await getAppSession();

  const result = await withDbTransaction(async (client) => {
    const goalResult = await client.query<GoalAccessRow>(
      `
        select id, owner_profile_id, scope, status, title, weightage, created_by
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

async function logAudit(
  client: import("pg").PoolClient,
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  await client.query(
    `
      insert into public.audit_logs (id, actor_profile_id, entity_type, entity_id, action, metadata)
      values ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [randomUUID(), actorId, entityType, entityId, action, JSON.stringify(metadata)]
  );
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
  const parsed = goalIdSchema.parse({
    goalId: formData.get("goalId")
  });

  const { session, goal } = await loadGoalForActor(parsed.goalId);

  if (!goal || goal.owner_profile_id !== session.userId || goal.status !== "draft") {
    return;
  }

  await withDbTransaction(async (client) => {
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
        values ($1, $2, $3, 'submit', 'Goal submitted for approval', $4::jsonb)
      `,
      [
        randomUUID(),
        goal.id,
        session.userId,
        JSON.stringify({ submitted_from: "goals_page" })
      ]
    );

    await logAudit(client, session.userId, "goal", goal.id, "goal_submitted", {
      title: goal.title
    });
  });

  revalidatePath("/goals");
  revalidatePath("/goals/approvals");
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

    const allowed =
      session.role === "admin" ||
      goal.owner_profile_id === session.userId ||
      managerAllowed;

    if (!allowed) {
      return;
    }

    const nextStatus =
      parsed.completionPct >= 100 && goal.status !== "archived"
        ? "completed"
        : goal.status === "completed" && parsed.completionPct < 100
          ? "active"
          : goal.status;

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

    await logAudit(client, session.userId, "goal", goal.id, "goal_progress_updated", {
      completionPct: parsed.completionPct
    });
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

    const allowed = session.role === "admin" || managerAllowed;

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

    await logAudit(client, session.userId, "goal", goal.id, "goal_archived", {
      title: goal.title
    });
  });

  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function approveGoalAction(formData: FormData) {
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

    const allowed = session.role === "admin" || managerAllowed;

    if (!allowed || goal.status !== "pending_approval") {
      return;
    }

    await client.query(
      `
        update public.goals
        set status = 'active',
            approved_by = $2,
            approved_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [goal.id, session.userId]
    );

    await client.query(
      `
        insert into public.goal_approval_events (id, goal_id, actor_profile_id, event_type, reason, metadata)
        values ($1, $2, $3, 'approve', 'Goal approved', $4::jsonb)
      `,
      [randomUUID(), goal.id, session.userId, JSON.stringify({ approved: true })]
    );

    await logAudit(client, session.userId, "goal", goal.id, "goal_approved", {
      title: goal.title
    });
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

    await logAudit(client, session.userId, "goal", goal.id, "goal_rejected", {
      reason: parsed.reason
    });
  });

  revalidatePath("/goals");
  revalidatePath("/goals/approvals");
  revalidatePath("/dashboard");
}
