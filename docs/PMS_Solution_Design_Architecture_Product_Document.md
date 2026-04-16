# PMS Solution Design, Architecture and Product Document

Version: 1.0
Date: 2026-04-16
Project: Performance Management System (PMS)

## 1. Document Purpose

This document captures the current product design, application architecture, module behavior, operational model, and implementation status of the PMS solution built in this repository.

It is intended for product owners, engineering stakeholders, reviewers, administrators, and future contributors who need one consolidated understanding of:

- what the PMS solution does
- how the product is structured
- how the technical design is organized
- how the database and workflows are modeled
- what is already implemented
- what still requires production hardening or future expansion

## 2. Solution Summary

The Performance Management System is a role-based web application that combines:

- goal management
- review cycle management
- probation workflow management
- flag and compliance monitoring
- notification-driven operational follow-up
- admin oversight and configuration

The solution is designed as one shared platform rather than separate tools. Goal data, roles, review feedback, probation feedback, flags, approvals, and notifications all operate on one common user and workflow model.

The current implementation is built with:

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- server actions for mutations
- a workflow service layer for domain logic

## 3. Business Context And Product Goals

The PMS is intended to solve fragmented people-process operations by consolidating employee performance processes into one system of record.

Primary product goals:

- enable employees to manage goals and self-review work in one place
- enable managers to approve goals, monitor team performance, and complete review actions
- enable Admin and HR users to monitor compliance, review flags, and manage operational cycles
- preserve auditability across approvals, feedback, probation, and admin decisions
- support shared workflows for employee, manager, admin, and player-coach use cases

Business outcomes targeted by the solution:

- faster goal approval turnaround
- improved visibility into review progress and compliance
- reduced manual follow-up for probation checkpoints
- earlier flag detection for risky feedback patterns
- cleaner governance through audit logs and role-aware access

## 4. User Roles And Personas

### 4.1 Employee

Employee users can:

- sign in and work from a personal workspace
- create and edit their own goal drafts
- submit goals for approval
- update progress on active goals
- complete self-review and self-feedback tasks
- respond to probation feedback requests

### 4.2 Manager

Manager users can:

- switch into team-performance workspace
- create goals for themselves or direct reports
- review and approve or reject employee goals
- rate team performance in review cycles
- review team dashboards and operational queues
- participate in probation workflows

### 4.3 Admin (HR)

Admin users can:

- view organization-wide metrics
- approve any goal when needed
- monitor flags and compliance
- manage review cycles and probation administration
- update global settings
- receive escalations when workflows are not resolved in time

### 4.4 Player-Coach / Multi-Role User

The system supports users with more than one role. A manager can also operate as an employee within the same platform by switching workspace context.

## 5. Product Scope

### 5.1 Core Modules Included In The Current Solution

- Authentication and profile sync
- Role-based dashboard
- Goal Management System (GMS)
- Goal approvals
- Review cycles and review submissions
- Probation workflow management
- Flag monitoring and actions
- Notifications and reminder processing
- Admin cycle, probation, and settings surfaces

### 5.2 Operating Principle

This PMS is a shared domain platform. It is not split into isolated applications. The same profiles, roles, workflow entities, and notifications are reused across:

- goals
- reviews
- probation
- flags
- admin monitoring

## 6. Functional Design

### 6.1 Authentication And User Profile Lifecycle

The authentication model uses Supabase Auth for account creation and session identity.

On successful authentication:

- the signed-in user is mapped to a PMS profile
- role assignments are loaded from the application database
- multi-role users receive a workspace toggle
- employee accounts receive employment records
- manager relationships can be assigned during signup or resolved during profile sync

Product rules:

- the application fails closed when no authenticated user is present
- server-side session loading is required for protected workspace access
- signup supports employee, manager, and admin roles, though production use should eventually restrict elevated roles to invitation-based assignment

### 6.2 Dashboard

The dashboard is role-specific.

Employee dashboard focuses on:

- personal goals
- completion status
- feedback history
- self-feedback items

Manager dashboard focuses on:

- team goals
- team ratings and completion signals
- pending approvals
- scheduled discussions

Admin dashboard focuses on:

- organization-wide overview
- flagged responses
- compliance indicators
- catch-up briefing for current operational state

### 6.3 Goal Management System (GMS)

The Goal Management System is part of PMS and follows the shared data model.

Implemented design characteristics:

- hierarchy support for company, team, and individual goals
- weighted completion rollups across the hierarchy
- goal lifecycle using draft, pending approval, active, completed, and archived states
- employee goal submission flow
- manager and admin approval and rejection flow
- approval-related notification generation
- goal edit, progress update, archive, and suggestion acknowledgement flows

Functional behaviors:

- employees create goal drafts
- managers and admins can create active goals
- employees submit drafts for approval
- managers or admins approve with weightage confirmation
- rejected goals return for revision and resubmission
- company-goal updates can propagate as downstream suggestions

### 6.4 Review Cycle Management

The review module manages cycle participation and submission state.

Implemented capabilities include:

- listing active and historical review cycles
- cycle enrollment model
- self and manager review submission support
- discussion scheduling state
- finalization and waiver support
- shared feedback submission and flag creation integration

Design intent:

- reviews remain linked to employee and manager relationships
- review submissions contribute to operational visibility and flag intelligence
- role-aware visibility is preserved across employee, manager, and admin use

### 6.5 Probation Workflow

The probation module manages employee probation operations through structured checkpoints.

Current model includes:

- probation cases
- checkpoint schedule entries
- role-specific feedback requests
- review status progression
- admin decisions
- discussion status tracking

The design supports:

- Day 30 / 60 / 80 style workflow modeling
- employee and manager participation
- admin review and action
- reminder-driven follow-up through the notification processor

### 6.6 Flags And Compliance

The flag subsystem identifies and manages risky or incomplete feedback.

Current design supports:

- flag generation from feedback submissions
- repeat-flag tracking
- severity classification
- queue-based admin monitoring
- flag actions including review, escalate, and resolve

Compliance is surfaced through:

- open-flag counts
- aging indicators
- pending approvals
- review completion signals
- feedback submission ratios

### 6.7 Notifications And Automation

Notifications are modeled as application records with delivery tracking.

Current architecture supports:

- in-app notification creation
- reminder scheduling metadata
- escalation scheduling metadata
- separate notification delivery state
- an automation script for processing pending notifications and workflow reminders

This creates a foundation for:

- SLA reminders
- review nudges
- probation reminders
- company-goal suggestion escalations
- admin alerts

## 7. Technical Architecture

### 7.1 Architecture Style

The PMS follows a layered web application architecture.

Layers:

- Presentation layer: Next.js App Router pages and reusable React components
- Interaction layer: server actions under route modules
- Domain layer: workflow services and helpers in the `lib/workflows` directory
- Persistence layer: PostgreSQL access through pooled `pg` connections
- Identity layer: Supabase Auth with server-side session resolution
- Operations layer: standalone scripts for diagnostics, schema application, and notification processing

### 7.2 High-Level Runtime Flow

Browser request

goes to

Next.js route or server action

which calls

workflow service and helper logic

which reads or writes

Supabase Postgres

while authentication is resolved through

Supabase Auth SSR utilities

and operational reminders are generated through

notification queue processing

### 7.3 Frontend Design

The frontend is built using:

- server-rendered route components for workspace pages
- small client components for interactive forms
- a reusable role-aware shell
- cards and tabular workflow views

Key design choices:

- keep data fetching server-side where possible
- keep mutation logic in server actions
- render role-based surfaces from one shared shell instead of separate apps
- keep the navigation model stable across modules

### 7.4 Backend Design

The backend logic is embedded inside the Next.js application through:

- server actions for transactional mutations
- service functions for composed read models
- helpers for domain-specific rules such as goal hierarchy rollups and notification creation

This keeps the repository simple while still separating:

- UI
- mutation handlers
- workflow/business logic
- database access helpers

### 7.5 Database Design

The database is modeled on Supabase Postgres and uses UUID primary keys throughout.

Important design themes:

- normalized role and profile model
- workflow history tables for approvals and updates
- dedicated entities for cycle enrollment and feedback routing
- queue tables for notifications and delivery tracking
- audit logging for operational traceability
- row-level security on core tables

## 8. Component And Module Design

### 8.1 `app/`

Contains route-level pages and server actions for:

- dashboard
- goals
- approvals
- probation
- reviews
- flags
- admin operations
- login and signup

### 8.2 `components/`

Contains reusable UI building blocks such as:

- application shell
- metric cards
- section cards
- submit buttons
- form status
- logout button

### 8.3 `lib/auth/`

Contains:

- role definitions
- server-side session loading
- profile synchronization
- workspace role resolution for player-coach users
- permission shaping

### 8.4 `lib/workflows/`

Contains domain services and helpers for:

- dashboard aggregation
- goal logic
- goal hierarchy calculations
- review workflow logic
- probation workflow logic
- flag logic
- notification and workflow helper utilities

### 8.5 `lib/db/`

Contains:

- pooled PostgreSQL connection utilities
- transaction helper
- shared TypeScript domain record types

### 8.6 `scripts/`

Contains operational scripts for:

- database diagnostics
- Supabase diagnostics
- SQL application
- notification processing

### 8.7 `supabase/migrations/`

Contains the database schema definition and seed-aligned setup artifacts for the PMS domain.

## 9. Data Model Summary

Key entities and roles in the data design:

- `profiles`: application users
- `user_roles`: role assignments and primary-role selection
- `employee_records`: employment and reporting context
- `manager_assignments`: manager history over time
- `teams`: organizational structure
- `review_cycles`: configured review periods
- `cycle_enrollments`: employee membership in review cycles
- `goals`: hierarchical goal records
- `goal_updates`: progress and update history
- `goal_approval_events`: lifecycle and approval history
- `probation_cases`: employee probation ownership
- `probation_checkpoints`: checkpoint schedule and status
- `feedback_requests`: routed feedback tasks
- `feedback_submissions`: submitted workflow feedback
- `review_submissions`: role-specific review content
- `flags`: operational warning records
- `flag_actions`: admin actions on flags
- `notifications`: queued user-facing notifications
- `notification_deliveries`: delivery attempts and status
- `audit_logs`: auditable system actions
- `app_settings`: global workflow configuration
- `probation_decisions`: admin outcome records

## 10. Security And Access Control

Security is enforced through multiple layers:

- authenticated server-side session checks
- profile-based role loading
- row-level security in Supabase Postgres
- role-aware filtering in workflow services
- server-only database access helpers
- audit logs for privileged actions

Security design notes:

- public frontend keys are used only for safe client identity operations
- database credentials remain server-side
- direct database connectivity is optional for this machine, while pooled connectivity is the active operational path

## 11. Deployment And Environment Design

The solution expects these environment groups:

- Supabase project URL and publishable key
- pooled `DATABASE_URL`
- optional direct `DIRECT_URL`
- application base URL
- SMTP settings for email delivery

Current operational scripts:

- `npm run debug:supabase`
- `npm run debug:db`
- `npm run notifications:process`

Recommended deployment model:

- deploy Next.js application on a Node-compatible host
- connect to Supabase Auth and Postgres
- schedule notification processing as a recurring job
- keep secrets in deployment-managed environment storage

## 12. Current Implementation Status

### 12.1 Implemented

- Supabase-backed authentication
- profile sync and multi-role session model
- role-based shell and dashboards
- goal creation, editing, submission, approval, rejection, progress update, archive, and hierarchy recalculation
- manager and admin approval workspace
- review cycle listing and submission foundation
- probation workflow foundation and admin controls
- flag queue and action handling
- notification queue and processing script
- audit logging foundation

### 12.2 Production Hardening Still Recommended

- restrict manager/admin self-signup in production
- configure real SMTP delivery for notifications
- deploy scheduled automation for notification processing
- expand analytics and export/reporting coverage
- harden role-assignment governance for enterprise rollout

## 13. Known Constraints And Risks

- direct database hostname resolution is environment-dependent on this machine, so pooled connectivity is the primary supported runtime path here
- advanced reporting and executive analytics are still lighter than a full enterprise BI layer
- notification processing exists as a script and requires scheduler integration in deployment
- elevated-role signup is still open for development convenience and should be locked down for production

## 14. Recommended Next Steps

- formalize invite-only identity provisioning for manager and admin roles
- configure production SMTP and message templates
- schedule notification processing in the deployment platform
- add richer reporting and exports for HR and leadership
- add deeper admin ownership-transfer workflows
- complete final UAT across employee, manager, admin, and player-coach journeys

## 15. Conclusion

The PMS solution in this repository is already structured as a coherent, modular, role-aware platform rather than a prototype of disconnected screens. Its design combines product workflows, operational monitoring, and shared workflow data into a single architecture that is ready for continued hardening and rollout planning.

This document should be used as the baseline implementation reference for:

- product walkthroughs
- engineering handoff
- architecture review
- stakeholder alignment
- future roadmap planning
