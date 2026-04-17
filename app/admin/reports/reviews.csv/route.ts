import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db/server";
import { toCsv } from "@/lib/reports/csv";

export async function GET() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const result = await dbQuery<{
    cycle_name: string;
    cycle_type: string;
    employee_name: string | null;
    reviewer_name: string | null;
    close_date: string;
    review_status: string;
    discussion_status: string;
    employee_submission: boolean;
    manager_submission: boolean;
    self_rating: string | null;
    manager_rating: string | null;
  }>(
    `
      select
        rc.name as cycle_name,
        rc.cycle_type::text as cycle_type,
        employee.full_name as employee_name,
        reviewer.full_name as reviewer_name,
        to_char(rc.close_date, 'YYYY-MM-DD') as close_date,
        ce.review_status::text as review_status,
        ce.discussion_status::text as discussion_status,
        (self_review.id is not null) as employee_submission,
        (manager_review.id is not null) as manager_submission,
        self_review.overall_rating as self_rating,
        manager_review.overall_rating as manager_rating
      from public.cycle_enrollments ce
      join public.review_cycles rc on rc.id = ce.cycle_id
      join public.profiles employee on employee.id = ce.employee_profile_id
      left join public.profiles reviewer on reviewer.id = ce.acting_reviewer_profile_id
      left join public.review_submissions self_review
        on self_review.cycle_enrollment_id = ce.id
       and self_review.submission_role = 'employee'
      left join public.review_submissions manager_review
        on manager_review.cycle_enrollment_id = ce.id
       and manager_review.submission_role = 'manager'
      order by rc.close_date desc, employee.full_name asc
    `
  );

  const rows = result.rows.map((row) => ({
    cycle_name: row.cycle_name,
    cycle_type: row.cycle_type,
    employee_name: row.employee_name ?? "Unknown employee",
    reviewer_name: row.reviewer_name ?? "Unassigned",
    close_date: row.close_date,
    review_status: row.review_status,
    discussion_status: row.discussion_status,
    employee_submission: row.employee_submission,
    manager_submission: row.manager_submission,
    self_rating: row.self_rating ?? "",
    manager_rating: row.manager_rating ?? ""
  }));

  return new NextResponse(
    toCsv(rows) ||
      "cycle_name,cycle_type,employee_name,reviewer_name,close_date,review_status,discussion_status,employee_submission,manager_submission,self_rating,manager_rating\n",
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="pms-reviews-report.csv"'
      }
    }
  );
}
