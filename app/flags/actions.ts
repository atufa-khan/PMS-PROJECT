"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";
import {
  findEscalationAdminProfileId,
  queueNotification,
  recordAudit
} from "@/lib/workflows/workflow-helpers";

const flagIdSchema = z.object({
  flagId: z.string().uuid()
});

const flagNoteSchema = z.object({
  flagId: z.string().uuid(),
  note: z.string().min(3).max(1000)
});

export async function startFlagReviewAction(formData: FormData) {
  const parsed = flagIdSchema.safeParse({
    flagId: formData.get("flagId")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  await withDbTransaction(async (client) => {
    await client.query(
      `
        update public.flags
        set status = 'in_review',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.flagId]
    );

    await client.query(
      `
        insert into public.flag_actions (id, flag_id, actor_profile_id, action_type, note)
        values (gen_random_uuid(), $1, $2, 'review_started', 'Admin started reviewing this flag')
      `,
      [parsed.data.flagId, session.userId]
    );

    await recordAudit(client, session.userId, "flag", parsed.data.flagId, "flag_review_started");
  });

  revalidatePath("/flags");
  revalidatePath("/dashboard");
}

export async function resolveFlagAction(formData: FormData) {
  const parsed = flagNoteSchema.safeParse({
    flagId: formData.get("flagId"),
    note: formData.get("note")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  await withDbTransaction(async (client) => {
    await client.query(
      `
        update public.flags
        set status = 'resolved',
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.flagId]
    );

    await client.query(
      `
        insert into public.flag_actions (id, flag_id, actor_profile_id, action_type, note)
        values (gen_random_uuid(), $1, $2, 'resolved', $3)
      `,
      [parsed.data.flagId, session.userId, parsed.data.note]
    );

    await recordAudit(client, session.userId, "flag", parsed.data.flagId, "flag_resolved", {
      note: parsed.data.note
    });
  });

  revalidatePath("/flags");
  revalidatePath("/dashboard");
}

export async function escalateFlagAction(formData: FormData) {
  const parsed = flagNoteSchema.safeParse({
    flagId: formData.get("flagId"),
    note: formData.get("note")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  await withDbTransaction(async (client) => {
    await client.query(
      `
        update public.flags
        set status = 'escalated',
            aged_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.flagId]
    );

    await client.query(
      `
        insert into public.flag_actions (id, flag_id, actor_profile_id, action_type, note)
        values (gen_random_uuid(), $1, $2, 'escalated', $3)
      `,
      [parsed.data.flagId, session.userId, parsed.data.note]
    );

    const escalationAdmin = await findEscalationAdminProfileId(client);

    await queueNotification(client, {
      recipientProfileId: escalationAdmin,
      channel: "in_app",
      templateKey: "flag_escalated",
      subject: "Flag escalated",
      body: "A workflow flag has been escalated and needs higher-priority attention.",
      actionUrl: "/flags"
    });

    await recordAudit(client, session.userId, "flag", parsed.data.flagId, "flag_escalated", {
      note: parsed.data.note
    });
  });

  revalidatePath("/flags");
  revalidatePath("/dashboard");
}
