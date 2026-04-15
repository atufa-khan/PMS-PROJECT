import type { AppSession } from "@/lib/auth/session";
import { getApprovals, getGoals } from "@/lib/demo-data";
import { dbQuery } from "@/lib/db/server";
import type { ApprovalRecord, GoalRecord } from "@/lib/db/types";

type GoalRow = {
  id: string;
  title: string;
  scope: GoalRecord["scope"];
  status: GoalRecord["status"];
  owner_id: string | null;
  owner_name: string | null;
  due_label: string | null;
  weightage: number | string;
  completion_pct: number | string;
  is_managed: boolean;
};

type ApprovalRow = {
  goal_id: string;
  goal_title: string;
  requested_by: string | null;
  submitted_at: string | null;
  status_label: string;
  scope: ApprovalRecord["scope"];
  weightage: number | string;
};

function buildGoalFilter(role: AppSession["role"]) {
  if (role === "admin") {
    return "true";
  }

  if (role === "manager") {
    return `
      g.scope = 'company'
      or g.owner_profile_id = $1
      or exists (
        select 1
        from public.employee_records er
        where er.profile_id = g.owner_profile_id
          and er.manager_profile_id = $1
      )
    `;
  }

  return `
    g.scope = 'company'
    or g.owner_profile_id = $1
    or (
      g.scope = 'team'
      and g.team_id = (
        select team_id
        from public.profiles
        where id = $1
      )
    )
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

export async function listGoals(session: AppSession): Promise<GoalRecord[]> {
  try {
    const result = await dbQuery<GoalRow>(
      `
        select
          g.id,
          g.title,
          g.scope,
          g.status,
          g.owner_profile_id as owner_id,
          p.full_name as owner_name,
          to_char(coalesce(rc.close_date, g.created_at::date), 'Mon DD') as due_label,
          g.weightage,
          g.completion_pct,
          exists (
            select 1
            from public.employee_records er
            where er.profile_id = g.owner_profile_id
              and er.manager_profile_id = $1
          ) as is_managed
        from public.goals g
        left join public.profiles p on p.id = g.owner_profile_id
        left join public.review_cycles rc on rc.id = g.cycle_id
        where ${buildGoalFilter(session.role)}
        order by g.updated_at desc, g.created_at desc
        limit 50
      `,
      [session.userId]
    );

    return result.rows.map((row: GoalRow) => {
      const isOwner = row.owner_id === session.userId;
      const canManageGoal =
        session.role === "admin" ||
        isOwner ||
        Boolean(row.is_managed);
      const status = row.status;

      return {
        id: row.id,
        title: row.title,
        scope: row.scope,
        status,
        ownerId: row.owner_id,
        ownerName: row.owner_name ?? "Unassigned",
        dueLabel: row.due_label ?? "No cycle",
        weightage: Number(row.weightage),
        completionPct: Number(row.completion_pct),
        canSubmit: isOwner && status === "draft",
        canUpdateProgress:
          canManageGoal &&
          (status === "active" || status === "completed"),
        canArchive: canManageGoal && status !== "archived"
      };
    });
  } catch (error) {
    console.error("listGoals failed, falling back to demo data:", error);
    return getGoals();
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
          to_char(coalesce(ls.created_at, g.updated_at), 'YYYY-MM-DD') as submitted_at,
          case
            when coalesce(ls.created_at, g.updated_at)::date <= current_date - 5
              then 'Escalation due'
            else 'Pending approval'
          end as status_label,
          g.scope,
          g.weightage
        from public.goals g
        left join public.profiles p on p.id = g.owner_profile_id
        left join latest_submit ls on ls.goal_id = g.id
        where ${buildApprovalFilter(session.role)}
        order by coalesce(ls.created_at, g.updated_at) desc
        limit 25
      `,
      [session.userId]
    );

    return result.rows.map((row: ApprovalRow) => ({
      id: row.goal_id,
      goalId: row.goal_id,
      goalTitle: row.goal_title,
      requestedBy: row.requested_by ?? "Unknown",
      submittedAt: row.submitted_at ?? "--",
      status: row.status_label,
      scope: row.scope,
      weightage: Number(row.weightage),
      canApprove: session.role === "manager" || session.role === "admin"
    }));
  } catch (error) {
    console.error("listPendingApprovals failed, falling back to demo data:", error);
    return getApprovals();
  }
}
