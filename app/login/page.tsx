import Link from "next/link";
import { LoginForm } from "@/app/login/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-20">
      <div className="w-full rounded-xl2 border border-border/80 bg-white/90 p-8 shadow-card">
        <p className="text-sm uppercase tracking-[0.25em] text-accent">Secure sign-in</p>
        <h1 className="mt-3 text-3xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Sign in with your Supabase Auth credentials. On first successful login, the app will sync or create your
          PMS profile automatically.
        </p>
        <LoginForm />
        <p className="mt-6 text-center text-sm text-muted">
          Need an account?{" "}
          <Link href="/signup" className="text-accent underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
