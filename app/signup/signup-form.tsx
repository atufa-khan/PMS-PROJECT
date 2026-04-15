"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { SubmitButton } from "@/components/submit-button";
import { signUpAction, type SignUpActionState } from "@/app/signup/actions";

const initialState: SignUpActionState = {
  status: "idle"
};

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm text-stone-700">Full name</span>
        <input
          name="fullName"
          className="w-full rounded-2xl border border-border bg-stone-50 px-4 py-3 outline-none"
          required
        />
      </label>
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
        <span className="mb-2 block text-sm text-stone-700">Role</span>
        <select
          name="role"
          defaultValue="employee"
          className="w-full rounded-2xl border border-border bg-stone-50 px-4 py-3 outline-none"
        >
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin (HR)</option>
        </select>
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
      <label className="block">
        <span className="mb-2 block text-sm text-stone-700">Confirm password</span>
        <input
          name="confirmPassword"
          type="password"
          className="w-full rounded-2xl border border-border bg-stone-50 px-4 py-3 outline-none"
          required
        />
      </label>
      <FormStatus status={state.status} message={state.message} />
      <SubmitButton
        label="Create account"
        pendingLabel="Creating account..."
        className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
