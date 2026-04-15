# PMS Implementation Plan

## 1. Product Scope

Build a single local-first PMS application that includes GMS as an internal module, not as a separate product.

The app must support three authenticated roles:

- `employee`
- `manager`
- `admin`

Implementation note:

- The product-facing role is `Admin (HR)`
- The internal role key can still be stored as `hr_admin` if that is cleaner in code

The product must implement these core business areas:

- onboarding and goal setup
- probation monitoring at Day 30, Day 60, and Day 80
- bi-annual and quarterly performance cycles
- ongoing goal tracking and approval workflows
- unified feedback storage with red-flag review
- HR decision support for probation confirmation and review compliance

The implementation must not introduce a fourth business role. `Admin (HR)` subsumes HR and leadership/CXO access.

### Success Metrics Alignment

The implementation should support tracking these PRD success metrics:

- probation triggers sent on schedule: `100%` with zero manual intervention
- feedback form completion rate: `> 85%` before escalation threshold
- Admin flag review turnaround: `< 7 days`
- manager goal assignment coverage: `> 90%` within first `30` days of cycle
- employee goal approval turnaround: `< 5` business days

Reporting alignment:

- dashboards and reports should make these metrics measurable

## 2. Implementation Principles

- Build one `Next.js` application for UI and application logic.
- Use `Supabase` as the backend platform for auth, database, authorization, and scheduled jobs.
- Treat all workflows as auditable. Every approval, reassignment, waiver, escalation, and review decision should be logged.
- Keep GMS inside PMS. Goals, reviews, feedback, and dashboards should all share the same user model and data layer.
- Implement role-based visibility from day one using `RLS` and server-side authorization checks.
- Build automation as part of the core system, not as an optional add-on.

## 3. What Should Be Implemented

### Role Capability Alignment

Employee capabilities:

- view personal dashboard with goals, feedback history, and self-feedback
- create, edit, and update own goals in line with status rules from the PRD
- submit goals for approval
- submit self-feedback during probation checkpoints
- receive cycle emails and submit self-rating
- receive trigger emails, reminder nudges, and goal approval status updates

Manager capabilities:

- view team dashboard with team goals, ratings, and pending approvals
- create, assign, weight, approve, and reject team goals
- submit manager feedback during probation
- initiate discussion and submit final rating during review cycles
- receive trigger emails, escalation alerts, and approval queue notifications

Admin capabilities:

- view org-level overview with flagged responses and compliance status
- set company-wide goals and manage the goal structure
- approve or reject any goal
- trigger review cycles and monitor compliance
- view all submissions and flagged entries
- receive escalation inbox items and weekly digest summaries

### Authentication and Role Access

- Email/password sign-in using `Supabase Auth`
- Session handling for `Next.js` using `@supabase/ssr`
- Role mapping for `employee`, `manager`, and `admin`
- Protected routes and server-side permission checks
- `RLS` policies for all role-sensitive tables

How to implement:

- Use `auth.users` for identity
- Create `profiles` for user details and employment context
- Create `user_roles` so one user can act as employee and manager where needed
- Add role-aware helpers in the app layer for page guards and action guards
- Seed local test accounts for all three roles
- Support player-coach users with separate employee and manager views in one account

### Organization and Employment Setup

- Employee profiles with DOJ, manager, department/team, employment status, and review track
- Team structure for company -> team -> individual goal cascades
- Manager reassignment support
- Leave periods that pause probation clocks
- Admin setup for red-flag threshold and successor/escalation owner

How to implement:

- Create tables for `teams`, `profiles`, `employee_records`, `manager_assignments`, and `leave_periods`
- Keep employment data separate from auth data
- Store review track as `biannual` or `quarterly`
- Store probation status as `active`, `paused`, `completed`, `terminated`, or `extended`
- Store admin successor and secondary escalation contact in `app_settings`
- Support a first-login catch-up state for newly assigned Admin users
- When an Admin account is deactivated, reassign open flags, escalations, and digest subscriptions to the designated successor with a confirmation step
- Show open flags, pending escalations, and cycle status in the new-Admin catch-up briefing

### Goal Management System

- Company goals
- Team goals
- Individual goals
- Employee-created goal drafts
- Manager/Admin approval and rejection flow
- Weightage validation and completion tracking
- Goal archive/history rules
- Goal ownership transfer when an employee changes teams
- Weightage-based completion auto-aggregation from individual -> team -> company
- Goal-linked performance rating context: `Below Expectations`, `Meets Expectations`, or `Above Expectations`

How to implement:

- Use a single `goals` table with `parent_goal_id` to support hierarchy
- Store `scope` as `company`, `team`, or `individual`
- Store `status` as `draft`, `pending_approval`, `active`, `completed`, or `archived`
- Store `weightage`, `completion_pct`, `cycle_id`, `created_by`, `approved_by`, and `approved_at`
- Create `goal_updates` for progress notes, blockers, nudges, and completion updates
- Create `goal_approval_events` for submit, approve, reject, resubmit, and archive actions
- Block approval if active goal weightage is not balanced to `100%` for the target employee in the active cycle
- Preserve archived/deleted goal contribution in cycle history rather than removing it from past reporting
- Freeze archived/deleted goal contribution to completion percentage for the cycle in which the goal existed
- Store rejection reason/comments so employees can revise and resubmit
- Escalate pending goal approvals to Admin after `5` business days
- Block self-rating when the employee has no active goals in the applicable review cycle
- Show the employee a message instructing them to contact their manager when self-rating is blocked because no goals exist
- Treat company-goal updates mid-cycle as suggested changes that require acknowledgement, not forced overwrites
- Give team and individual goal owners `5` days to acknowledge propagated company-goal updates before notifying Admin
- Notify the manager immediately when an employee submits a goal for approval
- Notify the employee on approval and rejection
- Require manager-set weightage at approval time unless Admin is the approver
- Alert the manager simultaneously when self-rating is blocked because the employee has no goals
- Show a real-time weightage counter during goal assignment
- Turn the counter red and block save if total weightage is not `100%`
- When goal ownership changes after a team transfer, the old manager retains view access for the current cycle and the new manager gets edit access

Role-specific goal rules:

- employee can create goals, submit for approval, and update completion percentage on own goals
- manager can create goals, approve/reject employee goals, set weightage, update completion percentage, archive goals, and view full team goals
- admin can create company goals, approve/reject any goal, set weightage, archive goals, and view org-wide goals

### Probation Monitoring

- Auto-trigger Day 30, Day 60, and Day 80 probation check-ins
- Employee self-feedback form
- Manager feedback form
- Reminder engine at `+2`, `+4`, and `+6` days
- Escalation to HR/Admin at `+7` days
- Cross-share only after both submissions are complete
- HR review window before confirmation decision
- Day `80` should act as the final probation form roughly `10` days before the confirmation discussion

How to implement:

- Create `probation_cases` per employee
- Create `probation_checkpoints` for Day 30, 60, and 80 with calculated due dates. Each checkpoint should use a distinct form template: Day 30 = initial check-in, Day 60 = mid-probation review, Day 80 = final pre-confirmation review
- Create paired `feedback_requests` for employee and manager submissions
- Group employee and manager submissions under one checkpoint so cross-share can be unlocked only when both are submitted
- Use working-day calculation utilities and ignore leave periods during day counting
- Allow admin actions for blocked trigger, waived checkpoint, reassigned manager, or canceled workflow
- On early termination, auto-cancel all pending probation triggers and record the cancellation in the audit log
- Add `probation_decisions` for `confirm`, `extend_probation`, and `review_further`
- Store explicit waiting states such as `waiting_for_employee` and `waiting_for_manager`
- Surface cross-share status as `Waiting for [Manager/Employee]` until both sides submit
- For backdated DOJ cases, prompt Admin with options to send missed probation forms or mark them as waived. Never auto-fire without Admin confirmation. Log all waivers for audit
- Mark blocked checkpoints when no manager is assigned and surface a one-click Admin resolution path
- Generate a Day `85-90` pre-call briefing for Admin review and manager preparation
- Share completed probation insights from Admin to the manager before the confirmation call
- Store prior submissions as read-only history with a context note (e.g., "Submitted by [Previous Manager] before reassignment on [date]") when manager reassignment happens mid-probation

### Performance Review Cycles

- Bi-annual review cycles
- Quarterly review cycles
- Self-rating flow for employees
- Final rating flow for managers
- HR/Admin cycle monitoring
- Discussion scheduling state
- Waiver and extension actions for missed submissions

How to implement:

- Create `review_cycles` with type, window, trigger date, close date, and finalization date
- Create `cycle_enrollments` for employee participation in each cycle
- Create `review_submissions` for self-review and manager review
- Enforce cycle eligibility rules for mid-cycle joiners: employee must have joined more than `60` days before the cycle close date, otherwise auto-enroll in the next cycle
- Enforce deduplication rule where quarterly overrides bi-annual when the windows overlap
- Store final rating values as `below_expectations`, `meets_expectations`, or `above_expectations`
- Store review status as `not_started`, `in_progress`, `submitted`, `overdue`, `waived`, or `finalized`
- Add a `discussion_status` field on `cycle_enrollments` with values `not_scheduled`, `scheduled`, `completed`. Manager can set the discussion date and employee should see it on their dashboard. For probation, track the confirmation call scheduling on `probation_cases`
- Cycle activation must be blocked if red-flag threshold is not yet configured in `app_settings`. Surface a setup prompt to Admin
- Seed predefined cycle templates:
- bi-annual cycle 1: April-September goals, trigger `Aug 1`, close `Aug 25`, finalize from `Aug 26`
- bi-annual cycle 2: October-March goals, trigger `Feb 1`, close `Feb 25`, finalize from `Feb 26`
- quarterly Q1: January-March goals, trigger `Apr 1`, close `Apr 15`
- quarterly Q2: April-June goals, trigger `Jul 1`, close `Jul 15`
- quarterly Q3: July-September goals, trigger `Oct 1`, close `Oct 15`
- quarterly Q4: October-December goals, trigger `Jan 1`, close `Jan 15`
- Implement reminder schedule on the `5th` (gentle nudge), `15th` (urgent), and `22nd` (escalation to Admin if still pending) of the review window. Notification priority and email template tone should reflect these levels
- Allow Admin to assign a temporary acting reviewer when the manager is unavailable during finalization, with an audit trail
- On cycle close with missing submissions, provide Admin actions to `extend`, `escalate`, or `waive`
- Show cycle eligibility clearly on the employee profile for mid-cycle joiners
- Log the skip when a dual-track employee is deduplicated into quarterly review only
- Log all Admin decisions on cycle extensions, escalations, and waivers

### Feedback and Flag Management

- Unified feedback store for probation and performance cycles
- Threshold-based red-flag detection
- Soft flags for blank open-ended responses
- Weekly HR review queue
- Repeat flag detection across consecutive cycles

How to implement:

- Use one `feedback_submissions` table with a `workflow_type` column such as `probation` or `cycle_review`
- Store structured answers in JSON for form flexibility
- Create a `flags` table with `severity`, `reason`, `status`, and `aged_at`
- Create a rule evaluator that runs after submission save
- Flag low scores, negative sentiment in open-ended responses, empty comments where comments are expected, and repeat patterns across adjacent cycles
- Add `flag_actions` for review notes, resolution, reassignment, and escalation
- Store goal context or a goal snapshot reference with each review submission so feedback stays linked to GMS data
- Require red-flag threshold setup before review cycles can be activated
- Make red-flag threshold setup a mandatory onboarding checklist step
- Escalate flags with no Admin action after `7` days to the secondary Admin contact
- Recommend a default red-flag threshold of score `<= 2` out of `5`
- Surface blank open-ended responses to Admin as `incomplete`
- Surface a `Repeat Flag` alert when an employee is flagged in `2+` consecutive cycles
- Show repeat-flagged submissions side by side during Admin review

### Notifications and Automation

- Trigger emails for probation milestones
- Review-cycle launch emails
- Reminder emails
- Goal approval notifications
- HR escalation alerts
- Weekly digest for flag review

How to implement:

- Create a `notifications` table and `notification_deliveries` table
- Use scheduled jobs in `Supabase` to scan for due events each day
- Generate in-app notifications and email events from the same workflow service
- Use a mailer adapter from the app layer for custom email sending
- For local development, route mail to the local test inbox instead of a production provider
- Store delivery status, retry count, and last error for each email
- All trigger emails must include a direct link to the applicable feedback form
- Implement exact PRD automation rules:
  - probation triggers on DOJ `+30`, `+60`, and `+80` working days
  - probation reminders at `+2`, `+4`, and `+6` days, then Admin escalation at `+7`
  - bi-annual cycle launches on `Aug 1` and `Feb 1`
  - quarterly cycle launches on the `1st` day of the trigger month
  - review reminders on the `5th` and `15th`, then Admin escalation on the `22nd`
  - goal approval escalates to Admin after `5` business days

Automation schedule alignment:

| Trigger | Timing | Recipients | Action if missed |
|---|---|---|---|
| Probation Day 30 | DOJ + `30` working days | Employee + Manager | Reminders `+2d`, `+4d`, `+6d`; Admin at `+7d` |
| Probation Day 60 | DOJ + `60` working days | Employee + Manager | Reminders `+2d`, `+4d`, `+6d`; Admin at `+7d` |
| Probation Day 80 | DOJ + `80` working days | Employee + Manager | Reminders `+2d`, `+4d`, `+6d`; Admin at `+7d` |
| Bi-Annual Cycle | `Aug 1` / `Feb 1` | Employee + Manager | Remind on `5th`, `15th`; Admin on `22nd` |
| Quarterly Cycle | `1st` of trigger month | Employee + Manager | Remind on `5th`, `15th`; Admin on `22nd` |
| Goal approval request | On employee submission | Manager + Admin | Escalate to Admin after `5` business days |
| Goal approved/rejected | On manager/admin action | Employee | No missed-action rule |

Probation timer rule:

- probation timers must run on working days, not calendar days
- leave periods must pause the timer automatically

### Dashboards and Role-Based App Surfaces

- Employee dashboard
- Manager dashboard
- HR/Admin dashboard
- Goal approval queue
- Flag review queue
- Cycle monitoring pages
- Probation monitoring pages

How to implement:

- Employee dashboard should show own goals, pending submissions, feedback history, probation status, and review status
- Manager dashboard should show team goals, pending approvals, overdue forms, final rating queue, and team completion health
- HR/Admin dashboard should show org-wide status, escalations, flags, compliance metrics, and confirmation decision prep
- HR/Admin dashboard should also provide live submission status, red-flag queue, and confirmation workflow visibility
- Show a `Paused` badge with revised expected trigger dates on the Admin dashboard for employees on leave during probation
- Use tables for operational lists and charts only where trends matter
- Keep all sensitive data server-rendered where possible
- Admin dashboard should include a catch-up briefing for new Admin users
- Player-coach users should be able to toggle between personal and team views cleanly
- Player-coach forms must remain clearly separated between employee actions and manager actions
- Manager and Admin dashboards should include trend analysis and month-over-month comparison views
- HR/Admin dashboard should show a flag aging indicator for unresolved flags
- Player-coach toggle labels should map to `My performance` and `My team's performance`

## 4. How The Flowchart Should Translate Into Features

### 1. Onboarding and Goal Setup

- Employee creates goal drafts with subtasks and draft weightage
- Manager reviews goals, approves or rejects them, and confirms weightage
- HR/Admin sets company goals and supports cascading

### 2. Probation Monitoring

- System triggers probation forms automatically at Day 30, 60, and 80
- Employee submits self-feedback
- Manager submits manager feedback
- Reminder engine follows up on missed submissions
- HR/Admin monitors submission status
- Cross-share unlocks only after both sides submit

### 3. Performance Cycles

- HR/Admin triggers the cycle email window
- Employee reviews goals and updates progress
- Employee submits self-rating
- Manager schedules the review discussion
- Manager submits final rating
- Reminder schedule tracks incomplete work

### 4. Ongoing GMS

- Employee updates goals continuously with completion percent, notes, and blockers
- Manager reviews team goal progress and approves requested changes
- HR/Admin sees org-level rollups and flagged responses

### 5. HR Review and Confirmation Decision

- HR/Admin runs weekly review of flagged or pending items
- Manager receives pre-call briefing for probation decision support
- Employee is notified after outcome
- System stores final confirmation decision with audit history

## 5. Core Data Model

The implementation should start with these main tables:

- `profiles`
- `user_roles`
- `teams`
- `employee_records`
- `manager_assignments`
- `leave_periods`
- `review_cycles`
- `cycle_enrollments`
- `goals`
- `goal_updates`
- `goal_approval_events`
- `probation_cases`
- `probation_checkpoints`
- `feedback_requests`
- `feedback_submissions`
- `review_submissions`
- `flags`
- `flag_actions`
- `notifications`
- `notification_deliveries`
- `audit_logs`
- `app_settings`
- `probation_decisions`

Recommended audit log coverage:

- goal submission, approval, rejection, resubmission, archive
- probation trigger send, reminder send, escalation, waiver, reassignment, cancellation
- cycle trigger, reminder, escalation, extension, waiver, acting reviewer assignment
- flag creation, review, reassignment, escalation, resolution
- admin ownership transfer and new-admin catch-up acknowledgement

## 6. App Routes and Screens

The first implementation should include these route groups:

- `/login`
- `/dashboard`
- `/goals`
- `/goals/new`
- `/goals/approvals`
- `/probation`
- `/reviews`
- `/reviews/[cycleId]`
- `/flags`
- `/admin/cycles`
- `/admin/probation`
- `/admin/settings`

Suggested behavior by role:

- `employee` sees own dashboard, goals, self-feedback, self-rating, and outcome history
- `manager` sees team dashboard, team approvals, team reviews, and manager feedback forms
- `admin` sees org-wide dashboards, escalations, flags, cycle controls, and probation decisions

## 7. Code Organization

Use a structure that keeps workflows separate from pages:

- `app/` for route segments and pages
- `components/` for UI blocks using `shadcn/ui`
- `lib/auth/` for session and permission helpers
- `lib/db/` for typed database access
- `lib/workflows/` for goal, probation, cycle, and flag services
- `lib/notifications/` for in-app and email delivery logic
- `lib/dates/` for working-day and cycle-window calculations
- `supabase/migrations/` for schema and policy SQL
- `supabase/seed.sql` for local sample users, roles, and demo data

## 8. Delivery Phases

### Phase 1 - Foundation

- Next.js app shell
- Supabase local setup
- Auth and sessions
- role tables and RLS
- team and employee records
- seeded local users

### Phase 2 - Goal Management P0

- goal hierarchy
- employee goal draft flow
- manager/admin approval flow
- goal progress updates
- employee and manager dashboards for goals

### Phase 3 - Probation P0

- probation case creation
- Day 30/60/80 calculation
- paired feedback forms
- cross-share logic
- reminder and escalation engine
- HR probation monitoring dashboard

### Phase 4 - Review Cycles P1

- bi-annual and quarterly cycle setup
- enrollment and eligibility logic
- self-rating and final-rating forms
- reminder schedule
- discussion scheduling and finalization workflow (see `discussion_status` spec in Review Cycles section)

### Phase 5 - Flags and HR Oversight P1/P2

- unified feedback store
- threshold and soft-flag rules
- HR review queue
- repeat flag detection
- weekly digest

### Phase 6 - Reporting and Polish P2

- org-level completion rollups
- trend charts
- exportable `CSV/PDF` reports for feedback and goal data
- edge-case admin tools
- final audit views

### Priority Alignment With PRD

P0:

- probation email triggers
- self + manager feedback forms
- goal CRUD in GMS
- goal approval workflow
- Admin dashboard

P1:

- reminder + escalation engine
- bi-annual + quarterly triggers
- GMS org-level aggregation
- goal approval notifications

P2:

- red-flag auto-tagging
- pattern detection
- month-over-month comparison
- exportable reporting

## 9. Important Edge Cases To Implement Early

- employee with no assigned manager
- manager change during probation
- leave pauses during probation
- backdated DOJ
- early termination during probation
- dual-track review overlap
- mid-cycle joiner eligibility
- manager unavailable during finalization
- cycle close with unsubmitted forms
- goal ownership change after team transfer
- company goals updated mid-cycle
- player-coach user with both employee and manager views
- unconfigured red-flag threshold blocking cycle activation
- admin offboarding with ownership transfer
- new Admin catch-up briefing
- repeat flags across consecutive cycles
- probation waiting state visibility for each party
- flag aging visibility in dashboard
- weightage counter enforcement in goal assignment UI

## 10. Recommended First Build Target

The first usable milestone should include:

- authentication for all three roles
- employee and manager goal workflows
- probation Day 30/60/80 workflow
- cross-share feedback visibility
- HR/Admin dashboard for submission monitoring
- audit logs for approvals, reminders, and decisions

This first milestone covers the highest-value path in both the PRD and the workflow chart, and it creates the base required for review cycles and advanced analytics later.
