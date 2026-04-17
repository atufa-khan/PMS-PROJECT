# PMS Platform

A full-stack **Performance Management System (PMS)** built with **Next.js + Supabase** for role-based goal tracking, reviews, probation workflows, red-flag handling, admin governance, and rollout readiness.

This project is designed as a single integrated PMS platform, not a collection of disconnected modules. Goals, feedback, approvals, reviews, flags, provisioning, and notifications all work against the same shared user and workflow model.

## Why this project matters

This system is built to solve real people-operations problems:

- give employees a clear place to manage goals and self-feedback
- help managers approve goals, review progress, and handle probation workflows
- give admins visibility into compliance, flags, reporting, user provisioning, and rollout readiness
- keep operational flows moving with notifications, audit trails, and UAT tooling

## Product scope

### Employee workspace
- Personal dashboard
- Goal creation, editing, submission, and progress tracking
- Review participation and self-feedback
- Probation checkpoints when applicable

### Manager workspace
- Team dashboard and pending approvals
- Goal approval and rejection
- Manager reviews and final ratings
- Probation feedback and team workflow handling

### Admin workspace
- Org-level monitoring and compliance visibility
- User provisioning and access control
- Review cycle operations
- Probation administration
- Ownership transfer
- Reports and exports
- Notification operations
- Readiness and UAT workspaces

## What is already implemented

- Next.js App Router application with TypeScript and Tailwind
- Supabase-backed authentication and role-aware sessions
- Role-based dashboards for employee, manager, admin, and player-coach flows
- Goal Management System with approvals, hierarchy support, and weightage-aware progress
- Reviews, probation, flags, and admin operational workflows
- Admin provisioning, reporting, ownership-transfer, notification operations, readiness, and UAT tools
- Supabase schema with UUID primary keys
- Seed data for realistic PMS workflows
- Diagnostics for Supabase, database, and notification processing

## Tech stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS
- **Backend:** Next.js server actions + route handlers
- **Database:** Supabase Postgres
- **Auth:** Supabase Auth
- **Validation:** Zod
- **Email/Notifications:** Nodemailer + internal notification processor
- **Tooling:** TypeScript, ESLint, smoke-test runner

## Project structure

```text
app/                Next.js routes and server actions
lib/                business logic, auth, DB helpers, workflow services
supabase/           migrations and seed data
scripts/            diagnostics, smoke tests, and notification processing
docs/               design and product documentation
```

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in the real values.

Core values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL`
- `DIRECT_URL` if your machine can resolve the direct host
- `INTERNAL_JOB_SECRET`
- SMTP settings for real notification delivery

### 3. Run locally

```bash
npm run dev
```

### 4. Validate the setup

```bash
npm run typecheck
npm test
npm run debug:supabase
npm run debug:db
```

## Available scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm test
npm run debug:supabase
npm run debug:db
npm run notifications:process
```

## Environment notes

- `ALLOW_ELEVATED_SELF_SIGNUP=false` should stay disabled for production so manager/admin access remains invite-only.
- The app can run on pooled Postgres connectivity even if `DIRECT_URL` is not resolvable on the machine.
- For real email delivery, configure SMTP provider credentials in `.env.local` and in deployment.

## Recommended rollout flow

1. Configure Supabase and environment values
2. Apply schema and seed data
3. Prepare seeded UAT access from `/admin/uat`
4. Run employee, manager, admin, and player-coach UAT journeys
5. Configure notification delivery and scheduler
6. Use `/admin/readiness` to close rollout gaps before production

## Operational workspaces

The app includes dedicated admin workspaces for late-stage rollout and validation:

- `/admin/users`
- `/admin/ownership`
- `/admin/reports`
- `/admin/notifications`
- `/admin/readiness`
- `/admin/uat`

## Current status

The core PMS platform is implemented and usable. The remaining work is mainly **production rollout work**, such as:

- deployment scheduler setup for notification processing
- real SMTP/provider configuration in the target environment
- final real-user UAT execution
- optional analytics/reporting depth beyond the current operational layer

## Reference documents

This implementation is aligned to the product and implementation notes captured in:

- `project_goal.md`
- `implementation.md`
- `techstack.md`

## Summary

If you want one-line positioning for this project:

> **PMS Platform is a production-style role-based performance management system with goals, approvals, reviews, probation, flags, admin governance, notifications, and UAT readiness built on Next.js and Supabase.**
