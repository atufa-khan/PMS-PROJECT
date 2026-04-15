import Link from "next/link";
import { SignUpForm } from "@/app/signup/signup-form";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-20">
      <div className="w-full rounded-xl2 border border-border/80 bg-white/90 p-8 shadow-card">
        <p className="text-sm uppercase tracking-[0.25em] text-accent">
          Create account
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Start using PMS</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Create a new employee account in Supabase Auth. The app will create or
          sync your PMS profile on first successful auth.
        </p>
        <SignUpForm />
        <div className="mt-6 text-center text-sm text-muted">
          <Link href="/" className="underline underline-offset-4">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
