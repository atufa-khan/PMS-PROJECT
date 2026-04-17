# PMS Platform

This repository contains the current implementation of the Performance Management System described in:

- `project_goal.md`
- `implementation.md`
- `techstack.md`

## What is included

- Next.js App Router application with Supabase-backed auth
- TypeScript and Tailwind configuration
- Role-aware dashboards and application shell
- Goal management, approvals, reviews, probation, and flags workflows
- Admin settings, reporting, ownership-transfer, user provisioning, and cycle/probation operations
- Supabase-ready schema with UUID primary keys throughout
- Seed SQL with pseudo data aligned to the PMS domain
- Diagnostic and notification-processing scripts
- Secure internal notification processor route for deployment schedulers
- Admin UAT workspace for role-based rollout validation

## Current focus

The current implementation covers the main PMS workflow foundation and is now focused on operational hardening:

- production-safe account provisioning
- scheduled notifications and reminders
- deployment-safe notification scheduling
- reporting and export depth
- admin transfer and succession workflows
- end-to-end UAT across all roles

## Important notes

- The SQL schema is designed for Supabase Postgres with RLS and `gen_random_uuid()`.
- Local development can run entirely on pooled Postgres connectivity if direct DB host resolution is unavailable on the machine.
- Production should keep `ALLOW_ELEVATED_SELF_SIGNUP=false` so manager and Admin access remain invite-only.

## Next steps

1. Copy `.env.example` to `.env.local` and fill in the real values
2. Run the Supabase migration and seed files
3. Configure SMTP and deployment-managed secrets
4. Set `INTERNAL_JOB_SECRET` and schedule either `/api/internal/notifications/process` or `npm run notifications:process` in the target environment
5. Use `/admin/uat` and `/admin/readiness` to complete final rollout validation with real users
