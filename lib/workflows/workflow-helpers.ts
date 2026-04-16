import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export async function recordAudit(
  client: PoolClient,
  actorProfileId: string | null,
  entityType: string,
  entityId: string | null,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  await client.query(
    `
      insert into public.audit_logs (id, actor_profile_id, entity_type, entity_id, action, metadata)
      values ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [randomUUID(), actorProfileId, entityType, entityId, action, JSON.stringify(metadata)]
  );
}

export async function findEscalationAdminProfileId(client: PoolClient) {
  const configuredAdmin = await client.query<{
    secondary_admin_profile_id: string | null;
    admin_successor_profile_id: string | null;
  }>(
    `
      select secondary_admin_profile_id, admin_successor_profile_id
      from public.app_settings
      limit 1
    `
  );

  const configuredRecipient =
    configuredAdmin.rows[0]?.secondary_admin_profile_id ??
    configuredAdmin.rows[0]?.admin_successor_profile_id;

  if (configuredRecipient) {
    return configuredRecipient;
  }

  const fallbackAdmin = await client.query<{ profile_id: string }>(
    `
      select profile_id
      from public.user_roles
      where role = 'admin'
      order by is_primary desc, created_at asc
      limit 1
    `
  );

  return fallbackAdmin.rows[0]?.profile_id ?? null;
}

export async function queueNotification(
  client: PoolClient,
  {
    recipientProfileId,
    channel = "in_app",
    templateKey,
    subject,
    body,
    actionUrl,
    scheduledFor = new Date()
  }: {
    recipientProfileId: string | null;
    channel?: "email" | "in_app";
    templateKey: string;
    subject: string;
    body: string;
    actionUrl: string;
    scheduledFor?: Date;
  }
) {
  if (!recipientProfileId) {
    return null;
  }

  const notificationId = randomUUID();

  await client.query(
    `
      insert into public.notifications (
        id,
        recipient_profile_id,
        channel,
        template_key,
        subject,
        body,
        action_url,
        scheduled_for
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      notificationId,
      recipientProfileId,
      channel,
      templateKey,
      subject,
      body,
      actionUrl,
      scheduledFor
    ]
  );

  await client.query(
    `
      insert into public.notification_deliveries (id, notification_id, status, retry_count)
      values ($1, $2, 'pending', 0)
    `,
    [randomUUID(), notificationId]
  );

  return notificationId;
}

export async function createFlagFromSubmission(
  client: PoolClient,
  {
    feedbackSubmissionId,
    subjectProfileId,
    score,
    sentimentLabel,
    workflowLabel
  }: {
    feedbackSubmissionId: string;
    subjectProfileId: string;
    score: number | null;
    sentimentLabel: string | null;
    workflowLabel: string;
  }
) {
  const settingsResult = await client.query<{ red_flag_threshold: number | string | null }>(
    `
      select red_flag_threshold
      from public.app_settings
      limit 1
    `
  );

  const threshold = Number(settingsResult.rows[0]?.red_flag_threshold ?? 2);
  const normalizedSentiment = (sentimentLabel ?? "").trim().toLowerCase();
  const submissionResult = await client.query<{
    answers: Record<string, unknown> | null;
    workflow_type: string;
    cycle_name: string | null;
    cycle_period_end: string | null;
    review_rating: string | null;
  }>(
    `
      select
        fs.answers,
        fs.workflow_type::text as workflow_type,
        rc.name as cycle_name,
        rc.period_end::text as cycle_period_end,
        rs.overall_rating as review_rating
      from public.feedback_submissions fs
      left join public.feedback_requests fr on fr.id = fs.feedback_request_id
      left join public.cycle_enrollments ce on ce.id = fr.cycle_enrollment_id
      left join public.review_cycles rc on rc.id = ce.cycle_id
      left join public.review_submissions rs
        on rs.cycle_enrollment_id = ce.id
       and rs.submission_role = fr.recipient_role
      where fs.id = $1
      limit 1
    `,
    [feedbackSubmissionId]
  );
  const submission = submissionResult.rows[0];
  const answers = submission?.answers ?? {};
  const softFlag = Object.values(answers).some(
    (value) => typeof value === "string" && value.trim().length === 0
  );
  const scoreFlag = typeof score === "number" && score <= threshold;
  const sentimentFlag = normalizedSentiment === "negative";
  const existingFlagResult = await client.query<{ id: string }>(
    `
      select id
      from public.flags
      where feedback_submission_id = $1
      limit 1
    `,
    [feedbackSubmissionId]
  );
  const existingFlagId = existingFlagResult.rows[0]?.id ?? null;

  let isRepeatFlag = false;
  let previousCycleContext: {
    cycle_name: string | null;
    had_flag: boolean;
    review_rating: string | null;
  } | null = null;

  if (submission?.workflow_type === "cycle_review" && submission.cycle_period_end) {
    const previousCycleResult = await client.query<{
      cycle_name: string | null;
      had_flag: boolean;
      review_rating: string | null;
    }>(
      `
        select
          rc.name as cycle_name,
          (f.id is not null) as had_flag,
          rs.overall_rating as review_rating
        from public.feedback_submissions fs
        join public.feedback_requests fr on fr.id = fs.feedback_request_id
        join public.cycle_enrollments ce on ce.id = fr.cycle_enrollment_id
        join public.review_cycles rc on rc.id = ce.cycle_id
        left join public.flags f on f.feedback_submission_id = fs.id
        left join public.review_submissions rs
          on rs.cycle_enrollment_id = ce.id
         and rs.submission_role = fr.recipient_role
        where fs.subject_profile_id = $1
          and fs.workflow_type = 'cycle_review'
          and fs.id <> $2
          and rc.period_end < $3::date
        order by rc.period_end desc
        limit 1
      `,
      [subjectProfileId, feedbackSubmissionId, submission.cycle_period_end]
    );

    previousCycleContext = previousCycleResult.rows[0] ?? null;
    isRepeatFlag = Boolean(previousCycleContext?.had_flag);
  } else {
    const previousFlagsResult = await client.query<{ total: number | string }>(
      `
        select count(*)::int as total
        from public.flags f
        join public.feedback_submissions fs on fs.id = f.feedback_submission_id
        where fs.subject_profile_id = $1
          and fs.id <> $2
      `,
      [subjectProfileId, feedbackSubmissionId]
    );

    const previousFlagCount = Number(previousFlagsResult.rows[0]?.total ?? 0);
    isRepeatFlag = previousFlagCount > 0;
  }

  if (!scoreFlag && !sentimentFlag && !softFlag) {
    return existingFlagId;
  }

  const severity =
    softFlag && !scoreFlag && !sentimentFlag
      ? "low"
      : scoreFlag && sentimentFlag
      ? "critical"
      : scoreFlag || isRepeatFlag
        ? "high"
        : "medium";

  const reasons = [
    scoreFlag ? `Score at or below threshold (${threshold})` : null,
    sentimentFlag ? "Negative sentiment detected" : null,
    softFlag ? "Open-ended feedback was left incomplete" : null,
    isRepeatFlag
      ? previousCycleContext?.cycle_name
        ? `The previous review cycle (${previousCycleContext.cycle_name}) was also flagged`
        : "Previous related flags exist for this employee"
      : null
  ].filter(Boolean);

  if (softFlag) {
    await client.query(
      `
        update public.feedback_submissions
        set is_soft_flag = true,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [feedbackSubmissionId]
    );
  }

  const flagReason = `${workflowLabel}: ${reasons.join(". ")}`;

  if (existingFlagId) {
    await client.query(
      `
        update public.flags
        set severity = $2,
            reason = $3,
            is_repeat_flag = $4,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [existingFlagId, severity, flagReason, isRepeatFlag]
    );

    return existingFlagId;
  }

  const flagId = randomUUID();

  await client.query(
    `
      insert into public.flags (
        id,
        feedback_submission_id,
        severity,
        reason,
        status,
        aged_at,
        is_repeat_flag
      )
      values (
        $1,
        $2,
        $3,
        $4,
        'open',
        timezone('utc', now()) + interval '3 days',
        $5
      )
    `,
    [flagId, feedbackSubmissionId, severity, flagReason, isRepeatFlag]
  );

  const adminRecipient = await findEscalationAdminProfileId(client);

  await queueNotification(client, {
    recipientProfileId: adminRecipient,
    channel: "in_app",
    templateKey: "flag_created",
    subject: "New workflow flag created",
    body: `${workflowLabel} triggered a ${severity} flag and needs review.`,
    actionUrl: "/flags"
  });

  return flagId;
}

export async function syncProbationCheckpointState(
  client: PoolClient,
  checkpointId: string
) {
  const checkpointResult = await client.query<{
    status: string;
    probation_case_id: string;
  }>(
    `
      select status, probation_case_id
      from public.probation_checkpoints
      where id = $1
      limit 1
    `,
    [checkpointId]
  );

  const checkpoint = checkpointResult.rows[0];

  if (!checkpoint || checkpoint.status === "paused") {
    return;
  }

  const caseResult = await client.query<{ manager_profile_id: string | null }>(
    `
      select manager_profile_id
      from public.probation_cases
      where id = $1
      limit 1
    `,
    [checkpoint.probation_case_id]
  );

  const feedbackResult = await client.query<{
    recipient_role: "employee" | "manager";
    submitted_at: string | null;
  }>(
    `
      select recipient_role, submitted_at
      from public.feedback_requests
      where checkpoint_id = $1
    `,
    [checkpointId]
  );

  const managerAssigned = Boolean(caseResult.rows[0]?.manager_profile_id);

  if (!managerAssigned) {
    await client.query(
      `
        update public.probation_checkpoints
        set status = 'blocked',
            waiting_on = null,
            manager_context_note = 'No manager assigned yet',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [checkpointId]
    );
    return;
  }

  const hasEmployeeRequest = feedbackResult.rows.some(
    (row) => row.recipient_role === "employee"
  );
  const hasManagerRequest = feedbackResult.rows.some(
    (row) => row.recipient_role === "manager"
  );

  if (!hasEmployeeRequest || !hasManagerRequest) {
    await client.query(
      `
        update public.probation_checkpoints
        set status = 'blocked',
            waiting_on = null,
            manager_context_note = 'Feedback routing is incomplete',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [checkpointId]
    );
    return;
  }

  const employeeSubmitted = feedbackResult.rows.some(
    (row) => row.recipient_role === "employee" && Boolean(row.submitted_at)
  );
  const managerSubmitted = feedbackResult.rows.some(
    (row) => row.recipient_role === "manager" && Boolean(row.submitted_at)
  );

  const nextStatus = employeeSubmitted && managerSubmitted
    ? { status: "awaiting_admin_review", waitingOn: "admin" }
    : employeeSubmitted
      ? { status: "in_progress", waitingOn: "manager" }
      : { status: "in_progress", waitingOn: "employee" };

  await client.query(
    `
      update public.probation_checkpoints
      set status = $2,
          waiting_on = $3::public.feedback_actor_type,
          manager_context_note = null,
          updated_at = timezone('utc', now())
      where id = $1
    `,
    [checkpointId, nextStatus.status, nextStatus.waitingOn]
  );
}

export async function syncReviewEnrollmentStatus(
  client: PoolClient,
  enrollmentId: string
) {
  const currentStatusResult = await client.query<{ review_status: string }>(
    `
      select review_status::text as review_status
      from public.cycle_enrollments
      where id = $1
      limit 1
    `,
    [enrollmentId]
  );

  const currentStatus = currentStatusResult.rows[0]?.review_status;

  if (!currentStatus || currentStatus === "waived" || currentStatus === "finalized") {
    return currentStatus ?? null;
  }

  const submissionCountResult = await client.query<{ total: number | string }>(
    `
      select count(*)::int as total
      from public.review_submissions
      where cycle_enrollment_id = $1
    `,
    [enrollmentId]
  );

  const total = Number(submissionCountResult.rows[0]?.total ?? 0);
  const nextStatus =
    total >= 2 ? "submitted" : total === 1 ? "in_progress" : "not_started";

  await client.query(
    `
      update public.cycle_enrollments
      set review_status = $2::public.review_status,
          updated_at = timezone('utc', now())
      where id = $1
    `,
    [enrollmentId, nextStatus]
  );

  return nextStatus;
}
