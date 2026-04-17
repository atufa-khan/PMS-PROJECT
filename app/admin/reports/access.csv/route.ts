import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db/server";
import { toCsv } from "@/lib/reports/csv";

export async function GET() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const result = await dbQuery<{
    full_name: string | null;
    email: string;
    is_active: boolean;
    employment_status: string | null;
    roles: string[] | null;
    manager_name: string | null;
    team_name: string | null;
    auth_linked: boolean;
  }>(
    `
      select
        p.full_name,
        p.email,
        p.is_active,
        er.employment_status,
        array_remove(array_agg(distinct ur.role::text order by ur.role::text), null) as roles,
        manager.full_name as manager_name,
        team.name as team_name,
        (p.auth_user_id is not null) as auth_linked
      from public.profiles p
      left join public.user_roles ur on ur.profile_id = p.id
      left join public.employee_records er on er.profile_id = p.id
      left join public.profiles manager on manager.id = er.manager_profile_id
      left join public.teams team on team.id = p.team_id
      group by
        p.id,
        p.full_name,
        p.email,
        p.is_active,
        er.employment_status,
        manager.full_name,
        team.name,
        p.auth_user_id
      order by p.is_active desc, p.created_at desc
    `
  );

  const rows = result.rows.map((row) => ({
    full_name: row.full_name ?? "Unknown user",
    email: row.email,
    is_active: row.is_active,
    employment_status: row.employment_status ?? "",
    roles: (row.roles ?? []).join(" | "),
    manager_name: row.manager_name ?? "",
    team_name: row.team_name ?? "",
    auth_linked: row.auth_linked
  }));

  return new NextResponse(
    toCsv(rows) ||
      "full_name,email,is_active,employment_status,roles,manager_name,team_name,auth_linked\n",
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="pms-access-roster.csv"'
      }
    }
  );
}
