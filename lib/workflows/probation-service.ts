import { addWorkingDays, formatDate } from "@/lib/dates/working-days";
import type { AppSession } from "@/lib/auth/session";
import { dbQuery, isExpectedTransientDbError } from "@/lib/db/server";
import type { ProbationCaseRecord, ProbationCheckpointRecord } from "@/lib/db/types";

type ProbationRow = {
  id: string;
  case_id: string;
  employee_id: string | null;
  employee_name: string | null;
  manager_name: string | null;
  checkpoint_day: number;
  due_date: string;
  status: string;
  waiting_on: string | null;
  manager_context_note: string | null;
  employee_submitted: boolean;
  manager_submitted: boolean;
  my_request_id: string | null;
  my_request_role: "employee" | "manager" | null;
};

type ProbationCaseRow = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  manager_name: string | null;
  status: string;
  discussion_status: string;
  discussion_at: string | null;
  admin_briefing_note: string | null;
  pending_checkpoints: number | string;
  latest_decision: string | null;
  latest_decision_date: string | null;
  missing_manager: boolean;
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
): Promise<ProbationCheckpointRecord[]> {
  try {
    const result = await dbQuery<ProbationRow>(
      `
        select
          pc.id,
          pcase.id as case_id,
          p.id as employee_id,
          p.full_name as employee_name,
          mgr.full_name as manager_name,
          pc.checkpoint_day,
          to_char(pc.due_date, 'YYYY-MM-DD') as due_date,
          pc.status,
          pc.waiting_on::text as waiting_on,
          pc.manager_context_note,
          coalesce(bool_or(fr.recipient_role = 'employee' and fr.submitted_at is not null), false) as employee_submitted,
          coalesce(bool_or(fr.recipient_role = 'manager' and fr.submitted_at is not null), false) as manager_submitted,
          max(case when fr.recipient_profile_id = $1 and fr.submitted_at is null then fr.id::text end) as my_request_id,
          max(case when fr.recipient_profile_id = $1 and fr.submitted_at is null then fr.recipient_role::text end)::text as my_request_role
        from public.probation_checkpoints pc
        join public.probation_cases pcase on pcase.id = pc.probation_case_id
        join public.profiles p on p.id = pcase.employee_profile_id
        left join public.profiles mgr on mgr.id = pcase.manager_profile_id
        left join public.feedback_requests fr on fr.checkpoint_id = pc.id
        where ${buildProbationFilter(session.role)}
        group by
          pc.id,
          pcase.id,
          p.id,
          p.full_name,
          mgr.full_name,
          pc.checkpoint_day,
          pc.due_date,
          pc.status,
          pc.waiting_on,
          pc.manager_context_note
        order by pc.due_date asc, pc.checkpoint_day asc
        limit 25
      `,
      [session.userId]
    );

    return result.rows.map((row: ProbationRow) => ({
      id: row.id,
      caseId: row.case_id,
      employeeId: row.employee_id,
      employeeName: row.employee_name ?? "Unknown employee",
      managerName: row.manager_name,
      dayLabel: `Day ${row.checkpoint_day}`,
      dueDate: row.due_date,
      status: row.status.replaceAll("_", " "),
      waitingOn:
        row.manager_context_note ??
        (row.waiting_on
          ? `${row.waiting_on.charAt(0).toUpperCase()}${row.waiting_on.slice(1)} feedback`
          : "Admin review")
      ,
      employeeSubmitted: row.employee_submitted,
      managerSubmitted: row.manager_submitted,
      canSubmitFeedback: Boolean(row.my_request_id),
      myPendingRequestId: row.my_request_id,
      pendingRole: row.my_request_role
    }));
  } catch (error) {
    if (!isExpectedTransientDbError(error)) {
      console.error("listProbationCheckpoints failed:", error);
    }

    return [];
  }
}

export async function listProbationCasesForAdmin(): Promise<ProbationCaseRecord[]> {
  try {
    const result = await dbQuery<ProbationCaseRow>(
      `
        select
          pcase.id,
          employee.id as employee_id,
          employee.full_name as employee_name,
          manager.full_name as manager_name,
          pcase.status,
          pcase.confirmation_discussion_status::text as discussion_status,
          to_char(pcase.confirmation_discussion_at, 'YYYY-MM-DD"T"HH24:MI') as discussion_at,
          pcase.admin_briefing_note,
          count(pc.id) filter (where pc.status <> 'completed')::int as pending_checkpoints,
          latest_decision.decision::text as latest_decision,
          to_char(latest_decision.effective_on, 'YYYY-MM-DD') as latest_decision_date,
          (pcase.manager_profile_id is null) as missing_manager
        from public.probation_cases pcase
        join public.profiles employee on employee.id = pcase.employee_profile_id
        left join public.profiles manager on manager.id = pcase.manager_profile_id
        left join public.probation_checkpoints pc on pc.probation_case_id = pcase.id
        left join lateral (
          select decision, effective_on
          from public.probation_decisions pd
          where pd.probation_case_id = pcase.id
          order by pd.created_at desc
          limit 1
        ) latest_decision on true
        group by
          pcase.id,
          employee.id,
          employee.full_name,
          manager.full_name,
          pcase.status,
          pcase.confirmation_discussion_status,
          pcase.confirmation_discussion_at,
          pcase.admin_briefing_note,
          latest_decision.decision,
          latest_decision.effective_on,
          pcase.manager_profile_id
        order by employee.full_name asc
      `
    );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name ?? "Unknown employee",
      managerName: row.manager_name ?? "Unassigned",
      status: row.status.replaceAll("_", " "),
      discussionStatus: row.discussion_status.replaceAll("_", " "),
      discussionAt: row.discussion_at ?? "Not scheduled",
      adminBriefingNote: row.admin_briefing_note ?? "No admin briefing note yet.",
      pendingCheckpoints: Number(row.pending_checkpoints),
      latestDecision: row.latest_decision?.replaceAll("_", " "),
      latestDecisionDate: row.latest_decision_date ?? undefined,
      missingManager: row.missing_manager
    }));
  } catch (error) {
    if (!isExpectedTransientDbError(error)) {
      console.error("listProbationCasesForAdmin failed:", error);
    }

    return [];
  }
}

export async function listAssignableManagers() {
  try {
    const result = await dbQuery<{ email: string; full_name: string }>(
      `
        select distinct p.email, p.full_name
        from public.profiles p
        join public.user_roles ur on ur.profile_id = p.id
        where ur.role = 'manager'
          and p.is_active = true
        order by p.full_name asc
      `
    );

    return result.rows;
  } catch (error) {
    if (!isExpectedTransientDbError(error)) {
      console.error("listAssignableManagers failed:", error);
    }

    return [];
  }
}

export function calculateCheckpointDate(doj: Date, checkpointWorkingDay: number) {
  return formatDate(addWorkingDays(doj, checkpointWorkingDay));
}
