import {
  getInternalJobSummary,
  getSupabaseEnvSummary,
  getSmtpSummary
} from "@/lib/config/env";
import { dbQuery } from "@/lib/db/server";
import {
  getReadinessLabel,
  getReadinessState,
  type ReadinessState
} from "@/lib/workflows/readiness-rules";

export type ReadinessCheckRecord = {
  title: string;
  description: string;
  state: ReadinessState;
  href?: string;
};

export type ReadinessOverview = {
  metrics: Array<{
    label: string;
    value: string;
    tone?: "default" | "accent" | "warn";
    href?: string;
    detail?: string;
  }>;
  environmentChecks: ReadinessCheckRecord[];
  workflowChecks: ReadinessCheckRecord[];
  featureAlignmentChecks: ReadinessCheckRecord[];
  nextActions: string[];
};

export async function getReadinessOverview(): Promise<ReadinessOverview> {
  const envSummary = getSupabaseEnvSummary();
  const smtp = getSmtpSummary();

  const [countsResult, notificationRunResult, automatedRunResult] = await Promise.all([
    dbQuery<{
      auth_linked_users: number | string;
      unlinked_profiles: number | string;
      employees_without_manager: number | string;
      pending_approvals: number | string;
      active_cycles: number | string;
      open_flags: number | string;
      blocked_probation: number | string;
      failed_deliveries: number | string;
      due_notifications: number | string;
    }>(
      `
        select
          (
            select count(*)::int
            from public.profiles
            where auth_user_id is not null
          ) as auth_linked_users,
          (
            select count(*)::int
            from public.profiles
            where auth_user_id is null
          ) as unlinked_profiles,
          (
            select count(*)::int
            from public.employee_records
            where employment_status = 'active'
              and manager_profile_id is null
          ) as employees_without_manager,
          (
            select count(*)::int
            from public.goals
            where status = 'pending_approval'
          ) as pending_approvals,
          (
            select count(*)::int
            from public.review_cycles
            where is_active = true
               or current_date between trigger_date and close_date
          ) as active_cycles,
          (
            select count(*)::int
            from public.flags
            where status in ('open', 'in_review', 'escalated')
          ) as open_flags,
          (
            select count(*)::int
            from public.probation_checkpoints
            where status = 'blocked'
          ) as blocked_probation,
          (
            select count(*)::int
            from public.notification_deliveries
            where status = 'failed'
          ) as failed_deliveries,
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
      action: string;
      trigger: string | null;
      created_at_label: string;
      created_at_raw: string;
    }>(
      `
        select
          audit.action,
          audit.metadata ->> 'trigger' as trigger,
          to_char(audit.created_at, 'DD Mon YYYY HH24:MI') as created_at_label,
          audit.created_at::text as created_at_raw
        from public.audit_logs audit
        where audit.entity_type = 'notification_ops'
          and audit.action in ('processor_run_success', 'processor_run_failed')
        order by audit.created_at desc
        limit 1
      `
    ),
    dbQuery<{
      action: string;
      trigger: string | null;
      created_at_label: string;
      created_at_raw: string;
    }>(
      `
        select
          audit.action,
          audit.metadata ->> 'trigger' as trigger,
          to_char(audit.created_at, 'DD Mon YYYY HH24:MI') as created_at_label,
          audit.created_at::text as created_at_raw
        from public.audit_logs audit
        where audit.entity_type = 'notification_ops'
          and audit.action in ('processor_run_success', 'processor_run_failed')
          and audit.metadata ->> 'trigger' in ('script', 'internal_api')
        order by audit.created_at desc
        limit 1
      `
    )
  ]);

  const counts = countsResult.rows[0];
  const latestNotificationRun = notificationRunResult.rows[0];
  const latestAutomatedRun = automatedRunResult.rows[0];
  const scheduler = getInternalJobSummary();

  const authLinkedUsers = Number(counts?.auth_linked_users ?? 0);
  const unlinkedProfiles = Number(counts?.unlinked_profiles ?? 0);
  const employeesWithoutManager = Number(counts?.employees_without_manager ?? 0);
  const pendingApprovals = Number(counts?.pending_approvals ?? 0);
  const activeCycles = Number(counts?.active_cycles ?? 0);
  const openFlags = Number(counts?.open_flags ?? 0);
  const blockedProbation = Number(counts?.blocked_probation ?? 0);
  const failedDeliveries = Number(counts?.failed_deliveries ?? 0);
  const dueNotifications = Number(counts?.due_notifications ?? 0);

  const recentAutomatedRun =
    latestAutomatedRun?.created_at_raw
      ? Date.now() - new Date(latestAutomatedRun.created_at_raw).getTime() <
        1000 * 60 * 60 * 36
      : false;

  const environmentChecks: ReadinessCheckRecord[] = [
    {
      title: `Supabase public client: ${getReadinessLabel(
        getReadinessState({
          blocked: !envSummary.url || !envSummary.publicKeyPresent
        })
      )}`,
      description: envSummary.url && envSummary.publicKeyPresent
        ? "Frontend auth and client-side Supabase access are configured."
        : "Missing Supabase URL or public key.",
      state: getReadinessState({
        blocked: !envSummary.url || !envSummary.publicKeyPresent
      })
    },
    {
      title: `Admin provisioning key: ${getReadinessLabel(
        getReadinessState({
          blocked: !envSummary.adminKeyPresent
        })
      )}`,
      description: envSummary.adminKeyPresent
        ? "Admin provisioning and elevated account operations can run."
        : "Provisioning remains blocked until a secret/service role key is configured.",
      state: getReadinessState({
        blocked: !envSummary.adminKeyPresent
      }),
      href: "/admin/users"
    },
    {
      title: `Database runtime: ${getReadinessLabel(
        getReadinessState({
          blocked: !envSummary.databaseUrlPresent
        })
      )}`,
      description: envSummary.databaseUrlPresent
        ? "The app has a pooled database connection configured."
        : "DATABASE_URL is missing, so server-side workflows cannot run.",
      state: getReadinessState({
        blocked: !envSummary.databaseUrlPresent
      })
    },
    {
      title: `Internal scheduler secret: ${getReadinessLabel(
        getReadinessState({
          attention: !scheduler.configured
        })
      )}`,
      description: scheduler.configured
        ? "The internal notification processor route is protected and ready for cron/scheduler use."
        : "Set INTERNAL_JOB_SECRET to enable the secure internal scheduler route for notification processing.",
      state: getReadinessState({
        attention: !scheduler.configured
      }),
      href: "/admin/notifications"
    },
    {
      title: `SMTP delivery: ${getReadinessLabel(
        getReadinessState({
          attention: !smtp.configured
        })
      )}`,
      description: smtp.configured
        ? `SMTP is configured on ${smtp.host}:${smtp.port ?? "n/a"}.`
        : "In-app notifications work, but real email delivery still needs SMTP/provider configuration.",
      state: getReadinessState({
        attention: !smtp.configured
      }),
      href: "/admin/notifications"
    }
  ];

  const workflowChecks: ReadinessCheckRecord[] = [
    {
      title: `Profile auth linkage: ${getReadinessLabel(
        getReadinessState({
          attention: unlinkedProfiles > 0
        })
      )}`,
      description:
        unlinkedProfiles > 0
          ? `${unlinkedProfiles} profile(s) are still not linked to Supabase Auth.`
          : "All current profile rows are linked to auth identities.",
      state: getReadinessState({
        attention: unlinkedProfiles > 0
      }),
      href: "/admin/users"
    },
    {
      title: `Reporting-manager mapping: ${getReadinessLabel(
        getReadinessState({
          attention: employeesWithoutManager > 0
        })
      )}`,
      description:
        employeesWithoutManager > 0
          ? `${employeesWithoutManager} active employee record(s) do not have a manager assigned.`
          : "Employee-to-manager routing is in place for current active users.",
      state: getReadinessState({
        attention: employeesWithoutManager > 0
      }),
      href: "/admin/users"
    },
    {
      title: `Goal approvals queue: ${getReadinessLabel(
        getReadinessState({
          attention: pendingApprovals > 0
        })
      )}`,
      description:
        pendingApprovals > 0
          ? `${pendingApprovals} goal(s) are waiting for approval.`
          : "No goal approvals are currently pending.",
      state: getReadinessState({
        attention: pendingApprovals > 0
      }),
      href: "/goals/approvals"
    },
    {
      title: `Probation routing: ${getReadinessLabel(
        getReadinessState({
          attention: blockedProbation > 0
        })
      )}`,
      description:
        blockedProbation > 0
          ? `${blockedProbation} probation checkpoint(s) are currently blocked.`
          : "No probation checkpoints are blocked right now.",
      state: getReadinessState({
        attention: blockedProbation > 0
      }),
      href: "/admin/probation"
    },
    {
      title: `Review cycle coverage: ${getReadinessLabel(
        getReadinessState({
          attention: activeCycles === 0
        })
      )}`,
      description:
        activeCycles > 0
          ? `${activeCycles} active or open review cycle(s) are available.`
          : "No active review cycle is currently open for submissions.",
      state: getReadinessState({
        attention: activeCycles === 0
      }),
      href: "/admin/cycles"
    },
    {
      title: `Notification delivery health: ${getReadinessLabel(
        getReadinessState({
          attention: failedDeliveries > 0 || dueNotifications > 0
        })
      )}`,
      description:
        failedDeliveries > 0 || dueNotifications > 0
          ? `${failedDeliveries} failed deliverie(s) and ${dueNotifications} due notification(s) need attention.`
          : "Notification delivery is clean right now.",
      state: getReadinessState({
        attention: failedDeliveries > 0 || dueNotifications > 0
      }),
      href: "/admin/notifications"
    }
  ];

  const featureAlignmentChecks: ReadinessCheckRecord[] = [
    {
      title: "Goal management and approvals",
      description:
        "Employee draft/create/edit/submit plus manager/admin approve-reject and weightage flows are live in the shared PMS module.",
      state: getReadinessState({
        attention: pendingApprovals > 0
      }),
      href: "/goals"
    },
    {
      title: "Review cycle workflows",
      description:
        "Self-review, manager review, discussion scheduling, waivers, and admin cycle control are implemented in the current product flow.",
      state: getReadinessState({
        attention: activeCycles === 0
      }),
      href: "/reviews"
    },
    {
      title: "Probation checkpoints and admin actions",
      description:
        "Day-based probation checkpoints, feedback routing, admin review, and escalation handling are modeled in the live app.",
      state: getReadinessState({
        attention: blockedProbation > 0
      }),
      href: "/probation"
    },
    {
      title: "Flags, reporting, and compliance monitoring",
      description:
        "The HR/Admin queue, reports, exports, and flagged-response monitoring are all available from admin operations.",
      state: getReadinessState({
        attention: openFlags > 0
      }),
      href: "/flags"
    },
    {
      title: "Provisioning and role-governed access",
      description:
        "Admin provisioning, lifecycle controls, ownership transfer, and multi-role workspace switching are implemented and available in-app.",
      state: getReadinessState({
        blocked: !envSummary.adminKeyPresent,
        attention: unlinkedProfiles > 0
      }),
      href: "/admin/users"
    },
    {
      title: "Notification automation and rollout readiness",
      description:
        recentAutomatedRun && scheduler.configured && smtp.configured
          ? "Notification automation is configured and has a recent automated processor run."
          : "Manual processing exists in-app, but deployment scheduling and/or SMTP still need final rollout setup.",
      state: getReadinessState({
        blocked: !smtp.configured,
        attention: !scheduler.configured || !recentAutomatedRun
      }),
      href: "/admin/notifications"
    }
  ];

  const nextActions: string[] = [];

  if (!scheduler.configured) {
    nextActions.push("Set INTERNAL_JOB_SECRET and use the internal notification processor route so deployment scheduling can call a protected endpoint.");
  }

  if (!smtp.configured) {
    nextActions.push("Configure real SMTP/provider credentials so email delivery moves beyond in-app notifications.");
  }

  if (!recentAutomatedRun) {
    nextActions.push("Schedule either the internal notification processor route or `npm run notifications:process` in deployment so reminder and escalation automation runs without manual intervention.");
  }

  if (employeesWithoutManager > 0) {
    nextActions.push("Assign reporting managers to all active employees so approvals, reviews, and probation routing stay fully aligned.");
  }

  if (unlinkedProfiles > 0) {
    nextActions.push("Link remaining profile rows to Supabase Auth accounts or deactivate stale placeholder records.");
  }

  if (nextActions.length === 0) {
    nextActions.push("Core code-side implementation is aligned; the main remaining work is production UAT with real users and live workflow data.");
  }

  return {
    metrics: [
      {
        label: "Auth-linked users",
        value: String(authLinkedUsers),
        href: "/admin/users"
      },
      {
        label: "Pending approvals",
        value: String(pendingApprovals),
        tone: pendingApprovals > 0 ? "accent" : undefined,
        href: "/goals/approvals"
      },
      {
        label: "Blocked probation",
        value: String(blockedProbation),
        tone: blockedProbation > 0 ? "warn" : undefined,
        href: "/admin/probation"
      },
      {
        label: "Failed deliveries",
        value: String(failedDeliveries),
        tone: failedDeliveries > 0 ? "warn" : undefined,
        href: "/admin/notifications",
        detail: latestNotificationRun
          ? `Latest run: ${latestNotificationRun.created_at_label}`
          : "No processor runs recorded yet"
      }
    ],
    environmentChecks,
    workflowChecks,
    featureAlignmentChecks,
    nextActions
  };
}
