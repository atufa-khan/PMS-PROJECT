"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/form-status";
import { SubmitButton } from "@/components/submit-button";
import {
  createGoalAction,
  type GoalActionState
} from "@/app/goals/new/actions";
import type { AppRole } from "@/lib/auth/roles";
import type {
  GoalOwnerOptionRecord,
  GoalScope,
  GoalWeightageContextRecord
} from "@/lib/db/types";

const initialState: GoalActionState = {
  status: "idle"
};

export function GoalForm({
  weightageContexts,
  action = createGoalAction,
  initialValues,
  submitLabel = "Create goal",
  pendingLabel = "Creating goal...",
  allowedScopes = ["individual", "team", "company"],
  assignableOwners = [],
  workspaceRole
}: {
  weightageContexts: GoalWeightageContextRecord[];
  action?: (
    prevState: GoalActionState,
    formData: FormData
  ) => Promise<GoalActionState>;
  initialValues?: {
    id?: string;
    title?: string;
    scope?: GoalScope;
    dueDate?: string;
    weightage?: number;
    description?: string;
    ownerProfileId?: string;
  };
  submitLabel?: string;
  pendingLabel?: string;
  allowedScopes?: GoalScope[];
  assignableOwners?: GoalOwnerOptionRecord[];
  workspaceRole?: AppRole;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [scope, setScope] = useState<GoalWeightageContextRecord["scope"]>(
    initialValues?.scope ?? allowedScopes[0] ?? "individual"
  );
  const [weightage, setWeightage] = useState(initialValues?.weightage ?? 0);
  const selectedContext =
    weightageContexts.find((context) => context.scope === scope) ??
    weightageContexts[0];
  const projectedTotal = Math.round((selectedContext.assignedTotal + weightage) * 100) / 100;
  const isBalanced = Math.abs(projectedTotal - 100) < 0.01;

  return (
    <form action={formAction} className="space-y-4">
      {initialValues?.id ? <input type="hidden" name="goalId" value={initialValues.id} /> : null}
      {workspaceRole ? <input type="hidden" name="workspaceRole" value={workspaceRole} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <input
          name="title"
          className="rounded-2xl border border-border bg-stone-50 px-4 py-3"
          placeholder="Goal title"
          defaultValue={initialValues?.title}
          required
        />
        <select
          name="scope"
          className="rounded-2xl border border-border bg-stone-50 px-4 py-3"
          defaultValue={initialValues?.scope ?? allowedScopes[0] ?? "individual"}
          onChange={(event) =>
            setScope(event.target.value as GoalWeightageContextRecord["scope"])
          }
        >
          {allowedScopes.includes("individual") ? (
            <option value="individual">Individual</option>
          ) : null}
          {allowedScopes.includes("team") ? <option value="team">Team</option> : null}
          {allowedScopes.includes("company") ? (
            <option value="company">Company</option>
          ) : null}
        </select>
        {assignableOwners.length > 0 ? (
          <select
            name="ownerProfileId"
            className="rounded-2xl border border-border bg-stone-50 px-4 py-3"
            defaultValue={initialValues?.ownerProfileId ?? assignableOwners[0]?.id}
          >
            {assignableOwners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.fullName}
                {owner.teamName ? ` • ${owner.teamName}` : ""}
              </option>
            ))}
          </select>
        ) : null}
        <input
          name="dueDate"
          type="date"
          className="rounded-2xl border border-border bg-stone-50 px-4 py-3"
          defaultValue={initialValues?.dueDate}
          required
        />
        <input
          name="weightage"
          type="number"
          min="0"
          max="100"
          step="0.01"
          className="rounded-2xl border border-border bg-stone-50 px-4 py-3"
          placeholder="Weightage"
          defaultValue={initialValues?.weightage}
          onChange={(event) => setWeightage(Number(event.target.value || 0))}
          required
        />
      </div>
      <div
        className={`rounded-2xl border px-4 py-3 text-sm ${
          isBalanced
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-rose-200 bg-rose-50 text-rose-900"
        }`}
      >
        <p className="font-medium">
          {scope.charAt(0).toUpperCase() + scope.slice(1)} portfolio counter
        </p>
        <p className="mt-1">
          Existing assigned weightage: {selectedContext.assignedTotal}% | projected total:{" "}
          {projectedTotal}% | remaining after this save:{" "}
          {Math.round((100 - projectedTotal) * 100) / 100}%
        </p>
        <p className="mt-1 text-xs">
          The counter turns red until the full portfolio balances to 100%. Drafts can still be
          submitted for review, but approval needs the final portfolio to balance at 100%.
        </p>
      </div>
      <textarea
        name="description"
        className="min-h-32 w-full rounded-2xl border border-border bg-stone-50 px-4 py-3"
        placeholder="Describe success criteria, blockers, and how this goal supports the cycle"
        defaultValue={initialValues?.description}
        required
      />
      <FormStatus status={state.status} message={state.message} />
      <SubmitButton
        label={submitLabel}
        pendingLabel={pendingLabel}
        className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}
