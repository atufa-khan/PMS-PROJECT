"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";
import { queueNotification, recordAudit } from "@/lib/workflows/workflow-helpers";

const cycleIdSchema = z.object({
  cycleId: z.string().uuid()
});

const toggleSchema = z.object({
  cycleId: z.string().uuid(),
  nextActive: z.enum(["true", "false"])
});

const extendSchema = z.object({
  cycleId: z.string().uuid(),
  closeDate: z.string().min(1)
});

export async function syncCycleEnrollmentsAction(formData: FormData) {
  const parsed = cycleIdSchema.safeParse({
    cycleId: formData.get("cycleId")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  await withDbTransaction(async (client) => {
    const cycleResult = await client.query<{
      id: string;
      cycle_type: "biannual" | "quarterly";
      close_date: string;
    }>(
      `
        select id, cycle_type, to_char(close_date, 'YYYY-MM-DD') as close_date
        from public.review_cycles
        where id = $1
        limit 1
      `,
      [parsed.data.cycleId]
    );

    const cycle = cycleResult.rows[0];

    if (!cycle) {
      return;
    }

    const insertResult = await client.query<{
      employee_profile_id: string;
      acting_reviewer_profile_id: string | null;
    }>(
      `
        insert into public.cycle_enrollments (
          id,
          cycle_id,
          employee_profile_id,
          acting_reviewer_profile_id,
          discussion_status,
          review_status,
          eligibility_note
        )
        select
          gen_random_uuid(),
          $1,
          er.profile_id,
          er.manager_profile_id,
          'not_scheduled',
          'not_started',
          case
            when er.date_of_joining <= ($2::date - interval '60 days')
              then 'Eligible for this review cycle'
            else 'Joined within 60 days of cycle close; Admin can waive if needed'
          end
        from public.employee_records er
        where er.employment_status = 'active'
          and er.review_track = $3::public.review_track
          and not exists (
            select 1
            from public.cycle_enrollments existing
            where existing.cycle_id = $1
              and existing.employee_profile_id = er.profile_id
          )
        returning employee_profile_id, acting_reviewer_profile_id
      `,
      [parsed.data.cycleId, cycle.close_date, cycle.cycle_type]
    );

    for (const row of insertResult.rows) {
      await queueNotification(client, {
        recipientProfileId: row.employee_profile_id,
        channel: "in_app",
        templateKey: "cycle_enrollment_created",
        subject: "You were enrolled in a review cycle",
        body: "Your review cycle entry is now available in the Reviews workspace.",
        actionUrl: `/reviews/${parsed.data.cycleId}`
      });

      await queueNotification(client, {
        recipientProfileId: row.acting_reviewer_profile_id,
        channel: "in_app",
        templateKey: "cycle_reviewer_assigned",
        subject: "You were assigned as acting reviewer",
        body: "A cycle enrollment now needs reviewer ownership.",
        actionUrl: `/reviews/${parsed.data.cycleId}`
      });
    }

    await recordAudit(client, session.userId, "review_cycle", parsed.data.cycleId, "cycle_enrollments_synced", {
      inserted: insertResult.rowCount
    });
  });

  revalidatePath("/admin/cycles");
  revalidatePath("/reviews");
  revalidatePath("/dashboard");
}

export async function toggleCycleActivationAction(formData: FormData) {
  const parsed = toggleSchema.safeParse({
    cycleId: formData.get("cycleId"),
    nextActive: formData.get("nextActive")
  });

  if (!parsed.success) {
    return;
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  await withDbTransaction(async (client) => {
    if (parsed.data.nextActive === "true") {
      const settingsResult = await client.query<{
        red_flag_threshold: number | string | null;
      }>(
        `
          select red_flag_threshold
          from public.app_settings
          limit 1
        `
      );

      if (settingsResult.rows[0]?.red_flag_threshold == null) {
        await recordAudit(client, session.userId, "review_cycle", parsed.data.cycleId, "cycle_activation_blocked", {
          reason: "red_flag_threshold_missing"
        });
        return;
      }
    }

    await client.query(
      `
        update public.review_cycles
        set is_active = $2,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.cycleId, parsed.data.nextActive === "true"]
    );

    await recordAudit(client, session.userId, "review_cycle", parsed.data.cycleId, "cycle_activation_toggled", {
      isActive: parsed.data.nextActive === "true"
    });
  });

  revalidatePath("/admin/cycles");
  revalidatePath("/reviews");
}

export async function extendCycleCloseDateAction(formData: FormData) {
  const parsed = extendSchema.safeParse({
    cycleId: formData.get("cycleId"),
    closeDate: formData.get("closeDate")
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
        update public.review_cycles
        set close_date = $2::date,
            finalization_date = ($2::date + interval '1 day')::date,
            updated_at = timezone('utc', now())
        where id = $1
      `,
      [parsed.data.cycleId, parsed.data.closeDate]
    );

    await recordAudit(client, session.userId, "review_cycle", parsed.data.cycleId, "cycle_close_date_extended", {
      closeDate: parsed.data.closeDate
    });
  });

  revalidatePath("/admin/cycles");
  revalidatePath("/reviews");
}
