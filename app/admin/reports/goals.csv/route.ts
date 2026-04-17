import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/permissions";
import { getAppSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db/server";
import { toCsv } from "@/lib/reports/csv";

export async function GET() {
  const session = await getAppSession();
  requireRole(session, ["admin"]);

  const result = await dbQuery<{
    goal_id: string;
    title: string;
    scope: string;
    status: string;
    owner_name: string | null;
    owner_email: string | null;
    team_name: string | null;
    cycle_name: string | null;
    weightage: number | string;
    completion_pct: number | string;
    latest_submit_at: string | null;
    approved_at: string | null;
  }>(
    `
      with latest_submit as (
        select distinct on (goal_id)
          goal_id,
          to_char(created_at, 'YYYY-MM-DD') as latest_submit_at
        from public.goal_approval_events
        where event_type in ('submit', 'resubmit')
        order by goal_id, created_at desc
      )
      select
        g.id as goal_id,
        g.title,
        g.scope::text as scope,
        g.status::text as status,
        p.full_name as owner_name,
        p.email as owner_email,
        t.name as team_name,
        rc.name as cycle_name,
        g.weightage,
        g.completion_pct,
        ls.latest_submit_at,
        to_char(g.approved_at, 'YYYY-MM-DD') as approved_at
      from public.goals g
      left join public.profiles p on p.id = g.owner_profile_id
      left join public.teams t on t.id = g.team_id
      left join public.review_cycles rc on rc.id = g.cycle_id
      left join latest_submit ls on ls.goal_id = g.id
      order by g.updated_at desc, g.created_at desc
    `
  );

  const rows = result.rows.map((row) => ({
    goal_id: row.goal_id,
    title: row.title,
    scope: row.scope,
    status: row.status,
    owner_name: row.owner_name ?? "Unassigned",
    owner_email: row.owner_email ?? "",
    team_name: row.team_name ?? "",
    cycle_name: row.cycle_name ?? "",
    weightage: Number(row.weightage),
    completion_pct: Number(row.completion_pct),
    latest_submit_at: row.latest_submit_at ?? "",
    approved_at: row.approved_at ?? ""
  }));

  return new NextResponse(
    toCsv(rows) ||
      "goal_id,title,scope,status,owner_name,owner_email,team_name,cycle_name,weightage,completion_pct,latest_submit_at,approved_at\n",
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="pms-goals-report.csv"'
      }
    }
  );
}
