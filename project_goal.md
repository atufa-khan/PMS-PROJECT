# Performance & Goal Management Platform

Unified Product Requirements Document | March 2026
Roles in Scope: Employee | Manager | Admin (HR)
Modules: Performance Monitoring (PMS) | Goal Management System (GMS)
Review Cycles: Probation | Bi-Annual | Quarterly

## 1. Overview ---

PMS is an enterprise Performance & Goal Management Platform that unifies probation tracking, bi-annual and quarterly performance reviews, and structured goal management into a single role-based system.
The Goal Management System (GMS) is a core module within PMS — not a standalone product. It shares the same role model, data layer, and interface as the broader platform.
PMS replaces fragmented email threads, spreadsheets, and informal feedback with automated workflows, structured forms, and real-time dashboards. The platform serves three roles — Employee, Manager, and Admin — each with a tailored experience.

## 2. Problem Statement ---

- No centralized visibility into probation timelines or review deadlines
- Feedback is informal, inconsistent, and not linked to goals
- Goal tracking is siloed across teams with no aggregation
- Admin has no real-time view into pending actions or red-flag responses
- Performance decisions lack structured, auditable data
- Goal creation is manager-only today, limiting employee ownership and accountability

## 3. Goals & Success Metrics ---

### 3.1 Platform Goals

- Automate all trigger emails for probation (Day 30/60/80) and review cycles
- Provide structured, role-appropriate feedback forms linked to GMS goal data
- Give Admin a live dashboard of submission status, flags, and trend analysis
- Cascade goals from Company → Team → Individual with weighted completion tracking
- Enable employees to create and propose goals, subject to manager or admin approval

### 3.2 Success Metrics

| Metric                              | Target                              |
|-------------------------------------|-------------------------------------|
| Probation triggers sent on schedule | 100% with zero manual intervention  |
| Feedback form completion rate       | > 85% before escalation threshold   |
| Admin flag review turnaround        | < 7 days                            |
| Manager goal assignment coverage    | > 90% within first 30 days of cycle |
| Employee goal approval turnaround   | < 5 business days                   |

## 4. Users & Roles

Three roles are in scope: Employee, Manager, and Admin. Admin subsumes all HR and leadership/CXO access — there is no fourth role.

| Feature         | Employee                                           | Manager                                             | Admin                                                      |
|-----------------|----------------------------------------------------|-----------------------------------------------------|------------------------------------------------------------|
| Dashboard       | Personal goals + feedback history + self-feedback  | Team goals + ratings + pending approvals            | Org-level overview + flagged responses + compliance        |
| Goal management | Create, edit, update own goals (pending approval)  | Create, assign, weight, approve/reject team goals   | Set company-wide goals, approve any goal, manage structure |
| Goal approval   | Submit goals for approval                          | Approve or reject employee goals                    | Approve or reject any goal                                 |
| Feedback forms  | Submit self-feedback at each trigger               | Submit manager feedback + final rating              | View all submissions, flag red flags                       |
| Review cycles   | Receive cycle emails, submit self-rating           | Initiate discussion, submit final rating            | Trigger cycles, monitor compliance                         |
| Notifications   | Trigger emails + reminder nudges + approval status | Trigger emails + escalation alerts + approval queue | Escalation inbox + weekly digest                           |

## 5. Core Modules

### 5.1 Probation Monitoring

Automated email triggers go out from the employee's date of joining (DOJ) at Day 30, Day 60, and Day 80. Each trigger sends one form to the employee (self-feedback) and one to their manager. Submissions are stored and cross-shared between employee and manager upon completion.

- Day 30 — initial check-in form
- Day 60 — mid-probation form
- Day 80 — final form, 10 days before confirmation discussion
- Reminder at +2 days if not submitted; escalation to Admin after 7 days
- Day 85–90 — Admin reviews all feedback and shares insights with manager before confirmation call

#### Edge Case Handling — Probation

- Leave during probation: probation clock pauses on leave, resumes on return. Admin dashboard shows 'Paused' badge with revised expected trigger date.
- Manager change mid-probation: pending forms reassigned to new manager; prior submissions visible in read-only probation history with context note.
- Early termination: all pending triggers auto-cancel with audit log entry.
- Cross-share logic: forms only cross-shared after both parties submit. Status shown as 'Waiting for [Manager/Employee]' until then.
- No manager assigned: trigger blocked, Admin alerted with one-click resolution.
- Backdated DOJ: system prompts Admin to send missed forms or mark as waived; waiver logged for audit. Never auto-fires without confirmation.

### 5.2 Performance Review Cycles

Two parallel review tracks run for different employee segments.

#### Bi-Annual (majority of employees)

- Cycle 1: April–September goals — trigger Aug 1, close Aug 25, finalize from Aug 26
- Cycle 2: October–March goals — trigger Feb 1, close Feb 25, finalize from Feb 26

#### Quarterly (select roles / leadership)

- Q1 (Jan–Mar): Trigger Apr 1, close Apr 15
- Q2 (Apr–Jun): Trigger Jul 1, close Jul 15
- Q3 (Jul–Sep): Trigger Oct 1, close Oct 15
- Q4 (Oct–Dec): Trigger Jan 1, close Jan 15

Reminder schedule for all cycles: 5th (gentle nudge), 15th (urgent), 22nd (escalation to Admin if pending).

#### Edge Case Handling — Review Cycles

- Mid-cycle joiners: eligibility cutoff = joined more than 60 days before cycle close. Otherwise auto-enrolled in next cycle. Shown clearly on employee profile.
- Dual-track employees (quarterly + bi-annual): system deduplicates. If quarterly window overlaps bi-annual, run quarterly only and log the skip.
- Manager unavailable during finalization: Admin can designate a temporary acting reviewer with audit trail.
- Cycle close with unsubmitted forms: Admin gets list with options — extend window, escalate, or mark as waived. All decisions logged.

### 5.3 Goal Management System (GMS)

GMS is the goal tracking module within PMS. It is not a standalone product. All goal data, user roles, and feedback are shared with the broader PMS platform.

#### Goal Hierarchy

- Goals cascade: Company → Team → Individual
- Weightage-based completion % auto-aggregates to team and company level
- Performance rating: Below / Meets / Above Expectations

#### Goal Lifecycle & Approval Flow

Employees can create their own goals. All employee-created goals require approval before becoming active.

| Status           | Description                                             |
|------------------|---------------------------------------------------------|
| Draft            | Created by employee, not yet submitted                  |
| Pending Approval | Submitted by employee, awaiting manager or admin action |
| Active           | Approved — counts toward weightage and completion %     |
| Completed        | Marked complete by employee or manager                  |
| Archived         | Removed from active view, retained in history           |

##### Goal Actions by Role

| Action                | Employee | Manager | Admin |
|-----------------------|----------|---------|-------|
| Create goal           | Yes      | Yes     | Yes   |
| Submit for approval   | Yes      | —       | —     |
| Approve / reject goal | —        | Yes     | Yes   |

| Action                  | Employee       | Manager          | Admin    |
|-------------------------|----------------|------------------|----------|
| Set / confirm weightage | —              | Yes, at approval | Yes      |
| Update completion %     | Yes            | Yes              | —        |
| Archive goal            | —              | Yes              | Yes      |
| View all team goals     | Own goals only | Full team        | Org-wide |

##### Approval Flow Details

- On submission: manager notified immediately
- On approval: employee notified, goal status set to Active, manager sets weightage
- On rejection: employee notified with reason/comment, can edit and resubmit
- Admin can approve any goal, including if manager is unavailable
- Approval turnaround target: 5 business days

#### Edge Case Handling — GMS

- No goals at review time: self-rating blocked. Employee sees message to contact manager. Manager alerted simultaneously.
- Deleted/archived goals: retained in historical record, frozen contribution to completion % for the cycle in which they existed.
- Weightage validation: real-time counter shown during goal assignment. Turns red if total is not 100%. Save blocked until balanced.
- Goal ownership after team transfer: goals follow employee. Old manager retains view access for current cycle; new manager gets edit access.
- Company goals updated mid-cycle: changes propagate as suggestions, not forced overwrites. Team/individual owners get 5 days to acknowledge before Admin is notified.

### 5.4 Feedback & Flag Module

All form submissions (probation and cycle reviews) feed into a single unified response store. The system auto-tags red flags based on low scores or negative open-ended responses. Admin reviews flagged entries weekly.

- Cross-share: manager sees employee self-feedback; employee sees manager feedback — only after both parties submit
- Red flag tagging on scores below configured threshold or negative sentiment
- Admin weekly review queue with action tracking
- All feedback linked to GMS goal data for context
- Blank open-ended responses treated as soft flags — surfaced to Admin as 'incomplete'

#### Edge Case Handling — Feedback & Flags

- Unconfigured red-flag threshold: mandatory setup step in onboarding checklist. Platform will not activate review cycles until configured. Default recommendation: score  $\leq 2$  out of 5.
- Flags with no Admin action in 7 days: auto-escalate to secondary Admin contact. Flag aging indicator shown in dashboard.
- Repeat flags across cycles: pattern detection layer surfaces 'Repeat Flag' alert if flagged in 2+ consecutive cycles. All flagged submissions shown side by side.

## 6. Automation Rules

| Trigger                | Timing                  | Recipients         | Action if missed                             |
|------------------------|-------------------------|--------------------|----------------------------------------------|
| Probation Day 30       | DOJ + 30 working days   | Employee + Manager | Reminder +2d, +4d, +6d; Admin at +7d         |
| Probation Day 60       | DOJ + 60 working days   | Employee + Manager | Reminder +2d, +4d, +6d; Admin at +7d         |
| Probation Day 80       | DOJ + 80 working days   | Employee + Manager | Reminder +2d, +4d, +6d; Admin at +7d         |
| Bi-Annual Cycle        | Aug 1 / Feb 1           | Employee + Manager | Remind 5th, 15th; Admin 22nd                 |
| Quarterly Cycle        | 1st of trigger month    | Employee + Manager | Remind 5th, 15th; Admin 22nd                 |
| Goal approval request  | On employee submission  | Manager + Admin    | Auto-escalate to Admin after 5 business days |
| Goal approved/rejected | On manager/admin action | Employee           | —                                            |

Note: Probation timers run on working days, not calendar days. Leave periods pause the timer automatically.

## 7. Roles & Access — Edge Cases

- Admin offboarding: ownership transfer flow triggered when Admin account is deactivated. Open flags, escalations, and digest subscriptions reassigned to designated successor with confirmation step.
- Player-coach (manager who also reports to another manager): unified dashboard with toggle between 'My performance' and 'My team's performance'. One set of forms as employee, one as manager — clearly separated.
- New Admin mid-cycle: on first login, Admin sees a catch-up briefing — all open flags, pending escalations, and cycle status.

## 8. Prioritization

| Priority | Feature                        | Description                                                          |
|----------|--------------------------------|----------------------------------------------------------------------|
| P0       | Probation email triggers       | Automated Day 30/60/80 sends from DOJ (working days) with form links |
| P0       | Self + manager feedback forms  | Two-form setup, stored submissions, cross-share on completion        |
| P0       | Goal CRUD in GMS               | Create, assign, weight, track completion % per individual            |
| P0       | Goal approval workflow         | Employee submits → Manager/Admin approves → Active status            |
| P0       | Admin dashboard                | Live submission status, red-flag queue, confirmation workflow        |
| P1       | Reminder + escalation engine   | Automated nudges, escalation to Admin/HRBP at +7d / 22nd             |
| P1       | Bi-annual + quarterly triggers | Cycle emails, reminder schedule, Admin escalation                    |
| P1       | GMS org-level aggregation      | Company → Team → Individual roll-up                                  |
| P1       | Goal approval notifications    | Employee notified on approval/rejection with reason                  |
| P2       | Red-flag auto-tagging          | Score threshold alerts + sentiment flag on open-ended responses      |
| P2       | Pattern detection              | Repeat flag alerts across consecutive cycles                         |
| P2       | Month-over-month comparison    | Trend charts in GMS dashboard for managers and Admin                 |
| P2       | Exportable reporting           | CSV/PDF export of feedback and goal data for Admin records           |