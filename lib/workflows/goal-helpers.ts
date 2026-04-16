import "server-only";

import { randomUUID } from "node:crypto";
import { addWorkingDays } from "@/lib/dates/working-days";
import {
  findEscalationAdminProfileId,
  queueNotification,
  recordAudit
} from "@/lib/workflows/workflow-helpers";
import type { PoolClient } from "pg";

export type GoalWorkflowRow = {
  id: string;
  parent_goal_id: string | null;
  owner_profile_id: string | null;
  team_id: string | null;
  cycle_id: string | null;
  scope: "company" | "team" | "individual";
  status: "draft" | "pending_approval" | "active" | "completed" | "archived";
  title: string;
  weightage: number | string;
  completion_pct: number | string;
  created_by: string | null;
};

export type GoalWeightageSummary = {
  assignedTotal: number;
  remaining: number;
  isBalanced: boolean;
  isOverweight: boolean;
  contextLabel: string;
};

function roundWeightage(value: number) {
  return Math.round(value * 100) / 100;
}

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) < 0.01;
}

export function deriveGoalRating(completionPct: number) {
  if (completionPct >= 100) {
    return "Above Expectations";
  }

  if (completionPct >= 70) {
    return "Meets Expectations";
  }

  return "Below Expectations";
}

export function normalizeGoalStatus(
  currentStatus: GoalWorkflowRow["status"],
  completionPct: number
) {
  if (currentStatus === "archived") {
    return currentStatus;
  }

  if (completionPct >= 100) {
    return "completed" as const;
  }

  if (currentStatus === "completed" && completionPct < 100) {
    return "active" as const;
  }

  return currentStatus;
}

function getGoalContextLabel(goal: {
  scope: GoalWorkflowRow["scope"];
  owner_profile_id?: string | null;
  team_id?: string | null;
}) {
  if (goal.scope === "company") {
    return "company goal portfolio";
  }

  if (goal.scope === "team") {
    return "team goal portfolio";
  }

  return "individual goal portfolio";
}

export async function summarizeGoalWeightage(
  client: PoolClient,
  goal: Pick<GoalWorkflowRow, "scope" | "cycle_id" | "owner_profile_id" | "team_id">,
  {
    excludeGoalId,
    candidateWeightage = 0
  }: {
    excludeGoalId?: string | null;
    candidateWeightage?: number;
  } = {}
): Promise<GoalWeightageSummary> {
  const result = await client.query<{ assigned_total: number | string }>(
    `
      select coalesce(sum(weightage), 0)::float8 as assigned_total
      from public.goals
      where status in ('draft', 'pending_approval', 'active', 'completed')
        and scope = $1::public.goal_scope
        and cycle_id is not distinct from $2::uuid
        and ($3::uuid is null or id <> $3::uuid)
        and (
          ($1::public.goal_scope = 'individual' and owner_profile_id is not distinct from $4::uuid)
          or ($1::public.goal_scope = 'team' and team_id is not distinct from $5::uuid)
          or $1::public.goal_scope = 'company'
        )
    `,
    [
      goal.scope,
      goal.cycle_id,
      excludeGoalId ?? null,
      goal.owner_profile_id ?? null,
      goal.team_id ?? null
    ]
  );

  const assignedTotal = roundWeightage(
    Number(result.rows[0]?.assigned_total ?? 0) + candidateWeightage
  );

  return {
    assignedTotal,
    remaining: roundWeightage(100 - assignedTotal),
    isBalanced: sameNumber(assignedTotal, 100),
    isOverweight: assignedTotal > 100,
    contextLabel: getGoalContextLabel(goal)
  };
}

export async function ensureGoalWeightageBalanced(
  client: PoolClient,
  goal: Pick<
    GoalWorkflowRow,
    "id" | "scope" | "cycle_id" | "owner_profile_id" | "team_id"
  >,
  candidateWeightage: number
) {
  const summary = await summarizeGoalWeightage(client, goal, {
    excludeGoalId: goal.id,
    candidateWeightage
  });

  if (!summary.isBalanced) {
    throw new Error(
      `${summary.contextLabel} must total exactly 100% before submission or approval. Current assigned total: ${summary.assignedTotal}%.`
    );
  }

  return summary;
}

async function findCurrentManagerProfileId(
  client: PoolClient,
  ownerProfileId: string | null
) {
  if (!ownerProfileId) {
    return null;
  }

  const result = await client.query<{ manager_profile_id: string | null }>(
    `
      select manager_profile_id
      from public.employee_records
      where profile_id = $1
      limit 1
    `,
    [ownerProfileId]
  );

  return result.rows[0]?.manager_profile_id ?? null;
}

export async function queueGoalSubmissionNotifications(
  client: PoolClient,
  goal: GoalWorkflowRow
) {
  const managerProfileId = await findCurrentManagerProfileId(
    client,
    goal.owner_profile_id
  );
  const escalationAdminId = await findEscalationAdminProfileId(client);
  const reviewerId = managerProfileId ?? escalationAdminId;

  await queueNotification(client, {
    recipientProfileId: reviewerId,
    channel: "in_app",
    templateKey: "goal_submitted",
    subject: "Goal approval required",
    body: `${goal.title} is waiting for approval.`,
    actionUrl: "/goals/approvals"
  });

  const escalationRecipient =
    escalationAdminId && escalationAdminId !== reviewerId
      ? escalationAdminId
      : null;

  if (escalationRecipient) {
    await queueNotification(client, {
      recipientProfileId: escalationRecipient,
      channel: "in_app",
      templateKey: "goal_approval_sla",
      subject: "Goal approval SLA reached",
      body: `${goal.title} still needs an approval decision after 5 business days.`,
      actionUrl: "/goals/approvals",
      scheduledFor: addWorkingDays(new Date(), 5)
    });
  }
}

export async function queueGoalDecisionNotification(
  client: PoolClient,
  {
    goal,
    decision,
    actorProfileId,
    reason,
    weightage
  }: {
    goal: GoalWorkflowRow;
    decision: "approved" | "rejected";
    actorProfileId: string | null;
    reason?: string;
    weightage?: number;
  }
) {
  if (decision === "approved") {
    await queueNotification(client, {
      recipientProfileId: goal.owner_profile_id,
      channel: "in_app",
      templateKey: "goal_approved",
      subject: "Goal approved",
      body: `${goal.title} is now active${typeof weightage === "number" ? ` at ${weightage}% weightage` : ""}.`,
      actionUrl: "/goals"
    });

    await recordAudit(client, actorProfileId, "goal", goal.id, "goal_approved", {
      title: goal.title,
      weightage
    });

    return;
  }

  await queueNotification(client, {
    recipientProfileId: goal.owner_profile_id,
    channel: "in_app",
    templateKey: "goal_rejected",
    subject: "Goal changes requested",
    body: reason
      ? `${goal.title} was returned with feedback: ${reason}`
      : `${goal.title} was returned for revision.`,
    actionUrl: "/goals"
  });

  await recordAudit(client, actorProfileId, "goal", goal.id, "goal_rejected", {
    title: goal.title,
    reason
  });
}

export async function queueCompanyGoalSuggestions(
  client: PoolClient,
  {
    sourceGoalId,
    sourceGoalTitle,
    actorProfileId
  }: {
    sourceGoalId: string;
    sourceGoalTitle: string;
    actorProfileId: string | null;
  }
) {
  const descendants = await client.query<{
    id: string;
    owner_profile_id: string | null;
    title: string;
  }>(
    `
      with recursive descendants as (
        select id, parent_goal_id, owner_profile_id, title, status
        from public.goals
        where parent_goal_id = $1

        union all

        select g.id, g.parent_goal_id, g.owner_profile_id, g.title, g.status
        from public.goals g
        join descendants d on d.id = g.parent_goal_id
      )
      select id, owner_profile_id, title
      from descendants
      where status in ('draft', 'pending_approval', 'active', 'completed')
    `,
    [sourceGoalId]
  );

  for (const row of descendants.rows) {
    await client.query(
      `
        insert into public.goal_approval_events (id, goal_id, actor_profile_id, event_type, reason, metadata)
        values ($1, $2, $3, 'company_goal_suggested', $4, $5::jsonb)
      `,
      [
        randomUUID(),
        row.id,
        actorProfileId,
        "Company goal updated mid-cycle",
        JSON.stringify({
          sourceGoalId,
          sourceGoalTitle
        })
      ]
    );

    await queueNotification(client, {
      recipientProfileId: row.owner_profile_id,
      channel: "in_app",
      templateKey: "company_goal_suggestion",
      subject: "Company goal update needs acknowledgment",
      body: `${sourceGoalTitle} changed mid-cycle. Review the cascade impact on ${row.title}.`,
      actionUrl: "/goals"
    });
  }

  return descendants.rowCount;
}

export async function inferGoalParentId(
  client: PoolClient,
  {
    scope,
    cycleId,
    teamId
  }: {
    scope: GoalWorkflowRow["scope"];
    cycleId: string | null;
    teamId: string | null;
  }
) {
  if (!cycleId) {
    return null;
  }

  if (scope === "team") {
    const result = await client.query<{ id: string }>(
      `
        select id
        from public.goals
        where cycle_id = $1
          and scope = 'company'
          and status in ('active', 'completed')
        order by approved_at desc nulls last, created_at asc
        limit 1
      `,
      [cycleId]
    );

    return result.rows[0]?.id ?? null;
  }

  if (scope === "individual" && teamId) {
    const result = await client.query<{ id: string }>(
      `
        select id
        from public.goals
        where cycle_id = $1
          and team_id = $2
          and scope = 'team'
          and status in ('active', 'completed')
        order by approved_at desc nulls last, created_at asc
        limit 1
      `,
      [cycleId, teamId]
    );

    return result.rows[0]?.id ?? null;
  }

  return null;
}

async function calculateWeightedCompletion(
  client: PoolClient,
  query: string,
  params: unknown[]
) {
  const result = await client.query<{ completion_pct: number | string }>(
    query,
    params
  );

  return roundWeightage(Number(result.rows[0]?.completion_pct ?? 0));
}

async function updateTeamRollups(
  client: PoolClient,
  {
    teamId,
    cycleId
  }: {
    teamId: string | null;
    cycleId: string | null;
  }
) {
  if (!teamId || !cycleId) {
    return;
  }

  const completionPct = await calculateWeightedCompletion(
    client,
    `
      select
        case
          when coalesce(sum(weightage), 0) = 0 then 0
          else round(sum(completion_pct * weightage) / sum(weightage), 2)
        end as completion_pct
      from public.goals
      where scope = 'individual'
        and team_id = $1
        and cycle_id = $2
        and status in ('active', 'completed', 'archived')
    `,
    [teamId, cycleId]
  );

  await client.query(
    `
      update public.goals
      set completion_pct = $3,
          status = case
            when $3 >= 100 then 'completed'::public.goal_status
            when status = 'completed' and $3 < 100 then 'active'::public.goal_status
            else status
          end,
          updated_at = timezone('utc', now())
      where scope = 'team'
        and team_id = $1
        and cycle_id = $2
        and status in ('active', 'completed')
    `,
    [teamId, cycleId, completionPct]
  );
}

async function updateCompanyRollups(client: PoolClient, cycleId: string | null) {
  if (!cycleId) {
    return;
  }

  const completionPct = await calculateWeightedCompletion(
    client,
    `
      select
        case
          when coalesce(sum(weightage), 0) = 0 then 0
          else round(sum(completion_pct * weightage) / sum(weightage), 2)
        end as completion_pct
      from public.goals
      where scope = 'team'
        and cycle_id = $1
        and status in ('active', 'completed', 'archived')
    `,
    [cycleId]
  );

  await client.query(
    `
      update public.goals
      set completion_pct = $2,
          status = case
            when $2 >= 100 then 'completed'::public.goal_status
            when status = 'completed' and $2 < 100 then 'active'::public.goal_status
            else status
          end,
          updated_at = timezone('utc', now())
      where scope = 'company'
        and cycle_id = $1
        and status in ('active', 'completed')
    `,
    [cycleId, completionPct]
  );
}

async function updateAncestorRollup(client: PoolClient, goalId: string | null) {
  let currentGoalId = goalId;

  while (currentGoalId) {
    const aggregate = await calculateWeightedCompletion(
      client,
      `
        select
          case
            when coalesce(sum(weightage), 0) = 0 then 0
            else round(sum(completion_pct * weightage) / sum(weightage), 2)
          end as completion_pct
        from public.goals
        where parent_goal_id = $1
          and status in ('active', 'completed', 'archived')
      `,
      [currentGoalId]
    );

    const parentResult = await client.query<{
      parent_goal_id: string | null;
      status: GoalWorkflowRow["status"];
    }>(
      `
        update public.goals
        set completion_pct = $2,
            status = case
              when status = 'archived' then status
              when $2 >= 100 and status in ('active', 'completed') then 'completed'::public.goal_status
              when status = 'completed' and $2 < 100 then 'active'::public.goal_status
              else status
            end,
            updated_at = timezone('utc', now())
        where id = $1
        returning parent_goal_id, status
      `,
      [currentGoalId, aggregate]
    );

    currentGoalId = parentResult.rows[0]?.parent_goal_id ?? null;
  }
}

export async function recalculateGoalHierarchy(
  client: PoolClient,
  goalId: string
) {
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

  const goal = goalResult.rows[0];

  if (!goal) {
    return;
  }

  if (goal.scope === "individual") {
    await updateTeamRollups(client, {
      teamId: goal.team_id,
      cycleId: goal.cycle_id
    });
    await updateCompanyRollups(client, goal.cycle_id);
  } else if (goal.scope === "team") {
    await updateCompanyRollups(client, goal.cycle_id);
  }

  await updateAncestorRollup(client, goal.parent_goal_id);
}
