import "server-only";

import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import type { PoolClient } from "pg";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";

type SyncedProfile = {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
};

function deriveRequestedRole(user: User): AppRole {
  const metadataRole =
    typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "";

  if (APP_ROLES.includes(metadataRole as AppRole)) {
    return metadataRole as AppRole;
  }

  return "employee";
}

async function ensurePrimaryRole(
  client: PoolClient,
  profileId: string,
  requestedRole: AppRole
) {
  const existingRoles = await client.query<{ id: string; role: AppRole }>(
    `
      select id, role
      from public.user_roles
      where profile_id = $1
      order by created_at asc
    `,
    [profileId]
  );

  const hasRequestedRole = existingRoles.rows.some(
    (row) => row.role === requestedRole
  );

  if (!hasRequestedRole) {
    await client.query(
      `
        insert into public.user_roles (id, profile_id, role, is_primary)
        values ($1, $2, $3, false)
      `,
      [randomUUID(), profileId, requestedRole]
    );
  }

  await client.query(
    `
      update public.user_roles
      set is_primary = role = $2
      where profile_id = $1
    `,
    [profileId, requestedRole]
  );
}

async function ensureEmploymentRecord(
  client: PoolClient,
  profileId: string
) {
  const existingRecord = await client.query<{ id: string }>(
    `
      select id
      from public.employee_records
      where profile_id = $1
      limit 1
    `,
    [profileId]
  );

  if (existingRecord.rows[0]) {
    return;
  }

  await client.query(
    `
      insert into public.employee_records (
        id,
        profile_id,
        date_of_joining,
        review_track,
        probation_status,
        employment_status
      )
      values ($1, $2, current_date, 'biannual', 'active', 'active')
    `,
    [randomUUID(), profileId]
  );
}

function deriveFullName(user: User) {
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : "";

  if (metadataName.trim()) {
    return metadataName.trim();
  }

  const emailPrefix = user.email?.split("@")[0] ?? "New User";
  return emailPrefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function syncProfileForAuthUser(
  client: PoolClient,
  user: User
): Promise<SyncedProfile> {
  const email = user.email?.trim().toLowerCase();
  const requestedRole = deriveRequestedRole(user);

  if (!email) {
    throw new Error("Authenticated user is missing an email address.");
  }

  const existingProfileResult = await client.query<{
    id: string;
    full_name: string;
    email: string;
    auth_user_id: string | null;
  }>(
    `
      select id, full_name, email, auth_user_id
      from public.profiles
      where auth_user_id = $1 or lower(email) = $2
      order by case when auth_user_id = $1 then 0 else 1 end
      limit 1
    `,
    [user.id, email]
  );

  let profile = existingProfileResult.rows[0];

  if (!profile) {
    const id = randomUUID();
    const fullName = deriveFullName(user);
    const employeeCode = `SELF-${Date.now().toString().slice(-8)}`;

    await client.query(
      `
        insert into public.profiles (id, auth_user_id, employee_code, full_name, email)
        values ($1, $2, $3, $4, $5)
      `,
      [id, user.id, employeeCode, fullName, email]
    );

    await client.query(
      `
        insert into public.user_roles (id, profile_id, role, is_primary)
        values ($1, $2, $3, true)
      `,
      [randomUUID(), id, requestedRole]
    );

    await ensureEmploymentRecord(client, id);

    profile = {
      id,
      full_name: fullName,
      email,
      auth_user_id: user.id
    };
  } else if (profile.auth_user_id !== user.id) {
    await client.query(
      `
        update public.profiles
        set auth_user_id = $1, updated_at = timezone('utc', now())
        where id = $2
      `,
      [user.id, profile.id]
    );
  }

  await ensurePrimaryRole(client, profile.id, requestedRole);
  await ensureEmploymentRecord(client, profile.id);

  const roleResult = await client.query<{
    role: AppRole;
  }>(
    `
      select role
      from public.user_roles
      where profile_id = $1
      order by is_primary desc, created_at asc
      limit 1
    `,
    [profile.id]
  );

  const role = roleResult.rows[0]?.role ?? "employee";

  return {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role
  };
}
