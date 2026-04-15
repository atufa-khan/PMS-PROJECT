import type { AppRole } from "@/lib/auth/roles";
import { getDemoSession } from "@/lib/demo-data";
import { syncProfileForAuthUser } from "@/lib/auth/profile-sync";
import { withDbTransaction } from "@/lib/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppSession = {
  userId: string;
  fullName: string;
  role: AppRole;
  email: string;
  isDemo?: boolean;
};

export async function getAppSession(): Promise<AppSession> {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error) {
      console.error("Supabase auth.getUser failed:", error.message);
    }

    if (user?.email) {
      try {
        const profile = await withDbTransaction((client) =>
          syncProfileForAuthUser(client, user)
        );

        return {
          userId: profile.id,
          fullName: profile.full_name,
          role: profile.role,
          email: profile.email
        };
      } catch (syncError) {
        console.error("Profile sync failed:", syncError);
      }
    }
  }

  return {
    ...getDemoSession(),
    isDemo: true
  };
}
