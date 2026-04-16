import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/auth/roles";
import { syncProfileForAuthUser } from "@/lib/auth/profile-sync";
import { withDbTransaction } from "@/lib/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppSession = {
  userId: string;
  fullName: string;
  role: AppRole;
  roles: AppRole[];
  email: string;
  isDemo?: boolean;
};

export async function getAppSession(): Promise<AppSession> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase auth is not configured.");
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Supabase auth.getUser failed:", error.message);
  }

  if (!user?.email) {
    redirect("/login");
  }

  try {
    const profile = await withDbTransaction(async (client) => {
      const syncedProfile = await syncProfileForAuthUser(client, user);
      const rolesResult = await client.query<{ role: AppRole }>(
        `
          select role
          from public.user_roles
          where profile_id = $1
          order by is_primary desc, created_at asc
        `,
        [syncedProfile.id]
      );

      return {
        ...syncedProfile,
        roles: rolesResult.rows.map((row) => row.role)
      };
    });

    return {
      userId: profile.id,
      fullName: profile.full_name,
      role: profile.role,
      roles: profile.roles.length > 0 ? profile.roles : [profile.role],
      email: profile.email
    };
  } catch (syncError) {
    console.error("Profile sync failed:", syncError);
    throw new Error("Unable to load the signed-in user profile.");
  }
}
