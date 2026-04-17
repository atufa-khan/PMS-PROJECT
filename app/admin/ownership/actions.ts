"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";
import { queueNotification, recordAudit } from "@/lib/workflows/workflow-helpers";

const managerTransferSchema = z.object({
  currentManagerEmail: z.string().email(),
  nextManagerEmail: z.string().email()
});

const goalTransferSchema = z.object({
  currentOwnerEmail: z.string().email(),
  nextOwnerEmail: z.string().email(),
  scope: z.enum(["team", "company", "all_non_individual"])
});

function buildRedirect(
  status: "success" | "error",
  message: string,
  path = "/admin/ownership"
) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("status", status);
  url.searchParams.set("message", message);
  return `${url.pathname}${url.search}` as Route;
}

export async function transferManagerPortfolioAction(formData: FormData) {
  const parsed = managerTransferSchema.safeParse({
    currentManagerEmail: formData.get("currentManagerEmail"),
    nextManagerEmail: formData.get("nextManagerEmail")
  });

  if (!parsed.success) {
    redirect(buildRedirect("error", "Please choose valid manager email addresses."));
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect(buildRedirect("error", "Only Admin can transfer manager portfolios."));
  }

  if (
    parsed.data.currentManagerEmail.toLowerCase() ===
    parsed.data.nextManagerEmail.toLowerCase()
  ) {
    redirect(buildRedirect("error", "Choose two different managers for the transfer."));
  }

  try {
    const affectedEmployees = await withDbTransaction(async (client) => {
      const currentManagerExact = await client.query<{ id: string; full_name: string }>(
        `
          select p.id, p.full_name
          from public.profiles p
          join public.user_roles ur
            on ur.profile_id = p.id
           and ur.role = 'manager'
          where lower(p.email) = lower($1)
          limit 1
        `,
        [parsed.data.currentManagerEmail]
      );
      const nextManagerExact = await client.query<{ id: string; full_name: string }>(
        `
          select p.id, p.full_name
          from public.profiles p
          join public.user_roles ur
            on ur.profile_id = p.id
           and ur.role = 'manager'
          where lower(p.email) = lower($1)
          limit 1
        `,
        [parsed.data.nextManagerEmail]
      );

      const currentManagerProfile = currentManagerExact.rows[0];
      const nextManagerProfile = nextManagerExact.rows[0];

      if (!currentManagerProfile || !nextManagerProfile) {
        throw new Error("Both source and destination managers must exist as active manager profiles.");
      }

      const reports = await client.query<{ profile_id: string }>(
        `
          select profile_id
          from public.employee_records
          where manager_profile_id = $1
        `,
        [currentManagerProfile.id]
      );

      const employeeIds = reports.rows.map((row) => row.profile_id);

      if (employeeIds.length === 0) {
        throw new Error("The selected current manager has no direct reports to transfer.");
      }

      await client.query(
        `
          update public.employee_records
          set manager_profile_id = $2,
              updated_at = timezone('utc', now())
          where manager_profile_id = $1
        `,
        [currentManagerProfile.id, nextManagerProfile.id]
      );

      await client.query(
        `
          update public.manager_assignments
          set ends_on = coalesce(ends_on, current_date),
              updated_at = timezone('utc', now())
          where manager_profile_id = $1
            and employee_profile_id = any($2::uuid[])
            and (ends_on is null or ends_on >= current_date)
        `,
        [currentManagerProfile.id, employeeIds]
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
          select
            gen_random_uuid(),
            transferred.employee_profile_id,
            $2,
            current_date,
            'Portfolio transfer by Admin'
          from unnest($1::uuid[]) as transferred(employee_profile_id)
          where not exists (
            select 1
            from public.manager_assignments existing
            where existing.employee_profile_id = transferred.employee_profile_id
              and existing.manager_profile_id = $2
              and existing.ends_on is null
          )
        `,
        [employeeIds, nextManagerProfile.id]
      );

      await client.query(
        `
          update public.probation_cases
          set manager_profile_id = $2,
              updated_at = timezone('utc', now())
          where employee_profile_id = any($1::uuid[])
        `,
        [employeeIds, nextManagerProfile.id]
      );

      await client.query(
        `
          update public.cycle_enrollments
          set acting_reviewer_profile_id = $2,
              updated_at = timezone('utc', now())
          where acting_reviewer_profile_id = $1
            and employee_profile_id = any($3::uuid[])
            and review_status not in ('waived', 'finalized')
        `,
        [currentManagerProfile.id, nextManagerProfile.id, employeeIds]
      );

      for (const employeeId of employeeIds) {
        await queueNotification(client, {
          recipientProfileId: employeeId,
          channel: "in_app",
          templateKey: "manager_transfer",
          subject: "Reporting manager updated",
          body: `${nextManagerProfile.full_name} is now your reporting manager in PMS.`,
          actionUrl: "/dashboard"
        });
      }

      await queueNotification(client, {
        recipientProfileId: currentManagerProfile.id,
        channel: "in_app",
        templateKey: "manager_transfer_from",
        subject: "Portfolio transfer completed",
        body: `${employeeIds.length} direct report assignments were moved away from your portfolio.`,
        actionUrl: "/dashboard"
      });

      await queueNotification(client, {
        recipientProfileId: nextManagerProfile.id,
        channel: "in_app",
        templateKey: "manager_transfer_to",
        subject: "Portfolio transfer completed",
        body: `${employeeIds.length} direct reports were reassigned into your portfolio.`,
        actionUrl: "/dashboard"
      });

      await recordAudit(client, session.userId, "manager_transfer", null, "manager_portfolio_transferred", {
        fromManagerEmail: parsed.data.currentManagerEmail,
        toManagerEmail: parsed.data.nextManagerEmail,
        employeeCount: employeeIds.length
      });

      return employeeIds.length;
    });

    revalidatePath("/admin/ownership");
    revalidatePath("/dashboard");
    revalidatePath("/probation");
    revalidatePath("/reviews");

    redirect(
      buildRedirect(
        "success",
        `Transferred ${affectedEmployees} direct reports and related reviewer ownership to the new manager.`
      )
    );
  } catch (error) {
    redirect(
      buildRedirect(
        "error",
        error instanceof Error ? error.message : "Unable to transfer manager portfolio."
      )
    );
  }
}

export async function transferGoalOwnershipAction(formData: FormData) {
  const parsed = goalTransferSchema.safeParse({
    currentOwnerEmail: formData.get("currentOwnerEmail"),
    nextOwnerEmail: formData.get("nextOwnerEmail"),
    scope: formData.get("scope")
  });

  if (!parsed.success) {
    redirect(buildRedirect("error", "Please provide valid goal ownership transfer details."));
  }

  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect(buildRedirect("error", "Only Admin can transfer goal ownership."));
  }

  if (
    parsed.data.currentOwnerEmail.toLowerCase() ===
    parsed.data.nextOwnerEmail.toLowerCase()
  ) {
    redirect(buildRedirect("error", "Choose two different users for goal ownership transfer."));
  }

  try {
    const movedGoals = await withDbTransaction(async (client) => {
      const sourceResult = await client.query<{ id: string; full_name: string }>(
        `
          select id, full_name
          from public.profiles
          where lower(email) = lower($1)
            and is_active = true
          limit 1
        `,
        [parsed.data.currentOwnerEmail]
      );

      const targetResult = await client.query<{
        id: string;
        full_name: string;
        elevated_role_count: number | string;
      }>(
        `
          select
            p.id,
            p.full_name,
            count(*) filter (where ur.role in ('manager', 'admin'))::int as elevated_role_count
          from public.profiles p
          left join public.user_roles ur on ur.profile_id = p.id
          where lower(p.email) = lower($1)
            and p.is_active = true
          group by p.id, p.full_name
          limit 1
        `,
        [parsed.data.nextOwnerEmail]
      );

      const source = sourceResult.rows[0];
      const target = targetResult.rows[0];

      if (!source || !target) {
        throw new Error("Both source and destination owners must exist as active profiles.");
      }

      if (Number(target.elevated_role_count) === 0) {
        throw new Error("Team and company goals can only be transferred to a manager or admin.");
      }

      const updatedGoals = await client.query<{ id: string; title: string }>(
        `
          update public.goals
          set owner_profile_id = $2,
              updated_at = timezone('utc', now())
          where owner_profile_id = $1
            and status <> 'archived'
            and (
              ($3 = 'team' and scope = 'team')
              or ($3 = 'company' and scope = 'company')
              or ($3 = 'all_non_individual' and scope in ('team', 'company'))
            )
          returning id, title
        `,
        [source.id, target.id, parsed.data.scope]
      );

      if (updatedGoals.rowCount === 0) {
        throw new Error("No non-archived goals matched the selected transfer scope.");
      }

      for (const goal of updatedGoals.rows) {
        await client.query(
          `
            insert into public.goal_approval_events (
              id,
              goal_id,
              actor_profile_id,
              event_type,
              reason,
              metadata
            )
            values ($1, $2, $3, 'ownership_transfer', $4, $5::jsonb)
          `,
          [
            randomUUID(),
            goal.id,
            session.userId,
            'Goal ownership transferred by Admin',
            JSON.stringify({
              from: parsed.data.currentOwnerEmail,
              to: parsed.data.nextOwnerEmail,
              scope: parsed.data.scope
            })
          ]
        );
      }

      await queueNotification(client, {
        recipientProfileId: target.id,
        channel: "in_app",
        templateKey: "goal_ownership_transfer",
        subject: "Goal ownership transferred",
        body: `${updatedGoals.rowCount} goal(s) are now assigned to you for operational ownership.`,
        actionUrl: "/goals"
      });

      await recordAudit(client, session.userId, "goal_transfer", null, "goal_ownership_transferred", {
        fromOwnerEmail: parsed.data.currentOwnerEmail,
        toOwnerEmail: parsed.data.nextOwnerEmail,
        scope: parsed.data.scope,
        goalCount: updatedGoals.rowCount
      });

      return updatedGoals.rowCount;
    });

    revalidatePath("/admin/ownership");
    revalidatePath("/goals");
    revalidatePath("/goals/approvals");
    revalidatePath("/dashboard");

    redirect(
      buildRedirect(
        "success",
        `Transferred ${movedGoals} goal(s) to the new owner for the selected scope.`
      )
    );
  } catch (error) {
    redirect(
      buildRedirect(
        "error",
        error instanceof Error ? error.message : "Unable to transfer goal ownership."
      )
    );
  }
}
