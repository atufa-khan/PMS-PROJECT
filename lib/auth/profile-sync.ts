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

type ManagerCandidate = {
  id: string;
  team_id: string | null;
};

function deriveRequestedRole(user: User): AppRole {
  const metadataRole =
    typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "";

  if (APP_ROLES.includes(metadataRole as AppRole)) {
    return metadataRole as AppRole;
  }

  return "employee";
}

function deriveRequestedManagerProfileId(user: User) {
  return typeof user.user_metadata?.manager_profile_id === "string" &&
    user.user_metadata.manager_profile_id.trim()
    ? user.user_metadata.manager_profile_id.trim()
    : null;
}

async function resolveManagerCandidate(
  client: PoolClient,
  {
    profileId,
    profileName,
    requestedRole,
    requestedManagerProfileId
  }: {
    profileId: string;
    profileName: string;
    requestedRole: AppRole;
    requestedManagerProfileId: string | null;
  }
): Promise<ManagerCandidate | null> {
  if (requestedRole !== "employee") {
    return null;
  }

  if (requestedManagerProfileId) {
    const requestedManager = await client.query<ManagerCandidate>(
      `
        select p.id, p.team_id
        from public.profiles p
        join public.user_roles ur on ur.profile_id = p.id
        where p.id = $1
          and ur.role = 'manager'
          and p.is_active = true
        limit 1
      `,
      [requestedManagerProfileId]
    );

    if (requestedManager.rows[0]) {
      return requestedManager.rows[0];
    }
  }

  const sameNameManagers = await client.query<ManagerCandidate>(
    `
      select p.id, p.team_id
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      where ur.role = 'manager'
        and p.is_active = true
        and p.id <> $1
        and lower(trim(p.full_name)) = lower(trim($2))
      order by ur.is_primary desc, p.created_at asc
      limit 2
    `,
    [profileId, profileName]
  );

  if (sameNameManagers.rows.length === 1) {
    return sameNameManagers.rows[0];
  }

  const allManagers = await client.query<ManagerCandidate>(
    `
      select p.id, p.team_id
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      where ur.role = 'manager'
        and p.is_active = true
      order by ur.is_primary desc, p.created_at asc
      limit 2
    `
  );

  if (allManagers.rows.length === 1) {
    return allManagers.rows[0];
  }

  return null;
}

async function ensurePrimaryRole(
  client: PoolClient,
  profileId: string,
  requestedRole: AppRole,
  allowRoleExpansion: boolean
) {
  const requestedRoles: AppRole[] =
    requestedRole === "manager"
      ? ["manager", "employee"]
      : [requestedRole];
  const existingRoles = await client.query<{ id: string; role: AppRole }>(
    `
      select id, role
      from public.user_roles
      where profile_id = $1
      order by created_at asc
    `,
    [profileId]
  );

  const existingRoleSet = new Set(existingRoles.rows.map((row) => row.role));

  for (const role of requestedRoles) {
    const shouldGrant =
      !existingRoleSet.has(role) &&
      (allowRoleExpansion || role === "employee");

    if (!shouldGrant) {
      continue;
    }

    await client.query(
      `
        insert into public.user_roles (id, profile_id, role, is_primary)
        values ($1, $2, $3, false)
      `,
      [randomUUID(), profileId, role]
    );
  }

  const primaryRole =
    existingRoleSet.has(requestedRole) || allowRoleExpansion
      ? requestedRole
      : existingRoles.rows[0]?.role ?? "employee";

  await client.query(
    `
      update public.user_roles
      set is_primary = role = $2
      where profile_id = $1
    `,
    [profileId, primaryRole]
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

async function assignManagerIfMissing(
  client: PoolClient,
  {
    profileId,
    profileName,
    requestedRole,
    requestedManagerProfileId
  }: {
    profileId: string;
    profileName: string;
    requestedRole: AppRole;
    requestedManagerProfileId: string | null;
  }
) {
  const recordResult = await client.query<{ manager_profile_id: string | null }>(
    `
      select manager_profile_id
      from public.employee_records
      where profile_id = $1
      limit 1
    `,
    [profileId]
  );

  if (recordResult.rows[0]?.manager_profile_id) {
    return;
  }

  const managerCandidate = await resolveManagerCandidate(client, {
    profileId,
    profileName,
    requestedRole,
    requestedManagerProfileId
  });

  if (!managerCandidate) {
    return;
  }

  await client.query(
    `
      update public.employee_records
      set manager_profile_id = $2,
          updated_at = timezone('utc', now())
      where profile_id = $1
    `,
    [profileId, managerCandidate.id]
  );

  await client.query(
    `
      insert into public.manager_assignments (
        id,
        employee_profile_id,
        manager_profile_id,
        starts_on,
        reason
      )
      select $1, $2, $3, current_date, 'Assigned during account sync'
      where not exists (
        select 1
        from public.manager_assignments
        where employee_profile_id = $2
          and manager_profile_id = $3
          and ends_on is null
      )
    `,
    [randomUUID(), profileId, managerCandidate.id]
  );

  await client.query(
    `
      update public.profiles
      set team_id = coalesce(team_id, $2),
          updated_at = timezone('utc', now())
      where id = $1
    `,
    [profileId, managerCandidate.team_id]
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
  const requestedManagerProfileId = deriveRequestedManagerProfileId(user);

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
      where auth_user_id = $1
      limit 1
    `,
    [user.id]
  );

  let profile = existingProfileResult.rows[0];
  let createdProfile = false;

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

    createdProfile = true;

    profile = {
      id,
      full_name: fullName,
      email,
      auth_user_id: user.id
    };
  } else {
    await client.query(
      `
        update public.profiles
        set full_name = $1,
            email = $2,
            updated_at = timezone('utc', now())
        where id = $3
      `,
      [deriveFullName(user), email, profile.id]
    );

    profile = {
      ...profile,
      full_name: deriveFullName(user),
      email
    };
  }

  await ensurePrimaryRole(client, profile.id, requestedRole, createdProfile);
  await ensureEmploymentRecord(client, profile.id);
  await assignManagerIfMissing(client, {
    profileId: profile.id,
    profileName: profile.full_name,
    requestedRole,
    requestedManagerProfileId
  });

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
