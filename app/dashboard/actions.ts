"use server";

import { revalidatePath } from "next/cache";
import { getAppSession } from "@/lib/auth/session";
import { withDbTransaction } from "@/lib/db/server";
import { recordAudit } from "@/lib/workflows/workflow-helpers";

export async function acknowledgeAdminCatchUpAction() {
  const session = await getAppSession();

  if (session.role !== "admin") {
    return;
  }

  await withDbTransaction(async (client) => {
    await recordAudit(
      client,
      session.userId,
      "dashboard",
      null,
      "admin_catch_up_acknowledged"
    );
  });

  revalidatePath("/dashboard");
}
