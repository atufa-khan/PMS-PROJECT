import type { FlagRecord } from "@/lib/db/types";
import { dbQuery } from "@/lib/db/server";

type FlagRow = {
  id: string;
  employee_name: string | null;
  severity: FlagRecord["severity"];
  reason: string;
  status: FlagRecord["status"];
  created_at: string;
  is_repeat_flag: boolean;
  latest_action_note: string | null;
  action_count: number | string;
  workflow_label: string | null;
  current_context: string | null;
  previous_context: string | null;
  repeat_context: string | null;
};

function formatAgeLabel(createdAt: string) {
  const createdTime = new Date(createdAt).getTime();
  const dayCount = Math.max(
    0,
    Math.floor((Date.now() - createdTime) / (1000 * 60 * 60 * 24))
  );

  if (dayCount === 0) {
    return "Today";
  }

  return dayCount === 1 ? "1 day" : `${dayCount} days`;
}

export async function listFlags(): Promise<FlagRecord[]> {
  try {
    const result = await dbQuery<FlagRow>(
      `
        select
          f.id,
          subject.full_name as employee_name,
          f.severity,
          f.reason,
          f.status,
          to_char(f.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
          f.is_repeat_flag,
          latest_action.note as latest_action_note,
          count(actions.id)::int as action_count,
          case fs.workflow_type
            when 'cycle_review' then 'Cycle review'
            when 'probation' then 'Probation'
            else null
          end as workflow_label,
          case
            when rc.name is not null then concat(rc.name, ' | ', coalesce(rs.overall_rating, 'No rating'), ' | ', left(coalesce(rs.summary, 'No summary'), 120))
            else null
          end as current_context,
          previous_cycle.previous_context,
          case
            when f.is_repeat_flag and previous_cycle.previous_context is not null
              then concat('Consecutive-cycle repeat pattern detected from ', previous_cycle.previous_cycle_name)
            else null
          end as repeat_context
        from public.flags f
        left join public.feedback_submissions fs on fs.id = f.feedback_submission_id
        left join public.feedback_requests fr on fr.id = fs.feedback_request_id
        left join public.cycle_enrollments ce on ce.id = fr.cycle_enrollment_id
        left join public.review_cycles rc on rc.id = ce.cycle_id
        left join public.review_submissions rs
          on rs.cycle_enrollment_id = ce.id
         and rs.submission_role = fr.recipient_role
        left join public.profiles subject on subject.id = fs.subject_profile_id
        left join public.flag_actions actions on actions.flag_id = f.id
        left join lateral (
          select note
          from public.flag_actions fa
          where fa.flag_id = f.id
          order by fa.created_at desc
          limit 1
        ) latest_action on true
        left join lateral (
          select
            rc_prev.name as previous_cycle_name,
            concat(
              rc_prev.name,
              ' | ',
              coalesce(rs_prev.overall_rating, 'No rating'),
              ' | ',
              left(coalesce(f_prev.reason, 'No previous flag note'), 120)
            ) as previous_context
          from public.feedback_submissions fs_prev
          join public.feedback_requests fr_prev on fr_prev.id = fs_prev.feedback_request_id
          join public.cycle_enrollments ce_prev on ce_prev.id = fr_prev.cycle_enrollment_id
          join public.review_cycles rc_prev on rc_prev.id = ce_prev.cycle_id
          left join public.flags f_prev on f_prev.feedback_submission_id = fs_prev.id
          left join public.review_submissions rs_prev
            on rs_prev.cycle_enrollment_id = ce_prev.id
           and rs_prev.submission_role = fr_prev.recipient_role
          where fs_prev.subject_profile_id = fs.subject_profile_id
            and fs_prev.workflow_type = 'cycle_review'
            and rc.period_end is not null
            and rc_prev.period_end < rc.period_end
          order by rc_prev.period_end desc
          limit 1
        ) previous_cycle on true
        group by
          f.id,
          subject.full_name,
          f.severity,
          f.reason,
          f.status,
          f.created_at,
          f.is_repeat_flag,
          latest_action.note,
          fs.workflow_type,
          rc.name,
          rs.overall_rating,
          rs.summary,
          previous_cycle.previous_context,
          previous_cycle.previous_cycle_name
        order by f.created_at desc
      `
    );

    return result.rows.map((row) => ({
      id: row.id,
      employeeName: row.employee_name ?? "Unknown employee",
      severity: row.severity,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      ageLabel: formatAgeLabel(row.created_at),
      isRepeatFlag: row.is_repeat_flag,
      latestActionNote: row.latest_action_note ?? "No action recorded yet.",
      actionCount: Number(row.action_count),
      canReview: row.status === "open",
      canResolve: row.status !== "resolved",
      canEscalate: row.status !== "resolved" && row.status !== "escalated",
      workflowLabel: row.workflow_label ?? undefined,
      currentContext: row.current_context,
      previousContext: row.previous_context,
      repeatContext: row.repeat_context
    }));
  } catch (error) {
    console.error("listFlags failed:", error);
    return [];
  }
}
