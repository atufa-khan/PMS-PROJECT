import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db/server";
import { toCsv } from "@/lib/reports/csv";

export async function GET() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const result = await dbQuery<{
    employee_name: string | null;
    manager_name: string | null;
    case_status: string;
    checkpoint_day: number;
    checkpoint_status: string;
    waiting_on: string | null;
    due_date: string;
    employee_submitted: boolean;
    manager_submitted: boolean;
    latest_decision: string | null;
    discussion_status: string;
  }>(
    `
      select
        employee.full_name as employee_name,
        manager.full_name as manager_name,
        pcase.status::text as case_status,
        checkpoint.checkpoint_day,
        checkpoint.status as checkpoint_status,
        checkpoint.waiting_on::text as waiting_on,
        to_char(checkpoint.due_date, 'YYYY-MM-DD') as due_date,
        coalesce(bool_or(fr.recipient_role = 'employee' and fr.submitted_at is not null), false) as employee_submitted,
        coalesce(bool_or(fr.recipient_role = 'manager' and fr.submitted_at is not null), false) as manager_submitted,
        latest_decision.decision::text as latest_decision,
        pcase.confirmation_discussion_status::text as discussion_status
      from public.probation_cases pcase
      join public.profiles employee on employee.id = pcase.employee_profile_id
      left join public.profiles manager on manager.id = pcase.manager_profile_id
      left join public.probation_checkpoints checkpoint on checkpoint.probation_case_id = pcase.id
      left join public.feedback_requests fr on fr.checkpoint_id = checkpoint.id
      left join lateral (
        select decision
        from public.probation_decisions pd
        where pd.probation_case_id = pcase.id
        order by pd.created_at desc
        limit 1
      ) latest_decision on true
      group by
        employee.full_name,
        manager.full_name,
        pcase.status,
        checkpoint.checkpoint_day,
        checkpoint.status,
        checkpoint.waiting_on,
        checkpoint.due_date,
        latest_decision.decision,
        pcase.confirmation_discussion_status
      order by employee.full_name asc, checkpoint.checkpoint_day asc
    `
  );

  const rows = result.rows.map((row) => ({
    employee_name: row.employee_name ?? "Unknown employee",
    manager_name: row.manager_name ?? "Unassigned",
    case_status: row.case_status,
    checkpoint_day: row.checkpoint_day,
    checkpoint_status: row.checkpoint_status,
    waiting_on: row.waiting_on ?? "",
    due_date: row.due_date,
    employee_submitted: row.employee_submitted,
    manager_submitted: row.manager_submitted,
    latest_decision: row.latest_decision ?? "",
    discussion_status: row.discussion_status
  }));

  return new NextResponse(
    toCsv(rows) ||
      "employee_name,manager_name,case_status,checkpoint_day,checkpoint_status,waiting_on,due_date,employee_submitted,manager_submitted,latest_decision,discussion_status\n",
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="pms-probation-report.csv"'
      }
    }
  );
}
