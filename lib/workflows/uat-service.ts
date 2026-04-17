import type { UatOverview, UatScenarioRecord } from "@/lib/db/types";
import { getInternalJobSummary, getSmtpSummary, getSupabaseEnvSummary } from "@/lib/config/env";
import { dbQuery } from "@/lib/db/server";
import { getReadinessState } from "@/lib/workflows/readiness-rules";

export async function getUatOverview(): Promise<UatOverview> {
  const envSummary = getSupabaseEnvSummary();
  const smtp = getSmtpSummary();
  const scheduler = getInternalJobSummary();

  const [countsResult, automatedRunResult] = await Promise.all([
    dbQuery<{
      active_employees: number | string;
      active_managers: number | string;
      active_admins: number | string;
      player_coaches: number | string;
      unlinked_profiles: number | string;
      employees_without_manager: number | string;
      pending_approvals: number | string;
      active_cycles: number | string;
      blocked_probation: number | string;
      open_flags: number | string;
      failed_deliveries: number | string;
      due_notifications: number | string;
    }>(
      `
        select
          (
            select count(*)::int
            from public.employee_records
            where employment_status = 'active'
          ) as active_employees,
          (
            select count(distinct ur.profile_id)::int
            from public.user_roles ur
            join public.employee_records er on er.profile_id = ur.profile_id
            where ur.role = 'manager'
              and er.employment_status = 'active'
          ) as active_managers,
          (
            select count(distinct ur.profile_id)::int
            from public.user_roles ur
            join public.employee_records er on er.profile_id = ur.profile_id
            where ur.role = 'admin'
              and er.employment_status = 'active'
          ) as active_admins,
          (
            select count(*)::int
            from (
              select ur.profile_id
              from public.user_roles ur
              group by ur.profile_id
              having bool_or(ur.role = 'employee') and bool_or(ur.role = 'manager')
            ) player_coach
          ) as player_coaches,
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
            from public.probation_checkpoints
            where status = 'blocked'
          ) as blocked_probation,
          (
            select count(*)::int
            from public.flags
            where status in ('open', 'in_review', 'escalated')
          ) as open_flags,
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
      created_at_label: string;
      created_at_raw: string;
      trigger: string | null;
    }>(
      `
        select
          to_char(audit.created_at, 'DD Mon YYYY HH24:MI') as created_at_label,
          audit.created_at::text as created_at_raw,
          audit.metadata ->> 'trigger' as trigger
        from public.audit_logs audit
        where audit.entity_type = 'notification_ops'
          and audit.action = 'processor_run_success'
          and audit.metadata ->> 'trigger' in ('script', 'internal_api')
        order by audit.created_at desc
        limit 1
      `
    )
  ]);

  const counts = countsResult.rows[0];
  const latestAutomatedRun = automatedRunResult.rows[0];

  const activeEmployees = Number(counts?.active_employees ?? 0);
  const activeManagers = Number(counts?.active_managers ?? 0);
  const activeAdmins = Number(counts?.active_admins ?? 0);
  const playerCoaches = Number(counts?.player_coaches ?? 0);
  const unlinkedProfiles = Number(counts?.unlinked_profiles ?? 0);
  const employeesWithoutManager = Number(counts?.employees_without_manager ?? 0);
  const pendingApprovals = Number(counts?.pending_approvals ?? 0);
  const activeCycles = Number(counts?.active_cycles ?? 0);
  const blockedProbation = Number(counts?.blocked_probation ?? 0);
  const openFlags = Number(counts?.open_flags ?? 0);
  const failedDeliveries = Number(counts?.failed_deliveries ?? 0);
  const dueNotifications = Number(counts?.due_notifications ?? 0);

  const recentAutomatedRun =
    latestAutomatedRun?.created_at_raw
      ? Date.now() - new Date(latestAutomatedRun.created_at_raw).getTime() <
        1000 * 60 * 60 * 36
      : false;

  const scenarios: UatScenarioRecord[] = [
    {
      id: "employee",
      title: "Employee journey",
      role: "employee",
      state: getReadinessState({
        blocked: activeEmployees === 0,
        attention: activeCycles === 0 || employeesWithoutManager > 0
      }),
      description:
        "Validate that an employee can access the personal dashboard, create/edit/submit goals, and complete self-driven workflow tasks.",
      liveEvidence: `${activeEmployees} active employee(s), ${activeCycles} active review cycle(s), ${pendingApprovals} goal approval(s) currently pending.`,
      href: "/goals",
      steps: [
        "Sign in as an employee and confirm the personal dashboard renders personal goals and feedback context.",
        "Create an individual goal draft, edit it, and submit it for approval.",
        "Confirm the employee can see probation or review actions when those workflows are active."
      ]
    },
    {
      id: "manager",
      title: "Manager journey",
      role: "manager",
      state: getReadinessState({
        blocked: activeManagers === 0,
        attention: employeesWithoutManager > 0
      }),
      description:
        "Validate approvals, team dashboard visibility, manager review submission, and manager-side probation handling.",
      liveEvidence: `${activeManagers} active manager(s), ${employeesWithoutManager} employee(s) currently missing a reporting manager.`,
      href: "/goals/approvals",
      steps: [
        "Sign in as a manager and confirm the team dashboard shows team goals, ratings, and pending approvals.",
        "Approve or reject an employee goal and confirm the employee notification path updates.",
        "Submit a manager review or probation checkpoint response for an assigned employee."
      ]
    },
    {
      id: "admin",
      title: "Admin journey",
      role: "admin",
      state: getReadinessState({
        blocked: activeAdmins === 0 || !envSummary.adminKeyPresent,
        attention: unlinkedProfiles > 0 || blockedProbation > 0
      }),
      description:
        "Validate admin provisioning, cycle/probation control, reporting, and escalation handling across the PMS platform.",
      liveEvidence: `${activeAdmins} active admin(s), ${unlinkedProfiles} unlinked profile(s), ${blockedProbation} blocked probation checkpoint(s).`,
      href: "/admin/users",
      steps: [
        "Provision or invite a user from Admin Users and confirm the profile links correctly.",
        "Review admin cycle, probation, and ownership-transfer actions for a live record.",
        "Open reports and flags to confirm compliance monitoring and exports are available."
      ]
    },
    {
      id: "player-coach",
      title: "Player-coach workspace",
      role: "manager",
      state: getReadinessState({
        attention: playerCoaches === 0
      }),
      description:
        "Validate the multi-role toggle so users who are both employee and manager can switch workspaces without losing the correct permissions.",
      liveEvidence: `${playerCoaches} manager+employee account(s) currently available for testing.`,
      href: "/dashboard",
      steps: [
        "Sign in as a user who has both employee and manager roles.",
        "Switch between My performance and My team's performance.",
        "Confirm dashboard, goals, approvals, probation, and reviews follow the selected workspace role."
      ]
    },
    {
      id: "operations",
      title: "Operations and notification rollout",
      role: "operations",
      state: getReadinessState({
        blocked: !smtp.configured,
        attention:
          !scheduler.configured ||
          !recentAutomatedRun ||
          failedDeliveries > 0 ||
          dueNotifications > 0 ||
          openFlags > 0
      }),
      description:
        "Validate production-style notification delivery, processor automation, and operational queues that keep the product aligned with the PRD timelines.",
      liveEvidence: `${failedDeliveries} failed delivery record(s), ${dueNotifications} due notification(s), ${openFlags} open/escalated flag(s). Latest automated run: ${latestAutomatedRun?.created_at_label ?? "none"}${latestAutomatedRun?.trigger ? ` via ${latestAutomatedRun.trigger}` : ""}.`,
      href: "/admin/notifications",
      steps: [
        "Send an SMTP test email and confirm provider delivery succeeds.",
        "Trigger the internal notification processor route or scheduled job and confirm a successful automated run is recorded.",
        "Review failed deliveries and due notifications until the queue is clean."
      ]
    }
  ];

  const readyScenarios = scenarios.filter((scenario) => scenario.state === "ready").length;
  const attentionScenarios = scenarios.filter(
    (scenario) => scenario.state === "attention"
  ).length;
  const blockedScenarios = scenarios.filter(
    (scenario) => scenario.state === "blocked"
  ).length;

  const rolloutNotes: string[] = [];

  if (!scheduler.configured) {
    rolloutNotes.push(
      "Set INTERNAL_JOB_SECRET so deployment can call the protected internal notification processor route."
    );
  }

  if (!smtp.configured) {
    rolloutNotes.push(
      "Configure real SMTP/provider credentials before considering notification rollout complete."
    );
  }

  if (!recentAutomatedRun) {
    rolloutNotes.push(
      "Run the automated notification processor from a scheduler and confirm a successful run is recorded in the last 36 hours."
    );
  }

  if (employeesWithoutManager > 0) {
    rolloutNotes.push(
      "Assign reporting managers to all active employees before final manager-journey UAT."
    );
  }

  if (unlinkedProfiles > 0) {
    rolloutNotes.push(
      "Link or deactivate stale unlinked profiles so auth and provisioning validation reflect real users only."
    );
  }

  if (rolloutNotes.length === 0) {
    rolloutNotes.push(
      "The code-side rollout checklist is green; the next step is coordinated real-user UAT across all roles."
    );
  }

  return {
    metrics: [
      {
        label: "Ready scenarios",
        value: String(readyScenarios),
        tone: readyScenarios > 0 ? "accent" : undefined
      },
      {
        label: "Needs attention",
        value: String(attentionScenarios),
        tone: attentionScenarios > 0 ? "warn" : undefined
      },
      {
        label: "Blocked scenarios",
        value: String(blockedScenarios),
        tone: blockedScenarios > 0 ? "warn" : undefined
      },
      {
        label: "Player-coach users",
        value: String(playerCoaches),
        detail: latestAutomatedRun
          ? `Latest automated run: ${latestAutomatedRun.created_at_label}`
          : "No automated notification run recorded yet"
      }
    ],
    scenarios,
    rolloutNotes
  };
}
