"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";
import {
  createFlagFromSubmission,
  queueNotification,
  recordAudit,
  syncReviewEnrollmentStatus
} from "@/lib/workflows/workflow-helpers";

const reviewSubmissionSchema = z.object({
  enrollmentId: z.string().uuid(),
  overallRating: z.string().min(2).max(100),
  summary: z.string().min(8).max(2000)
});

const scheduleSchema = z.object({
  enrollmentId: z.string().uuid(),
  discussionAt: z.string().min(5)
});

const enrollmentSchema = z.object({
  enrollmentId: z.string().uuid()
});

const waiveSchema = z.object({
  enrollmentId: z.string().uuid(),
  reason: z.string().min(3).max(500)
});

const reassignReviewerSchema = z.object({
  enrollmentId: z.string().uuid(),
  reviewerEmail: z.string().email()
});

type EnrollmentAccessRow = {
  id: string;
  cycle_id: string;
  employee_profile_id: string;
  acting_reviewer_profile_id: string | null;
  line_manager_profile_id: string | null;
  employee_name: string | null;
};

function deriveReviewScore(overallRating: string) {
  switch (overallRating) {
    case "Outstanding":
      return 4;
    case "Strong":
      return 3.5;
    case "On Track":
      return 3;
    case "Needs Support":
      return 1.5;
    default:
      return 3;
  }
}

function deriveReviewSentiment(overallRating: string) {
  switch (overallRating) {
    case "Outstanding":
    case "Strong":
      return "positive";
    case "Needs Support":
      return "negative";
    default:
      return "neutral";
  }
}

async function syncCycleReviewFeedbackSubmission(
  client: PoolClient,
  {
    enrollmentId,
    employeeProfileId,
    actorProfileId,
    recipientRole,
    overallRating,
    summary
  }: {
    enrollmentId: string;
    employeeProfileId: string;
    actorProfileId: string;
    recipientRole: "employee" | "manager";
    overallRating: string;
    summary: string;
  }
) {
  const requestResult = await client.query<{ id: string }>(
    `
      select id
      from public.feedback_requests
      where cycle_enrollment_id = $1
        and recipient_role = $2
      order by created_at asc
      limit 1
    `,
    [enrollmentId, recipientRole]
  );

  const requestId = requestResult.rows[0]?.id ?? randomUUID();

  if (!requestResult.rows[0]) {
    await client.query(
      `
        insert into public.feedback_requests (
          id,
          cycle_enrollment_id,
          recipient_profile_id,
          recipient_role,
          due_at,
          submitted_at,
          status
        )
        values (
          $1,
          $2,
          $3,
          $4::public.feedback_actor_type,
          timezone('utc', now()),
          timezone('utc', now()),
          'submitted'
        )
      `,
      [requestId, enrollmentId, actorProfileId, recipientRole]
    );
  } else {
    await client.query(
      `
        update public.feedback_requests
        set recipient_profile_id = $2,
            submitted_at = timezone('utc', now()),
            status = 'submitted',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [requestId, actorProfileId]
    );
  }

  const goalSnapshotResult = await client.query<{
    goal_total: number | string;
    avg_completion: number | string | null;
  }>(
    `
      select
        count(*)::int as goal_total,
        round(avg(completion_pct), 0) as avg_completion
      from public.goals
      where cycle_id = (
        select cycle_id
        from public.cycle_enrollments
        where id = $1
        limit 1
      )
        and owner_profile_id = $2
        and status in ('active', 'completed', 'archived')
    `,
    [enrollmentId, employeeProfileId]
  );

  const goalSnapshot = {
    goalCount: Number(goalSnapshotResult.rows[0]?.goal_total ?? 0),
    completionPct: Number(goalSnapshotResult.rows[0]?.avg_completion ?? 0)
  };

  const feedbackSubmissionResult = await client.query<{ id: string }>(
    `
      select id
      from public.feedback_submissions
      where feedback_request_id = $1
      limit 1
    `,
    [requestId]
  );

  const feedbackSubmissionId =
    feedbackSubmissionResult.rows[0]?.id ?? randomUUID();
  const score = deriveReviewScore(overallRating);
  const sentimentLabel = deriveReviewSentiment(overallRating);

  if (!feedbackSubmissionResult.rows[0]) {
    await client.query(
      `
        insert into public.feedback_submissions (
          id,
          feedback_request_id,
          workflow_type,
          actor_profile_id,
          subject_profile_id,
          score,
          answers,
          sentiment_label,
          goal_snapshot
        )
        values (
          $1,
          $2,
          'cycle_review',
          $3,
          $4,
          $5,
          $6::jsonb,
          $7,
          $8::jsonb
        )
      `,
      [
        feedbackSubmissionId,
        requestId,
        actorProfileId,
        employeeProfileId,
        score,
        JSON.stringify({
          overallRating,
          summary
        }),
        sentimentLabel,
        JSON.stringify(goalSnapshot)
      ]
    );
  } else {
    await client.query(
      `
        update public.feedback_submissions
        set actor_profile_id = $2,
            subject_profile_id = $3,
            score = $4,
            answers = $5::jsonb,
            sentiment_label = $6,
            goal_snapshot = $7::jsonb,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [
        feedbackSubmissionId,
        actorProfileId,
        employeeProfileId,
        score,
        JSON.stringify({
          overallRating,
          summary
        }),
        sentimentLabel,
        JSON.stringify(goalSnapshot)
      ]
    );
  }

  await createFlagFromSubmission(client, {
    feedbackSubmissionId,
    subjectProfileId: employeeProfileId,
    score,
    sentimentLabel,
    workflowLabel: "Cycle review"
  });
}

async function loadEnrollmentForActor(enrollmentId: string, actorId: string) {
  return withDbTransaction(async (client) => {
    const result = await client.query<EnrollmentAccessRow>(
      `
        select
          ce.id,
          ce.cycle_id,
          ce.employee_profile_id,
          ce.acting_reviewer_profile_id,
          er.manager_profile_id as line_manager_profile_id,
          employee.full_name as employee_name
        from public.cycle_enrollments ce
        join public.profiles employee on employee.id = ce.employee_profile_id
        left join public.employee_records er on er.profile_id = ce.employee_profile_id
        where ce.id = $1
        limit 1
      `,
      [enrollmentId]
    );

    const enrollment = result.rows[0];

    if (!enrollment) {
      return { enrollment: null, isLineManager: false };
    }

    const managerAccess = await client.query<{ allowed: boolean }>(
      `
        select exists (
          select 1
          from public.employee_records
          where profile_id = $1
            and manager_profile_id = $2
        ) as allowed
      `,
      [enrollment.employee_profile_id, actorId]
    );

    return {
      enrollment,
      isLineManager: Boolean(managerAccess.rows[0]?.allowed)
    };
  });
}

export async function submitSelfReviewAction(formData: FormData) {
  const parsed = reviewSubmissionSchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    overallRating: formData.get("overallRating"),
    summary: formData.get("summary")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();
  const access = await loadEnrollmentForActor(parsed.data.enrollmentId, session.userId);
  const enrollment = access.enrollment;

  if (!enrollment || enrollment.employee_profile_id !== session.userId) {
    return;
  }

  await withDbTransaction(async (client) => {
    const goalCountResult = await client.query<{ total: number | string }>(
      `
        select count(*)::int as total
        from public.goals
        where cycle_id = $1
          and owner_profile_id = $2
          and status in ('active', 'completed', 'archived')
      `,
      [enrollment.cycle_id, enrollment.employee_profile_id]
    );

    const goalCount = Number(goalCountResult.rows[0]?.total ?? 0);

    if (goalCount === 0) {
      await queueNotification(client, {
        recipientProfileId:
          enrollment.acting_reviewer_profile_id ?? enrollment.line_manager_profile_id,
        channel: "in_app",
        templateKey: "review_blocked_no_goals",
        subject: "Self review blocked: goals missing",
        body: `${enrollment.employee_name ?? "An employee"} tried to self-rate without approved goals in the active cycle.`,
        actionUrl: `/reviews/${enrollment.cycle_id}`
      });

      await recordAudit(
        client,
        session.userId,
        "cycle_enrollment",
        enrollment.id,
        "self_review_blocked_missing_goals",
        { cycleId: enrollment.cycle_id }
      );

      return;
    }

    await client.query(
      `
        insert into public.review_submissions (
          id,
          cycle_enrollment_id,
          submission_role,
          overall_rating,
          summary
        )
        values (gen_random_uuid(), $1, 'employee', $2, $3)
        on conflict (cycle_enrollment_id, submission_role)
        do update
          set overall_rating = excluded.overall_rating,
              summary = excluded.summary,
              updated_at = timezone('utc', now())
      `,
      [parsed.data.enrollmentId, parsed.data.overallRating, parsed.data.summary]
    );

    await syncCycleReviewFeedbackSubmission(client, {
      enrollmentId: parsed.data.enrollmentId,
      employeeProfileId: enrollment.employee_profile_id,
      actorProfileId: session.userId,
      recipientRole: "employee",
      overallRating: parsed.data.overallRating,
      summary: parsed.data.summary
    });

    await syncReviewEnrollmentStatus(client, parsed.data.enrollmentId);

    await queueNotification(client, {
      recipientProfileId: enrollment.acting_reviewer_profile_id,
      channel: "in_app",
      templateKey: "self_review_submitted",
      subject: "Self review submitted",
      body: `${enrollment.employee_name ?? "An employee"} submitted a self review.`,
      actionUrl: `/reviews/${enrollment.cycle_id}`
    });

    await recordAudit(client, session.userId, "cycle_enrollment", enrollment.id, "self_review_submitted", {
      cycleId: enrollment.cycle_id,
      overallRating: parsed.data.overallRating
    });
  });

  revalidatePath(`/reviews/${enrollment.cycle_id}`);
  revalidatePath("/reviews");
  revalidatePath("/dashboard");
}

export async function submitManagerReviewAction(formData: FormData) {
  const parsed = reviewSubmissionSchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    overallRating: formData.get("overallRating"),
    summary: formData.get("summary")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();
  const access = await loadEnrollmentForActor(parsed.data.enrollmentId, session.userId);
  const enrollment = access.enrollment;

  if (
    !enrollment ||
    (session.role !== "admin" &&
      enrollment.acting_reviewer_profile_id !== session.userId &&
      !access.isLineManager)
  ) {
    return;
  }

  await withDbTransaction(async (client) => {
    await client.query(
      `
        insert into public.review_submissions (
          id,
          cycle_enrollment_id,
          submission_role,
          overall_rating,
          summary
        )
        values (gen_random_uuid(), $1, 'manager', $2, $3)
        on conflict (cycle_enrollment_id, submission_role)
        do update
          set overall_rating = excluded.overall_rating,
              summary = excluded.summary,
              updated_at = timezone('utc', now())
      `,
      [parsed.data.enrollmentId, parsed.data.overallRating, parsed.data.summary]
    );

    await syncCycleReviewFeedbackSubmission(client, {
      enrollmentId: parsed.data.enrollmentId,
      employeeProfileId: enrollment.employee_profile_id,
      actorProfileId: session.userId,
      recipientRole: "manager",
      overallRating: parsed.data.overallRating,
      summary: parsed.data.summary
    });

    await syncReviewEnrollmentStatus(client, parsed.data.enrollmentId);

    await queueNotification(client, {
      recipientProfileId: enrollment.employee_profile_id,
      channel: "in_app",
      templateKey: "manager_review_submitted",
      subject: "Manager review submitted",
      body: "Your manager review has been recorded.",
      actionUrl: `/reviews/${enrollment.cycle_id}`
    });

    await recordAudit(client, session.userId, "cycle_enrollment", enrollment.id, "manager_review_submitted", {
      cycleId: enrollment.cycle_id,
      overallRating: parsed.data.overallRating
    });
  });

  revalidatePath(`/reviews/${enrollment.cycle_id}`);
  revalidatePath("/reviews");
  revalidatePath("/dashboard");
}

export async function scheduleReviewDiscussionAction(formData: FormData) {
  const parsed = scheduleSchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    discussionAt: formData.get("discussionAt")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();
  const access = await loadEnrollmentForActor(parsed.data.enrollmentId, session.userId);
  const enrollment = access.enrollment;

  if (
    !enrollment ||
    (session.role !== "admin" &&
      enrollment.acting_reviewer_profile_id !== session.userId &&
      !access.isLineManager)
  ) {
    return;
  }

  const discussionAt = new Date(parsed.data.discussionAt);

  if (Number.isNaN(discussionAt.getTime())) {
    return;
  }

  await withDbTransaction(async (client) => {
    await client.query(
      `
        update public.cycle_enrollments
        set discussion_status = 'scheduled',
            discussion_date = $2,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.enrollmentId, discussionAt.toISOString()]
    );

    await queueNotification(client, {
      recipientProfileId: enrollment.employee_profile_id,
      channel: "in_app",
      templateKey: "review_discussion_scheduled",
      subject: "Review discussion scheduled",
      body: "A review discussion has been scheduled for your cycle enrollment.",
      actionUrl: `/reviews/${enrollment.cycle_id}`
    });

    await recordAudit(client, session.userId, "cycle_enrollment", enrollment.id, "review_discussion_scheduled", {
      cycleId: enrollment.cycle_id,
      discussionAt: discussionAt.toISOString()
    });
  });

  revalidatePath(`/reviews/${enrollment.cycle_id}`);
  revalidatePath("/reviews");
}

export async function completeReviewDiscussionAction(formData: FormData) {
  const parsed = enrollmentSchema.safeParse({
    enrollmentId: formData.get("enrollmentId")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();
  const access = await loadEnrollmentForActor(parsed.data.enrollmentId, session.userId);
  const enrollment = access.enrollment;

  if (
    !enrollment ||
    (session.role !== "admin" &&
      enrollment.acting_reviewer_profile_id !== session.userId &&
      !access.isLineManager)
  ) {
    return;
  }

  await withDbTransaction(async (client) => {
    await client.query(
      `
        update public.cycle_enrollments
        set discussion_status = 'completed',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.enrollmentId]
    );

    await recordAudit(client, session.userId, "cycle_enrollment", enrollment.id, "review_discussion_completed", {
      cycleId: enrollment.cycle_id
    });
  });

  revalidatePath(`/reviews/${enrollment.cycle_id}`);
  revalidatePath("/reviews");
}

export async function finalizeReviewAction(formData: FormData) {
  const parsed = enrollmentSchema.safeParse({
    enrollmentId: formData.get("enrollmentId")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  const access = await loadEnrollmentForActor(parsed.data.enrollmentId, session.userId);
  const enrollment = access.enrollment;

  if (!enrollment) {
    return;
  }

  await withDbTransaction(async (client) => {
    await client.query(
      `
        update public.cycle_enrollments
        set review_status = 'finalized',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.enrollmentId]
    );

    await queueNotification(client, {
      recipientProfileId: enrollment.employee_profile_id,
      channel: "in_app",
      templateKey: "review_finalized",
      subject: "Review finalized",
      body: "Your review cycle entry has been finalized.",
      actionUrl: `/reviews/${enrollment.cycle_id}`
    });

    await recordAudit(client, session.userId, "cycle_enrollment", enrollment.id, "review_finalized", {
      cycleId: enrollment.cycle_id
    });
  });

  revalidatePath(`/reviews/${enrollment.cycle_id}`);
  revalidatePath("/reviews");
}

export async function waiveReviewAction(formData: FormData) {
  const parsed = waiveSchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    reason: formData.get("reason")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  const access = await loadEnrollmentForActor(parsed.data.enrollmentId, session.userId);
  const enrollment = access.enrollment;

  if (!enrollment) {
    return;
  }

  await withDbTransaction(async (client) => {
    await client.query(
      `
        update public.cycle_enrollments
        set review_status = 'waived',
            eligibility_note = concat(coalesce(eligibility_note, ''), case when eligibility_note is null then '' else ' | ' end, $2),
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.enrollmentId, `Waived by Admin: ${parsed.data.reason}`]
    );

    await recordAudit(client, session.userId, "cycle_enrollment", enrollment.id, "review_waived", {
      cycleId: enrollment.cycle_id,
      reason: parsed.data.reason
    });
  });

  revalidatePath(`/reviews/${enrollment.cycle_id}`);
  revalidatePath("/reviews");
}

export async function reassignActingReviewerAction(formData: FormData) {
  const parsed = reassignReviewerSchema.safeParse({
    enrollmentId: formData.get("enrollmentId"),
    reviewerEmail: formData.get("reviewerEmail")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  const access = await loadEnrollmentForActor(parsed.data.enrollmentId, session.userId);
  const enrollment = access.enrollment;

  if (!enrollment) {
    return;
  }

  await withDbTransaction(async (client) => {
    const reviewerResult = await client.query<{ id: string; full_name: string }>(
      `
        select p.id, p.full_name
        from public.profiles p
        join public.user_roles ur on ur.profile_id = p.id
        where lower(p.email) = lower($1)
          and ur.role in ('manager', 'admin')
        limit 1
      `,
      [parsed.data.reviewerEmail]
    );

    const reviewer = reviewerResult.rows[0];

    if (!reviewer) {
      return;
    }

    await client.query(
      `
        update public.cycle_enrollments
        set acting_reviewer_profile_id = $2,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.enrollmentId, reviewer.id]
    );

    await queueNotification(client, {
      recipientProfileId: reviewer.id,
      channel: "in_app",
      templateKey: "acting_reviewer_reassigned",
      subject: "You were assigned as acting reviewer",
      body: `${enrollment.employee_name ?? "An employee"} now routes through you for this review cycle.`,
      actionUrl: `/reviews/${enrollment.cycle_id}`
    });

    await queueNotification(client, {
      recipientProfileId: enrollment.employee_profile_id,
      channel: "in_app",
      templateKey: "acting_reviewer_changed",
      subject: "Your reviewer was updated",
      body: `${reviewer.full_name} is now the acting reviewer for this cycle entry.`,
      actionUrl: `/reviews/${enrollment.cycle_id}`
    });

    await recordAudit(client, session.userId, "cycle_enrollment", enrollment.id, "acting_reviewer_reassigned", {
      cycleId: enrollment.cycle_id,
      reviewerEmail: parsed.data.reviewerEmail,
      reviewerName: reviewer.full_name
    });
  });

  revalidatePath(`/reviews/${enrollment.cycle_id}`);
  revalidatePath("/reviews");
  revalidatePath("/admin/cycles");
}
