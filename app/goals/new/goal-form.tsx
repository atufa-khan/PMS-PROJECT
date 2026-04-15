"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { SubmitButton } from "@/components/submit-button";
import {
  createGoalAction,
  type GoalActionState
} from "@/app/goals/new/actions";

const initialState: GoalActionState = {
  status: "idle"
};

export function GoalForm() {
  const [state, formAction] = useActionState(createGoalAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <input
          name="title"
          className="rounded-2xl border border-border bg-stone-50 px-4 py-3"
          placeholder="Goal title"
          required
        />
        <select
          name="scope"
          className="rounded-2xl border border-border bg-stone-50 px-4 py-3"
          defaultValue="individual"
        >
          <option value="individual">Individual</option>
          <option value="team">Team</option>
          <option value="company">Company</option>
        </select>
        <input
          name="dueDate"
          type="date"
          className="rounded-2xl border border-border bg-stone-50 px-4 py-3"
          required
        />
        <input
          name="weightage"
          type="number"
          min="0"
          max="100"
          className="rounded-2xl border border-border bg-stone-50 px-4 py-3"
          placeholder="Weightage"
          required
        />
      </div>
      <textarea
        name="description"
        className="min-h-32 w-full rounded-2xl border border-border bg-stone-50 px-4 py-3"
        placeholder="Describe success criteria, blockers, and how this goal supports the cycle"
        required
      />
      <FormStatus status={state.status} message={state.message} />
      <SubmitButton
        label="Create goal"
        pendingLabel="Creating goal..."
        className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}
