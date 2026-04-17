import Link from "next/link";
import { SignUpForm } from "@/app/signup/signup-form";
import { env } from "@/lib/config/env";
import { dbQuery } from "@/lib/db/server";

export default async function SignUpPage() {
  const managers = await dbQuery<{
    id: string;
    full_name: string;
    email: string;
  }>(
    `
      select p.id, p.full_name, p.email
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      where ur.role = 'manager'
        and p.is_active = true
      order by ur.is_primary desc, p.full_name asc
    `
  ).catch(() => ({ rows: [] }));

  const allowElevatedRoles = env.ALLOW_ELEVATED_SELF_SIGNUP;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-20">
      <div className="w-full rounded-xl2 border border-border/80 bg-white/90 p-8 shadow-card">
        <p className="text-sm uppercase tracking-[0.25em] text-accent">
          Create account
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Start using PMS</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {allowElevatedRoles
            ? "Create a new PMS account in Supabase Auth. The app will create or sync your PMS profile on first successful auth."
            : "Create a new employee account in Supabase Auth. Manager and Admin access are provisioned through Admin Users in this environment."}
        </p>
        <SignUpForm
          allowElevatedRoles={allowElevatedRoles}
          managerOptions={managers.rows.map((manager) => ({
            id: manager.id,
            fullName: manager.full_name,
            email: manager.email
          }))}
        />
        <div className="mt-6 text-center text-sm text-muted">
          <Link href="/" className="underline underline-offset-4">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
