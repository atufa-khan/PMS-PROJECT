import "server-only";

import nodemailer from "nodemailer";
import type { PoolClient } from "pg";
import { env, getSmtpSummary } from "@/lib/config/env";
import { addWorkingDays, countWorkingDaysBetween } from "@/lib/dates/working-days";
import { getDbPool } from "@/lib/db/server";
import {
  findEscalationAdminProfileId,
  recordAudit
} from "@/lib/workflows/workflow-helpers";

type NotificationRunSummary = {
  queuedNotifications: number;
  processedDeliveries: number;
  sentDeliveries: number;
  failedDeliveries: number;
  trigger: string;
  smtpConfigured: boolean;
};

function getSmtpTransport() {
  const smtp = getSmtpSummary();

  if (!smtp.configured) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port ?? 0,
    secure: smtp.secure,
    requireTLS: smtp.requireTls,
    auth:
      smtp.authConfigured
        ? {
            user: process.env.SMTP_USER || undefined,
            pass: process.env.SMTP_PASS || undefined
          }
        : undefined,
    tls: {
      rejectUnauthorized: smtp.tlsRejectUnauthorized
    }
  });
}

async function insertNotificationIfMissing(
  client: PoolClient,
  {
    recipientProfileId,
    channel = "in_app",
    templateKey,
    subject,
    body,
    actionUrl,
    scheduledFor = new Date(),
    dedupeHours = 24
  }: {
    recipientProfileId: string | null;
    channel?: "email" | "in_app";
    templateKey: string;
    subject: string;
    body: string;
    actionUrl: string;
    scheduledFor?: Date;
    dedupeHours?: number;
  }
) {
  if (!recipientProfileId) {
    return false;
  }

  const exists = await client.query(
    `
      select 1
      from public.notifications
      where recipient_profile_id = $1
        and template_key = $2
        and coalesce(action_url, '') = coalesce($3, '')
        and created_at >= timezone('utc', now()) - make_interval(hours => $4::int)
      limit 1
    `,
    [recipientProfileId, templateKey, actionUrl, dedupeHours]
  );

  if ((exists.rowCount ?? 0) > 0) {
    return false;
  }

  const inserted = await client.query<{ id: string }>(
    `
      insert into public.notifications (
        id,
        recipient_profile_id,
        channel,
        template_key,
        subject,
        body,
        action_url,
        scheduled_for
      )
      values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
      returning id
    `,
    [
      recipientProfileId,
      channel,
      templateKey,
      subject,
      body,
      actionUrl,
      scheduledFor
    ]
  );

  const notificationId = inserted.rows[0]?.id;

  if (!notificationId) {
    return false;
  }

  await client.query(
    `
      insert into public.notification_deliveries (id, notification_id, status, retry_count)
      values (gen_random_uuid(), $1, 'pending', 0)
    `,
    [notificationId]
  );

  return true;
}

async function ensureProbationWorkflow(client: PoolClient) {
  const employees = await client.query<{
    profile_id: string;
    date_of_joining: string;
    manager_profile_id: string | null;
    probation_status: string;
    employment_status: string;
    on_leave: boolean;
  }>(
    `
      select
        er.profile_id,
        er.date_of_joining,
        er.manager_profile_id,
        er.probation_status::text as probation_status,
        er.employment_status,
        exists (
          select 1
          from public.leave_periods lp
          where lp.employee_profile_id = er.profile_id
            and current_date between lp.starts_on and lp.ends_on
        ) as on_leave
      from public.employee_records er
    `
  );

  for (const employee of employees.rows) {
    if (employee.employment_status !== "active") {
      await client.query(
        `
          update public.probation_cases
          set status = 'terminated',
              admin_briefing_note = concat(
                coalesce(admin_briefing_note, ''),
                case when admin_briefing_note is null then '' else ' | ' end,
                'Employment ended; probation flow auto-terminated on ',
                to_char(current_date, 'YYYY-MM-DD')
              ),
              updated_at = timezone('utc', now())
          where employee_profile_id = $1
            and status <> 'terminated'
        `,
        [employee.profile_id]
      );

      await client.query(
        `
          update public.employee_records
          set probation_status = 'terminated',
              updated_at = timezone('utc', now())
          where profile_id = $1
            and probation_status <> 'terminated'
        `,
        [employee.profile_id]
      );

      continue;
    }

    if (!["active", "paused", "extended"].includes(employee.probation_status)) {
      continue;
    }

    const caseResult = await client.query<{ id: string; status: string }>(
      `
        insert into public.probation_cases (
          id,
          employee_profile_id,
          manager_profile_id,
          status,
          admin_briefing_note
        )
        values (
          gen_random_uuid(),
          $1,
          $2,
          $3::public.probation_status,
          case
            when current_date > ($4::date + interval '80 days')
              then 'Backdated DOJ detected. Review checkpoint history and waiver needs.'
            else null
          end
        )
        on conflict (employee_profile_id)
        do update
          set manager_profile_id = excluded.manager_profile_id,
              status = case
                when public.probation_cases.status in ('completed', 'terminated')
                  then public.probation_cases.status
                else excluded.status
              end,
              updated_at = timezone('utc', now())
        returning id, status::text as status
      `,
      [
        employee.profile_id,
        employee.manager_profile_id,
        employee.on_leave ? "paused" : employee.probation_status,
        employee.date_of_joining
      ]
    );

    const probationCase = caseResult.rows[0];

    if (!probationCase || ["completed", "terminated"].includes(probationCase.status)) {
      continue;
    }

    if (employee.on_leave) {
      await client.query(
        `
          update public.probation_checkpoints
          set status = 'paused',
              manager_context_note = 'Paused automatically while the employee is on leave.',
              updated_at = timezone('utc', now())
          where probation_case_id = $1
            and status <> 'completed'
        `,
        [probationCase.id]
      );
      continue;
    }

    for (const checkpointDay of [30, 60, 80]) {
      const dueDate = addWorkingDays(
        new Date(`${employee.date_of_joining}T00:00:00.000Z`),
        checkpointDay
      );

      const checkpointResult = await client.query<{ id: string }>(
        `
          insert into public.probation_checkpoints (
            id,
            probation_case_id,
            checkpoint_day,
            due_date,
            status,
            waiting_on
          )
          values (
            gen_random_uuid(),
            $1,
            $2,
            $3::date,
            $4,
            $5::public.feedback_actor_type
          )
          on conflict (probation_case_id, checkpoint_day)
          do update
            set due_date = excluded.due_date,
                status = case
                  when public.probation_checkpoints.status = 'paused' then 'in_progress'
                  else public.probation_checkpoints.status
                end,
                updated_at = timezone('utc', now())
          returning id
        `,
        [
          probationCase.id,
          checkpointDay,
          dueDate.toISOString().slice(0, 10),
          employee.manager_profile_id ? "in_progress" : "blocked",
          employee.manager_profile_id ? "employee" : null
        ]
      );

      const checkpointId = checkpointResult.rows[0]?.id;

      if (!checkpointId) {
        continue;
      }

      for (const recipient of [
        { profileId: employee.profile_id, role: "employee" },
        { profileId: employee.manager_profile_id, role: "manager" }
      ] as const) {
        if (!recipient.profileId) {
          continue;
        }

        await client.query(
          `
            insert into public.feedback_requests (
              id,
              checkpoint_id,
              recipient_profile_id,
              recipient_role,
              due_at,
              status
            )
            select
              gen_random_uuid(),
              $1,
              $2,
              $3::public.feedback_actor_type,
              ($4::date + time '18:30'),
              'pending'
            where not exists (
              select 1
              from public.feedback_requests existing
              where existing.checkpoint_id = $1
                and existing.recipient_profile_id = $2
                and existing.recipient_role = $3::public.feedback_actor_type
            )
          `,
          [
            checkpointId,
            recipient.profileId,
            recipient.role,
            dueDate.toISOString().slice(0, 10)
          ]
        );
      }
    }
  }
}

async function queueProbationReminderCadence(client: PoolClient) {
  const escalationAdmin = await findEscalationAdminProfileId(client);
  let queued = 0;

  const pendingRequests = await client.query<{
    id: string;
    recipient_profile_id: string;
    due_at: string;
    checkpoint_day: number;
    employee_name: string;
  }>(
    `
      select
        fr.id,
        fr.recipient_profile_id,
        fr.due_at,
        pc.checkpoint_day,
        employee.full_name as employee_name
      from public.feedback_requests fr
      join public.probation_checkpoints pc on pc.id = fr.checkpoint_id
      join public.probation_cases pcase on pcase.id = pc.probation_case_id
      join public.profiles employee on employee.id = pcase.employee_profile_id
      where fr.checkpoint_id is not null
        and fr.submitted_at is null
    `
  );

  const now = new Date();

  for (const request of pendingRequests.rows) {
    const dueAt = new Date(request.due_at);
    const overdueDays = Math.floor((now.getTime() - dueAt.getTime()) / (1000 * 60 * 60 * 24));

    if ([2, 4, 6].includes(overdueDays)) {
      const inserted = await insertNotificationIfMissing(client, {
        recipientProfileId: request.recipient_profile_id,
        templateKey: `probation_feedback_reminder_${request.id}_${overdueDays}`,
        subject: "Probation feedback reminder",
        body: `Day ${request.checkpoint_day} feedback for ${request.employee_name} is overdue by ${overdueDays} days.`,
        actionUrl: "/probation"
      });

      queued += inserted ? 1 : 0;
    }

    if (overdueDays >= 7) {
      const inserted = await insertNotificationIfMissing(client, {
        recipientProfileId: escalationAdmin,
        templateKey: `probation_feedback_admin_escalation_${request.id}`,
        subject: "Probation feedback escalation",
        body: `Day ${request.checkpoint_day} feedback for ${request.employee_name} is still overdue after 7 days.`,
        actionUrl: "/admin/probation"
      });

      queued += inserted ? 1 : 0;
    }
  }

  return queued;
}

async function queueReviewReminderCadence(client: PoolClient) {
  const dayOfMonth = new Date().getUTCDate();

  if (![5, 15, 22].includes(dayOfMonth)) {
    return 0;
  }

  let queued = 0;

  const activeCycles = await client.query<{ id: string; name: string }>(
    `
      select id, name
      from public.review_cycles
      where is_active = true
         or current_date between trigger_date and close_date
    `
  );

  for (const cycle of activeCycles.rows) {
    const enrollments = await client.query<{
      id: string;
      employee_profile_id: string;
      acting_reviewer_profile_id: string | null;
      employee_name: string;
      has_employee_submission: boolean;
      has_manager_submission: boolean;
    }>(
      `
        select
          ce.id,
          ce.employee_profile_id,
          ce.acting_reviewer_profile_id,
          employee.full_name as employee_name,
          exists (
            select 1
            from public.review_submissions rs
            where rs.cycle_enrollment_id = ce.id
              and rs.submission_role = 'employee'
          ) as has_employee_submission,
          exists (
            select 1
            from public.review_submissions rs
            where rs.cycle_enrollment_id = ce.id
              and rs.submission_role = 'manager'
          ) as has_manager_submission
        from public.cycle_enrollments ce
        join public.profiles employee on employee.id = ce.employee_profile_id
        where ce.cycle_id = $1
          and ce.review_status not in ('waived', 'finalized')
      `,
      [cycle.id]
    );

    for (const enrollment of enrollments.rows) {
      if (!enrollment.has_employee_submission) {
        const inserted = await insertNotificationIfMissing(client, {
          recipientProfileId: enrollment.employee_profile_id,
          templateKey: `review_employee_reminder_${enrollment.id}_${dayOfMonth}`,
          subject: "Review self submission reminder",
          body: `${cycle.name} still needs your self review.`,
          actionUrl: `/reviews/${cycle.id}`,
          dedupeHours: 48
        });

        queued += inserted ? 1 : 0;
      }

      if (enrollment.has_employee_submission && !enrollment.has_manager_submission) {
        const inserted = await insertNotificationIfMissing(client, {
          recipientProfileId: enrollment.acting_reviewer_profile_id,
          templateKey: `review_manager_reminder_${enrollment.id}_${dayOfMonth}`,
          subject: "Manager review reminder",
          body: `${enrollment.employee_name} submitted a self review and now needs your manager review.`,
          actionUrl: `/reviews/${cycle.id}`,
          dedupeHours: 48
        });

        queued += inserted ? 1 : 0;
      }
    }
  }

  return queued;
}

async function queueCompanySuggestionEscalations(client: PoolClient) {
  const escalationAdmin = await findEscalationAdminProfileId(client);
  let queued = 0;

  const suggestions = await client.query<{
    id: string;
    title: string;
    suggested_at: string;
    source_goal_title: string | null;
  }>(
    `
      with latest_suggestion as (
        select distinct on (goal_id)
          goal_id,
          created_at,
          metadata
        from public.goal_approval_events
        where event_type = 'company_goal_suggested'
        order by goal_id, created_at desc
      ),
      latest_ack as (
        select distinct on (goal_id)
          goal_id,
          created_at
        from public.goal_approval_events
        where event_type = 'company_goal_acknowledged'
        order by goal_id, created_at desc
      )
      select
        g.id,
        g.title,
        ls.created_at as suggested_at,
        ls.metadata ->> 'sourceGoalTitle' as source_goal_title
      from latest_suggestion ls
      join public.goals g on g.id = ls.goal_id
      left join latest_ack ack on ack.goal_id = ls.goal_id
      where ack.created_at is null or ack.created_at < ls.created_at
    `
  );

  const now = new Date();

  for (const suggestion of suggestions.rows) {
    if (countWorkingDaysBetween(new Date(suggestion.suggested_at), now) < 5) {
      continue;
    }

    const inserted = await insertNotificationIfMissing(client, {
      recipientProfileId: escalationAdmin,
      templateKey: `company_goal_suggestion_escalation_${suggestion.id}`,
      subject: "Company goal acknowledgment overdue",
      body: `${suggestion.title} still has an unacknowledged company-goal update from ${suggestion.source_goal_title ?? "an upstream company goal"}.`,
      actionUrl: "/goals",
      dedupeHours: 72
    });

    queued += inserted ? 1 : 0;
  }

  return queued;
}

async function queueNotifications(client: PoolClient) {
  let queued = 0;

  await ensureProbationWorkflow(client);
  queued += await queueProbationReminderCadence(client);
  queued += await queueReviewReminderCadence(client);
  queued += await queueCompanySuggestionEscalations(client);

  const pendingApprovals = await client.query(
    `
      insert into public.notifications (
        id,
        recipient_profile_id,
        channel,
        template_key,
        subject,
        body,
        action_url,
        scheduled_for
      )
      select
        gen_random_uuid(),
        approver.approver_id,
        'in_app',
        'goal_approval_pending',
        'Goal approval waiting',
        'A goal has been waiting for your approval.',
        '/goals/approvals',
        timezone('utc', now())
      from (
        select distinct
          coalesce(er.manager_profile_id, settings.secondary_admin_profile_id) as approver_id,
          g.id as goal_id
        from public.goals g
        left join public.employee_records er on er.profile_id = g.owner_profile_id
        cross join public.app_settings settings
        where g.status = 'pending_approval'
      ) approver
      where approver.approver_id is not null
        and not exists (
          select 1
          from public.notifications existing
          where existing.recipient_profile_id = approver.approver_id
            and existing.template_key = 'goal_approval_pending'
            and existing.action_url = '/goals/approvals'
            and existing.created_at >= timezone('utc', now()) - interval '24 hours'
        )
    `
  );
  queued += pendingApprovals.rowCount ?? 0;

  const feedbackDue = await client.query(
    `
      insert into public.notifications (
        id,
        recipient_profile_id,
        channel,
        template_key,
        subject,
        body,
        action_url,
        scheduled_for
      )
      select
        gen_random_uuid(),
        fr.recipient_profile_id,
        'in_app',
        'feedback_due',
        'Feedback due soon',
        'A probation or review feedback task needs your response.',
        case
          when fr.checkpoint_id is not null then '/probation'
          else '/reviews'
        end,
        timezone('utc', now())
      from public.feedback_requests fr
      where fr.submitted_at is null
        and fr.due_at <= timezone('utc', now()) + interval '1 day'
        and not exists (
          select 1
          from public.notifications existing
          where existing.recipient_profile_id = fr.recipient_profile_id
            and existing.template_key = 'feedback_due'
            and existing.created_at >= timezone('utc', now()) - interval '24 hours'
        )
    `
  );
  queued += feedbackDue.rowCount ?? 0;

  const flagReview = await client.query(
    `
      insert into public.notifications (
        id,
        recipient_profile_id,
        channel,
        template_key,
        subject,
        body,
        action_url,
        scheduled_for
      )
      select
        gen_random_uuid(),
        coalesce(settings.secondary_admin_profile_id, settings.admin_successor_profile_id),
        'in_app',
        'flag_review_due',
        'Flag review queue needs attention',
        'There are open workflow flags awaiting Admin review.',
        '/flags',
        timezone('utc', now())
      from public.app_settings settings
      where exists (
        select 1
        from public.flags f
        where f.status in ('open', 'escalated')
      )
        and coalesce(settings.secondary_admin_profile_id, settings.admin_successor_profile_id) is not null
        and not exists (
          select 1
          from public.notifications existing
          where existing.template_key = 'flag_review_due'
            and existing.created_at >= timezone('utc', now()) - interval '24 hours'
        )
    `
  );
  queued += flagReview.rowCount ?? 0;

  await client.query(
    `
      insert into public.notification_deliveries (id, notification_id, status, retry_count)
      select gen_random_uuid(), n.id, 'pending', 0
      from public.notifications n
      where not exists (
        select 1
        from public.notification_deliveries d
        where d.notification_id = n.id
      )
    `
  );

  return queued;
}

async function processNotifications(client: PoolClient) {
  const deliveries = await client.query<{
    delivery_id: string;
    recipient_email: string;
    channel: "email" | "in_app";
    subject: string;
    body: string;
    action_url: string | null;
  }>(
    `
      select
        d.id as delivery_id,
        recipient.email as recipient_email,
        n.channel,
        n.subject,
        n.body,
        n.action_url
      from public.notification_deliveries d
      join public.notifications n on n.id = d.notification_id
      join public.profiles recipient on recipient.id = n.recipient_profile_id
      where d.status = 'pending'
        and n.scheduled_for <= timezone('utc', now())
      order by n.scheduled_for asc
    `
  );

  const transport = getSmtpTransport();
  const smtp = getSmtpSummary();
  let sentDeliveries = 0;
  let failedDeliveries = 0;

  for (const row of deliveries.rows) {
    try {
      if (row.channel === "email") {
        if (!transport) {
          throw new Error("SMTP is not configured.");
        }

        await transport.sendMail({
          from: `${smtp.fromName} <${smtp.fromEmail}>`,
          to: row.recipient_email,
          subject: row.subject,
          text: `${row.body}\n\nOpen: ${row.action_url ?? env.APP_URL}`
        });
      }

      await client.query(
        `
          update public.notification_deliveries
          set status = 'sent',
              delivered_at = timezone('utc', now()),
              updated_at = timezone('utc', now())
          where id = $1
        `,
        [row.delivery_id]
      );

      sentDeliveries += 1;
    } catch (error) {
      await client.query(
        `
          update public.notification_deliveries
          set status = 'failed',
              retry_count = retry_count + 1,
              last_error = $2,
              updated_at = timezone('utc', now())
          where id = $1
        `,
        [row.delivery_id, error instanceof Error ? error.message : "Unknown delivery error"]
      );

      failedDeliveries += 1;
    }
  }

  return {
    processedDeliveries: deliveries.rowCount ?? 0,
    sentDeliveries,
    failedDeliveries
  };
}

export async function runNotificationProcessor({
  actorProfileId,
  trigger
}: {
  actorProfileId: string | null;
  trigger: string;
}) {
  const pool = getDbPool();

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = await pool.connect();
  const smtp = getSmtpSummary();

  try {
    const queuedNotifications = await queueNotifications(client);
    const processed = await processNotifications(client);

    const summary: NotificationRunSummary = {
      queuedNotifications,
      ...processed,
      trigger,
      smtpConfigured: smtp.configured
    };

    await recordAudit(
      client,
      actorProfileId,
      "notification_ops",
      null,
      "processor_run_success",
      summary
    );

    return summary;
  } catch (error) {
    await recordAudit(
      client,
      actorProfileId,
      "notification_ops",
      null,
      "processor_run_failed",
      {
        trigger,
        smtpConfigured: smtp.configured,
        error:
          error instanceof Error
            ? error.message
            : "Unknown notification processing error"
      }
    );

    throw error;
  } finally {
    client.release();
  }
}

export async function sendSmtpTestEmail({
  actorProfileId,
  recipientEmail
}: {
  actorProfileId: string | null;
  recipientEmail: string;
}) {
  const transport = getSmtpTransport();
  const smtp = getSmtpSummary();

  if (!transport) {
    throw new Error("SMTP is not configured.");
  }

  await transport.sendMail({
    from: `${smtp.fromName} <${smtp.fromEmail}>`,
    to: recipientEmail,
    subject: "PMS SMTP delivery test",
    text: `This is a test delivery from PMS notification operations.\n\nSMTP host: ${smtp.host}\nFrom: ${smtp.fromEmail}`
  });

  const pool = getDbPool();

  if (!pool) {
    return;
  }

  const client = await pool.connect();

  try {
    await recordAudit(
      client,
      actorProfileId,
      "notification_ops",
      null,
      "smtp_test_sent",
      {
        trigger: "admin_manual",
        recipientEmail
      }
    );
  } finally {
    client.release();
  }
}

export async function verifySmtpConnection({
  actorProfileId
}: {
  actorProfileId: string | null;
}) {
  const transport = getSmtpTransport();
  const smtp = getSmtpSummary();

  if (!transport) {
    throw new Error(
      smtp.authPartiallyConfigured
        ? "SMTP auth is incomplete. Set both SMTP_USER and SMTP_PASS, or clear both for a non-authenticated server."
        : "SMTP is not configured."
    );
  }

  await transport.verify();

  const pool = getDbPool();

  if (!pool) {
    return {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTls: smtp.requireTls,
      authConfigured: smtp.authConfigured
    };
  }

  const client = await pool.connect();

  try {
    await recordAudit(
      client,
      actorProfileId,
      "notification_ops",
      null,
      "smtp_connection_verified",
      {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        requireTls: smtp.requireTls,
        authConfigured: smtp.authConfigured
      }
    );
  } finally {
    client.release();
  }

  return {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTls: smtp.requireTls,
    authConfigured: smtp.authConfigured
  };
}
