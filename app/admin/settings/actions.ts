"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { dbQuery, withDbTransaction } from "@/lib/db/server";

const settingsSchema = z.object({
  redFlagThreshold: z.coerce.number().min(1).max(5),
  secondaryAdminName: z.string().min(2)
});

export type SettingsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function updateAdminSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const parsed = settingsSchema.safeParse({
    redFlagThreshold: formData.get("redFlagThreshold"),
    secondaryAdminName: formData.get("secondaryAdminName")
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid settings input."
    };
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    return {
      status: "error",
      message: "Only Admin users can update system settings."
    };
  }

  try {
    const adminProfile = await dbQuery<{ id: string }>(
      `
        select id
        from public.profiles
        where lower(full_name) = lower($1)
        limit 1
      `,
      [parsed.data.secondaryAdminName]
    );

    await withDbTransaction(async (client) => {
      await client.query(
        `
          update public.app_settings
          set red_flag_threshold = $1,
              secondary_admin_profile_id = $2,
              is_review_activation_blocked = false,
              updated_at = timezone('utc', now())
        `,
        [parsed.data.redFlagThreshold, adminProfile.rows[0]?.id ?? null]
      );

      await client.query(
        `
          insert into public.audit_logs (id, actor_profile_id, entity_type, entity_id, action, metadata)
          select
            gen_random_uuid(),
            $1,
            'app_settings',
            id,
            'settings_updated',
            $2::jsonb
          from public.app_settings
          limit 1
        `,
        [
          session.userId,
          JSON.stringify({
            redFlagThreshold: parsed.data.redFlagThreshold,
            secondaryAdminName: parsed.data.secondaryAdminName
          })
        ]
      );
    });
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to update settings."
    };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");

  return {
    status: "success",
    message: "Admin settings updated."
  };
}
