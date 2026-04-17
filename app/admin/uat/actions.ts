"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";
import { syncProfileForAuthUser } from "@/lib/auth/profile-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/workflows/workflow-helpers";
import { SEEDED_UAT_FIXTURES } from "@/lib/workflows/uat-fixtures";

const uatExecutionSchema = z.object({
  scenarioKey: z.string().min(2),
  scenarioTitle: z.string().min(2),
  scenarioType: z.enum(["role", "seeded"]),
  testedAccountEmail: z.string().email().optional().or(z.literal("")),
  outcome: z.enum(["passed", "follow_up", "blocked"]),
  note: z.string().max(400).optional().or(z.literal(""))
});

function redirectWithStatus(status: "success" | "error", message: string): never {
  redirect(`/admin/uat?status=${status}&message=${encodeURIComponent(message)}` as never);
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

export async function prepareSeededUatAccessAction() {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  const supabaseAdmin = createSupabaseAdminClient();

  if (!supabaseAdmin) {
    redirectWithStatus(
      "error",
      "Seeded UAT access requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  try {
    let preparedCount = 0;

    for (const fixture of SEEDED_UAT_FIXTURES) {
      const profile = await withDbTransaction(async (client) => {
        const result = await client.query<{
          id: string;
          full_name: string;
          email: string;
          manager_profile_id: string | null;
        }>(
          `
            select
              p.id,
              p.full_name,
              p.email,
              er.manager_profile_id
            from public.profiles p
            left join public.employee_records er on er.profile_id = p.id
            where lower(p.email) = lower($1)
            limit 1
          `,
          [fixture.email]
        );

        return result.rows[0] ?? null;
      });

      if (!profile) {
        throw new Error(
          `The seeded profile for ${fixture.email} is missing. Apply the PMS seed data before preparing UAT access.`
        );
      }

      let authUser = await findExistingAuthUserByEmail(supabaseAdmin, fixture.email);

      if (!authUser) {
        const created = await supabaseAdmin.auth.admin.createUser({
          email: fixture.email,
          password: fixture.temporaryPassword,
          email_confirm: true,
          user_metadata: {
            full_name: profile.full_name,
            role: fixture.primaryRole,
            manager_profile_id: profile.manager_profile_id
          }
        });

        if (created.error || !created.data.user) {
          throw new Error(created.error?.message ?? `Unable to create auth user for ${fixture.email}.`);
        }

        authUser = created.data.user;
      }

      const updated = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        email_confirm: true,
        password: fixture.temporaryPassword,
        user_metadata: {
          ...(authUser.user_metadata ?? {}),
          full_name: profile.full_name,
          role: fixture.primaryRole,
          manager_profile_id: profile.manager_profile_id
        },
        app_metadata: {
          ...(authUser.app_metadata ?? {}),
          provisioned_profile_id: profile.id
        }
      });

      if (updated.error || !updated.data.user) {
        throw new Error(updated.error?.message ?? `Unable to update auth user for ${fixture.email}.`);
      }

      await withDbTransaction(async (client) => {
        await syncProfileForAuthUser(client, updated.data.user);
        await recordAudit(client, session.userId, "uat_fixture", profile.id, "uat_access_prepared", {
          email: fixture.email,
          primaryRole: fixture.primaryRole,
          roles: fixture.roles,
          temporaryPasswordLabel: "Known fixture password refreshed"
        });
      });

      preparedCount += 1;
    }

    revalidatePath("/admin/uat");
    revalidatePath("/admin/users");
    revalidatePath("/admin/readiness");
    revalidatePath("/login");
    revalidatePath("/signup");

    redirectWithStatus(
      "success",
      `Prepared ${preparedCount} seeded UAT account(s). You can now use the listed fixture emails and temporary passwords from the UAT workspace.`
    );
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "Unable to prepare the seeded UAT access."
    );
  }
}

export async function recordUatExecutionAction(formData: FormData) {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  const parsed = uatExecutionSchema.safeParse({
    scenarioKey: formData.get("scenarioKey"),
    scenarioTitle: formData.get("scenarioTitle"),
    scenarioType: formData.get("scenarioType"),
    testedAccountEmail: formData.get("testedAccountEmail") || "",
    outcome: formData.get("outcome"),
    note: formData.get("note") || ""
  });

  if (!parsed.success) {
    redirectWithStatus(
      "error",
      parsed.error.issues[0]?.message ?? "Invalid UAT execution request."
    );
  }

  try {
    await withDbTransaction(async (client) => {
      await recordAudit(
        client,
        session.userId,
        "uat_execution",
        null,
        parsed.data.outcome === "passed"
          ? "scenario_passed"
          : parsed.data.outcome === "follow_up"
            ? "scenario_follow_up"
            : "scenario_blocked",
        {
          scenarioKey: parsed.data.scenarioKey,
          scenarioTitle: parsed.data.scenarioTitle,
          scenarioType: parsed.data.scenarioType,
          outcome: parsed.data.outcome,
          testedAccountEmail: parsed.data.testedAccountEmail || null,
          note: parsed.data.note?.trim() || null
        }
      );
    });

    revalidatePath("/admin/uat");
    revalidatePath("/admin/readiness");

    redirectWithStatus(
      "success",
      `Recorded ${parsed.data.outcome.replace("_", " ")} for ${parsed.data.scenarioTitle}.`
    );
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "Unable to record the UAT execution."
    );
  }
}
