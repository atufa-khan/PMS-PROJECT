"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";
import {
  createFlagFromSubmission,
  findEscalationAdminProfileId,
  queueNotification,
  recordAudit,
  syncProbationCheckpointState
} from "@/lib/workflows/workflow-helpers";

const feedbackSchema = z.object({
  requestId: z.string().uuid(),
  score: z.coerce.number().min(1).max(5),
  sentimentLabel: z.enum(["positive", "neutral", "negative"]),
  summary: z.string().min(8).max(1000),
  followUp: z.string().min(2).max(1000)
});

type FeedbackRequestRow = {
  id: string;
  checkpoint_id: string;
  recipient_role: "employee" | "manager";
  recipient_profile_id: string;
  submitted_at: string | null;
  employee_profile_id: string;
  manager_profile_id: string | null;
  employee_name: string | null;
};

export async function submitProbationFeedbackAction(formData: FormData) {
  const parsed = feedbackSchema.safeParse({
    requestId: formData.get("requestId"),
    score: formData.get("score"),
    sentimentLabel: formData.get("sentimentLabel"),
    summary: formData.get("summary"),
    followUp: formData.get("followUp")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  await withDbTransaction(async (client) => {
    const requestResult = await client.query<FeedbackRequestRow>(
      `
        select
          fr.id,
          fr.checkpoint_id,
          fr.recipient_role::text as recipient_role,
          fr.recipient_profile_id,
          fr.submitted_at,
          pcase.employee_profile_id,
          pcase.manager_profile_id,
          employee.full_name as employee_name
        from public.feedback_requests fr
        join public.probation_checkpoints pc on pc.id = fr.checkpoint_id
        join public.probation_cases pcase on pcase.id = pc.probation_case_id
        join public.profiles employee on employee.id = pcase.employee_profile_id
        where fr.id = $1
        limit 1
      `,
      [parsed.data.requestId]
    );

    const request = requestResult.rows[0];

    if (!request || request.recipient_profile_id !== session.userId) {
      return;
    }

    const existingSubmission = await client.query<{ id: string }>(
      `
        select id
        from public.feedback_submissions
        where feedback_request_id = $1
        limit 1
      `,
      [request.id]
    );

    const submissionId = existingSubmission.rows[0]?.id ?? randomUUID();
    const answers = {
      summary: parsed.data.summary,
      follow_up: parsed.data.followUp,
      submitted_role: request.recipient_role
    };

    if (existingSubmission.rows[0]) {
      await client.query(
        `
          update public.feedback_submissions
          set score = $2,
              answers = $3::jsonb,
              sentiment_label = $4,
              updated_at = timezone('utc', now())
          where id = $1
        `,
        [
          submissionId,
          parsed.data.score,
          JSON.stringify(answers),
          parsed.data.sentimentLabel
        ]
      );
    } else {
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
            sentiment_label
          )
          values ($1, $2, 'probation', $3, $4, $5, $6::jsonb, $7)
        `,
        [
          submissionId,
          request.id,
          session.userId,
          request.employee_profile_id,
          parsed.data.score,
          JSON.stringify(answers),
          parsed.data.sentimentLabel
        ]
      );
    }

    await client.query(
      `
        update public.feedback_requests
        set submitted_at = timezone('utc', now()),
            status = 'submitted',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [request.id]
    );

    const existingFlag = await client.query<{ id: string }>(
      `
        select id
        from public.flags
        where feedback_submission_id = $1
        limit 1
      `,
      [submissionId]
    );

    if (!existingFlag.rows[0]) {
      await createFlagFromSubmission(client, {
        feedbackSubmissionId: submissionId,
        subjectProfileId: request.employee_profile_id,
        score: parsed.data.score,
        sentimentLabel: parsed.data.sentimentLabel,
        workflowLabel: `Probation ${request.employee_name ?? "employee"}`
      });
    }

    await syncProbationCheckpointState(client, request.checkpoint_id);

    const checkpointResult = await client.query<{
      waiting_on: "employee" | "manager" | "admin" | null;
    }>(
      `
        select waiting_on::text as waiting_on
        from public.probation_checkpoints
        where id = $1
        limit 1
      `,
      [request.checkpoint_id]
    );

    const waitingOn = checkpointResult.rows[0]?.waiting_on;
    const nextRecipient =
      waitingOn === "manager"
        ? request.manager_profile_id
        : waitingOn === "employee"
          ? request.employee_profile_id
          : waitingOn === "admin"
            ? await findEscalationAdminProfileId(client)
            : null;

    if (nextRecipient) {
      await queueNotification(client, {
        recipientProfileId: nextRecipient,
        channel: "in_app",
        templateKey: "probation_feedback_next_step",
        subject: "Probation checkpoint updated",
        body:
          waitingOn === "admin"
            ? "A probation checkpoint has both submissions and is ready for Admin review."
            : "A probation checkpoint is now waiting on your feedback.",
        actionUrl: waitingOn === "admin" ? "/admin/probation" : "/probation"
      });
    }

    await recordAudit(
      client,
      session.userId,
      "probation_checkpoint",
      request.checkpoint_id,
      "probation_feedback_submitted",
      {
        requestId: request.id,
        actorRole: request.recipient_role,
        score: parsed.data.score,
        sentimentLabel: parsed.data.sentimentLabel
      }
    );
  });

  revalidatePath("/probation");
  revalidatePath("/dashboard");
  revalidatePath("/admin/probation");
  revalidatePath("/flags");
}
