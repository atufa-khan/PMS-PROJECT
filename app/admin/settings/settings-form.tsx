"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { SubmitButton } from "@/components/submit-button";
import {
  updateAdminSettingsAction,
  type SettingsActionState
} from "@/app/admin/settings/actions";

const initialState: SettingsActionState = {
  status: "idle"
};

export function SettingsForm({
  redFlagThreshold,
  secondaryAdminName
}: {
  redFlagThreshold: number;
  secondaryAdminName: string;
}) {
  const [state, formAction] = useActionState(
    updateAdminSettingsAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="rounded-2xl border border-border bg-stone-50 p-4">
          <span className="mb-2 block text-sm text-muted">
            Default red-flag threshold
          </span>
          <input
            name="redFlagThreshold"
            type="number"
            min="1"
            max="5"
            className="w-full rounded-xl border border-border bg-white px-3 py-2"
            defaultValue={redFlagThreshold}
          />
        </label>
        <label className="rounded-2xl border border-border bg-stone-50 p-4">
          <span className="mb-2 block text-sm text-muted">
            Secondary Admin escalation owner
          </span>
          <input
            name="secondaryAdminName"
            className="w-full rounded-xl border border-border bg-white px-3 py-2"
            defaultValue={secondaryAdminName}
          />
        </label>
      </div>
      <FormStatus status={state.status} message={state.message} />
      <SubmitButton
        label="Save settings"
        pendingLabel="Saving settings..."
        className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}
