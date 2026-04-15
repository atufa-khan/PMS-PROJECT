import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
      <p className="text-sm uppercase tracking-[0.35em] text-accent">PMS + GMS</p>
      <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-tight text-stone-900">
        Enterprise performance workflows with goals, probation, reviews, and HR oversight in one system.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
        This foundation build maps your PRD into a single Next.js and Supabase-ready application with role-aware
        dashboards, workflow services, and an audit-focused data model.
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/dashboard"
          className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-teal-800"
        >
          Open dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          View login screen
        </Link>
      </div>
    </main>
  );
}
