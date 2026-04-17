import { AppShell } from "@/components/app-shell";
import { FormStatus } from "@/components/form-status";
import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import {
  retryFailedNotificationsAction,
  runNotificationOpsAction,
  sendSmtpTestAction,
  verifySmtpConnectionAction
} from "@/app/admin/notifications/actions";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { getNotificationOperationsOverview } from "@/lib/workflows/notification-ops-service";

export default async function AdminNotificationsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const resolvedSearchParams = (await searchParams) ?? {};
  const status =
    typeof resolvedSearchParams.status === "string"
      ? resolvedSearchParams.status
      : undefined;
  const message =
    typeof resolvedSearchParams.message === "string"
      ? resolvedSearchParams.message
      : undefined;

  const overview = await getNotificationOperationsOverview();
  const lastRun = overview.recentRuns[0];

  const metrics = [
    {
      label: "Pending deliveries",
      value: String(overview.counts.pendingDeliveries),
      tone: overview.counts.pendingDeliveries > 0 ? ("accent" as const) : undefined
    },
    {
      label: "Failed deliveries",
      value: String(overview.counts.failedDeliveries),
      tone: overview.counts.failedDeliveries > 0 ? ("warn" as const) : undefined
    },
    {
      label: "Due now",
      value: String(overview.counts.dueNotifications)
    },
    {
      label: "Sent last 24h",
      value: String(overview.counts.sentLast24Hours)
    }
  ];

  return (
    <AppShell
      role={session.role}
      title="Notification operations"
      subtitle="Track delivery readiness, inspect failed notifications, and manually process the queue when deployment scheduling is not available yet."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <FormStatus
        status={status === "success" || status === "error" ? status : "idle"}
        message={message}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Delivery readiness"
          description="SMTP remains deployment-managed, but this workspace shows whether the runtime is ready and gives Admins a safe manual fallback."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-stone-50 p-4">
              <p className="text-sm text-muted">SMTP status</p>
              <p className="mt-3 text-2xl font-semibold text-ink">
                {overview.smtp.configured ? "Configured" : "Missing"}
              </p>
              <p className="mt-2 text-sm text-muted">
                Host: {overview.smtp.host || "Not configured"} | Port:{" "}
                {overview.smtp.port ?? "n/a"}
              </p>
              <p className="mt-2 text-sm text-muted">
                Auth:{" "}
                {overview.smtp.authPartiallyConfigured
                  ? "Incomplete"
                  : overview.smtp.authConfigured
                    ? "Configured"
                    : "Not required"}
                {" | "}Transport:{" "}
                {overview.smtp.secure
                  ? "Implicit TLS"
                  : overview.smtp.requireTls
                    ? "STARTTLS"
                    : "Plain SMTP"}
              </p>
              <p className="mt-2 text-sm text-muted">
                Sender: {overview.smtp.fromName} &lt;{overview.smtp.fromEmail}&gt;
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-stone-50 p-4">
              <p className="text-sm text-muted">Latest processor run</p>
              <p className="mt-3 text-2xl font-semibold text-ink">
                {lastRun ? lastRun.createdAt : "No runs yet"}
              </p>
              <p className="mt-2 text-sm text-muted">
                {lastRun
                  ? `${lastRun.action} via ${lastRun.trigger} by ${lastRun.actorName}`
                  : "Run the processor manually here or wire cron in deployment."}
              </p>
              {lastRun?.errorMessage ? (
                <p className="mt-2 text-sm text-accentWarm">{lastRun.errorMessage}</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border bg-stone-50 p-4">
              <p className="text-sm text-muted">Scheduler endpoint</p>
              <p className="mt-3 text-2xl font-semibold text-ink">
                {overview.scheduler.configured ? "Ready" : "Missing secret"}
              </p>
              <p className="mt-2 break-all text-sm text-muted">
                {overview.scheduler.endpoint}
              </p>
              <p className="mt-2 text-sm text-muted">
                {overview.scheduler.lastAutomatedRunAt
                  ? `Latest automated run: ${overview.scheduler.lastAutomatedRunAt} via ${overview.scheduler.lastAutomatedTrigger}`
                  : "No automated route-triggered run recorded yet."}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <form action={runNotificationOpsAction}>
              <button
                type="submit"
                className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-white"
              >
                Process queue now
              </button>
            </form>

            <form action={sendSmtpTestAction}>
              <button
                type="submit"
                disabled={!overview.smtp.configured}
                className="rounded-full border border-border bg-white px-5 py-3 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send SMTP test to me
              </button>
            </form>

            <form action={verifySmtpConnectionAction}>
              <button
                type="submit"
                disabled={!overview.smtp.configured}
                className="rounded-full border border-border bg-white px-5 py-3 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Verify SMTP connection
              </button>
            </form>

            <form action={retryFailedNotificationsAction}>
              <button
                type="submit"
                disabled={overview.counts.failedDeliveries === 0}
                className="rounded-full border border-border bg-white px-5 py-3 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retry failed deliveries
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
            Deployment can now schedule the internal route at{" "}
            <span className="font-medium text-stone-700">
              {overview.scheduler.endpoint}
            </span>{" "}
            with either the <span className="font-medium text-stone-700">x-pms-job-secret</span>{" "}
            header or a bearer token using <span className="font-medium text-stone-700">INTERNAL_JOB_SECRET</span>.
            Until that recurring scheduler is wired, Admins can still use this manual runner to
            keep reminders, approvals, and escalations moving.
          </div>
        </SectionCard>

        <SectionCard
          title="Recent processor history"
          description="Manual and script-based runs are recorded into audit history so Admins can see the latest processing outcome."
        >
          <div className="space-y-3">
            {overview.recentRuns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
                No notification processor history has been recorded yet.
              </div>
            ) : null}

            {overview.recentRuns.map((run) => (
              <div key={run.id} className="rounded-2xl border border-border bg-stone-50 p-4">
                <p className="font-medium">{run.createdAt}</p>
                <p className="mt-1 text-sm text-muted">
                  {run.action} | {run.trigger} | {run.actorName}
                </p>
                <p className="mt-2 text-xs text-muted">
                  queued {run.queuedNotifications} | processed {run.processedDeliveries} |
                  sent {run.sentDeliveries} | failed {run.failedDeliveries}
                </p>
                {run.errorMessage ? (
                  <p className="mt-2 text-xs text-accentWarm">{run.errorMessage}</p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Recent failed deliveries"
        description="Inspect delivery failures before re-running the queue so you can spot SMTP or recipient-level issues quickly."
      >
        <div className="space-y-3">
          {overview.recentFailures.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
              No failed deliveries are currently recorded.
            </div>
          ) : null}

          {overview.recentFailures.map((failure) => (
            <div
              key={failure.id}
              className="rounded-2xl border border-border bg-stone-50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{failure.subject}</p>
                  <p className="mt-1 text-sm text-muted">
                    {failure.channel} | {failure.recipientEmail}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Scheduled: {failure.scheduledFor} | Last update: {failure.updatedAt} |
                    Retries: {failure.retryCount}
                  </p>
                </div>
                <p className="max-w-xl text-sm text-accentWarm">{failure.lastError}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
