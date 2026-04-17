import { dbQuery } from "@/lib/db/server";
import type { AccessRosterRecord, ProvisioningEventRecord } from "@/lib/db/types";
import { getLifecycleGuard } from "@/lib/workflows/provisioning-rules";

type AccessRosterRow = {
  id: string;
  full_name: string | null;
  email: string;
  manager_name: string | null;
  manager_email: string | null;
  team_name: string | null;
  auth_linked: boolean;
  is_active: boolean;
  employment_status: string | null;
  direct_report_count: number | string;
  active_review_assignment_count: number | string;
  elevated_goal_count: number | string;
  roles: string[] | null;
};

type ProvisioningEventRow = {
  id: string;
  actor_name: string | null;
  action: string;
  target_email: string | null;
  target_role: string | null;
  mode: string | null;
  manager_email: string | null;
  note: string | null;
  created_at: string;
};

export async function listAccessRoster(): Promise<AccessRosterRecord[]> {
  try {
    const result = await dbQuery<AccessRosterRow>(
      `
        select
          p.id,
          p.full_name,
          p.email,
          manager.full_name as manager_name,
          manager.email as manager_email,
          team.name as team_name,
          (p.auth_user_id is not null) as auth_linked,
          p.is_active,
          er.employment_status,
          (
            select count(*)::int
            from public.employee_records reports
            where reports.manager_profile_id = p.id
          ) as direct_report_count,
          (
            select count(*)::int
            from public.cycle_enrollments ce
            where ce.acting_reviewer_profile_id = p.id
              and ce.review_status not in ('waived', 'finalized')
          ) as active_review_assignment_count,
          (
            select count(*)::int
            from public.goals g
            where g.owner_profile_id = p.id
              and g.scope in ('team', 'company')
              and g.status <> 'archived'
          ) as elevated_goal_count,
          array_remove(
            array_agg(distinct ur.role::text order by ur.role::text),
            null
          ) as roles
        from public.profiles p
        left join public.user_roles ur on ur.profile_id = p.id
        left join public.employee_records er on er.profile_id = p.id
        left join public.profiles manager on manager.id = er.manager_profile_id
        left join public.teams team on team.id = p.team_id
        group by
          p.id,
          p.full_name,
          p.email,
          manager.full_name,
          manager.email,
          team.name,
          p.auth_user_id,
          p.is_active,
          er.employment_status
        order by p.is_active desc, p.created_at desc
        limit 30
      `
    );

    return result.rows.map((row) => {
      const directReportCount = Number(row.direct_report_count ?? 0);
      const activeReviewAssignments = Number(row.active_review_assignment_count ?? 0);
      const elevatedGoalCount = Number(row.elevated_goal_count ?? 0);
      const lifecycle = getLifecycleGuard({
        isActive: row.is_active,
        directReportCount,
        activeReviewAssignments,
        elevatedGoalCount
      });

      return {
        id: row.id,
        fullName: row.full_name ?? "Unknown user",
        email: row.email,
        roles: row.roles ?? [],
        managerName: row.manager_name,
        managerEmail: row.manager_email,
        teamName: row.team_name,
        authLinked: row.auth_linked,
        isActive: row.is_active,
        employmentStatus: row.employment_status,
        directReportCount,
        activeReviewAssignments,
        elevatedGoalCount,
        canDeactivate: lifecycle.canDeactivate,
        lifecycleHint: lifecycle.lifecycleHint
      };
    });
  } catch (error) {
    console.error("listAccessRoster failed:", error);
    return [];
  }
}

export async function listProvisioningEvents(): Promise<ProvisioningEventRecord[]> {
  try {
    const result = await dbQuery<ProvisioningEventRow>(
      `
        select
          audit.id,
          actor.full_name as actor_name,
          audit.action,
          audit.metadata ->> 'email' as target_email,
          audit.metadata ->> 'role' as target_role,
          audit.metadata ->> 'mode' as mode,
          audit.metadata ->> 'managerEmail' as manager_email,
          audit.metadata ->> 'note' as note,
          to_char(audit.created_at, 'YYYY-MM-DD HH24:MI') as created_at
        from public.audit_logs audit
        left join public.profiles actor on actor.id = audit.actor_profile_id
        where audit.entity_type = 'user_provisioning'
        order by audit.created_at desc
        limit 12
      `
    );

    return result.rows.map((row) => ({
      id: row.id,
      actorName: row.actor_name ?? "Unknown admin",
      action: row.action.replaceAll("_", " "),
      targetEmail: row.target_email ?? "Unknown email",
      targetRole: row.target_role ?? "unknown",
      mode: row.mode ?? "unknown",
      managerEmail: row.manager_email,
      note: row.note,
      createdAt: row.created_at
    }));
  } catch (error) {
    console.error("listProvisioningEvents failed:", error);
    return [];
  }
}
