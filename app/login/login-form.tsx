"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { SubmitButton } from "@/components/submit-button";
import { loginAction, type LoginActionState } from "@/app/login/actions";

const initialState: LoginActionState = {
  status: "idle"
};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm text-stone-700">Email</span>
        <input
          name="email"
          type="email"
          className="w-full rounded-2xl border border-border bg-stone-50 px-4 py-3 outline-none"
          required
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm text-stone-700">Password</span>
        <input
          name="password"
          type="password"
          className="w-full rounded-2xl border border-border bg-stone-50 px-4 py-3 outline-none"
          required
        />
      </label>
      <FormStatus status={state.status} message={state.message} />
      <SubmitButton
        label="Sign in"
        pendingLabel="Signing in..."
        className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}
