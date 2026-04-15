import { dbQuery } from "@/lib/db/server";

export type AdminSettingsRecord = {
  redFlagThreshold: number;
  secondaryAdminName: string;
};

export async function getAdminSettings(): Promise<AdminSettingsRecord> {
  try {
    const result = await dbQuery<{
      red_flag_threshold: number | null;
      secondary_admin_profile_id: string | null;
      secondary_admin_name: string | null;
    }>(
      `
        select
          settings.red_flag_threshold,
          settings.secondary_admin_profile_id,
          profile.full_name as secondary_admin_name
        from public.app_settings settings
        left join public.profiles profile
          on profile.id = settings.secondary_admin_profile_id
        limit 1
      `
    );

    const settings = result.rows[0];

    if (!settings) {
      return {
        redFlagThreshold: 2,
        secondaryAdminName: "Priya Nair"
      };
    }

    return {
      redFlagThreshold: settings.red_flag_threshold ?? 2,
      secondaryAdminName: settings.secondary_admin_name ?? "Priya Nair"
    };
  } catch (error) {
    console.error("getAdminSettings failed, falling back to defaults:", error);
    return {
      redFlagThreshold: 2,
      secondaryAdminName: "Priya Nair"
    };
  }
}
