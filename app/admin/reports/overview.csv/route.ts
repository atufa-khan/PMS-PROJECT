import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db/server";
import { toCsv } from "@/lib/reports/csv";

export async function GET() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const [flagMetrics, probationMetrics, approvalMetrics, cycles] = await Promise.all([
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
        from public.probation_cases
        where status in ('active', 'paused', 'extended')
      `
    ),
    dbQuery<{ total: number | string }>(
      `
        select count(*)::int as total
        from public.goals
        where status = 'pending_approval'
      `
    ),
    dbQuery<{
      name: string;
      cycle_type: string;
      close_date: string;
      enrollment_total: number | string;
      completed_total: number | string;
    }>(
      `
        select
          rc.name,
          rc.cycle_type::text,
          to_char(rc.close_date, 'YYYY-MM-DD') as close_date,
          count(ce.id)::int as enrollment_total,
          count(ce.id) filter (where ce.review_status in ('submitted', 'finalized'))::int as completed_total
        from public.review_cycles rc
        left join public.cycle_enrollments ce on ce.cycle_id = rc.id
        group by rc.id, rc.name, rc.cycle_type, rc.close_date
        order by rc.close_date asc
      `
    )
  ]);

  const rows: Array<Record<string, string | number>> = [
    {
      category: "metric",
      label: "open_flags",
      value: Number(flagMetrics.rows[0]?.total ?? 0),
      detail: `${Number(flagMetrics.rows[0]?.aging ?? 0)} aging`
    },
    {
      category: "metric",
      label: "active_probation_cases",
      value: Number(probationMetrics.rows[0]?.total ?? 0),
      detail: ""
    },
    {
      category: "metric",
      label: "pending_goal_approvals",
      value: Number(approvalMetrics.rows[0]?.total ?? 0),
      detail: ""
    },
    ...cycles.rows.map((cycle) => ({
      category: "review_cycle",
      label: cycle.name,
      value: `${Number(cycle.completed_total)}/${Number(cycle.enrollment_total)}`,
      detail: `${cycle.cycle_type} closes ${cycle.close_date}`
    }))
  ];

  return new NextResponse(toCsv(rows) || "category,label,value,detail\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pms-operational-overview.csv"'
    }
  });
}
