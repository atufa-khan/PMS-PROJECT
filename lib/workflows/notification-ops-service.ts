import { getInternalJobSummary, getSmtpSummary } from "@/lib/config/env";
import type {
  NotificationFailureRecord,
  NotificationOperationsOverview,
  NotificationProcessorRunRecord
} from "@/lib/db/types";
import { dbQuery } from "@/lib/db/server";

export async function getNotificationOperationsOverview(): Promise<NotificationOperationsOverview> {
  const [countResult, failuresResult, runsResult] = await Promise.all([
    dbQuery<{
      pending_deliveries: number | string;
      failed_deliveries: number | string;
      sent_last_24_hours: number | string;
      due_notifications: number | string;
    }>(
      `
        select
          (select count(*)::int from public.notification_deliveries where status = 'pending') as pending_deliveries,
          (select count(*)::int from public.notification_deliveries where status = 'failed') as failed_deliveries,
          (
            select count(*)::int
            from public.notification_deliveries
            where status = 'sent'
              and delivered_at >= timezone('utc', now()) - interval '24 hours'
          ) as sent_last_24_hours,
          (
            select count(*)::int
            from public.notifications n
            join public.notification_deliveries d on d.notification_id = n.id
            where d.status = 'pending'
              and n.scheduled_for <= timezone('utc', now())
          ) as due_notifications
      `
    ),
    dbQuery<{
      id: string;
      subject: string;
      recipient_email: string;
      channel: "email" | "in_app";
      last_error: string | null;
      retry_count: number | string;
      scheduled_for_label: string;
      updated_at_label: string;
    }>(
      `
        select
          d.id,
          n.subject,
          recipient.email as recipient_email,
          n.channel,
          d.last_error,
          d.retry_count,
          to_char(n.scheduled_for, 'DD Mon YYYY HH24:MI') as scheduled_for_label,
          to_char(d.updated_at, 'DD Mon YYYY HH24:MI') as updated_at_label
        from public.notification_deliveries d
        join public.notifications n on n.id = d.notification_id
        join public.profiles recipient on recipient.id = n.recipient_profile_id
        where d.status = 'failed'
        order by d.updated_at desc
        limit 8
      `
    ),
    dbQuery<{
      id: string;
      action: string;
      actor_name: string | null;
      trigger: string | null;
      queued_notifications: number | string | null;
      processed_deliveries: number | string | null;
      sent_deliveries: number | string | null;
      failed_deliveries: number | string | null;
      error_message: string | null;
      created_at_label: string;
    }>(
      `
        select
          audit.id,
          audit.action,
          actor.full_name as actor_name,
          audit.metadata ->> 'trigger' as trigger,
          (audit.metadata ->> 'queuedNotifications') as queued_notifications,
          (audit.metadata ->> 'processedDeliveries') as processed_deliveries,
          (audit.metadata ->> 'sentDeliveries') as sent_deliveries,
          (audit.metadata ->> 'failedDeliveries') as failed_deliveries,
          audit.metadata ->> 'error' as error_message,
          to_char(audit.created_at, 'DD Mon YYYY HH24:MI') as created_at_label
        from public.audit_logs audit
        left join public.profiles actor on actor.id = audit.actor_profile_id
        where audit.entity_type = 'notification_ops'
        order by audit.created_at desc
        limit 10
      `
    )
  ]);

  const counts = countResult.rows[0];

  const recentFailures: NotificationFailureRecord[] = failuresResult.rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    recipientEmail: row.recipient_email,
    channel: row.channel,
    lastError: row.last_error ?? "Unknown delivery error",
    retryCount: Number(row.retry_count ?? 0),
    scheduledFor: row.scheduled_for_label,
    updatedAt: row.updated_at_label
  }));

  const recentRuns: NotificationProcessorRunRecord[] = runsResult.rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.actor_name ?? "System",
    trigger: row.trigger ?? "unknown",
    queuedNotifications: Number(row.queued_notifications ?? 0),
    processedDeliveries: Number(row.processed_deliveries ?? 0),
    sentDeliveries: Number(row.sent_deliveries ?? 0),
    failedDeliveries: Number(row.failed_deliveries ?? 0),
    errorMessage: row.error_message,
    createdAt: row.created_at_label
  }));

  const latestAutomatedRun = recentRuns.find((run) =>
    ["script", "internal_api"].includes(run.trigger)
  );
  const scheduler = getInternalJobSummary();

  return {
    counts: {
      pendingDeliveries: Number(counts?.pending_deliveries ?? 0),
      failedDeliveries: Number(counts?.failed_deliveries ?? 0),
      sentLast24Hours: Number(counts?.sent_last_24_hours ?? 0),
      dueNotifications: Number(counts?.due_notifications ?? 0)
    },
    scheduler: {
      configured: scheduler.configured,
      endpoint: scheduler.endpoint,
      lastAutomatedRunAt: latestAutomatedRun?.createdAt ?? null,
      lastAutomatedTrigger: latestAutomatedRun?.trigger ?? null
    },
    smtp: getSmtpSummary(),
    recentFailures,
    recentRuns
  };
}
