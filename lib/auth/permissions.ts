import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/auth/roles";
import type { AppSession } from "@/lib/auth/session";

export function requireRole(session: AppSession, allowed: AppRole[]) {
  if (!allowed.includes(session.role)) {
    redirect("/dashboard");
  }
}
