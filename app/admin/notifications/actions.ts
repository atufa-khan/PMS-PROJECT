"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db/server";
import {
  runNotificationProcessor,
  sendSmtpTestEmail,
  verifySmtpConnection
} from "@/lib/workflows/notification-runtime";

function redirectWithStatus(status: "success" | "error", message: string): never {
  redirect(
    `/admin/notifications?status=${status}&message=${encodeURIComponent(message)}` as never
  );
}

export async function runNotificationOpsAction() {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  try {
    const result = await runNotificationProcessor({
      actorProfileId: session.userId,
      trigger: "admin_manual"
    });

    revalidatePath("/admin/notifications");
    revalidatePath("/dashboard");
    redirectWithStatus(
      "success",
      `Processed ${result.processedDeliveries} deliveries, sent ${result.sentDeliveries}, failed ${result.failedDeliveries}, and queued ${result.queuedNotifications} new notifications.`
    );
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error
        ? error.message
        : "Unable to process notifications right now."
    );
  }
}

export async function sendSmtpTestAction() {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  try {
    await sendSmtpTestEmail({
      actorProfileId: session.userId,
      recipientEmail: session.email
    });

    revalidatePath("/admin/notifications");
    redirectWithStatus("success", `SMTP test email sent to ${session.email}.`);
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "Unable to send the SMTP test email."
    );
  }
}

export async function verifySmtpConnectionAction() {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  try {
    const result = await verifySmtpConnection({
      actorProfileId: session.userId
    });

    revalidatePath("/admin/notifications");
    redirectWithStatus(
      "success",
      `SMTP connection verified on ${result.host}:${result.port ?? "n/a"} using ${result.secure ? "implicit TLS" : result.requireTls ? "STARTTLS" : "plain SMTP"}${result.authConfigured ? " with authentication" : ""}.`
    );
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "Unable to verify the SMTP connection."
    );
  }
}

export async function retryFailedNotificationsAction() {
  const session = await getAppSession();

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  try {
    const retried = await dbQuery<{ total: number | string }>(
      `
        with reset_rows as (
          update public.notification_deliveries
          set status = 'pending',
              last_error = null,
              updated_at = timezone('utc', now())
          where status = 'failed'
          returning id
        )
        select count(*)::int as total
        from reset_rows
      `
    );

    const resetTotal = Number(retried.rows[0]?.total ?? 0);

    const result = await runNotificationProcessor({
      actorProfileId: session.userId,
      trigger: "admin_retry_failed"
    });

    revalidatePath("/admin/notifications");
    revalidatePath("/admin/readiness");

    redirectWithStatus(
      "success",
      `Reset ${resetTotal} failed deliverie(s), then processed ${result.processedDeliveries} deliveries with ${result.sentDeliveries} sent and ${result.failedDeliveries} failed.`
    );
  } catch (error) {
    redirectWithStatus(
      "error",
      error instanceof Error ? error.message : "Unable to retry failed notifications."
    );
  }
}
