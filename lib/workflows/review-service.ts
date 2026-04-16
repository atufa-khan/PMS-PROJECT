import type { AppSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db/server";
import type { ReviewCycleRecord, ReviewEnrollmentRecord } from "@/lib/db/types";

type CycleRow = {
  id: string;
  name: string;
  cycle_type: "biannual" | "quarterly";
  window_label: string;
  close_date: string;
  is_active: boolean;
  enrollment_count: number | string;
  completed_count: number | string;
  my_status: string | null;
};

type CycleDetailRow = {
  id: string;
  name: string;
  cycle_type: "biannual" | "quarterly";
  window_label: string;
  close_date: string;
  is_active: boolean;
};

type EnrollmentRow = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  discussion_status: string;
  discussion_date: string | null;
  review_status: string;
  eligibility_note: string | null;
  self_rating: string | null;
  self_summary: string | null;
  manager_rating: string | null;
  manager_summary: string | null;
  goal_count: number | string;
  has_employee_submission: boolean;
  has_manager_submission: boolean;
  is_self: boolean;
  is_reviewer: boolean;
  is_line_manager: boolean;
};

function buildCycleVisibility(role: AppSession["role"], userParam: string) {
  if (role === "admin") {
    return "true";
  }

  if (role === "manager") {
    return `
      exists (
        select 1
        from public.cycle_enrollments ce
        left join public.employee_records er on er.profile_id = ce.employee_profile_id
        where ce.cycle_id = rc.id
          and (
            ce.employee_profile_id = ${userParam}
            or ce.acting_reviewer_profile_id = ${userParam}
            or er.manager_profile_id = ${userParam}
          )
      )
    `;
  }

  return `
    exists (
      select 1
      from public.cycle_enrollments ce
      where ce.cycle_id = rc.id
        and ce.employee_profile_id = ${userParam}
    )
  `;
}

function buildEnrollmentVisibility(
  role: AppSession["role"],
  userParam: string
) {
  if (role === "admin") {
    return "true";
  }

  if (role === "manager") {
    return `
      ce.employee_profile_id = ${userParam}
      or ce.acting_reviewer_profile_id = ${userParam}
      or exists (
        select 1
        from public.employee_records er
        where er.profile_id = ce.employee_profile_id
          and er.manager_profile_id = ${userParam}
      )
    `;
  }

  return `ce.employee_profile_id = ${userParam}`;
}

export async function listReviewCycles(
  session: AppSession
): Promise<ReviewCycleRecord[]> {
  try {
    const result = await dbQuery<CycleRow>(
      `
        select
          rc.id,
          rc.name,
          rc.cycle_type,
          concat(to_char(rc.period_start, 'Mon DD'), ' to ', to_char(rc.period_end, 'Mon DD')) as window_label,
          to_char(rc.close_date, 'YYYY-MM-DD') as close_date,
          rc.is_active,
          (
            select count(*)::int
            from public.cycle_enrollments ce
            where ce.cycle_id = rc.id
              and ${buildEnrollmentVisibility(session.role, "$1")}
          ) as enrollment_count,
          (
            select count(*)::int
            from public.cycle_enrollments ce
            where ce.cycle_id = rc.id
              and ${buildEnrollmentVisibility(session.role, "$1")}
              and ce.review_status in ('submitted', 'finalized')
          ) as completed_count,
          (
            select ce.review_status::text
            from public.cycle_enrollments ce
            where ce.cycle_id = rc.id
              and ce.employee_profile_id = $1
            limit 1
          ) as my_status
        from public.review_cycles rc
        where ${buildCycleVisibility(session.role, "$1")}
        order by rc.close_date asc, rc.name asc
      `,
      [session.userId]
    );

    return result.rows.map((row) => {
      const enrollmentCount = Number(row.enrollment_count);
      const completedCount = Number(row.completed_count);
      const myStatus = row.my_status?.replaceAll("_", " ") ?? "Not enrolled";

      return {
        id: row.id,
        name: row.name,
        cycleType: row.cycle_type,
        windowLabel: row.window_label,
        closeDate: row.close_date,
        isActive: row.is_active,
        enrollmentCount,
        completedCount,
        myStatus,
        actionRequired:
          session.role === "employee"
            ? myStatus !== "submitted" && myStatus !== "finalized" && myStatus !== "waived"
            : row.is_active && completedCount < enrollmentCount
      };
    });
  } catch (error) {
    console.error("listReviewCycles failed:", error);
    return [];
  }
}

export async function getReviewCycleDetail(
  session: AppSession,
  cycleId: string
): Promise<{
  cycle: ReviewCycleRecord | null;
  enrollments: ReviewEnrollmentRecord[];
}> {
  try {
    const cycleResult = await dbQuery<CycleDetailRow>(
      `
        select
          rc.id,
          rc.name,
          rc.cycle_type,
          concat(to_char(rc.period_start, 'Mon DD'), ' to ', to_char(rc.period_end, 'Mon DD')) as window_label,
          to_char(rc.close_date, 'YYYY-MM-DD') as close_date,
          rc.is_active
        from public.review_cycles rc
        where rc.id = $1
          and ${buildCycleVisibility(session.role, "$2")}
        limit 1
      `,
      [cycleId, session.userId]
    );

    const cycleRow = cycleResult.rows[0];

    if (!cycleRow) {
      return { cycle: null, enrollments: [] };
    }

    const enrollmentResult = await dbQuery<EnrollmentRow>(
      `
        select
          ce.id,
          employee.id as employee_id,
          employee.full_name as employee_name,
          reviewer.full_name as reviewer_name,
          reviewer.email as reviewer_email,
          ce.discussion_status::text as discussion_status,
          to_char(ce.discussion_date, 'YYYY-MM-DD"T"HH24:MI') as discussion_date,
          ce.review_status::text as review_status,
          ce.eligibility_note,
          self_review.overall_rating as self_rating,
          self_review.summary as self_summary,
          manager_review.overall_rating as manager_rating,
          manager_review.summary as manager_summary,
          (
            select count(*)::int
            from public.goals g
            where g.cycle_id = ce.cycle_id
              and g.owner_profile_id = ce.employee_profile_id
              and g.status in ('active', 'completed', 'archived')
          ) as goal_count,
          (self_review.id is not null) as has_employee_submission,
          (manager_review.id is not null) as has_manager_submission,
          (ce.employee_profile_id = $2) as is_self,
          (ce.acting_reviewer_profile_id = $2) as is_reviewer,
          exists (
            select 1
            from public.employee_records er
            where er.profile_id = ce.employee_profile_id
              and er.manager_profile_id = $2
          ) as is_line_manager
        from public.cycle_enrollments ce
        join public.profiles employee on employee.id = ce.employee_profile_id
        left join public.profiles reviewer on reviewer.id = ce.acting_reviewer_profile_id
        left join public.review_submissions self_review
          on self_review.cycle_enrollment_id = ce.id
         and self_review.submission_role = 'employee'
        left join public.review_submissions manager_review
          on manager_review.cycle_enrollment_id = ce.id
         and manager_review.submission_role = 'manager'
        where ce.cycle_id = $1
          and ${buildEnrollmentVisibility(session.role, "$2")}
        order by employee.full_name asc
      `,
      [cycleId, session.userId]
    );

    const enrollments = enrollmentResult.rows.map((row) => {
      const canManageEnrollment =
        session.role === "admin" || row.is_reviewer || row.is_line_manager;
      const bothSubmitted = row.has_employee_submission && row.has_manager_submission;
      const goalCount = Number(row.goal_count);
      const goalRequirementNote =
        goalCount > 0
          ? `${goalCount} cycle goal${goalCount === 1 ? "" : "s"} available for review evidence.`
          : "No approved goals are on file for this cycle yet. Self-rating is blocked until your manager aligns goal assignments.";

      return {
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name ?? "Unknown employee",
        reviewerName: row.reviewer_name ?? "Unassigned reviewer",
        reviewerEmail: row.reviewer_email,
        discussionStatus: row.discussion_status.replaceAll("_", " "),
        discussionDate: row.discussion_date ?? "Not scheduled",
        reviewStatus: row.review_status.replaceAll("_", " "),
        eligibilityNote: row.eligibility_note ?? "No eligibility note recorded.",
        selfRating: row.self_rating ?? "Not submitted",
        selfSummary: row.self_summary ?? "",
        managerRating: row.manager_rating ?? "Not submitted",
        managerSummary: row.manager_summary ?? "",
        visibleSelfSummary:
          session.role === "admin" || row.is_self || bothSubmitted
            ? row.self_summary ?? ""
            : "",
        visibleManagerSummary:
          session.role === "admin" || row.is_reviewer || row.is_line_manager || bothSubmitted
            ? row.manager_summary ?? ""
            : "",
        crossShareStatus: bothSubmitted
          ? "Both sides have submitted. Cross-share is unlocked."
          : row.has_employee_submission || row.has_manager_submission
            ? "Cross-share stays locked until both employee and manager submit."
            : "Waiting for both employee and manager submissions.",
        goalCount,
        goalRequirementNote,
        hasEmployeeSubmission: row.has_employee_submission,
        hasManagerSubmission: row.has_manager_submission,
        canSubmitSelf:
          row.is_self &&
          goalCount > 0 &&
          row.review_status !== "waived" &&
          row.review_status !== "finalized",
        canSubmitManager:
          canManageEnrollment &&
          row.review_status !== "waived" &&
          row.review_status !== "finalized",
        canScheduleDiscussion:
          canManageEnrollment &&
          row.review_status !== "waived" &&
          row.review_status !== "finalized",
        canCompleteDiscussion:
          canManageEnrollment && row.discussion_status === "scheduled",
        canFinalize:
          session.role === "admin" &&
          row.has_employee_submission &&
          row.has_manager_submission &&
          row.review_status !== "finalized" &&
          row.review_status !== "waived",
        canWaive:
          session.role === "admin" &&
          row.review_status !== "finalized" &&
          row.review_status !== "waived",
        canReassignReviewer:
          session.role === "admin" &&
          row.review_status !== "finalized" &&
          row.review_status !== "waived"
      };
    });

    const cycle: ReviewCycleRecord = {
      id: cycleRow.id,
      name: cycleRow.name,
      cycleType: cycleRow.cycle_type,
      windowLabel: cycleRow.window_label,
      closeDate: cycleRow.close_date,
      isActive: cycleRow.is_active,
      enrollmentCount: enrollments.length,
      completedCount: enrollments.filter(
        (enrollment) =>
          enrollment.reviewStatus === "submitted" ||
          enrollment.reviewStatus === "finalized"
      ).length,
      myStatus:
        session.role === "employee"
          ? enrollments[0]?.reviewStatus ?? "Not enrolled"
          : cycleRow.is_active
            ? "Active"
            : "Inactive",
      actionRequired:
        session.role === "employee"
          ? Boolean(enrollments[0]?.canSubmitSelf)
          : enrollments.some(
              (enrollment) =>
                enrollment.canSubmitManager ||
                enrollment.canScheduleDiscussion ||
                enrollment.canFinalize
            )
    };

    return { cycle, enrollments };
  } catch (error) {
    console.error("getReviewCycleDetail failed:", error);
    return { cycle: null, enrollments: [] };
  }
}
