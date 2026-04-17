import { AppShell } from "@/components/app-shell";
import { FormStatus } from "@/components/form-status";
import { SectionCard } from "@/components/section-card";
import {
  transferGoalOwnershipAction,
  transferManagerPortfolioAction
} from "@/app/admin/ownership/actions";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import {
  listGoalOwnershipSummary,
  listManagerTransferSummary
} from "@/lib/workflows/ownership-service";

export default async function AdminOwnershipPage({
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
  const managers = await listManagerTransferSummary();
  const goalOwners = await listGoalOwnershipSummary();

  return (
    <AppShell
      role={session.role}
      title="Ownership transfer"
      subtitle="Use this surface to reassign reporting portfolios and transfer higher-level goal ownership during org changes, succession, or offboarding."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <FormStatus
        status={status === "success" || status === "error" ? status : "idle"}
        message={message}
      />

      <SectionCard
        title="Manager portfolio transfer"
        description="Move direct reports, review ownership, and probation ownership from one manager to another."
      >
        <datalist id="manager-transfer-directory">
          {managers.map((manager) => (
            <option key={manager.email} value={manager.email}>
              {manager.fullName}
            </option>
          ))}
        </datalist>

        <div className="mb-4 grid gap-4 xl:grid-cols-2">
          {managers.map((manager) => (
            <div
              key={manager.id}
              className="rounded-2xl border border-border bg-stone-50 p-4"
            >
              <p className="font-medium">{manager.fullName}</p>
              <p className="mt-1 text-sm text-muted">{manager.email}</p>
              <p className="mt-3 text-sm text-muted">
                Direct reports: {manager.directReportCount} | active review assignments:{" "}
                {manager.activeReviewAssignments} | team goals: {manager.openTeamGoalCount}
              </p>
            </div>
          ))}
        </div>

        <form action={transferManagerPortfolioAction} className="grid gap-4 md:grid-cols-2">
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">Current manager</span>
            <input
              name="currentManagerEmail"
              list="manager-transfer-directory"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
              placeholder="manager@company.com"
              required
            />
          </label>
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">New manager</span>
            <input
              name="nextManagerEmail"
              list="manager-transfer-directory"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
              placeholder="next.manager@company.com"
              required
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-white"
            >
              Transfer manager portfolio
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Goal ownership transfer"
        description="Transfer non-individual goal ownership when team or company-level responsibilities move to another manager or Admin."
      >
        <datalist id="goal-owner-directory">
          {goalOwners.map((owner) => (
            <option key={owner.email} value={owner.email}>
              {owner.fullName}
            </option>
          ))}
        </datalist>

        <div className="mb-4 grid gap-4 xl:grid-cols-2">
          {goalOwners.map((owner) => (
            <div
              key={owner.id}
              className="rounded-2xl border border-border bg-stone-50 p-4"
            >
              <p className="font-medium">{owner.fullName}</p>
              <p className="mt-1 text-sm text-muted">{owner.email}</p>
              <p className="mt-3 text-sm text-muted">
                Team goals: {owner.teamGoalCount} | company goals: {owner.companyGoalCount}
              </p>
            </div>
          ))}
        </div>

        <form action={transferGoalOwnershipAction} className="grid gap-4 md:grid-cols-3">
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">Current owner</span>
            <input
              name="currentOwnerEmail"
              list="goal-owner-directory"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
              placeholder="owner@company.com"
              required
            />
          </label>
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">New owner</span>
            <input
              name="nextOwnerEmail"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
              placeholder="new.owner@company.com"
              required
            />
          </label>
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">Transfer scope</span>
            <select
              name="scope"
              defaultValue="all_non_individual"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
            >
              <option value="all_non_individual">Team and company goals</option>
              <option value="team">Team goals only</option>
              <option value="company">Company goals only</option>
            </select>
          </label>
          <div className="md:col-span-3">
            <button
              type="submit"
              className="rounded-full border border-border bg-white px-5 py-3 text-sm text-stone-700"
            >
              Transfer goal ownership
            </button>
          </div>
        </form>
      </SectionCard>
    </AppShell>
  );
}
