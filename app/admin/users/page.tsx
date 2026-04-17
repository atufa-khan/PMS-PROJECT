import { AppShell } from "@/components/app-shell";
import { FormStatus } from "@/components/form-status";
import { SectionCard } from "@/components/section-card";
import {
  assignReportingManagerAction,
  linkExistingProfileAction,
  provisionUserAction,
  updateUserLifecycleAction
} from "@/app/admin/users/actions";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { getSupabaseAdminKey } from "@/lib/config/env";
import { listAssignableManagers } from "@/lib/workflows/probation-service";
import {
  listAccessRoster,
  listProvisioningEvents
} from "@/lib/workflows/provisioning-service";

export default async function AdminUsersPage({
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
  const [managers, roster, events] = await Promise.all([
    listAssignableManagers(),
    listAccessRoster(),
    listProvisioningEvents()
  ]);
  const provisioningEnabled = Boolean(getSupabaseAdminKey());

  return (
    <AppShell
      role={session.role}
      title="User provisioning"
      subtitle="Provision employee, manager, and Admin access from one controlled admin surface instead of relying on open elevated self-signup."
      userName={session.fullName}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      <FormStatus
        status={status === "success" || status === "error" ? status : "idle"}
        message={message}
      />

      <SectionCard
        title="Provision access"
        description="Use invite mode when the user should onboard through email, or direct mode when you need to create an active account with a temporary password."
      >
        <datalist id="manager-provision-directory">
          {managers.map((manager) => (
            <option key={manager.email} value={manager.email}>
              {manager.full_name}
            </option>
          ))}
        </datalist>

        {!provisioningEnabled ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Admin provisioning is disabled until `SUPABASE_SECRET_KEY` or
            `SUPABASE_SERVICE_ROLE_KEY` is configured in the environment.
          </div>
        ) : null}

        <form action={provisionUserAction} className="grid gap-4 md:grid-cols-2">
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">Full name</span>
            <input
              name="fullName"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
              placeholder="User full name"
              required
            />
          </label>
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">Email</span>
            <input
              name="email"
              type="email"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
              placeholder="user@company.com"
              required
            />
          </label>
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">Role</span>
            <select
              name="role"
              defaultValue="employee"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin (HR)</option>
            </select>
          </label>
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">Provisioning mode</span>
            <select
              name="provisioningMode"
              defaultValue="invite"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
            >
              <option value="invite">Send email invite</option>
              <option value="direct">Create active account</option>
            </select>
          </label>
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">Reporting manager email</span>
            <input
              name="managerEmail"
              list="manager-provision-directory"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
              placeholder="manager@company.com"
            />
            <p className="mt-2 text-xs text-muted">
              Used for employee accounts so goal approvals route correctly.
            </p>
          </label>
          <label className="rounded-2xl border border-border bg-stone-50 p-4">
            <span className="mb-2 block text-sm text-muted">Temporary password</span>
            <input
              name="temporaryPassword"
              type="password"
              className="w-full rounded-xl border border-border bg-white px-3 py-2"
              placeholder="Required for direct mode"
            />
            <p className="mt-2 text-xs text-muted">
              Only required when using direct account creation.
            </p>
          </label>
          <label className="rounded-2xl border border-border bg-stone-50 p-4 md:col-span-2">
            <span className="mb-2 block text-sm text-muted">Admin note</span>
            <textarea
              name="note"
              className="min-h-24 w-full rounded-xl border border-border bg-white px-3 py-2"
              placeholder="Why is this account being provisioned?"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!provisioningEnabled}
              className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Provision user
            </button>
          </div>
        </form>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Access roster"
          description="Recent active users, their roles, and whether the account is already linked to Supabase Auth."
        >
          <div className="space-y-3">
            {roster.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
                No users are visible yet.
              </div>
            ) : null}

            {roster.map((user) => (
              <div
                key={user.id}
                className="rounded-2xl border border-border bg-stone-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{user.fullName}</p>
                    <p className="mt-1 text-sm text-muted">{user.email}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.15em] text-muted">
                      {user.roles.join(" | ") || "No role assigned"} | auth linked:{" "}
                      {user.authLinked ? "yes" : "no"} |{" "}
                      {user.isActive ? "active" : "inactive"}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Manager: {user.managerName ?? "Unassigned"} | Team:{" "}
                      {user.teamName ?? "Unassigned"}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Employment: {user.employmentStatus ?? "n/a"} | direct reports:{" "}
                      {user.directReportCount} | acting reviews:{" "}
                      {user.activeReviewAssignments} | elevated goals:{" "}
                      {user.elevatedGoalCount}
                    </p>
                    {user.lifecycleHint ? (
                      <p className="mt-2 text-xs text-muted">{user.lifecycleHint}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {!user.authLinked && provisioningEnabled ? (
                      <form action={linkExistingProfileAction}>
                        <input type="hidden" name="profileId" value={user.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-border bg-white px-3 py-2 text-xs text-stone-700"
                        >
                          Invite and link auth
                        </button>
                      </form>
                    ) : null}

                    <form action={updateUserLifecycleAction}>
                      <input type="hidden" name="profileId" value={user.id} />
                      <input
                        type="hidden"
                        name="lifecycleAction"
                        value={user.isActive ? "deactivate" : "reactivate"}
                      />
                      <button
                        type="submit"
                        disabled={user.isActive ? !user.canDeactivate : false}
                        className="rounded-full border border-border bg-white px-3 py-2 text-xs text-stone-700"
                      >
                        {user.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </div>
                </div>

                {user.roles.includes("employee") ? (
                  <form
                    action={assignReportingManagerAction}
                    className="mt-4 flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="profileId" value={user.id} />
                    <label className="min-w-[240px] flex-1">
                      <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted">
                        Reporting manager email
                      </span>
                      <input
                        name="managerEmail"
                        list="manager-provision-directory"
                        className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                        defaultValue={user.managerEmail ?? ""}
                        placeholder="manager@company.com"
                        required
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-full border border-border bg-white px-4 py-2 text-xs text-stone-700"
                    >
                      Save manager
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Recent provisioning history"
          description="Audit trail for admin-created and invited accounts."
        >
          <div className="space-y-3">
            {events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-stone-50 p-4 text-sm text-muted">
                No provisioning history has been recorded yet.
              </div>
            ) : null}

            {events.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-border bg-stone-50 p-4"
              >
                <p className="font-medium">{event.targetEmail}</p>
                <p className="mt-1 text-sm text-muted">
                  {event.action} | {event.targetRole} | {event.mode}
                </p>
                <p className="mt-2 text-xs text-muted">
                  By {event.actorName} on {event.createdAt}
                </p>
                {event.managerEmail ? (
                  <p className="mt-2 text-xs text-muted">
                    Reporting manager: {event.managerEmail}
                  </p>
                ) : null}
                {event.note ? (
                  <p className="mt-2 text-xs text-muted">{event.note}</p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
