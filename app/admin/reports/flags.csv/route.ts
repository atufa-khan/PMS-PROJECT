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
    severity: string;
    status: string;
    reason: string;
    is_repeat_flag: boolean;
    created_at: string;
    last_action: string | null;
  }>(
    `
      select
        subject.full_name as employee_name,
        f.severity::text as severity,
        f.status::text as status,
        f.reason,
        f.is_repeat_flag,
        to_char(f.created_at, 'YYYY-MM-DD') as created_at,
        latest_action.action_type as last_action
      from public.flags f
      left join public.feedback_submissions fs on fs.id = f.feedback_submission_id
      left join public.profiles subject on subject.id = fs.subject_profile_id
      left join lateral (
        select action_type
        from public.flag_actions fa
        where fa.flag_id = f.id
        order by fa.created_at desc
        limit 1
      ) latest_action on true
      order by f.created_at desc
    `
  );

  const rows = result.rows.map((row) => ({
    employee_name: row.employee_name ?? "Unknown employee",
    severity: row.severity,
    status: row.status,
    reason: row.reason,
    is_repeat_flag: row.is_repeat_flag,
    created_at: row.created_at,
    last_action: row.last_action ?? ""
  }));

  return new NextResponse(
    toCsv(rows) ||
      "employee_name,severity,status,reason,is_repeat_flag,created_at,last_action\n",
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="pms-flags-report.csv"'
      }
    }
  );
}
