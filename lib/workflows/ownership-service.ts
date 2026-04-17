import { dbQuery } from "@/lib/db/server";

export type ManagerTransferSummary = {
  id: string;
  fullName: string;
  email: string;
  directReportCount: number;
  activeReviewAssignments: number;
  openTeamGoalCount: number;
};

export type GoalOwnershipSummary = {
  id: string;
  fullName: string;
  email: string;
  teamGoalCount: number;
  companyGoalCount: number;
};

export async function listManagerTransferSummary(): Promise<ManagerTransferSummary[]> {
  try {
    const result = await dbQuery<{
      id: string;
      full_name: string;
      email: string;
      direct_report_count: number | string;
      active_review_assignments: number | string;
      open_team_goal_count: number | string;
    }>(
      `
        select
          p.id,
          p.full_name,
          p.email,
          count(distinct er.profile_id)::int as direct_report_count,
          count(distinct ce.id) filter (
            where ce.review_status not in ('waived', 'finalized')
          )::int as active_review_assignments,
          count(distinct g.id) filter (
            where g.scope = 'team'
              and g.status <> 'archived'
          )::int as open_team_goal_count
        from public.profiles p
        join public.user_roles ur
          on ur.profile_id = p.id
         and ur.role = 'manager'
        left join public.employee_records er
          on er.manager_profile_id = p.id
        left join public.cycle_enrollments ce
          on ce.acting_reviewer_profile_id = p.id
        left join public.goals g
          on g.owner_profile_id = p.id
        where p.is_active = true
        group by p.id, p.full_name, p.email
        order by p.full_name asc
      `
    );

    return result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      directReportCount: Number(row.direct_report_count),
      activeReviewAssignments: Number(row.active_review_assignments),
      openTeamGoalCount: Number(row.open_team_goal_count)
    }));
  } catch (error) {
    console.error("listManagerTransferSummary failed:", error);
    return [];
  }
}

export async function listGoalOwnershipSummary(): Promise<GoalOwnershipSummary[]> {
  try {
    const result = await dbQuery<{
      id: string;
      full_name: string;
      email: string;
      team_goal_count: number | string;
      company_goal_count: number | string;
    }>(
      `
        select
          p.id,
          p.full_name,
          p.email,
          count(*) filter (
            where g.scope = 'team'
              and g.status <> 'archived'
          )::int as team_goal_count,
          count(*) filter (
            where g.scope = 'company'
              and g.status <> 'archived'
          )::int as company_goal_count
        from public.profiles p
        join public.goals g on g.owner_profile_id = p.id
        where p.is_active = true
        group by p.id, p.full_name, p.email
        having count(*) filter (
          where g.scope in ('team', 'company')
            and g.status <> 'archived'
        ) > 0
        order by p.full_name asc
      `
    );

    return result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      teamGoalCount: Number(row.team_goal_count),
      companyGoalCount: Number(row.company_goal_count)
    }));
  } catch (error) {
    console.error("listGoalOwnershipSummary failed:", error);
    return [];
  }
}
