create index if not exists idx_profiles_auth_user_id
  on public.profiles (auth_user_id);

create index if not exists idx_profiles_team_id
  on public.profiles (team_id);

create index if not exists idx_profiles_is_active
  on public.profiles (is_active);

create index if not exists idx_user_roles_profile_primary
  on public.user_roles (profile_id, is_primary desc, created_at asc);

create index if not exists idx_user_roles_role_profile
  on public.user_roles (role, profile_id);

create index if not exists idx_employee_records_manager_status
  on public.employee_records (manager_profile_id, employment_status, profile_id);

create index if not exists idx_employee_records_profile_status
  on public.employee_records (profile_id, employment_status);

create index if not exists idx_manager_assignments_employee_manager_dates
  on public.manager_assignments (employee_profile_id, manager_profile_id, starts_on, ends_on);

create index if not exists idx_review_cycles_active_close
  on public.review_cycles (is_active, close_date);

create index if not exists idx_review_cycles_period
  on public.review_cycles (period_start, period_end);

create index if not exists idx_cycle_enrollments_cycle_employee
  on public.cycle_enrollments (cycle_id, employee_profile_id);

create index if not exists idx_cycle_enrollments_cycle_reviewer
  on public.cycle_enrollments (cycle_id, acting_reviewer_profile_id);

create index if not exists idx_cycle_enrollments_review_status
  on public.cycle_enrollments (review_status, discussion_status);

create index if not exists idx_goals_owner_status_updated
  on public.goals (owner_profile_id, status, updated_at desc);

create index if not exists idx_goals_scope_status_updated
  on public.goals (scope, status, updated_at desc);

create index if not exists idx_goals_team_status_updated
  on public.goals (team_id, status, updated_at desc);

create index if not exists idx_goals_cycle_owner_scope
  on public.goals (cycle_id, owner_profile_id, scope, status);

create index if not exists idx_goals_cycle_team_scope
  on public.goals (cycle_id, team_id, scope, status);

create index if not exists idx_goal_approval_events_goal_event_created
  on public.goal_approval_events (goal_id, event_type, created_at desc);

create index if not exists idx_probation_cases_manager_status
  on public.probation_cases (manager_profile_id, status);

create index if not exists idx_probation_cases_employee_status
  on public.probation_cases (employee_profile_id, status);

create index if not exists idx_probation_checkpoints_case_status_due
  on public.probation_checkpoints (probation_case_id, status, due_date);

create index if not exists idx_feedback_requests_recipient_submission_due
  on public.feedback_requests (recipient_profile_id, submitted_at, due_at);

create index if not exists idx_feedback_requests_checkpoint
  on public.feedback_requests (checkpoint_id);

create index if not exists idx_feedback_requests_cycle_enrollment
  on public.feedback_requests (cycle_enrollment_id);

create index if not exists idx_feedback_submissions_subject_created
  on public.feedback_submissions (subject_profile_id, created_at desc);

create index if not exists idx_feedback_submissions_request
  on public.feedback_submissions (feedback_request_id);

create index if not exists idx_review_submissions_cycle_role_updated
  on public.review_submissions (cycle_enrollment_id, submission_role, updated_at desc);

create index if not exists idx_flags_status_aged_created
  on public.flags (status, aged_at, created_at desc);

create index if not exists idx_flags_feedback_submission
  on public.flags (feedback_submission_id);

create index if not exists idx_notifications_recipient_scheduled
  on public.notifications (recipient_profile_id, scheduled_for);

create index if not exists idx_notification_deliveries_notification_status
  on public.notification_deliveries (notification_id, status, updated_at desc);

create index if not exists idx_audit_logs_entity_action_created
  on public.audit_logs (entity_type, action, created_at desc);

create index if not exists idx_audit_logs_actor_created
  on public.audit_logs (actor_profile_id, created_at desc);

create index if not exists idx_audit_logs_uat_scenario
  on public.audit_logs (((metadata ->> 'scenarioKey')), created_at desc)
  where entity_type = 'uat_execution';
