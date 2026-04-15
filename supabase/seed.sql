insert into public.teams (id, parent_team_id, name, slug, description)
values
  ('3fd3155b-5c1c-48ab-81e0-aa9802be3687', null, 'People Operations', 'people-operations', 'Company-wide people, HR, and performance operations'),
  ('7f747801-831b-48af-a9f4-48d4aa3bde5e', '3fd3155b-5c1c-48ab-81e0-aa9802be3687', 'Business Operations', 'business-operations', 'Team goals and manager oversight');

insert into public.profiles (id, auth_user_id, employee_code, full_name, email, department, team_id)
values
  ('8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', null, 'EMP-1001', 'Aarav Shah', 'aarav.shah@pms.local', 'People', '3fd3155b-5c1c-48ab-81e0-aa9802be3687'),
  ('7f83686a-3a66-4876-b564-10d7cdd74c11', null, 'EMP-1002', 'Neha Rao', 'neha.rao@pms.local', 'Business Ops', '7f747801-831b-48af-a9f4-48d4aa3bde5e'),
  ('6f3c1130-93f3-47ff-8664-6474ac48a637', null, 'EMP-1003', 'Ishita Gupta', 'ishita.gupta@pms.local', 'Business Ops', '7f747801-831b-48af-a9f4-48d4aa3bde5e'),
  ('29f4bc79-a1d3-420f-9107-f665ecb79311', null, 'EMP-1004', 'Rohan Mehta', 'rohan.mehta@pms.local', 'Business Ops', '7f747801-831b-48af-a9f4-48d4aa3bde5e');

insert into public.user_roles (profile_id, role, is_primary)
values
  ('8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', 'admin', true),
  ('7f83686a-3a66-4876-b564-10d7cdd74c11', 'manager', true),
  ('7f83686a-3a66-4876-b564-10d7cdd74c11', 'employee', false),
  ('6f3c1130-93f3-47ff-8664-6474ac48a637', 'employee', true),
  ('29f4bc79-a1d3-420f-9107-f665ecb79311', 'employee', true);

insert into public.employee_records (profile_id, date_of_joining, review_track, probation_status, employment_status, manager_profile_id)
values
  ('7f83686a-3a66-4876-b564-10d7cdd74c11', '2024-02-12', 'biannual', 'completed', 'active', '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3'),
  ('6f3c1130-93f3-47ff-8664-6474ac48a637', '2026-01-20', 'biannual', 'active', 'active', '7f83686a-3a66-4876-b564-10d7cdd74c11'),
  ('29f4bc79-a1d3-420f-9107-f665ecb79311', '2026-03-04', 'quarterly', 'active', 'active', null);

insert into public.manager_assignments (employee_profile_id, manager_profile_id, starts_on, reason)
values
  ('6f3c1130-93f3-47ff-8664-6474ac48a637', '7f83686a-3a66-4876-b564-10d7cdd74c11', '2026-01-20', 'Primary manager assignment');

insert into public.leave_periods (employee_profile_id, starts_on, ends_on, leave_type, notes)
values
  ('6f3c1130-93f3-47ff-8664-6474ac48a637', '2026-03-28', '2026-04-02', 'medical', 'Pause probation timer during approved leave');

insert into public.review_cycles (id, name, cycle_type, period_start, period_end, trigger_date, close_date, finalization_date, is_active)
values
  ('ad486493-2830-4c0e-bf1b-8fc6c1ca1cae', 'Bi-Annual Cycle 1 FY26', 'biannual', '2026-04-01', '2026-09-30', '2026-08-01', '2026-08-25', '2026-08-26', true),
  ('696d5ee1-c8f4-410d-96a7-636c4c00da54', 'Quarterly Q2 FY26', 'quarterly', '2026-04-01', '2026-06-30', '2026-07-01', '2026-07-15', '2026-07-16', true);

insert into public.cycle_enrollments (id, cycle_id, employee_profile_id, acting_reviewer_profile_id, discussion_status, discussion_date, review_status, eligibility_note, deduplication_note)
values
  ('ac20a4ef-cae7-44ab-b496-62150cf9f0ff', 'ad486493-2830-4c0e-bf1b-8fc6c1ca1cae', '6f3c1130-93f3-47ff-8664-6474ac48a637', '7f83686a-3a66-4876-b564-10d7cdd74c11', 'scheduled', '2026-08-19 11:00:00+00', 'in_progress', 'Eligible: joined more than 60 days before cycle close', null),
  ('8db955bc-eb89-42c1-b418-069b84784dfa', '696d5ee1-c8f4-410d-96a7-636c4c00da54', '29f4bc79-a1d3-420f-9107-f665ecb79311', null, 'not_scheduled', null, 'not_started', 'Eligible for quarterly track', 'Quarterly enrollment supersedes biannual overlap');

insert into public.goals (id, parent_goal_id, owner_profile_id, team_id, cycle_id, scope, status, title, description, success_metric, weightage, completion_pct, created_by, approved_by, approved_at)
values
  ('4f0cb2df-4913-4ff0-9d32-3a887e2c0a48', null, '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', '3fd3155b-5c1c-48ab-81e0-aa9802be3687', 'ad486493-2830-4c0e-bf1b-8fc6c1ca1cae', 'company', 'active', 'Launch structured onboarding goals for all new hires', 'Standardize goal setup for all new joiners across the company.', '90% goal assignment within first 30 days', 20, 55, '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', timezone('utc', now())),
  ('9df4dbdf-f63e-4207-b7c9-d0e309892f63', '4f0cb2df-4913-4ff0-9d32-3a887e2c0a48', '7f83686a-3a66-4876-b564-10d7cdd74c11', '7f747801-831b-48af-a9f4-48d4aa3bde5e', 'ad486493-2830-4c0e-bf1b-8fc6c1ca1cae', 'team', 'active', 'Reduce probation form delays below 10%', 'Improve submission compliance through manager-level follow-up.', 'Under 10% overdue checkpoints', 30, 72, '7f83686a-3a66-4876-b564-10d7cdd74c11', '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', timezone('utc', now())),
  ('3ce506cf-7572-44b4-bb2d-dfd3aa841478', '9df4dbdf-f63e-4207-b7c9-d0e309892f63', '6f3c1130-93f3-47ff-8664-6474ac48a637', '7f747801-831b-48af-a9f4-48d4aa3bde5e', 'ad486493-2830-4c0e-bf1b-8fc6c1ca1cae', 'individual', 'pending_approval', 'Automate manager nudges for pending reviews', 'Create a manager follow-up pattern for overdue employee review steps.', '100% nudge delivery before escalation threshold', 25, 10, '6f3c1130-93f3-47ff-8664-6474ac48a637', null, null),
  ('c36a0ccb-09f9-4bb6-b92e-8e72893e0f63', '9df4dbdf-f63e-4207-b7c9-d0e309892f63', '6f3c1130-93f3-47ff-8664-6474ac48a637', '7f747801-831b-48af-a9f4-48d4aa3bde5e', 'ad486493-2830-4c0e-bf1b-8fc6c1ca1cae', 'individual', 'active', 'Improve team goal coverage in first 30 days', 'Ensure new joiners receive approved goals before month one closes.', '90% coverage rate within 30 days', 25, 93, '7f83686a-3a66-4876-b564-10d7cdd74c11', '7f83686a-3a66-4876-b564-10d7cdd74c11', timezone('utc', now()));

insert into public.goal_approval_events (goal_id, actor_profile_id, event_type, reason, metadata)
values
  ('3ce506cf-7572-44b4-bb2d-dfd3aa841478', '6f3c1130-93f3-47ff-8664-6474ac48a637', 'submit', 'Employee submitted draft for review', '{"submitted_from":"employee_dashboard"}'::jsonb),
  ('c36a0ccb-09f9-4bb6-b92e-8e72893e0f63', '7f83686a-3a66-4876-b564-10d7cdd74c11', 'approve', 'Balanced team weightage during approval', '{"weightage_confirmed":true}'::jsonb);

insert into public.probation_cases (id, employee_profile_id, manager_profile_id, status, confirmation_discussion_status, confirmation_discussion_at, admin_briefing_note)
values
  ('fd5b0140-7f6c-4f05-91d1-824f08937bc6', '6f3c1130-93f3-47ff-8664-6474ac48a637', '7f83686a-3a66-4876-b564-10d7cdd74c11', 'active', 'scheduled', '2026-04-28 10:00:00+00', 'Manager briefing pending final checkpoint submission'),
  ('279ea570-d9f5-4c03-a6e2-6f7d2d76ec12', '29f4bc79-a1d3-420f-9107-f665ecb79311', null, 'active', 'not_scheduled', null, 'Blocked due to missing manager assignment');

insert into public.probation_checkpoints (id, probation_case_id, checkpoint_day, due_date, status, waiting_on, manager_context_note, waiver_reason)
values
  ('56374ed0-1ae4-4a63-aa40-d2c2504041c7', 'fd5b0140-7f6c-4f05-91d1-824f08937bc6', 60, '2026-04-20', 'in_progress', 'manager', null, null),
  ('43db6771-f3c6-4fce-aa1e-07c0a97149e0', '279ea570-d9f5-4c03-a6e2-6f7d2d76ec12', 30, '2026-04-17', 'blocked', null, 'No manager assigned yet', null),
  ('fc9f44a5-443f-4e08-8302-942dc728bf89', 'fd5b0140-7f6c-4f05-91d1-824f08937bc6', 80, '2026-05-16', 'paused', 'employee', 'Paused while employee is on leave', null);

insert into public.feedback_requests (id, checkpoint_id, recipient_profile_id, recipient_role, due_at, submitted_at, status)
values
  ('0eb6643e-b758-40cf-af6d-0d4e3d0aa894', '56374ed0-1ae4-4a63-aa40-d2c2504041c7', '6f3c1130-93f3-47ff-8664-6474ac48a637', 'employee', '2026-04-20 18:30:00+00', '2026-04-15 12:00:00+00', 'submitted'),
  ('74722dd8-4197-49ce-b339-6d81209413d0', '56374ed0-1ae4-4a63-aa40-d2c2504041c7', '7f83686a-3a66-4876-b564-10d7cdd74c11', 'manager', '2026-04-20 18:30:00+00', null, 'pending');

insert into public.feedback_submissions (id, feedback_request_id, workflow_type, actor_profile_id, subject_profile_id, score, answers, sentiment_label, is_soft_flag, goal_snapshot)
values
  ('515130ef-72a4-43f2-97ab-b6a5418c6172', '0eb6643e-b758-40cf-af6d-0d4e3d0aa894', 'probation', '6f3c1130-93f3-47ff-8664-6474ac48a637', '6f3c1130-93f3-47ff-8664-6474ac48a637', 2.0, '{"communication":"Needs more structured check-ins","confidence":"I need more clarity on expectations"}'::jsonb, 'negative', false, '{"active_goals":2,"completion_pct":51}'::jsonb);

insert into public.flags (id, feedback_submission_id, severity, reason, status, aged_at, is_repeat_flag)
values
  ('8b7b95a3-f8d0-46f6-ab6f-5323d85d8ac2', '515130ef-72a4-43f2-97ab-b6a5418c6172', 'high', 'Score below configured threshold and negative sentiment detected', 'open', '2026-04-22 00:00:00+00', true);

insert into public.flag_actions (flag_id, actor_profile_id, action_type, note)
values
  ('8b7b95a3-f8d0-46f6-ab6f-5323d85d8ac2', '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', 'review_started', 'Admin reviewing repeat flag context before manager discussion');

insert into public.notifications (id, recipient_profile_id, channel, template_key, subject, body, action_url, scheduled_for)
values
  ('a9ae91c1-e3d6-43e0-ae63-9012efa4888d', '7f83686a-3a66-4876-b564-10d7cdd74c11', 'email', 'goal_approval_request', 'Goal approval pending', 'An employee goal is waiting for your review.', '/goals/approvals', '2026-04-16 08:00:00+00'),
  ('2f84cc1e-f2a6-48bb-9e8c-f2fc1d418297', '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', 'in_app', 'flag_escalation', 'Repeat flag requires review', 'A repeat flag has remained unresolved and needs Admin attention.', '/flags', '2026-04-16 09:00:00+00');

insert into public.notification_deliveries (notification_id, status, provider_message_id, retry_count, last_error, delivered_at)
values
  ('a9ae91c1-e3d6-43e0-ae63-9012efa4888d', 'sent', 'smtp-demo-001', 0, null, '2026-04-16 08:01:00+00'),
  ('2f84cc1e-f2a6-48bb-9e8c-f2fc1d418297', 'pending', null, 0, null, null);

insert into public.audit_logs (actor_profile_id, entity_type, entity_id, action, metadata)
values
  ('6f3c1130-93f3-47ff-8664-6474ac48a637', 'goal', '3ce506cf-7572-44b4-bb2d-dfd3aa841478', 'goal_submitted', '{"escalates_after_business_days":5}'::jsonb),
  ('8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', 'flag', '8b7b95a3-f8d0-46f6-ab6f-5323d85d8ac2', 'flag_review_started', '{"queue":"weekly_review"}'::jsonb),
  ('8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', 'probation_checkpoint', '43db6771-f3c6-4fce-aa1e-07c0a97149e0', 'checkpoint_blocked', '{"reason":"manager_missing"}'::jsonb);

insert into public.app_settings (id, red_flag_threshold, secondary_admin_profile_id, admin_successor_profile_id, is_review_activation_blocked)
values
  ('d4ea43c9-416d-45d2-a887-65ef1dad9d17', 2.0, '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', false);

insert into public.probation_decisions (probation_case_id, decided_by, decision, note, effective_on)
values
  ('fd5b0140-7f6c-4f05-91d1-824f08937bc6', '8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3', 'review_further', 'Complete Day 80 checkpoint before confirmation.', '2026-05-18');
