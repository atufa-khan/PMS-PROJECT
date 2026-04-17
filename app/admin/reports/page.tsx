import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db/server";

export default async function AdminReportsPage() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const [
    openFlags,
    pendingApprovals,
    activeProbation,
    activeCycles,
    compliance,
    provisioningVolume,
    lifecycleCounts,
    approvalHotspots,
    trendRows
  ] =
    await Promise.all([
      dbQuery<{ total: number | string }>(
        `
          select count(*)::int as total
          from public.flags
          where status <> 'resolved'
        `
      ),
      dbQuery<{ total: number | string }>(
        `
          select count(*)::int as total
          from public.goals
          where status = 'pending_approval'
        `
      ),
      dbQuery<{ total: number | string }>(
        `
          select count(*)::int as total
          from public.probation_cases
          where status in ('active', 'paused', 'extended')
        `
      ),
      dbQuery<{ total: number | string }>(
        `
          select count(*)::int as total
          from public.review_cycles
          where is_active = true
        `
      ),
      dbQuery<{ value: number | string }>(
        `
          select
            case
              when count(*) = 0 then 0
              else round(
                (
                  count(*) filter (where submitted_at is not null)::numeric
                  / count(*)::numeric
                ) * 100,
                0
              )
            end as value
          from public.feedback_requests
        `
      ),
      dbQuery<{ total: number | string }>(
        `
          select count(*)::int as total
          from public.audit_logs
          where entity_type = 'user_provisioning'
            and created_at >= timezone('utc', now()) - interval '30 days'
        `
      ),
      dbQuery<{
        active_total: number | string;
        inactive_total: number | string;
      }>(
        `
          select
            count(*) filter (where is_active = true)::int as active_total,
            count(*) filter (where is_active = false)::int as inactive_total
          from public.profiles
        `
      ),
      dbQuery<{
        manager_name: string | null;
        pending_total: number | string;
      }>(
        `
          select
            manager.full_name as manager_name,
            count(*)::int as pending_total
          from public.goals g
          join public.employee_records er on er.profile_id = g.owner_profile_id
          left join public.profiles manager on manager.id = er.manager_profile_id
          where g.status = 'pending_approval'
          group by manager.full_name
          order by pending_total desc, manager.full_name asc nulls last
          limit 5
        `
      ),
      dbQuery<{
        month_label: string;
        goals_submitted: number | string;
        reviews_submitted: number | string;
        flags_created: number | string;
      }>(
        `
          with months as (
            select generate_series(
              date_trunc('month', timezone('utc', now())) - interval '5 months',
              date_trunc('month', timezone('utc', now())),
              interval '1 month'
            ) as month_start
          )
          select
            to_char(months.month_start, 'YYYY-MM') as month_label,
            (
              select count(*)::int
              from public.goal_approval_events gae
              where gae.event_type in ('submit', 'resubmit')
                and date_trunc('month', gae.created_at) = months.month_start
            ) as goals_submitted,
            (
              select count(*)::int
              from public.review_submissions rs
              where date_trunc('month', rs.created_at) = months.month_start
            ) as reviews_submitted,
            (
              select count(*)::int
              from public.flags f
              where date_trunc('month', f.created_at) = months.month_start
            ) as flags_created
          from months
          order by months.month_start asc
        `
      )
    ]);

  const metrics = [
    {
      label: "Open flags",
      value: String(openFlags.rows[0]?.total ?? 0),
      tone: "warn" as const
    },
    {
      label: "Pending approvals",
      value: String(pendingApprovals.rows[0]?.total ?? 0),
      href: "/goals/approvals"
    },
    {
      label: "Active probation",
      value: String(activeProbation.rows[0]?.total ?? 0),
      href: "/admin/probation"
    },
    {
      label: "Feedback compliance",
      value: `${Number(compliance.rows[0]?.value ?? 0)}%`,
      tone: "accent" as const
    },
    {
      label: "Active cycles",
      value: String(activeCycles.rows[0]?.total ?? 0),
      href: "/admin/cycles"
    },
    {
      label: "30-day provisioning",
      value: String(provisioningVolume.rows[0]?.total ?? 0),
      href: "/admin/users"
    }
  ];

  const exports = [
    {
      title: "Operational overview",
      href: "/admin/reports/overview.csv",
      description: "Executive snapshot across flags, probation, approvals, and cycle completion."
    },
    {
      title: "Goals export",
      href: "/admin/reports/goals.csv",
      description: "Goal ownership, approval state, completion, and hierarchy-aligned reporting."
    },
    {
      title: "Reviews export",
      href: "/admin/reports/reviews.csv",
      description: "Cycle enrollments, reviewer ownership, discussion status, and submission coverage."
    },
    {
      title: "Probation export",
      href: "/admin/reports/probation.csv",
      description: "Case status, checkpoint routing, and latest decision context."
    },
    {
      title: "Flags export",
      href: "/admin/reports/flags.csv",
      description: "Severity, repeat patterns, and the latest queue action per flag."
    },
    {
      title: "Access roster export",
      href: "/admin/reports/access.csv",
      description: "User roles, account state, reporting structure, and auth linkage."
    }
  ];

  return (
    <AppShell
      role={session.role}
      title="Admin reports"
      subtitle="Download operational exports and review live performance, review, probation, and compliance coverage from one admin reporting surface."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard
          title="Operational hotspots"
          description="Managers carrying the highest pending approval volume right now."
        >
          <div className="space-y-3">
            {approvalHotspots.rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
                No approval hotspots are present right now.
              </div>
            ) : null}
            {approvalHotspots.rows.map((item) => (
              <div
                key={item.manager_name ?? "Unassigned"}
                className="rounded-2xl border border-border bg-stone-50 p-4"
              >
                <p className="font-medium">{item.manager_name ?? "Unassigned manager"}</p>
                <p className="mt-1 text-sm text-muted">
                  Pending approvals: {Number(item.pending_total ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Access state"
          description="High-level visibility into currently active vs inactive accounts."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-stone-50 p-4">
              <p className="text-sm text-muted">Active users</p>
              <p className="mt-3 text-3xl font-semibold text-ink">
                {Number(lifecycleCounts.rows[0]?.active_total ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-stone-50 p-4">
              <p className="text-sm text-muted">Inactive users</p>
              <p className="mt-3 text-3xl font-semibold text-accentWarm">
                {Number(lifecycleCounts.rows[0]?.inactive_total ?? 0)}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Six-month operational trend"
        description="Monthly flow of goal submissions, review submissions, and flags created."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-3">Month</th>
                <th className="pb-3">Goals submitted</th>
                <th className="pb-3">Reviews submitted</th>
                <th className="pb-3">Flags created</th>
              </tr>
            </thead>
            <tbody>
              {trendRows.rows.map((row) => (
                <tr key={row.month_label} className="border-t border-border/70">
                  <td className="py-3 pr-4 font-medium">{row.month_label}</td>
                  <td className="py-3 pr-4">{Number(row.goals_submitted ?? 0)}</td>
                  <td className="py-3 pr-4">{Number(row.reviews_submitted ?? 0)}</td>
                  <td className="py-3 pr-4">{Number(row.flags_created ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Available exports"
        description="These exports are shaped for HR operations, audit review, and leadership reporting."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {exports.map((item) => (
            <div
              key={item.href}
              className="rounded-2xl border border-border bg-stone-50 p-4"
            >
              <p className="font-medium">{item.title}</p>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
              <Link
                href={item.href as Route}
                className="mt-4 inline-flex rounded-full border border-border bg-white px-4 py-2 text-sm text-stone-700"
              >
                Download CSV
              </Link>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
