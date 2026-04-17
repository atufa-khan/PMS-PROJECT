"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APP_ROLES } from "@/lib/auth/roles";
import { getAppSession } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { withDbTransaction } from "@/lib/db/server";
import { syncProfileForAuthUser } from "@/lib/auth/profile-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/workflows/workflow-helpers";

const provisionUserSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.string().email(),
    role: z.enum(APP_ROLES),
    provisioningMode: z.enum(["invite", "direct"]),
    temporaryPassword: z.string().optional(),
    managerEmail: z.union([z.string().email(), z.literal("")]).optional(),
    note: z.string().max(300).optional()
  })
  .superRefine((value, context) => {
    if (value.provisioningMode === "direct" && (!value.temporaryPassword || value.temporaryPassword.length < 8)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Direct account creation requires a temporary password of at least 8 characters.",
        path: ["temporaryPassword"]
      });
    }
  });

const lifecycleSchema = z.object({
  profileId: z.string().uuid(),
  lifecycleAction: z.enum(["deactivate", "reactivate"])
});

const managerAssignmentSchema = z.object({
  profileId: z.string().uuid(),
  managerEmail: z.string().email()
});

const linkExistingProfileSchema = z.object({
  profileId: z.string().uuid()
});

function redirectWithStatus(status: "success" | "error", message: string): never {
  redirect(
    `/admin/users?status=${status}&message=${encodeURIComponent(message)}` as never
  );
}

async function findExistingAuthUserByEmail(
  supabaseAdmin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  email: string
) {
  let page = 1;
  const perPage = 200;

  while (page <= 5) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error(error.message);
    }

    const foundUser = data.users.find(
      (candidate) => candidate.email?.trim().toLowerCase() === email.trim().toLowerCase()
    );

    if (foundUser) {
      return foundUser;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

export async function provisionUserAction(formData: FormData) {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  const parsed = provisionUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    role: formData.get("role"),
    provisioningMode: formData.get("provisioningMode"),
    temporaryPassword: formData.get("temporaryPassword") || undefined,
    managerEmail: formData.get("managerEmail") || undefined,
    note: formData.get("note") || undefined
  });

  if (!parsed.success) {
    redirectWithStatus(
      "error",
      parsed.error.issues[0]?.message ?? "Invalid provisioning request."
    );
  }

  const input = parsed.data;

  const supabaseAdmin = createSupabaseAdminClient();

  if (!supabaseAdmin) {
    redirectWithStatus(
      "error",
      "Admin provisioning requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const managerEmail =
    input.role === "employee" ? input.managerEmail ?? "" : "";

  try {
    let managerProfileId: string | null = null;
    let existingProfileToLink:
      | {
          id: string;
        }
      | null = null;

    if (managerEmail) {
      const resolvedManager = await withDbTransaction(async (client) => {
        const managerResult = await client.query<{ id: string }>(
          `
            select p.id
            from public.profiles p
            join public.user_roles ur on ur.profile_id = p.id
            where lower(p.email) = lower($1)
              and ur.role = 'manager'
              and p.is_active = true
            limit 1
          `,
          [managerEmail]
        );

        return managerResult.rows[0]?.id ?? null;
      });

      if (!resolvedManager) {
        redirectWithStatus("error", "The selected reporting manager could not be found.");
      }

      managerProfileId = resolvedManager;
    }

    existingProfileToLink = await withDbTransaction(async (client) => {
      const existingProfile = await client.query<{ id: string }>(
        `
          select id
          from public.profiles
          where lower(email) = lower($1)
            and auth_user_id is null
          limit 1
        `,
        [input.email]
      );

      return existingProfile.rows[0] ?? null;
    });

    const userMetadata = {
      full_name: input.fullName,
      role: input.role,
      manager_profile_id: input.role === "employee" ? managerProfileId : null
    };

    let provisionedUser:
      | Awaited<ReturnType<NonNullable<ReturnType<typeof createSupabaseAdminClient>>["auth"]["admin"]["createUser"]>>["data"]["user"]
      | null = null;

    if (input.provisioningMode === "direct") {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: input.email,
        password: input.temporaryPassword!,
        email_confirm: true,
        user_metadata: userMetadata
      });

      if (error) {
        redirectWithStatus("error", error.message);
      }

      provisionedUser = data.user;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        input.email,
        {
          data: userMetadata,
          redirectTo: `${env.APP_URL}/login`
        }
      );

      if (error) {
        redirectWithStatus("error", error.message);
      }

      provisionedUser = data.user;
    }

    if (provisionedUser && existingProfileToLink) {
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        provisionedUser.id,
        {
          app_metadata: {
            ...(provisionedUser.app_metadata ?? {}),
            provisioned_profile_id: existingProfileToLink.id
          }
        }
      );

      if (error) {
        redirectWithStatus("error", error.message);
      }

      provisionedUser = data.user;
    }

    const action =
      input.provisioningMode === "direct"
        ? "user_created"
        : "user_invited";

    await withDbTransaction(async (client) => {
      const syncedProfile = provisionedUser
        ? await syncProfileForAuthUser(client, provisionedUser)
        : null;

      await client.query(
        `
          insert into public.audit_logs (
            id,
            actor_profile_id,
            entity_type,
            entity_id,
            action,
            metadata
          )
          values (
            gen_random_uuid(),
            $1,
            'user_provisioning',
            $2,
            $3,
            $4::jsonb
          )
        `,
        [
          session.userId,
          syncedProfile?.id ?? null,
          action,
          JSON.stringify({
            email: input.email,
            role: input.role,
            mode: input.provisioningMode,
            linkedExistingProfileId: existingProfileToLink?.id ?? null,
            managerEmail: managerEmail || null,
            note: input.note?.trim() || null
          })
        ]
      );
    });

    revalidatePath("/admin/users");
    revalidatePath("/signup");

    redirectWithStatus(
      "success",
      input.provisioningMode === "direct"
        ? "User account created and synced successfully."
        : "User invitation sent and provisioning history recorded."
    );
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "Unable to provision the user."
    );
  }
}

export async function assignReportingManagerAction(formData: FormData) {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  const parsed = managerAssignmentSchema.safeParse({
    profileId: formData.get("profileId"),
    managerEmail: formData.get("managerEmail")
  });

  if (!parsed.success) {
    redirectWithStatus(
      "error",
      parsed.error.issues[0]?.message ?? "Invalid manager assignment request."
    );
  }

  try {
    await withDbTransaction(async (client) => {
      const targetResult = await client.query<{
        id: string;
        full_name: string;
        email: string;
      }>(
        `
          select p.id, p.full_name, p.email
          from public.profiles p
          join public.employee_records er on er.profile_id = p.id
          where p.id = $1
          limit 1
        `,
        [parsed.data.profileId]
      );

      const target = targetResult.rows[0];

      if (!target) {
        throw new Error("The selected employee could not be found.");
      }

      const managerResult = await client.query<{
        id: string;
        full_name: string;
        team_id: string | null;
      }>(
        `
          select p.id, p.full_name, p.team_id
          from public.profiles p
          join public.user_roles ur on ur.profile_id = p.id
          where lower(p.email) = lower($1)
            and ur.role = 'manager'
            and p.is_active = true
          limit 1
        `,
        [parsed.data.managerEmail]
      );

      const manager = managerResult.rows[0];

      if (!manager) {
        throw new Error("The selected reporting manager could not be found.");
      }

      await client.query(
        `
          update public.employee_records
          set manager_profile_id = $2,
              updated_at = timezone('utc', now())
          where profile_id = $1
        `,
        [target.id, manager.id]
      );

      await client.query(
        `
          update public.manager_assignments
          set ends_on = current_date,
              updated_at = timezone('utc', now())
          where employee_profile_id = $1
            and manager_profile_id <> $2
            and ends_on is null
        `,
        [target.id, manager.id]
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
          select gen_random_uuid(), $1, $2, current_date, 'Assigned by Admin'
          where not exists (
            select 1
            from public.manager_assignments
            where employee_profile_id = $1
              and manager_profile_id = $2
              and ends_on is null
          )
        `,
        [target.id, manager.id]
      );

      await client.query(
        `
          update public.profiles
          set team_id = coalesce(team_id, $2),
              updated_at = timezone('utc', now())
          where id = $1
        `,
        [target.id, manager.team_id]
      );

      await recordAudit(
        client,
        session.userId,
        "user_provisioning",
        target.id,
        "manager_assigned",
        {
          employeeEmail: target.email,
          managerEmail: parsed.data.managerEmail,
          managerName: manager.full_name
        }
      );
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/readiness");
    revalidatePath("/dashboard");

    redirectWithStatus("success", "Reporting manager updated successfully.");
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "Unable to assign the reporting manager."
    );
  }
}

export async function linkExistingProfileAction(formData: FormData) {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  const parsed = linkExistingProfileSchema.safeParse({
    profileId: formData.get("profileId")
  });

  if (!parsed.success) {
    redirectWithStatus("error", "Invalid profile-linking request.");
  }

  const supabaseAdmin = createSupabaseAdminClient();

  if (!supabaseAdmin) {
    redirectWithStatus(
      "error",
      "Profile linking requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  try {
    const targetProfile = await withDbTransaction(async (client) => {
      const result = await client.query<{
        id: string;
        full_name: string;
        email: string;
        auth_user_id: string | null;
        primary_role: (typeof APP_ROLES)[number] | null;
        manager_profile_id: string | null;
      }>(
        `
          select
            p.id,
            p.full_name,
            p.email,
            p.auth_user_id,
            (
              select ur.role
              from public.user_roles ur
              where ur.profile_id = p.id
              order by ur.is_primary desc, ur.created_at asc
              limit 1
            ) as primary_role,
            er.manager_profile_id
          from public.profiles p
          left join public.employee_records er on er.profile_id = p.id
          where p.id = $1
          limit 1
        `,
        [parsed.data.profileId]
      );

      return result.rows[0] ?? null;
    });

    if (!targetProfile) {
      redirectWithStatus("error", "The selected profile could not be found.");
    }

    if (targetProfile.auth_user_id) {
      redirectWithStatus("error", "This profile is already linked to Supabase Auth.");
    }

    const existingAuthUser = await findExistingAuthUserByEmail(
      supabaseAdmin,
      targetProfile.email
    );

    let authUser = existingAuthUser;

    if (!authUser) {
      const inviteResponse = await supabaseAdmin.auth.admin.inviteUserByEmail(
        targetProfile.email,
        {
          data: {
            full_name: targetProfile.full_name,
            role: targetProfile.primary_role ?? "employee",
            manager_profile_id: targetProfile.manager_profile_id
          },
          redirectTo: `${env.APP_URL}/login`
        }
      );

      if (inviteResponse.error) {
        redirectWithStatus("error", inviteResponse.error.message);
      }

      authUser = inviteResponse.data.user;
    }

    if (!authUser) {
      redirectWithStatus("error", "Unable to create or locate the auth user.");
    }

    const updateResponse = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      user_metadata: {
        ...(authUser.user_metadata ?? {}),
        full_name: targetProfile.full_name,
        role: targetProfile.primary_role ?? "employee",
        manager_profile_id: targetProfile.manager_profile_id
      },
      app_metadata: {
        ...(authUser.app_metadata ?? {}),
        provisioned_profile_id: targetProfile.id
      }
    });

    if (updateResponse.error) {
      redirectWithStatus("error", updateResponse.error.message);
    }

    await withDbTransaction(async (client) => {
      await syncProfileForAuthUser(client, updateResponse.data.user);

      await recordAudit(
        client,
        session.userId,
        "user_provisioning",
        targetProfile.id,
        "existing_profile_linked",
        {
          email: targetProfile.email,
          authUserId: updateResponse.data.user.id,
          role: targetProfile.primary_role ?? "employee"
        }
      );
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/readiness");
    revalidatePath("/signup");

    redirectWithStatus(
      "success",
      `Auth access linked successfully for ${targetProfile.email}.`
    );
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "Unable to link this profile to auth."
    );
  }
}

export async function updateUserLifecycleAction(formData: FormData) {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  const parsed = lifecycleSchema.safeParse({
    profileId: formData.get("profileId"),
    lifecycleAction: formData.get("lifecycleAction")
  });

  if (!parsed.success) {
    redirectWithStatus("error", "Invalid lifecycle request.");
  }

  try {
    await withDbTransaction(async (client) => {
      const targetResult = await client.query<{
        id: string;
        full_name: string;
        email: string;
        is_active: boolean;
        direct_report_count: number | string;
        active_review_assignment_count: number | string;
        elevated_goal_count: number | string;
      }>(
        `
          select
            p.id,
            p.full_name,
            p.email,
            p.is_active,
            (
              select count(*)::int
              from public.employee_records reports
              where reports.manager_profile_id = p.id
            ) as direct_report_count,
            (
              select count(*)::int
              from public.cycle_enrollments ce
              where ce.acting_reviewer_profile_id = p.id
                and ce.review_status not in ('waived', 'finalized')
            ) as active_review_assignment_count,
            (
              select count(*)::int
              from public.goals g
              where g.owner_profile_id = p.id
                and g.scope in ('team', 'company')
                and g.status <> 'archived'
            ) as elevated_goal_count
          from public.profiles p
          where p.id = $1
          limit 1
        `,
        [parsed.data.profileId]
      );

      const target = targetResult.rows[0];

      if (!target) {
        throw new Error("The selected user could not be found.");
      }

      if (parsed.data.lifecycleAction === "deactivate") {
        if (!target.is_active) {
          throw new Error("This user is already inactive.");
        }

        if (
          Number(target.direct_report_count) > 0 ||
          Number(target.active_review_assignment_count) > 0 ||
          Number(target.elevated_goal_count) > 0
        ) {
          throw new Error(
            "Transfer direct reports, acting reviewer assignments, and team/company goals before deactivating this user."
          );
        }

        await client.query(
          `
            update public.profiles
            set is_active = false,
                updated_at = timezone('utc', now())
            where id = $1
          `,
          [target.id]
        );

        await client.query(
          `
            update public.employee_records
            set employment_status = 'inactive',
                probation_status = case
                  when probation_status in ('active', 'paused', 'extended')
                    then 'terminated'
                  else probation_status
                end,
                updated_at = timezone('utc', now())
            where profile_id = $1
          `,
          [target.id]
        );

        await client.query(
          `
            update public.probation_cases
            set status = 'terminated',
                admin_briefing_note = concat(
                  coalesce(admin_briefing_note, ''),
                  case when admin_briefing_note is null then '' else ' | ' end,
                  'User deactivated by Admin on ',
                  to_char(current_date, 'YYYY-MM-DD')
                ),
                updated_at = timezone('utc', now())
            where employee_profile_id = $1
              and status <> 'terminated'
          `,
          [target.id]
        );
      } else {
        if (target.is_active) {
          throw new Error("This user is already active.");
        }

        await client.query(
          `
            update public.profiles
            set is_active = true,
                updated_at = timezone('utc', now())
            where id = $1
          `,
          [target.id]
        );

        await client.query(
          `
            update public.employee_records
            set employment_status = 'active',
                updated_at = timezone('utc', now())
            where profile_id = $1
          `,
          [target.id]
        );
      }

      await recordAudit(
        client,
        session.userId,
        "user_lifecycle",
        target.id,
        parsed.data.lifecycleAction === "deactivate"
          ? "user_deactivated"
          : "user_reactivated",
        {
          email: target.email,
          fullName: target.full_name
        }
      );
    });

    revalidatePath("/admin/users");
    revalidatePath("/dashboard");

    redirectWithStatus(
      "success",
      parsed.data.lifecycleAction === "deactivate"
        ? "User deactivated successfully."
        : "User reactivated successfully."
    );
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "Unable to update the user lifecycle state."
    );
  }
}
