import type { AppSession } from "@/lib/auth/session";
import { getDashboardMetrics } from "@/lib/demo-data";
import { dbQuery } from "@/lib/db/server";

type MetricRow = {
  value: number | string | null;
};

export async function getDashboardSummary(session: AppSession) {
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
          label: "Active goals",
          value: String(goalCount.rows[0]?.value ?? 0)
        },
        {
          label: "Goal completion",
          value: `${Number(completion.rows[0]?.value ?? 0)}%`,
          tone: "accent" as const
        },
        {
          label: "Probation checkpoint",
          value: nextCheckpoint?.day_label
            ? `${nextCheckpoint.day_label} due ${nextCheckpoint.due_date}`
            : "No checkpoint scheduled"
        },
        {
          label: "Open feedback items",
          value: String(openFeedback.rows[0]?.value ?? 0),
          tone: "warn" as const
        }
      ];
    }

    if (session.role === "manager") {
      const [pendingApprovals, teamCompletion, overdueForms, discussions] =
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
              from public.feedback_requests fr
              join public.probation_checkpoints pc on pc.id = fr.checkpoint_id
              join public.probation_cases pcase on pcase.id = pc.probation_case_id
              where pcase.manager_profile_id = $1
                and fr.submitted_at is null
                and fr.due_at < timezone('utc', now())
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
          label: "Pending approvals",
          value: String(pendingApprovals.rows[0]?.value ?? 0),
          tone: "warn" as const
        },
        {
          label: "Team completion",
          value: `${Number(teamCompletion.rows[0]?.value ?? 0)}%`,
          tone: "accent" as const
        },
        {
          label: "Overdue forms",
          value: String(overdueForms.rows[0]?.value ?? 0)
        },
        {
          label: "Discussion slots",
          value: `${Number(discussions.rows[0]?.value ?? 0)} upcoming`
        }
      ];
    }

    const [compliance, openFlags, probationCases, approvalSla] = await Promise.all([
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
          select count(*)::int as value
          from public.probation_cases
          where status in ('active', 'paused', 'extended')
        `
      ),
      dbQuery<MetricRow>(
        `
          with latest_submit as (
            select distinct on (goal_id)
              goal_id,
              created_at
            from public.goal_approval_events
            where event_type in ('submit', 'resubmit')
            order by goal_id, created_at desc
          )
          select round(avg(extract(day from timezone('utc', now()) - created_at)), 1) as value
          from latest_submit
        `
      )
    ]);

    return [
      {
        label: "Submission compliance",
        value: `${Number(compliance.rows[0]?.value ?? 0)}%`,
        tone: "accent" as const
      },
      {
        label: "Open flags",
        value: String(openFlags.rows[0]?.total ?? 0),
        tone: "warn" as const,
        detail: `${Number(openFlags.rows[0]?.aging ?? 0)} aging flags`
      },
      {
        label: "Probation cases",
        value: `${Number(probationCases.rows[0]?.value ?? 0)} active`
      },
      {
        label: "Goal approval SLA",
        value: `${Number(approvalSla.rows[0]?.value ?? 0)} days`
      }
    ];
  } catch (error) {
    console.error("getDashboardSummary failed, falling back to demo data:", error);
    return getDashboardMetrics(session.role);
  }
}
