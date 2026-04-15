import { addWorkingDays, formatDate } from "@/lib/dates/working-days";
import type { AppSession } from "@/lib/auth/session";
import { getProbationCheckpoints } from "@/lib/demo-data";
import { dbQuery } from "@/lib/db/server";

type ProbationRow = {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  checkpoint_day: number;
  due_date: string;
  status: string;
  waiting_on: string | null;
  manager_context_note: string | null;
};

function buildProbationFilter(role: AppSession["role"]) {
  if (role === "admin") {
    return "true";
  }

  if (role === "manager") {
    return "pcase.manager_profile_id = $1";
  }

  return "pcase.employee_profile_id = $1";
}

export async function listProbationCheckpoints(
  session: AppSession
) {
  try {
    const result = await dbQuery<ProbationRow>(
      `
        select
          pc.id,
          p.id as employee_id,
          p.full_name as employee_name,
          pc.checkpoint_day,
          to_char(pc.due_date, 'YYYY-MM-DD') as due_date,
          pc.status,
          pc.waiting_on::text as waiting_on,
          pc.manager_context_note
        from public.probation_checkpoints pc
        join public.probation_cases pcase on pcase.id = pc.probation_case_id
        join public.profiles p on p.id = pcase.employee_profile_id
        where ${buildProbationFilter(session.role)}
        order by pc.due_date asc, pc.checkpoint_day asc
        limit 25
      `,
      [session.userId]
    );

    return result.rows.map((row: ProbationRow) => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name ?? "Unknown employee",
      dayLabel: `Day ${row.checkpoint_day}`,
      dueDate: row.due_date,
      status: row.status.replaceAll("_", " "),
      waitingOn:
        row.manager_context_note ??
        (row.waiting_on
          ? `${row.waiting_on.charAt(0).toUpperCase()}${row.waiting_on.slice(1)} feedback`
          : "Admin review")
    }));
  } catch (error) {
    console.error(
      "listProbationCheckpoints failed, falling back to demo data:",
      error
    );
    return getProbationCheckpoints();
  }
}

export function calculateCheckpointDate(doj: Date, checkpointWorkingDay: number) {
  return formatDate(addWorkingDays(doj, checkpointWorkingDay));
}
