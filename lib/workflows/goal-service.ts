import type { AppSession } from "@/lib/auth/session";
import { countWorkingDaysBetween } from "@/lib/dates/working-days";
import { dbQuery } from "@/lib/db/server";
import type {
  ApprovalRecord,
  GoalOwnerOptionRecord,
  GoalRecord,
  GoalWeightageContextRecord
} from "@/lib/db/types";
import { deriveGoalRating } from "@/lib/workflows/goal-helpers";

type GoalRow = {
  id: string;
  title: string;
  scope: GoalRecord["scope"];
  status: GoalRecord["status"];
  owner_id: string | null;
  owner_name: string | null;
  cycle_id: string | null;
  team_id: string | null;
  description: string | null;
  success_metric: string | null;
  due_label: string | null;
  weightage: number | string;
  completion_pct: number | string;
  portfolio_weightage: number | string;
  latest_submit_at: string | null;
  latest_suggestion_at: string | null;
  latest_ack_at: string | null;
  suggestion_source_title: string | null;
  is_current_manager: boolean;
};

type ApprovalRow = {
  goal_id: string;
  goal_title: string;
  requested_by: string | null;
  submitted_at_value: string | null;
  scope: ApprovalRecord["scope"];
  weightage: number | string;
  assigned_total: number | string;
};

type GoalContextRow = {
  scope: GoalWeightageContextRecord["scope"];
  assigned_total: number | string;
};

function buildGoalFilter(role: AppSession["role"]) {
  if (role === "admin") {
    return "true";
  }

  if (role === "manager") {
    return `
      g.scope = 'company'
      or g.owner_profile_id = $1
      or g.team_id = (
        select team_id
        from public.profiles
        where id = $1
        limit 1
      )
      or exists (
        select 1
        from public.employee_records er
        where er.profile_id = g.owner_profile_id
          and er.manager_profile_id = $1
      )
      or exists (
        select 1
        from public.manager_assignments ma
        left join public.review_cycles arc on arc.id = g.cycle_id
        where ma.employee_profile_id = g.owner_profile_id
          and ma.manager_profile_id = $1
          and (
            (
              arc.id is not null
              and daterange(
                ma.starts_on,
                coalesce(ma.ends_on, arc.period_end),
                '[]'
              ) && daterange(arc.period_start, arc.period_end, '[]')
            )
            or (
              arc.id is null
              and coalesce(ma.ends_on, current_date) >= current_date
            )
          )
      )
    `;
  }

  return `
    g.scope = 'company'
    or g.owner_profile_id = $1
  `;
}

function buildApprovalFilter(role: AppSession["role"]) {
  if (role === "admin") {
    return `g.status = 'pending_approval'`;
  }

  if (role === "manager") {
    return `
      g.status = 'pending_approval'
      and exists (
        select 1
        from public.employee_records er
        where er.profile_id = g.owner_profile_id
          and er.manager_profile_id = $1
      )
    `;
  }

  return `
    g.status = 'pending_approval'
    and g.owner_profile_id = $1
  `;
}

function buildApprovalSlaLabel(submittedAt: string | null) {
  if (!submittedAt) {
    return "Pending approval";
  }

  const workingDays = countWorkingDaysBetween(new Date(submittedAt), new Date());

  if (workingDays >= 5) {
    return `Escalation due (${workingDays} business days)`;
  }

  return `Pending approval (${workingDays}/5 business days)`;
}

function canEditGoal(
  session: AppSession,
  row: Pick<GoalRow, "scope" | "status" | "owner_id" | "is_current_manager">
) {
  if (row.status === "archived") {
    return false;
  }

  const isOwner = row.owner_id === session.userId;
  const isCurrentManager = Boolean(row.is_current_manager);

  if (session.role === "admin") {
    return true;
  }

  if (session.role === "manager") {
    if (row.scope === "company") {
      return false;
    }

    return row.status === "draft" || row.status === "pending_approval"
      ? isOwner || isCurrentManager
      : row.scope === "team";
  }

  return isOwner && (row.status === "draft" || row.status === "pending_approval");
}

function buildSuggestionState(row: Pick<GoalRow, "latest_suggestion_at" | "latest_ack_at" | "suggestion_source_title">) {
  const hasPendingSuggestion =
    Boolean(row.latest_suggestion_at) &&
    (!row.latest_ack_at ||
      new Date(row.latest_ack_at).getTime() < new Date(row.latest_suggestion_at!).getTime());

  return {
    hasPendingSuggestion,
    suggestionContext: hasPendingSuggestion
      ? `${row.suggestion_source_title ?? "Company goal"} was updated and needs acknowledgment.`
      : null
  };
}

export async function listGoals(session: AppSession): Promise<GoalRecord[]> {
  try {
    const result = await dbQuery<GoalRow>(
      `
        with latest_submit as (
          select distinct on (goal_id)
            goal_id,
            created_at
          from public.goal_approval_events
          where event_type in ('submit', 'resubmit')
          order by goal_id, created_at desc
        ),
        latest_suggestion as (
          select distinct on (goal_id)
            goal_id,
            created_at,
            metadata
          from public.goal_approval_events
          where event_type = 'company_goal_suggested'
          order by goal_id, created_at desc
        ),
        latest_ack as (
          select distinct on (goal_id)
            goal_id,
            created_at
          from public.goal_approval_events
          where event_type = 'company_goal_acknowledged'
          order by goal_id, created_at desc
        )
        select
          g.id,
          g.title,
          g.scope,
          g.status,
          g.owner_profile_id as owner_id,
          p.full_name as owner_name,
          g.cycle_id,
          g.team_id,
          g.description,
          g.success_metric,
          to_char(
            coalesce(
              nullif(substring(g.success_metric from '([0-9]{4}-[0-9]{2}-[0-9]{2})'), '')::date,
              rc.close_date,
              g.created_at::date
            ),
            'Mon DD'
          ) as due_label,
          g.weightage,
          g.completion_pct,
          coalesce((
            select sum(sibling.weightage)::float8
            from public.goals sibling
            where sibling.status in ('draft', 'pending_approval', 'active', 'completed')
              and sibling.scope = g.scope
              and sibling.cycle_id is not distinct from g.cycle_id
              and (
                (g.scope = 'individual' and sibling.owner_profile_id is not distinct from g.owner_profile_id)
                or (g.scope = 'team' and sibling.team_id is not distinct from g.team_id)
                or g.scope = 'company'
              )
          ), 0)::float8 as portfolio_weightage,
          ls.created_at as latest_submit_at,
          suggestion.created_at as latest_suggestion_at,
          ack.created_at as latest_ack_at,
          suggestion.metadata ->> 'sourceGoalTitle' as suggestion_source_title,
          exists (
            select 1
            from public.employee_records er
            where er.profile_id = g.owner_profile_id
              and er.manager_profile_id = $1
          ) as is_current_manager
        from public.goals g
        left join public.profiles p on p.id = g.owner_profile_id
        left join public.review_cycles rc on rc.id = g.cycle_id
        left join latest_submit ls on ls.goal_id = g.id
        left join latest_suggestion suggestion on suggestion.goal_id = g.id
        left join latest_ack ack on ack.goal_id = g.id
        where ${buildGoalFilter(session.role)}
        order by g.updated_at desc, g.created_at desc
        limit 75
      `,
      [session.userId]
    );

    return result.rows.map((row) => {
      const isOwner = row.owner_id === session.userId;
      const isCurrentManager = Boolean(row.is_current_manager);
      const suggestionState = buildSuggestionState(row);
      const canUpdateProgress =
        (isOwner || isCurrentManager) &&
        (row.status === "active" || row.status === "completed");
      const canArchive =
        session.role === "admin" ||
        (session.role === "manager" && (isOwner || isCurrentManager));
      const portfolioWeightage = Number(row.portfolio_weightage);
      const completionPct = Number(row.completion_pct);

      return {
        id: row.id,
        title: row.title,
        scope: row.scope,
        status: row.status,
        ownerId: row.owner_id,
        ownerName: row.owner_name ?? "Unassigned",
        dueLabel: row.due_label ?? "No cycle",
        cycleId: row.cycle_id,
        teamId: row.team_id,
        description: row.description,
        successMetric: row.success_metric,
        weightage: Number(row.weightage),
        completionPct,
        rating: deriveGoalRating(completionPct),
        portfolioWeightage,
        portfolioRemaining: Math.round((100 - portfolioWeightage) * 100) / 100,
        approvalSlaLabel:
          row.status === "pending_approval"
            ? buildApprovalSlaLabel(row.latest_submit_at)
            : undefined,
        canSubmit: isOwner && row.status === "draft",
        canUpdateProgress,
        canArchive: canArchive && row.status !== "archived",
        canEdit: canEditGoal(session, row),
        hasPendingSuggestion: suggestionState.hasPendingSuggestion,
        suggestionContext: suggestionState.suggestionContext,
        canAcknowledgeSuggestion: suggestionState.hasPendingSuggestion && isOwner
      };
    });
  } catch (error) {
    console.error("listGoals failed:", error);
    return [];
  }
}

export async function listGoalWeightageContexts(
  session: AppSession,
  options: {
    cycleId?: string | null;
    teamId?: string | null;
    ownerId?: string | null;
    excludeGoalId?: string | null;
  } = {}
): Promise<GoalWeightageContextRecord[]> {
  try {
    const profileResult = await dbQuery<{ team_id: string | null }>(
      `
        select team_id
        from public.profiles
        where id = $1
        limit 1
      `,
      [session.userId]
    );

    const cycleResult = await dbQuery<{ id: string }>(
      `
        select id
        from public.review_cycles
        where is_active = true
           or current_date between period_start and period_end
        order by is_active desc, close_date asc
        limit 1
      `
    );

    const teamId = options.teamId ?? profileResult.rows[0]?.team_id ?? null;
    const cycleId = options.cycleId ?? cycleResult.rows[0]?.id ?? null;
    const ownerId = options.ownerId ?? session.userId;

    const summaryResult = await dbQuery<GoalContextRow>(
      `
        select
          scope,
          coalesce(sum(weightage), 0)::float8 as assigned_total
        from public.goals
        where status in ('draft', 'pending_approval', 'active', 'completed')
          and cycle_id is not distinct from $1::uuid
          and ($4::uuid is null or id <> $4::uuid)
          and (
            (scope = 'individual' and owner_profile_id = $2)
            or (scope = 'team' and team_id is not distinct from $3::uuid)
            or scope = 'company'
          )
        group by scope
      `,
      [cycleId, ownerId, teamId, options.excludeGoalId ?? null]
    );

    const totals = new Map(
      summaryResult.rows.map((row) => [row.scope, Number(row.assigned_total)])
    );

    return (["individual", "team", "company"] as const).map((scope) => {
      const assignedTotal = totals.get(scope) ?? 0;

      return {
        scope,
        assignedTotal,
        remaining: Math.round((100 - assignedTotal) * 100) / 100
      };
    });
  } catch (error) {
    console.error("listGoalWeightageContexts failed:", error);
    return [
      { scope: "individual", assignedTotal: 0, remaining: 100 },
      { scope: "team", assignedTotal: 0, remaining: 100 },
      { scope: "company", assignedTotal: 0, remaining: 100 }
    ];
  }
}

export async function listAssignableGoalOwners(
  session: AppSession
): Promise<GoalOwnerOptionRecord[]> {
  try {
    if (session.role === "employee") {
      const selfResult = await dbQuery<{
        id: string;
        full_name: string;
        email: string;
        team_name: string | null;
      }>(
        `
          select
            p.id,
            p.full_name,
            p.email,
            t.name as team_name
          from public.profiles p
          left join public.teams t on t.id = p.team_id
          where p.id = $1
          limit 1
        `,
        [session.userId]
      );

      return selfResult.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        teamName: row.team_name
      }));
    }

    const result = await dbQuery<{
      id: string;
      full_name: string;
      email: string;
      team_name: string | null;
    }>(
      session.role === "admin"
        ? `
            select
              p.id,
              p.full_name,
              p.email,
              t.name as team_name
            from public.profiles p
            left join public.teams t on t.id = p.team_id
            where p.is_active = true
            order by p.full_name asc
          `
        : `
            select
              p.id,
              p.full_name,
              p.email,
              t.name as team_name
            from public.profiles p
            left join public.teams t on t.id = p.team_id
            where p.id = $1
               or exists (
                 select 1
                 from public.employee_records er
                 where er.profile_id = p.id
                   and er.manager_profile_id = $1
               )
            order by p.full_name asc
          `,
      session.role === "admin" ? [] : [session.userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      teamName: row.team_name
    }));
  } catch (error) {
    console.error("listAssignableGoalOwners failed:", error);
    return [];
  }
}

export async function getGoalForEditing(
  session: AppSession,
  goalId: string
): Promise<{
  goal: {
    id: string;
    title: string;
    description: string;
    dueDate: string;
    weightage: number;
    scope: GoalRecord["scope"];
    status: GoalRecord["status"];
    cycleId: string | null;
    teamId: string | null;
    ownerId: string | null;
  };
  weightageContexts: GoalWeightageContextRecord[];
  assignableOwners: GoalOwnerOptionRecord[];
} | null> {
  try {
    const result = await dbQuery<
      Pick<
        GoalRow,
        | "id"
        | "title"
        | "description"
        | "scope"
        | "status"
        | "cycle_id"
        | "team_id"
        | "owner_id"
        | "weightage"
        | "is_current_manager"
      > & { due_date: string | null }
    >(
      `
        select
          g.id,
          g.title,
          g.description,
          g.scope,
          g.status,
          g.cycle_id,
          g.team_id,
          g.owner_profile_id as owner_id,
          g.weightage,
          exists (
            select 1
            from public.employee_records er
            where er.profile_id = g.owner_profile_id
              and er.manager_profile_id = $2
          ) as is_current_manager,
          to_char(
            coalesce(
              nullif(substring(g.success_metric from '([0-9]{4}-[0-9]{2}-[0-9]{2})'), '')::date,
              rc.close_date,
              g.created_at::date
            ),
            'YYYY-MM-DD'
          ) as due_date
        from public.goals g
        left join public.review_cycles rc on rc.id = g.cycle_id
        where g.id = $1
          and (
            ${
              session.role === "admin"
                ? "true"
                : session.role === "manager"
                  ? `
                    g.scope = 'company'
                    or g.owner_profile_id = $2
                    or exists (
                      select 1
                      from public.employee_records er
                      where er.profile_id = g.owner_profile_id
                        and er.manager_profile_id = $2
                    )
                    or exists (
                      select 1
                      from public.manager_assignments ma
                      left join public.review_cycles arc on arc.id = g.cycle_id
                      where ma.employee_profile_id = g.owner_profile_id
                        and ma.manager_profile_id = $2
                        and (
                          (
                            arc.id is not null
                            and daterange(
                              ma.starts_on,
                              coalesce(ma.ends_on, arc.period_end),
                              '[]'
                            ) && daterange(arc.period_start, arc.period_end, '[]')
                          )
                          or (
                            arc.id is null
                            and coalesce(ma.ends_on, current_date) >= current_date
                          )
                        )
                    )
                  `
                  : `
                    g.scope = 'company'
                    or g.owner_profile_id = $2
                  `
            }
          )
        limit 1
      `,
      [goalId, session.userId]
    );

    const row = result.rows[0];

    if (!row || !canEditGoal(session, row)) {
      return null;
    }

    const weightageContexts = await listGoalWeightageContexts(session, {
      cycleId: row.cycle_id,
      teamId: row.team_id,
      ownerId: row.owner_id,
      excludeGoalId: row.id
    });

    return {
      goal: {
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        dueDate: row.due_date ?? "",
        weightage: Number(row.weightage),
        scope: row.scope,
        status: row.status,
        cycleId: row.cycle_id,
        teamId: row.team_id,
        ownerId: row.owner_id
      },
      weightageContexts,
      assignableOwners: await listAssignableGoalOwners(session)
    };
  } catch (error) {
    console.error("getGoalForEditing failed:", error);
    return null;
  }
}

export async function listPendingApprovals(
  session: AppSession
): Promise<ApprovalRecord[]> {
  try {
    const result = await dbQuery<ApprovalRow>(
      `
        with latest_submit as (
          select distinct on (goal_id)
            goal_id,
            created_at
          from public.goal_approval_events
          where event_type in ('submit', 'resubmit')
          order by goal_id, created_at desc
        )
        select
          g.id as goal_id,
          g.title as goal_title,
          p.full_name as requested_by,
          coalesce(ls.created_at, g.updated_at)::text as submitted_at_value,
          g.scope,
          g.weightage,
          coalesce((
            select sum(sibling.weightage)::float8
            from public.goals sibling
            where sibling.status in ('draft', 'pending_approval', 'active', 'completed')
              and sibling.id <> g.id
              and sibling.scope = g.scope
              and sibling.cycle_id is not distinct from g.cycle_id
              and (
                (g.scope = 'individual' and sibling.owner_profile_id is not distinct from g.owner_profile_id)
                or (g.scope = 'team' and sibling.team_id is not distinct from g.team_id)
                or g.scope = 'company'
              )
          ), 0)::float8 as assigned_total
        from public.goals g
        left join public.profiles p on p.id = g.owner_profile_id
        left join latest_submit ls on ls.goal_id = g.id
        where ${buildApprovalFilter(session.role)}
        order by coalesce(ls.created_at, g.updated_at) desc
        limit 25
      `,
      [session.userId]
    );

    return result.rows.map((row) => {
      const assignedTotal = Number(row.assigned_total);

      return {
        id: row.goal_id,
        goalId: row.goal_id,
        goalTitle: row.goal_title,
        requestedBy: row.requested_by ?? "Unknown",
        submittedAt: row.submitted_at_value
          ? new Date(row.submitted_at_value).toISOString().slice(0, 10)
          : "--",
        status: buildApprovalSlaLabel(row.submitted_at_value),
        scope: row.scope,
        weightage: Number(row.weightage),
        assignedTotal,
        remaining: Math.round((100 - assignedTotal) * 100) / 100,
        canApprove: session.role === "manager" || session.role === "admin"
      };
    });
  } catch (error) {
    console.error("listPendingApprovals failed:", error);
    return [];
  }
}
