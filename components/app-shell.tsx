import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRightLeft,
  BarChart3,
  BellRing,
  ClipboardCheck,
  Flag,
  Goal,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  TimerReset,
  User,
  UserPlus,
  UsersRound
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import type { AppRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/auth/roles";

function getNavItems(role: AppRole) {
  const baseItems = [
    { href: "/dashboard" as Route, label: "Dashboard", icon: LayoutDashboard },
    { href: "/goals" as Route, label: "Goals", icon: Goal },
    { href: "/goals/approvals" as Route, label: "Approvals", icon: ShieldCheck },
    { href: "/probation" as Route, label: "Probation", icon: TimerReset },
    { href: "/reviews" as Route, label: "Reviews", icon: User }
  ];

  if (role !== "admin") {
    return baseItems;
  }

  return [
    ...baseItems,
    { href: "/flags" as Route, label: "Flags", icon: Flag },
    { href: "/admin/cycles" as Route, label: "Cycle Admin", icon: UsersRound },
    { href: "/admin/probation" as Route, label: "Probation Admin", icon: ShieldCheck },
    { href: "/admin/users" as Route, label: "Users", icon: UserPlus },
    { href: "/admin/ownership" as Route, label: "Ownership", icon: ArrowRightLeft },
    { href: "/admin/reports" as Route, label: "Reports", icon: BarChart3 },
    { href: "/admin/readiness" as Route, label: "Readiness", icon: ClipboardCheck },
    { href: "/admin/uat" as Route, label: "UAT", icon: ClipboardCheck },
    { href: "/admin/notifications" as Route, label: "Notifications", icon: BellRing },
    { href: "/admin/settings" as Route, label: "Settings", icon: Settings2 }
  ];
}

export function AppShell({
  role,
  title,
  subtitle,
  userName,
  userEmail,
  isDemo,
  workspaceToggle,
  children
}: {
  role: AppRole;
  title: string;
  subtitle: string;
  userName?: string;
  userEmail?: string;
  isDemo?: boolean;
  workspaceToggle?: Array<{
    href: string;
    label: string;
    role: AppRole;
  }>;
  children: React.ReactNode;
}) {
  const navItems = getNavItems(role);

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-xl2 border border-border/80 bg-white/85 p-5 shadow-card backdrop-blur">
          <div className="mb-8">
            <p className="text-sm uppercase tracking-[0.25em] text-muted">PMS</p>
            <h1 className="mt-2 text-2xl font-semibold">Performance Hub</h1>
            <p className="mt-2 text-sm text-muted">{roleLabel(role)} workspace</p>
          </div>

          {userName ? (
            <div className="mb-6 rounded-2xl border border-border bg-stone-50 p-4">
              <p className="font-medium text-stone-800">{userName}</p>
              {userEmail ? <p className="mt-1 text-sm text-muted">{userEmail}</p> : null}
              {isDemo ? (
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-accentWarm">
                  Demo fallback session
                </p>
              ) : null}
            </div>
          ) : null}

          {workspaceToggle && workspaceToggle.length > 1 ? (
            <div className="mb-6 rounded-2xl border border-border bg-stone-50 p-2">
              <p className="px-3 pb-2 pt-1 text-xs uppercase tracking-[0.18em] text-muted">
                Workspace view
              </p>
              <div className="grid gap-2">
                {workspaceToggle.map((option) => {
                  const isActive = option.role === role;

                  return (
                    <Link
                      key={option.role}
                      href={option.href as Route}
                      className={cn(
                        "rounded-2xl px-3 py-2 text-sm transition",
                        isActive
                          ? "bg-accent text-white"
                          : "bg-white text-stone-700 hover:bg-stone-100"
                      )}
                    >
                      {option.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          <nav className="space-y-2">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-stone-700 transition",
                  "hover:bg-stone-100 hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-6">
            <LogoutButton />
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-xl2 border border-border/80 bg-white/80 p-6 shadow-card backdrop-blur">
            <p className="text-sm uppercase tracking-[0.2em] text-accent">Role-based operations</p>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-3xl font-semibold">{title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{subtitle}</p>
              </div>
              <div className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
                Live workflow build
              </div>
            </div>
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}
