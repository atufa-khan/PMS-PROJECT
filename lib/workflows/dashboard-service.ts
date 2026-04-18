import type { AppSession } from "@/lib/auth/session";
import type {
  DashboardDetail,
  DashboardListItem,
  DashboardMetric
} from "@/lib/db/types";
import {
  dbQuery,
  isDbUnavailableFast,
  isExpectedTransientDbError
} from "@/lib/db/server";
import { deriveGoalRating } from "@/lib/workflows/goal-helpers";

type MetricRow = {
  value: number | string | null;
};

function emptyDetail(primaryTitle: string, secondaryTitle: string): DashboardDetail {
  return {
    primaryTitle,
    primaryDescription: "No records are available yet.",
    primaryItems: [],
    secondaryTitle,
    secondaryDescription: "No records are available yet.",
    secondaryItems: []
  };
}

function buildSummaryFallback(session: AppSession): DashboardMetric[] {
  if (session.role === "employee") {
    return [
      { label: "Personal goals", value: "0" },
      { label: "Goal completion", value: "0%", tone: "accent" },
      { label: "Next checkpoint", value: "Unavailable" },
      { label: "Self-feedback items", value: "0", tone: "warn" }
    ];
  }

  if (session.role === "manager") {
    return [
      { label: "Team goals", value: "0" },
      { label: "Team ratings", value: "0%", tone: "accent" },
      { label: "Pending approvals", value: "0", tone: "warn", href: "/goals/approvals" },
      { label: "Pending discussions", value: "0 upcoming" }
    ];
  }

  return [
    { label: "Open flags", value: "0", tone: "warn", detail: "0 aging flags" },
    { label: "Compliance", value: "0%", tone: "accent" },
    { label: "Pending approvals", value: "0", href: "/goals/approvals" },
    { label: "Active cycles", value: "0" }
  ];
}

function buildDetailFallback(session: AppSession): DashboardDetail {
  if (session.role === "employee") {
    return emptyDetail("Personal goals", "Feedback history and self-feedback");
  }

  if (session.role === "manager") {
    return emptyDetail("Team goals", "Ratings and pending approvals");
  }

  return emptyDetail("Org-level overview", "Flagged responses and compliance");
}

async function getAdminCatchUp(
  session: AppSession
): Promise<DashboardDetail["adminCatchUp"]> {
  if (session.role !== "admin") {
    return undefined;
  }

  const [ackResult, openFlags, escalatedFlags, activeCycles] = await Promise.all([
    dbQuery<{ acknowledged: boolean }>(
      `
        select exists (
          select 1
          from public.audit_logs
          where actor_profile_id = $1
            and entity_type = 'dashboard'
            and action = 'admin_catch_up_acknowledged'
        ) as acknowledged
      `,
      [session.userId]
    ),
    dbQuery<{
      total: number | string;
      aging: number | string;
    }>(
      `
        select
          count(*)::int as total,
          count(*) filter (
            where aged_at is not null
              and aged_at <= timezone('utc', now())
          )::int as aging
        from public.flags
        where status <> 'resolved'
      `
    ),
    dbQuery<{ total: number | string }>(
      `
        select count(*)::int as total
        from public.flags
        where status = 'escalated'
      `
    ),
    dbQuery<{
      id: string;
      name: string;
      completion_value: number | string;
      close_date: string;
    }>(
      `
        select
          rc.id,
          rc.name,
          case
            when count(ce.id) = 0 then 0
            else round(
              (
                count(*) filter (where ce.review_status in ('submitted', 'finalized'))::numeric
                / count(ce.id)::numeric
              ) * 100,
              0
            )
          end as completion_value,
          to_char(rc.close_date, 'YYYY-MM-DD') as close_date
        from public.review_cycles rc
        left join public.cycle_enrollments ce on ce.cycle_id = rc.id
        where rc.is_active = true
        group by rc.id, rc.name, rc.close_date
        order by rc.close_date asc
        limit 3
      `
    )
  ]);

  if (ackResult.rows[0]?.acknowledged) {
    return undefined;
  }

  const items: DashboardListItem[] = [
    {
      id: "catch-up-flags",
      title: "Open flags",
      subtitle: `${Number(openFlags.rows[0]?.total ?? 0)} unresolved responses`,
      detail: `${Number(openFlags.rows[0]?.aging ?? 0)} have already crossed their aging threshold.`,
      tone: "warn"
    },
    {
      id: "catch-up-escalations",
      title: "Pending escalations",
      subtitle: `${Number(escalatedFlags.rows[0]?.total ?? 0)} escalated cases`,
      detail: "Escalated flags need Admin attention before the queue can stabilize.",
      tone: Number(escalatedFlags.rows[0]?.total ?? 0) > 0 ? "warn" : "default"
    },
    ...activeCycles.rows.map((cycle) => ({
      id: `catch-up-cycle-${cycle.id}`,
      title: cycle.name,
      subtitle: `${Number(cycle.completion_value ?? 0)}% completion`,
      detail: `The current review window closes on ${cycle.close_date}.`
    }))
  ];

  return {
    title: "New admin catch-up briefing",
    description:
      "This briefing is shown until you acknowledge the current state of flags, escalations, and live review cycles.",
    items,
    canAcknowledge: true
  };
}

export async function getDashboardSummary(
  session: AppSession
): Promise<DashboardMetric[]> {
  if (isDbUnavailableFast()) {
    return buildSummaryFallback(session);
  }

  try {
    if (session.role === "employee") {
      const [goalCount, completion, probation, openFeedback] = await Promise.all([
        dbQuery<MetricRow>(
          `
            select count(*)::int as value
            from public.goals
            where owner_profile_id = $1
              and status in ('draft', 'pending_approval', 'active', 'completed')
          `,
          [session.userId]
        ),
        dbQuery<MetricRow>(
          `
            select round(avg(completion_pct), 0) as value
            from public.goals
            where owner_profile_id = $1
              and status in ('active', 'completed')
          `,
          [session.userId]
        ),
        dbQuery<{
          day_label: string | null;
          due_date: string | null;
        }>(
          `
            select
              concat('Day ', checkpoint_day) as day_label,
              to_char(due_date, 'YYYY-MM-DD') as due_date
            from public.probation_checkpoints pc
            join public.probation_cases pcase on pcase.id = pc.probation_case_id
            where pcase.employee_profile_id = $1
            order by due_date asc
            limit 1
          `,
          [session.userId]
        ),
        dbQuery<MetricRow>(
          `
            select count(*)::int as value
            from public.feedback_requests
            where recipient_profile_id = $1
              and submitted_at is null
          `,
          [session.userId]
        )
      ]);

      const nextCheckpoint = probation.rows[0];

      return [
        {
          label: "Personal goals",
          value: String(goalCount.rows[0]?.value ?? 0)
        },
        {
          label: "Goal completion",
          value: `${Number(completion.rows[0]?.value ?? 0)}%`,
          tone: "accent"
        },
        {
          label: "Next checkpoint",
          value: nextCheckpoint?.day_label
            ? `${nextCheckpoint.day_label} due ${nextCheckpoint.due_date}`
            : "No checkpoint scheduled"
        },
        {
          label: "Self-feedback items",
          value: String(openFeedback.rows[0]?.value ?? 0),
          tone: "warn"
        }
      ];
    }

    if (session.role === "manager") {
      const [pendingApprovals, teamCompletion, teamGoals, discussions] =
        await Promise.all([
          dbQuery<MetricRow>(
            `
              select count(*)::int as value
              from public.goals g
              where g.status = 'pending_approval'
                and exists (
                  select 1
                  from public.employee_records er
                  where er.profile_id = g.owner_profile_id
                    and er.manager_profile_id = $1
                )
            `,
            [session.userId]
          ),
          dbQuery<MetricRow>(
            `
              select round(avg(g.completion_pct), 0) as value
              from public.goals g
              where exists (
                select 1
                from public.employee_records er
                where er.profile_id = g.owner_profile_id
                  and er.manager_profile_id = $1
              )
                and g.status in ('active', 'completed')
            `,
            [session.userId]
          ),
          dbQuery<MetricRow>(
            `
              select count(*)::int as value
              from public.goals g
              where g.scope in ('team', 'individual')
                and (
                  g.owner_profile_id = $1
                  or exists (
                    select 1
                    from public.employee_records er
                    where er.profile_id = g.owner_profile_id
                      and er.manager_profile_id = $1
                  )
                )
            `,
            [session.userId]
          ),
          dbQuery<MetricRow>(
            `
              select count(*)::int as value
              from public.cycle_enrollments
              where acting_reviewer_profile_id = $1
                and discussion_status = 'scheduled'
            `,
            [session.userId]
          )
        ]);

      return [
        {
          label: "Team goals",
          value: String(teamGoals.rows[0]?.value ?? 0)
        },
        {
          label: "Team ratings",
          value: `${Number(teamCompletion.rows[0]?.value ?? 0)}%`,
          tone: "accent"
        },
        {
          label: "Pending approvals",
          value: String(pendingApprovals.rows[0]?.value ?? 0),
          tone: "warn",
          href: "/goals/approvals"
        },
        {
          label: "Pending discussions",
          value: `${Number(discussions.rows[0]?.value ?? 0)} upcoming`
        }
      ];
    }

    const [openFlags, compliance, approvals, cycles] = await Promise.all([
      dbQuery<{
        total: number | string;
        aging: number | string;
      }>(
        `
          select
            count(*)::int as total,
            count(*) filter (
              where aged_at is not null
                and aged_at <= timezone('utc', now())
            )::int as aging
          from public.flags
          where status <> 'resolved'
        `
      ),
      dbQuery<MetricRow>(
        `
          select
            case
              when count(*) = 0 then 0
              else round((count(*) filter (where submitted_at is not null)::numeric / count(*)::numeric) * 100, 0)
            end as value
          from public.feedback_requests
        `
      ),
      dbQuery<MetricRow>(
        `
          select count(*)::int as value
          from public.goals
          where status = 'pending_approval'
        `
      ),
      dbQuery<MetricRow>(
        `
          select count(*)::int as value
          from public.review_cycles
          where is_active = true
        `
      )
    ]);

    return [
      {
        label: "Open flags",
        value: String(openFlags.rows[0]?.total ?? 0),
        tone: "warn",
        detail: `${Number(openFlags.rows[0]?.aging ?? 0)} aging flags`
      },
      {
        label: "Compliance",
        value: `${Number(compliance.rows[0]?.value ?? 0)}%`,
        tone: "accent"
      },
      {
        label: "Pending approvals",
        value: String(approvals.rows[0]?.value ?? 0),
        href: "/goals/approvals"
      },
      {
        label: "Active cycles",
        value: String(cycles.rows[0]?.value ?? 0)
      }
    ];
  } catch (error) {
    if (!isExpectedTransientDbError(error)) {
      console.error("getDashboardSummary failed:", error);
    }

    return buildSummaryFallback(session);
  }
}

export async function getDashboardDetail(
  session: AppSession
): Promise<DashboardDetail> {
  if (isDbUnavailableFast()) {
    return buildDetailFallback(session);
  }

  try {
    if (session.role === "employee") {
      const [goals, feedbackHistory, selfFeedback] = await Promise.all([
        dbQuery<{
          id: string;
          title: string;
          status: string;
          weightage: number | string;
          completion_pct: number | string;
        }>(
          `
            select id, title, status::text, weightage, completion_pct
            from public.goals
            where owner_profile_id = $1
            order by updated_at desc
            limit 6
          `,
          [session.userId]
        ),
        dbQuery<{
          id: string;
          submission_role: string;
          overall_rating: string | null;
          cycle_name: string;
          created_at: string;
        }>(
          `
            select
              rs.id,
              rs.submission_role::text,
              rs.overall_rating,
              rc.name as cycle_name,
              to_char(rs.created_at, 'YYYY-MM-DD') as created_at
            from public.review_submissions rs
            join public.cycle_enrollments ce on ce.id = rs.cycle_enrollment_id
            join public.review_cycles rc on rc.id = ce.cycle_id
            where ce.employee_profile_id = $1
            order by rs.updated_at desc
            limit 6
          `,
          [session.userId]
        ),
        dbQuery<{
          id: string;
          item_title: string;
          due_at: string;
          workflow_label: string;
        }>(
          `
            select
              fr.id,
              case
                when fr.checkpoint_id is not null then concat('Probation feedback due for Day ', pc.checkpoint_day)
                else concat('Review feedback due for ', rc.name)
              end as item_title,
              to_char(fr.due_at, 'YYYY-MM-DD HH24:MI') as due_at,
              case
                when fr.checkpoint_id is not null then 'Probation'
                else 'Review'
              end as workflow_label
            from public.feedback_requests fr
            left join public.probation_checkpoints pc on pc.id = fr.checkpoint_id
            left join public.cycle_enrollments ce on ce.id = fr.cycle_enrollment_id
            left join public.review_cycles rc on rc.id = ce.cycle_id
            where fr.recipient_profile_id = $1
              and fr.submitted_at is null
            order by fr.due_at asc
            limit 6
          `,
          [session.userId]
        )
      ]);

      return {
        primaryTitle: "Personal goals",
        primaryDescription: "Your goals, their approval state, and current delivery progress.",
        primaryItems: goals.rows.map((goal) => ({
          id: goal.id,
          title: goal.title,
          subtitle: `${goal.status.replaceAll("_", " ")} • ${Number(goal.weightage)}% weightage`,
          detail: `${Number(goal.completion_pct)}% complete • ${deriveGoalRating(Number(goal.completion_pct))}`
        })),
        secondaryTitle: "Feedback history and self-feedback",
        secondaryDescription:
          "Recent review feedback plus any self-feedback items still waiting on you.",
        secondaryItems: [
          ...selfFeedback.rows.map((item) => ({
            id: item.id,
            title: item.item_title,
            subtitle: `${item.workflow_label} task`,
            detail: `Due ${item.due_at}`,
            tone: "warn" as const
          })),
          ...feedbackHistory.rows.map((item) => ({
            id: item.id,
            title: `${item.cycle_name} • ${item.submission_role} feedback`,
            subtitle: item.overall_rating ?? "No rating recorded",
            detail: `Submitted ${item.created_at}`
          }))
        ].slice(0, 6)
      };
    }

    if (session.role === "manager") {
      const [teamGoals, ratingSnapshot, pendingApprovals] = await Promise.all([
        dbQuery<{
          id: string;
          title: string;
          owner_name: string;
          status: string;
          completion_pct: number | string;
        }>(
          `
            select
              g.id,
              g.title,
              p.full_name as owner_name,
              g.status::text,
              g.completion_pct
            from public.goals g
            join public.profiles p on p.id = g.owner_profile_id
            where g.scope in ('team', 'individual')
              and (
                g.owner_profile_id = $1
                or exists (
                  select 1
                  from public.employee_records er
                  where er.profile_id = g.owner_profile_id
                    and er.manager_profile_id = $1
                )
              )
            order by g.updated_at desc
            limit 6
          `,
          [session.userId]
        ),
        dbQuery<{
          id: string;
          employee_name: string;
          avg_completion: number | string;
          latest_rating: string | null;
        }>(
          `
            select
              employee.id,
              employee.full_name as employee_name,
              coalesce(round(avg(g.completion_pct), 0), 0) as avg_completion,
              (
                select rs.overall_rating
                from public.review_submissions rs
                join public.cycle_enrollments ce on ce.id = rs.cycle_enrollment_id
                where ce.employee_profile_id = employee.id
                  and rs.submission_role = 'manager'
                order by rs.updated_at desc
                limit 1
              ) as latest_rating
            from public.employee_records er
            join public.profiles employee on employee.id = er.profile_id
            left join public.goals g
              on g.owner_profile_id = employee.id
             and g.status in ('active', 'completed')
            where er.manager_profile_id = $1
            group by employee.id, employee.full_name
            order by employee.full_name asc
            limit 6
          `,
          [session.userId]
        ),
        dbQuery<{
          id: string;
          title: string;
          requester_name: string;
          created_at: string;
        }>(
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
              g.id,
              g.title,
              p.full_name as requester_name,
              to_char(ls.created_at, 'YYYY-MM-DD') as created_at
            from public.goals g
            join public.profiles p on p.id = g.owner_profile_id
            left join latest_submit ls on ls.goal_id = g.id
            where g.status = 'pending_approval'
              and exists (
                select 1
                from public.employee_records er
                where er.profile_id = g.owner_profile_id
                  and er.manager_profile_id = $1
              )
            order by ls.created_at desc nulls last, g.updated_at desc
            limit 6
          `,
          [session.userId]
        )
      ]);

      return {
        primaryTitle: "Team goals",
        primaryDescription: "Goals currently owned by you or your direct reports.",
        primaryItems: teamGoals.rows.map((goal) => ({
          id: goal.id,
          title: goal.title,
          subtitle: `${goal.owner_name} • ${goal.status.replaceAll("_", " ")}`,
          detail: `${Number(goal.completion_pct)}% complete • ${deriveGoalRating(Number(goal.completion_pct))}`
        })),
        secondaryTitle: "Ratings and pending approvals",
        secondaryDescription:
          "Latest team performance signals alongside approvals waiting on you.",
        secondaryItems: [
          ...pendingApprovals.rows.map((item) => ({
            id: item.id,
            title: item.title,
            subtitle: `Pending approval from ${item.requester_name}`,
            detail: `Submitted ${item.created_at}`,
            tone: "warn" as const,
            href: "/goals/approvals"
          })),
          ...ratingSnapshot.rows.map((item) => ({
            id: item.id,
            title: item.employee_name,
            subtitle: item.latest_rating ?? "No manager rating yet",
            detail: `${Number(item.avg_completion)}% average goal completion`
          }))
        ].slice(0, 6)
      };
    }

    const [orgOverview, flaggedResponses, compliance, adminCatchUp] = await Promise.all([
      dbQuery<{
        id: string;
        title: string;
        value: number | string;
        detail: string;
      }>(
        `
          select *
          from (
            values
              ('company_goals', 'Company goals', (select count(*)::int from public.goals where scope = 'company' and status <> 'archived'), 'Live company-level goals'),
              ('team_goals', 'Team goals', (select count(*)::int from public.goals where scope = 'team' and status <> 'archived'), 'Active structure below company goals'),
              ('individual_goals', 'Individual goals', (select count(*)::int from public.goals where scope = 'individual' and status <> 'archived'), 'Employee-owned goals'),
              ('pending_approvals', 'Pending approvals', (select count(*)::int from public.goals where status = 'pending_approval'), 'Goals waiting on manager/admin review')
          ) as overview(id, title, value, detail)
        `
      ),
      dbQuery<{
        id: string;
        employee_name: string;
        severity: string;
        reason: string;
      }>(
        `
          select
            f.id,
            subject.full_name as employee_name,
            f.severity::text,
            f.reason
          from public.flags f
          left join public.feedback_submissions fs on fs.id = f.feedback_submission_id
          left join public.profiles subject on subject.id = fs.subject_profile_id
          where f.status <> 'resolved'
          order by f.created_at desc
          limit 6
        `
      ),
      dbQuery<{
        id: string;
        title: string;
        value: number | string;
        detail: string;
      }>(
        `
          select *
          from (
            values
              ('feedback_compliance', 'Feedback compliance', (
                select case
                  when count(*) = 0 then 0
                  else round((count(*) filter (where submitted_at is not null)::numeric / count(*)::numeric) * 100, 0)
                end
                from public.feedback_requests
              ), 'Overall submission completion'),
              ('probation_cases', 'Probation coverage', (
                select count(*)::int
                from public.probation_cases
                where status in ('active', 'paused', 'extended')
              ), 'Probation cases still active'),
              ('active_cycles', 'Active review cycles', (
                select count(*)::int
                from public.review_cycles
                where is_active = true
              ), 'Cycles currently open'),
              ('open_flags', 'Open flagged responses', (
                select count(*)::int
                from public.flags
                where status <> 'resolved'
              ), 'Responses needing admin attention')
          ) as compliance(id, title, value, detail)
        `
      ),
      getAdminCatchUp(session)
    ]);

    return {
      primaryTitle: "Org-level overview",
      primaryDescription: "Current structure, goal volume, and approval pressure across the platform.",
      primaryItems: orgOverview.rows.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: String(item.value),
        detail: item.detail,
        href: item.id === "pending_approvals" ? "/goals/approvals" : undefined
      })),
      secondaryTitle: "Flagged responses and compliance",
      secondaryDescription:
        "Open flagged responses plus the main compliance signals for admins.",
      secondaryItems: [
        ...flaggedResponses.rows.map((item) => ({
          id: item.id,
          title: item.employee_name ?? "Unknown employee",
          subtitle: `${item.severity} severity`,
          detail: item.reason,
          tone: "warn" as const
        })),
        ...compliance.rows.map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: String(item.value),
          detail: item.detail
        }))
      ].slice(0, 8),
      adminCatchUp
    };
  } catch (error) {
    if (!isExpectedTransientDbError(error)) {
      console.error("getDashboardDetail failed:", error);
    }

    return buildDetailFallback(session);
  }
}
