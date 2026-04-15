"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";

const createGoalSchema = z.object({
  title: z.string().min(5),
  scope: z.enum(["individual", "team", "company"]),
  dueDate: z.string().min(1),
  weightage: z.coerce.number().min(0).max(100),
  description: z.string().min(10)
});

export type GoalActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function createGoalAction(
  _prevState: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const parsed = createGoalSchema.safeParse({
    title: formData.get("title"),
    scope: formData.get("scope"),
    dueDate: formData.get("dueDate"),
    weightage: formData.get("weightage"),
    description: formData.get("description")
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the goal details."
    };
  }

  const session = await getAppSession();

  try {
    await withDbTransaction(async (client) => {
      const cycleResult = await client.query<{ id: string }>(
        `
          select id
          from public.review_cycles
          where $1::date between period_start and period_end
          order by close_date asc
          limit 1
        `,
        [parsed.data.dueDate]
      );

      const goalId = randomUUID();
      const goalStatus = session.role === "employee" ? "draft" : "active";

      await client.query(
        `
          insert into public.goals (
            id,
            owner_profile_id,
            cycle_id,
            scope,
            status,
            title,
            description,
            success_metric,
            weightage,
            completion_pct,
            created_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10)
        `,
        [
          goalId,
          session.userId,
          cycleResult.rows[0]?.id ?? null,
          parsed.data.scope,
          goalStatus,
          parsed.data.title,
          parsed.data.description,
          `Due by ${parsed.data.dueDate}`,
          parsed.data.weightage,
          session.userId
        ]
      );

      await client.query(
        `
          insert into public.goal_approval_events (id, goal_id, actor_profile_id, event_type, reason, metadata)
          values ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          randomUUID(),
          goalId,
          session.userId,
          session.role === "employee" ? "draft_created" : "create_active",
          session.role === "employee" ? "Draft created by employee" : "Goal created by manager/admin",
          JSON.stringify({
            dueDate: parsed.data.dueDate,
            weightage: parsed.data.weightage
          })
        ]
      );

      await client.query(
        `
          insert into public.audit_logs (id, actor_profile_id, entity_type, entity_id, action, metadata)
          values ($1, $2, 'goal', $3, $4, $5::jsonb)
        `,
        [
          randomUUID(),
          session.userId,
          goalId,
          "goal_created",
          JSON.stringify({
            scope: parsed.data.scope,
            status: goalStatus,
            dueDate: parsed.data.dueDate
          })
        ]
      );
    });
  } catch (error) {
    console.error("createGoalAction failed:", error);

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to create the goal."
    };
  }

  revalidatePath("/goals");
  revalidatePath("/goals/approvals");
  revalidatePath("/dashboard");

  return {
    status: "success",
    message:
      session.role === "employee"
        ? "Goal draft created. Submit it for approval from the goals workspace."
        : "Goal created successfully."
  };
}
