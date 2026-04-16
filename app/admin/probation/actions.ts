"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";
import {
  queueNotification,
  recordAudit,
  syncProbationCheckpointState
} from "@/lib/workflows/workflow-helpers";

const assignManagerSchema = z.object({
  caseId: z.string().uuid(),
  managerEmail: z.string().email()
});

const scheduleDiscussionSchema = z.object({
  caseId: z.string().uuid(),
  discussionAt: z.string().min(5)
});

const decisionSchema = z.object({
  caseId: z.string().uuid(),
  decision: z.enum(["confirm", "extend_probation", "review_further"]),
  note: z.string().min(3).max(500),
  effectiveOn: z.string().min(1)
});

export async function assignProbationManagerAction(formData: FormData) {
  const parsed = assignManagerSchema.safeParse({
    caseId: formData.get("caseId"),
    managerEmail: formData.get("managerEmail")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  await withDbTransaction(async (client) => {
    const managerResult = await client.query<{ id: string; full_name: string }>(
      `
        select p.id, p.full_name
        from public.profiles p
        join public.user_roles ur on ur.profile_id = p.id
        where lower(p.email) = lower($1)
          and ur.role = 'manager'
        limit 1
      `,
      [parsed.data.managerEmail]
    );

    const probationCaseResult = await client.query<{
      employee_profile_id: string;
    }>(
      `
        select employee_profile_id
        from public.probation_cases
        where id = $1
        limit 1
      `,
      [parsed.data.caseId]
    );

    const manager = managerResult.rows[0];
    const probationCase = probationCaseResult.rows[0];

    if (!manager || !probationCase) {
      return;
    }

    await client.query(
      `
        update public.probation_cases
        set manager_profile_id = $2,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.caseId, manager.id]
    );

    await client.query(
      `
        update public.employee_records
        set manager_profile_id = $2,
            updated_at = timezone('utc', now())
        where profile_id = $1
      `,
      [probationCase.employee_profile_id, manager.id]
    );

    const checkpoints = await client.query<{ id: string; due_date: string }>(
      `
        select id, to_char(due_date, 'YYYY-MM-DD') as due_date
        from public.probation_checkpoints
        where probation_case_id = $1
      `,
      [parsed.data.caseId]
    );

    for (const checkpoint of checkpoints.rows) {
      const requests = await client.query<{
        recipient_role: "employee" | "manager";
      }>(
        `
          select recipient_role::text as recipient_role
          from public.feedback_requests
          where checkpoint_id = $1
        `,
        [checkpoint.id]
      );

      const roles = new Set(requests.rows.map((row) => row.recipient_role));

      if (!roles.has("employee")) {
        await client.query(
          `
            insert into public.feedback_requests (
              id,
              checkpoint_id,
              recipient_profile_id,
              recipient_role,
              due_at,
              status
            )
            values (
              gen_random_uuid(),
              $1,
              $2,
              'employee',
              ($3::date + time '18:30'),
              'pending'
            )
          `,
          [checkpoint.id, probationCase.employee_profile_id, checkpoint.due_date]
        );
      }

      if (!roles.has("manager")) {
        await client.query(
          `
            insert into public.feedback_requests (
              id,
              checkpoint_id,
              recipient_profile_id,
              recipient_role,
              due_at,
              status
            )
            values (
              gen_random_uuid(),
              $1,
              $2,
              'manager',
              ($3::date + time '18:30'),
              'pending'
            )
          `,
          [checkpoint.id, manager.id, checkpoint.due_date]
        );
      }

      await syncProbationCheckpointState(client, checkpoint.id);
    }

    await queueNotification(client, {
      recipientProfileId: manager.id,
      channel: "in_app",
      templateKey: "probation_manager_assigned",
      subject: "You were assigned a probation case",
      body: "A probation case now needs your checkpoint feedback and follow-through.",
      actionUrl: "/probation"
    });

    await recordAudit(client, session.userId, "probation_case", parsed.data.caseId, "manager_assigned", {
      managerEmail: parsed.data.managerEmail,
      managerName: manager.full_name
    });
  });

  revalidatePath("/admin/probation");
  revalidatePath("/probation");
  revalidatePath("/dashboard");
}

export async function scheduleProbationDiscussionAction(formData: FormData) {
  const parsed = scheduleDiscussionSchema.safeParse({
    caseId: formData.get("caseId"),
    discussionAt: formData.get("discussionAt")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  const discussionAt = new Date(parsed.data.discussionAt);

  if (Number.isNaN(discussionAt.getTime())) {
    return;
  }

  await withDbTransaction(async (client) => {
    const caseResult = await client.query<{
      employee_profile_id: string;
      manager_profile_id: string | null;
    }>(
      `
        select employee_profile_id, manager_profile_id
        from public.probation_cases
        where id = $1
        limit 1
      `,
      [parsed.data.caseId]
    );

    const probationCase = caseResult.rows[0];

    if (!probationCase) {
      return;
    }

    await client.query(
      `
        update public.probation_cases
        set confirmation_discussion_status = 'scheduled',
            confirmation_discussion_at = $2,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.caseId, discussionAt.toISOString()]
    );

    await queueNotification(client, {
      recipientProfileId: probationCase.employee_profile_id,
      channel: "in_app",
      templateKey: "probation_discussion_scheduled",
      subject: "Probation discussion scheduled",
      body: "Your probation discussion has been scheduled. Review the probation workspace for timing.",
      actionUrl: "/probation"
    });

    await queueNotification(client, {
      recipientProfileId: probationCase.manager_profile_id,
      channel: "in_app",
      templateKey: "probation_discussion_scheduled_manager",
      subject: "Probation discussion scheduled",
      body: "A probation discussion for your report has been scheduled.",
      actionUrl: "/probation"
    });

    await recordAudit(
      client,
      session.userId,
      "probation_case",
      parsed.data.caseId,
      "probation_discussion_scheduled",
      {
        discussionAt: discussionAt.toISOString()
      }
    );
  });

  revalidatePath("/admin/probation");
  revalidatePath("/probation");
}

export async function recordProbationDecisionAction(formData: FormData) {
  const parsed = decisionSchema.safeParse({
    caseId: formData.get("caseId"),
    decision: formData.get("decision"),
    note: formData.get("note"),
    effectiveOn: formData.get("effectiveOn")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  await withDbTransaction(async (client) => {
    const caseResult = await client.query<{
      employee_profile_id: string;
      manager_profile_id: string | null;
    }>(
      `
        select employee_profile_id, manager_profile_id
        from public.probation_cases
        where id = $1
        limit 1
      `,
      [parsed.data.caseId]
    );

    const probationCase = caseResult.rows[0];

    if (!probationCase) {
      return;
    }

    await client.query(
      `
        insert into public.probation_decisions (
          id,
          probation_case_id,
          decided_by,
          decision,
          note,
          effective_on
        )
        values (gen_random_uuid(), $1, $2, $3, $4, $5::date)
      `,
      [
        parsed.data.caseId,
        session.userId,
        parsed.data.decision,
        parsed.data.note,
        parsed.data.effectiveOn
      ]
    );

    const nextStatus =
      parsed.data.decision === "confirm"
        ? "completed"
        : parsed.data.decision === "extend_probation"
          ? "extended"
          : "active";

    await client.query(
      `
        update public.probation_cases
        set status = $2::public.probation_status,
            confirmation_discussion_status = 'completed',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.caseId, nextStatus]
    );

    await client.query(
      `
        update public.employee_records
        set probation_status = $2::public.probation_status,
            updated_at = timezone('utc', now())
        where profile_id = $1
      `,
      [probationCase.employee_profile_id, nextStatus]
    );

    await queueNotification(client, {
      recipientProfileId: probationCase.employee_profile_id,
      channel: "in_app",
      templateKey: "probation_decision_recorded",
      subject: "Probation decision recorded",
      body: `A probation decision was recorded: ${parsed.data.decision.replaceAll("_", " ")}.`,
      actionUrl: "/probation"
    });

    await queueNotification(client, {
      recipientProfileId: probationCase.manager_profile_id,
      channel: "in_app",
      templateKey: "probation_decision_recorded_manager",
      subject: "Probation decision recorded",
      body: "A probation decision was recorded for your report.",
      actionUrl: "/admin/probation"
    });

    await recordAudit(client, session.userId, "probation_case", parsed.data.caseId, "probation_decision_recorded", {
      decision: parsed.data.decision,
      effectiveOn: parsed.data.effectiveOn
    });
  });

  revalidatePath("/admin/probation");
  revalidatePath("/probation");
  revalidatePath("/dashboard");
}
