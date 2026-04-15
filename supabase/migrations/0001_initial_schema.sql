create extension if not exists "pgcrypto";

create type public.app_role as enum ('employee', 'manager', 'admin');
create type public.review_track as enum ('biannual', 'quarterly');
create type public.probation_status as enum ('active', 'paused', 'completed', 'terminated', 'extended');
create type public.goal_scope as enum ('company', 'team', 'individual');
create type public.goal_status as enum ('draft', 'pending_approval', 'active', 'completed', 'archived');
create type public.review_cycle_type as enum ('biannual', 'quarterly');
create type public.review_status as enum ('not_started', 'in_progress', 'submitted', 'overdue', 'waived', 'finalized');
create type public.discussion_status as enum ('not_scheduled', 'scheduled', 'completed');
create type public.feedback_workflow_type as enum ('probation', 'cycle_review');
create type public.feedback_actor_type as enum ('employee', 'manager', 'admin');
create type public.flag_status as enum ('open', 'in_review', 'resolved', 'escalated');
create type public.flag_severity as enum ('low', 'medium', 'high', 'critical');
create type public.notification_channel as enum ('email', 'in_app');
create type public.notification_status as enum ('pending', 'sent', 'failed');
create type public.probation_decision_type as enum ('confirm', 'extend_probation', 'review_further');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  parent_team_id uuid references public.teams(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  employee_code text unique,
  full_name text not null,
  email text not null unique,
  department text,
  team_id uuid references public.teams(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, role)
);

create table public.employee_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  date_of_joining date not null,
  review_track public.review_track not null,
  probation_status public.probation_status not null default 'active',
  employment_status text not null default 'active',
  manager_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.manager_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references public.profiles(id) on delete cascade,
  manager_profile_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.leave_periods (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  leave_type text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.review_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cycle_type public.review_cycle_type not null,
  period_start date not null,
  period_end date not null,
  trigger_date date not null,
  close_date date not null,
  finalization_date date,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.cycle_enrollments (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.review_cycles(id) on delete cascade,
  employee_profile_id uuid not null references public.profiles(id) on delete cascade,
  acting_reviewer_profile_id uuid references public.profiles(id) on delete set null,
  discussion_status public.discussion_status not null default 'not_scheduled',
  discussion_date timestamptz,
  review_status public.review_status not null default 'not_started',
  eligibility_note text,
  deduplication_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cycle_id, employee_profile_id)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  parent_goal_id uuid references public.goals(id) on delete set null,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  cycle_id uuid references public.review_cycles(id) on delete set null,
  scope public.goal_scope not null,
  status public.goal_status not null default 'draft',
  title text not null,
  description text,
  success_metric text,
  weightage numeric(5,2) not null default 0,
  completion_pct numeric(5,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.goal_updates (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  progress_delta numeric(5,2),
  note text,
  blocker text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.goal_approval_events (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.probation_cases (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null unique references public.profiles(id) on delete cascade,
  manager_profile_id uuid references public.profiles(id) on delete set null,
  status public.probation_status not null default 'active',
  confirmation_discussion_status public.discussion_status not null default 'not_scheduled',
  confirmation_discussion_at timestamptz,
  admin_briefing_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.probation_checkpoints (
  id uuid primary key default gen_random_uuid(),
  probation_case_id uuid not null references public.probation_cases(id) on delete cascade,
  checkpoint_day integer not null check (checkpoint_day in (30, 60, 80)),
  due_date date not null,
  status text not null,
  waiting_on public.feedback_actor_type,
  manager_context_note text,
  waiver_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (probation_case_id, checkpoint_day)
);

create table public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid references public.probation_checkpoints(id) on delete cascade,
  cycle_enrollment_id uuid references public.cycle_enrollments(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_role public.feedback_actor_type not null,
  due_at timestamptz not null,
  submitted_at timestamptz,
  status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  feedback_request_id uuid references public.feedback_requests(id) on delete set null,
  workflow_type public.feedback_workflow_type not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  subject_profile_id uuid references public.profiles(id) on delete set null,
  score numeric(3,1),
  answers jsonb not null default '{}'::jsonb,
  sentiment_label text,
  is_soft_flag boolean not null default false,
  goal_snapshot jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.review_submissions (
  id uuid primary key default gen_random_uuid(),
  cycle_enrollment_id uuid not null references public.cycle_enrollments(id) on delete cascade,
  submission_role public.feedback_actor_type not null,
  overall_rating text,
  summary text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cycle_enrollment_id, submission_role)
);

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  feedback_submission_id uuid references public.feedback_submissions(id) on delete cascade,
  severity public.flag_severity not null,
  reason text not null,
  status public.flag_status not null default 'open',
  aged_at timestamptz,
  is_repeat_flag boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.flag_actions (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.flags(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action_type text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  channel public.notification_channel not null,
  template_key text not null,
  subject text,
  body text,
  action_url text,
  scheduled_for timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  status public.notification_status not null default 'pending',
  provider_message_id text,
  retry_count integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  red_flag_threshold numeric(3,1),
  secondary_admin_profile_id uuid references public.profiles(id) on delete set null,
  admin_successor_profile_id uuid references public.profiles(id) on delete set null,
  is_review_activation_blocked boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.probation_decisions (
  id uuid primary key default gen_random_uuid(),
  probation_case_id uuid not null references public.probation_cases(id) on delete cascade,
  decided_by uuid references public.profiles(id) on delete set null,
  decision public.probation_decision_type not null,
  note text,
  effective_on date,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.has_role(requested_role public.app_role)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where profile_id = public.current_profile_id()
      and role = requested_role
  );
$$;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.employee_records enable row level security;
alter table public.manager_assignments enable row level security;
alter table public.leave_periods enable row level security;
alter table public.review_cycles enable row level security;
alter table public.cycle_enrollments enable row level security;
alter table public.goals enable row level security;
alter table public.goal_updates enable row level security;
alter table public.goal_approval_events enable row level security;
alter table public.probation_cases enable row level security;
alter table public.probation_checkpoints enable row level security;
alter table public.feedback_requests enable row level security;
alter table public.feedback_submissions enable row level security;
alter table public.review_submissions enable row level security;
alter table public.flags enable row level security;
alter table public.flag_actions enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;
alter table public.probation_decisions enable row level security;

create policy "admin full access to teams" on public.teams for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "profiles self or admin read" on public.profiles for select using (id = public.current_profile_id() or public.has_role('admin'));
create policy "roles self or admin read" on public.user_roles for select using (profile_id = public.current_profile_id() or public.has_role('admin'));
create policy "employee records self manager admin read" on public.employee_records for select using (
  profile_id = public.current_profile_id()
  or manager_profile_id = public.current_profile_id()
  or public.has_role('admin')
);
create policy "goal read policy" on public.goals for select using (
  owner_profile_id = public.current_profile_id()
  or public.has_role('admin')
  or exists (
    select 1
    from public.employee_records er
    where er.profile_id = goals.owner_profile_id
      and er.manager_profile_id = public.current_profile_id()
  )
);
create policy "goal insert policy" on public.goals for insert with check (
  public.has_role('admin')
  or created_by = public.current_profile_id()
);
create policy "goal update policy" on public.goals for update using (
  public.has_role('admin')
  or owner_profile_id = public.current_profile_id()
  or exists (
    select 1
    from public.employee_records er
    where er.profile_id = goals.owner_profile_id
      and er.manager_profile_id = public.current_profile_id()
  )
);
create policy "probation read policy" on public.probation_cases for select using (
  employee_profile_id = public.current_profile_id()
  or manager_profile_id = public.current_profile_id()
  or public.has_role('admin')
);
create policy "checkpoint read policy" on public.probation_checkpoints for select using (
  exists (
    select 1 from public.probation_cases pc
    where pc.id = probation_checkpoints.probation_case_id
      and (
        pc.employee_profile_id = public.current_profile_id()
        or pc.manager_profile_id = public.current_profile_id()
        or public.has_role('admin')
      )
  )
);
create policy "feedback submission read policy" on public.feedback_submissions for select using (
  actor_profile_id = public.current_profile_id()
  or subject_profile_id = public.current_profile_id()
  or public.has_role('admin')
);
create policy "review cycles readable to authenticated users" on public.review_cycles for select using (auth.uid() is not null);
create policy "cycle enrollments self manager admin read" on public.cycle_enrollments for select using (
  employee_profile_id = public.current_profile_id()
  or acting_reviewer_profile_id = public.current_profile_id()
  or public.has_role('admin')
);
create policy "flags admin only" on public.flags for select using (public.has_role('admin'));
create policy "flag actions admin only" on public.flag_actions for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "notifications self or admin read" on public.notifications for select using (
  recipient_profile_id = public.current_profile_id()
  or public.has_role('admin')
);
create policy "audit admin only" on public.audit_logs for select using (public.has_role('admin'));
create policy "app settings admin only" on public.app_settings for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "probation decisions self manager admin read" on public.probation_decisions for select using (
  public.has_role('admin')
  or exists (
    select 1 from public.probation_cases pc
    where pc.id = probation_decisions.probation_case_id
      and (
        pc.employee_profile_id = public.current_profile_id()
        or pc.manager_profile_id = public.current_profile_id()
      )
  )
);

create trigger set_teams_updated_at before update on public.teams for each row execute function public.set_updated_at();
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_employee_records_updated_at before update on public.employee_records for each row execute function public.set_updated_at();
create trigger set_manager_assignments_updated_at before update on public.manager_assignments for each row execute function public.set_updated_at();
create trigger set_leave_periods_updated_at before update on public.leave_periods for each row execute function public.set_updated_at();
create trigger set_review_cycles_updated_at before update on public.review_cycles for each row execute function public.set_updated_at();
create trigger set_cycle_enrollments_updated_at before update on public.cycle_enrollments for each row execute function public.set_updated_at();
create trigger set_goals_updated_at before update on public.goals for each row execute function public.set_updated_at();
create trigger set_probation_cases_updated_at before update on public.probation_cases for each row execute function public.set_updated_at();
create trigger set_probation_checkpoints_updated_at before update on public.probation_checkpoints for each row execute function public.set_updated_at();
create trigger set_feedback_requests_updated_at before update on public.feedback_requests for each row execute function public.set_updated_at();
create trigger set_feedback_submissions_updated_at before update on public.feedback_submissions for each row execute function public.set_updated_at();
create trigger set_review_submissions_updated_at before update on public.review_submissions for each row execute function public.set_updated_at();
create trigger set_flags_updated_at before update on public.flags for each row execute function public.set_updated_at();
create trigger set_notification_deliveries_updated_at before update on public.notification_deliveries for each row execute function public.set_updated_at();
create trigger set_app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();
