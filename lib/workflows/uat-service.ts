import type {
  UatFixtureAccountRecord,
  UatExecutionRecord,
  UatOverview,
  UatScenarioRecord,
  UatSeededScenarioRecord
} from "@/lib/db/types";
import { getInternalJobSummary, getSmtpSummary, getSupabaseEnvSummary } from "@/lib/config/env";
import { dbQuery } from "@/lib/db/server";
import { getReadinessState } from "@/lib/workflows/readiness-rules";
import { SEEDED_UAT_FIXTURES } from "@/lib/workflows/uat-fixtures";

function normalizeRoleList(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.startsWith("{") && trimmed.endsWith("}")
    ? trimmed.slice(1, -1)
    : trimmed;

  return normalized
    .split(",")
    .map((role) => role.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
}

export async function getUatOverview(): Promise<UatOverview> {
  const envSummary = getSupabaseEnvSummary();
  const smtp = getSmtpSummary();
  const scheduler = getInternalJobSummary();

  const [
    countsResult,
    automatedRunResult,
    fixtureProfilesResult,
    seededScenarioResult,
    executionResult
  ] =
    await Promise.all([
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
    ),
    dbQuery<{
      email: string;
      auth_linked: boolean;
      is_active: boolean;
      roles: string[] | string | null;
    }>(
      `
        select
          p.email,
          p.auth_user_id is not null as auth_linked,
          p.is_active,
          array_remove(array_agg(distinct ur.role::text), null) as roles
        from public.profiles p
        left join public.user_roles ur on ur.profile_id = p.id
        where lower(p.email) = any($1::text[])
        group by p.id, p.email, p.auth_user_id, p.is_active
      `,
      [SEEDED_UAT_FIXTURES.map((fixture) => fixture.email.toLowerCase())]
    ),
    dbQuery<{
      pending_goal_count: number | string;
      blocked_probation_count: number | string;
      open_flag_count: number | string;
      scheduled_discussion_count: number | string;
    }>(
      `
        select
          (
            select count(*)::int
            from public.goals g
            join public.profiles p on p.id = g.owner_profile_id
            where lower(p.email) = lower('ishita.gupta@pms.local')
              and g.status = 'pending_approval'
          ) as pending_goal_count,
          (
            select count(*)::int
            from public.probation_checkpoints pc
            join public.probation_cases pcase on pcase.id = pc.probation_case_id
            join public.profiles p on p.id = pcase.employee_profile_id
            where lower(p.email) = lower('rohan.mehta@pms.local')
              and pc.status = 'blocked'
          ) as blocked_probation_count,
          (
            select count(*)::int
            from public.flags f
            where f.status in ('open', 'in_review', 'escalated')
          ) as open_flag_count,
          (
            select count(*)::int
            from public.cycle_enrollments ce
            join public.profiles p on p.id = ce.employee_profile_id
            where lower(p.email) = lower('ishita.gupta@pms.local')
              and ce.discussion_status = 'scheduled'
          ) as scheduled_discussion_count
      `
    ),
    dbQuery<{
      scenario_key: string;
      outcome: string | null;
      actor_name: string | null;
      created_at_label: string;
      note: string | null;
      tested_account_email: string | null;
    }>(
      `
        select distinct on ((audit.metadata ->> 'scenarioKey'))
          audit.metadata ->> 'scenarioKey' as scenario_key,
          audit.metadata ->> 'outcome' as outcome,
          actor.full_name as actor_name,
          to_char(audit.created_at, 'DD Mon YYYY HH24:MI') as created_at_label,
          audit.metadata ->> 'note' as note,
          audit.metadata ->> 'testedAccountEmail' as tested_account_email
        from public.audit_logs audit
        left join public.profiles actor on actor.id = audit.actor_profile_id
        where audit.entity_type = 'uat_execution'
        order by (audit.metadata ->> 'scenarioKey'), audit.created_at desc
      `
    )
  ]);

  const counts = countsResult.rows[0];
  const latestAutomatedRun = automatedRunResult.rows[0];
  const seededScenarioCounts = seededScenarioResult.rows[0];
  const latestExecutionRows = executionResult.rows;

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

  const fixtureProfileMap = new Map(
    fixtureProfilesResult.rows.map((row) => [row.email.trim().toLowerCase(), row])
  );
  const executionMap = new Map<string, UatExecutionRecord>(
    latestExecutionRows.map((row) => [
      row.scenario_key,
      {
        scenarioKey: row.scenario_key,
        outcome:
          row.outcome === "passed" || row.outcome === "follow_up"
            ? row.outcome
            : "blocked",
        actorName: row.actor_name?.trim() || "Unknown tester",
        testedAt: row.created_at_label,
        note: row.note,
        testedAccountEmail: row.tested_account_email
      }
    ])
  );

  const fixtureAccounts: UatFixtureAccountRecord[] = SEEDED_UAT_FIXTURES.map((fixture) => {
    const matched = fixtureProfileMap.get(fixture.email.toLowerCase());
    const matchedRoles = normalizeRoleList(matched?.roles);
    const status = matched
      ? matched.auth_linked && matched.is_active
        ? "ready"
        : "attention"
      : "blocked";

    const notes = [...fixture.notes];

    if (!matched) {
      notes.push("Seed profile missing from database.");
    } else {
      if (!matched.auth_linked) {
        notes.push("Auth login has not been prepared yet.");
      }

      if (!matched.is_active) {
        notes.push("Profile is currently inactive.");
      }
    }

    return {
      key: fixture.key,
      title: fixture.title,
      email: fixture.email,
      roles: matchedRoles.length ? matchedRoles : fixture.roles,
      temporaryPassword: fixture.temporaryPassword,
      status,
      authLinked: Boolean(matched?.auth_linked),
      description: fixture.description,
      notes
    };
  });

  const seededScenarios: UatSeededScenarioRecord[] = [
    {
      key: "goal-approval-seed",
      title: "Employee pending-goal approval",
      status:
        Number(seededScenarioCounts?.pending_goal_count ?? 0) > 0 ? "ready" : "blocked",
      description:
        "The primary employee fixture should already have a pending goal waiting for manager approval.",
      ownerEmail: "ishita.gupta@pms.local",
      linkedRoute: "/goals/approvals",
      evidence: `${Number(seededScenarioCounts?.pending_goal_count ?? 0)} pending goal record(s) found for Ishita Gupta.`,
      execution: executionMap.get("goal-approval-seed") ?? null
    },
    {
      key: "blocked-probation-seed",
      title: "Blocked probation routing",
      status:
        Number(seededScenarioCounts?.blocked_probation_count ?? 0) > 0
          ? "ready"
          : "blocked",
      description:
        "The blocked-routing employee fixture should surface a missing-manager probation issue for admin remediation.",
      ownerEmail: "rohan.mehta@pms.local",
      linkedRoute: "/admin/probation",
      evidence: `${Number(seededScenarioCounts?.blocked_probation_count ?? 0)} blocked probation checkpoint(s) found for Rohan Mehta.`,
      execution: executionMap.get("blocked-probation-seed") ?? null
    },
    {
      key: "flag-review-seed",
      title: "Open red-flag review",
      status:
        Number(seededScenarioCounts?.open_flag_count ?? 0) > 0 ? "ready" : "attention",
      description:
        "Admin should have at least one seeded flag review case available for compliance/UAT validation.",
      ownerEmail: "aarav.shah@pms.local",
      linkedRoute: "/flags",
      evidence: `${Number(seededScenarioCounts?.open_flag_count ?? 0)} open or escalated flag(s) currently available.`,
      execution: executionMap.get("flag-review-seed") ?? null
    },
    {
      key: "review-discussion-seed",
      title: "Scheduled review discussion",
      status:
        Number(seededScenarioCounts?.scheduled_discussion_count ?? 0) > 0
          ? "ready"
          : "attention",
      description:
        "The primary employee fixture should have a scheduled review discussion to test review progress and discussion completion.",
      ownerEmail: "ishita.gupta@pms.local",
      linkedRoute: "/reviews",
      evidence: `${Number(seededScenarioCounts?.scheduled_discussion_count ?? 0)} scheduled review discussion record(s) found for Ishita Gupta.`,
      execution: executionMap.get("review-discussion-seed") ?? null
    }
  ];

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
      recommendedEmail: "ishita.gupta@pms.local",
      execution: executionMap.get("employee") ?? null,
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
      recommendedEmail: "neha.rao@pms.local",
      execution: executionMap.get("manager") ?? null,
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
        attention:
          unlinkedProfiles > 0 ||
          blockedProbation > 0 ||
          envSummary.allowElevatedSelfSignup
      }),
      description:
        "Validate admin provisioning, cycle/probation control, reporting, and escalation handling across the PMS platform.",
      liveEvidence: `${activeAdmins} active admin(s), ${unlinkedProfiles} unlinked profile(s), ${blockedProbation} blocked probation checkpoint(s), elevated self-signup ${envSummary.allowElevatedSelfSignup ? "enabled" : "disabled"}.`,
      href: "/admin/users",
      recommendedEmail: "aarav.shah@pms.local",
      execution: executionMap.get("admin") ?? null,
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
      recommendedEmail: "neha.rao@pms.local",
      execution: executionMap.get("player-coach") ?? null,
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
      recommendedEmail: "aarav.shah@pms.local",
      execution: executionMap.get("operations") ?? null,
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

  if (envSummary.allowElevatedSelfSignup) {
    rolloutNotes.push(
      "Disable elevated self-signup before production so manager and Admin access remain invite-only."
    );
  }

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
    fixtureAccounts,
    seededScenarios,
    rolloutNotes
  };
}
