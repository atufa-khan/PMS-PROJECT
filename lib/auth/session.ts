import { cache } from "react";
import { redirect } from "next/navigation";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";
import { syncProfileForAuthUser } from "@/lib/auth/profile-sync";
import { dbQuery, withDbTransaction } from "@/lib/db/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type AppSession = {
  userId: string;
  fullName: string;
  role: AppRole;
  roles: AppRole[];
  email: string;
  isActive?: boolean;
  isDemo?: boolean;
};

type SessionProfileRow = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  primary_role: AppRole | null;
  roles: AppRole[] | null;
};

type SessionRoleRow = {
  role: AppRole;
  is_primary: boolean;
  created_at: string;
};

async function loadSessionProfile(userId: string) {
  const profileResult = await dbQuery<SessionProfileRow>(
    `
      select
        p.id,
        p.full_name,
        p.email,
        p.is_active,
        (
          select ur.role
          from public.user_roles ur
          where ur.profile_id = p.id
          order by ur.is_primary desc, ur.created_at asc
          limit 1
        ) as primary_role,
        (
          select array_remove(array_agg(ur.role order by ur.is_primary desc, ur.created_at asc), null)
          from public.user_roles ur
          where ur.profile_id = p.id
        ) as roles
      from public.profiles
      where auth_user_id = $1::uuid
      limit 1
    `,
    [userId]
  );

  const profile = profileResult.rows[0];

  if (!profile) {
    return null;
  }

  return {
    ...profile,
    roles: profile.roles ?? []
  };
}

async function loadSessionProfileViaSupabase(userId: string) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_active")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("Supabase profile lookup failed:", profileError.message);
    return null;
  }

  if (!profile) {
    return null;
  }

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role, is_primary, created_at")
    .eq("profile_id", profile.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (rolesError) {
    console.error("Supabase role lookup failed:", rolesError.message);
    return null;
  }

  const normalizedRoles = (roles ?? []) as SessionRoleRow[];

  return {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    is_active: profile.is_active,
    primary_role: normalizedRoles[0]?.role ?? null,
    roles: normalizedRoles.map((row) => row.role)
  };
}

async function loadSessionProfileViaAdmin(userId: string) {
  const supabaseAdmin = createSupabaseAdminClient();

  if (!supabaseAdmin) {
    return null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, is_active")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("Supabase admin profile lookup failed:", profileError.message);
    return null;
  }

  if (!profile) {
    return null;
  }

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role, is_primary, created_at")
    .eq("profile_id", profile.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (rolesError) {
    console.error("Supabase admin role lookup failed:", rolesError.message);
    return null;
  }

  const normalizedRoles = (roles ?? []) as SessionRoleRow[];

  return {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    is_active: profile.is_active,
    primary_role: normalizedRoles[0]?.role ?? null,
    roles: normalizedRoles.map((row) => row.role)
  };
}

function deriveFallbackRole(user: User): AppRole {
  const metadataRole =
    typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "";

  if (APP_ROLES.includes(metadataRole as AppRole)) {
    return metadataRole as AppRole;
  }

  return "employee";
}

function deriveFallbackName(user: User) {
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : "";

  if (metadataName.trim()) {
    return metadataName.trim();
  }

  const emailPrefix = user.email?.split("@")[0] ?? "User";
  return emailPrefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const getAppSession = cache(async (): Promise<AppSession> => {
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
    let profile =
      (await loadSessionProfileViaAdmin(user.id)) ??
      (await loadSessionProfileViaSupabase(user.id)) ??
      (await loadSessionProfile(user.id));

    if (!profile) {
      profile = await withDbTransaction(async (client) => {
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
          id: syncedProfile.id,
          full_name: syncedProfile.full_name,
          email: syncedProfile.email,
          is_active: syncedProfile.is_active,
          primary_role: syncedProfile.role,
          roles: rolesResult.rows.map((row) => row.role)
        };
      });
    }

    if (!profile.is_active) {
      redirect("/login");
    }

    const primaryRole = profile.primary_role ?? profile.roles[0] ?? "employee";

    return {
      userId: profile.id,
      fullName: profile.full_name,
      role: primaryRole,
      roles: profile.roles.length > 0 ? profile.roles : [primaryRole],
      email: profile.email,
      isActive: profile.is_active
    };
  } catch (syncError) {
    console.error("Profile sync failed:", syncError);
    const fallbackRole = deriveFallbackRole(user);

    return {
      userId: user.id,
      fullName: deriveFallbackName(user),
      role: fallbackRole,
      roles: fallbackRole === "manager" ? ["manager", "employee"] : [fallbackRole],
      email: user.email ?? "",
      isActive: true
    };
  }
});
