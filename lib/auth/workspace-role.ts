import type { AppRole } from "@/lib/auth/roles";
import type { AppSession } from "@/lib/auth/session";

export type WorkspaceToggleOption = {
  href: string;
  label: string;
  role: AppRole;
};

export function canUsePlayerCoachToggle(session: AppSession) {
  return session.roles.includes("employee") && session.roles.includes("manager");
}

export function resolveWorkspaceSession(
  session: AppSession,
  requestedRole?: string
): AppSession {
  if (!requestedRole) {
    return session;
  }

  if (!session.roles.includes(requestedRole as AppRole)) {
    return session;
  }

  return {
    ...session,
    role: requestedRole as AppRole
  };
}

export function buildWorkspaceToggleOptions(
  session: AppSession,
  currentRole: AppRole,
  pathname: string,
  searchParams?: Record<string, string | string[] | undefined>
): WorkspaceToggleOption[] {
  if (!canUsePlayerCoachToggle(session)) {
    return [];
  }

  const roles: AppRole[] = ["employee", "manager"];

  return roles
    .filter((role) => session.roles.includes(role))
    .map((role) => {
      const params = new URLSearchParams();

      for (const [key, value] of Object.entries(searchParams ?? {})) {
        if (key === "view") {
          continue;
        }

        if (typeof value === "string") {
          params.set(key, value);
        }
      }

      if (role !== session.role || currentRole !== session.role) {
        params.set("view", role);
      }

      const query = params.toString();

      return {
        role,
        label: role === "employee" ? "My performance" : "My team's performance",
        href: query ? `${pathname}?${query}` : pathname
      };
    });
}
