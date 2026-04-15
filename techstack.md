# PMS Implementation Plan

## Recommended Tech Stack

### Core App

- `Next.js` (App Router) for frontend and backend in one project
- `TypeScript` for full-stack type safety
- `pnpm` as the package manager

### UI

- `Tailwind CSS` for styling
- `shadcn/ui` for reusable UI components
- `lucide-react` for icons

### Backend, Database, and Auth

- `Supabase` for:
  - `Postgres` database
  - `Supabase Auth` for login and session management
  - `Row Level Security (RLS)` for role-based data access
  - `Supabase Cron` / `pg_cron` for recurring reminders, escalations, and review-cycle jobs
  - `Supabase Studio` for local database inspection
  - `Inbucket` for local email testing
- `@supabase/supabase-js` for database and auth access
- `@supabase/ssr` for cookie-based auth with Next.js App Router

### Forms and Validation

- `Zod` for schema validation
- `React Hook Form`
- `@hookform/resolvers`

### Email Sending

- `nodemailer` for sending trigger emails, reminders, escalations, and digest emails
  - In local development, point at `Inbucket` SMTP (already part of the local Supabase stack)
  - In production, swap to any SMTP provider without code changes

### Data Tables, Charts, and Dates

- `@tanstack/react-table` for dashboard tables
- `Recharts` for reports and charts
- `date-fns` for review-cycle dates, reminders, and probation calculations

### Export (Phase 6)

- `papaparse` for CSV export of feedback and goal data
- `jspdf` for PDF export of Admin reports

## Recommended Auth Approach

Use `Supabase Auth` with email/password sign-in for the three application roles:

- `employee`
- `manager`
- `hr_admin`

Recommended role model:

- `auth.users` stores authenticated users
- `public.profiles` stores user profile data
- `public.user_roles` stores app roles
- RLS policies restrict access by role
- Add the app role into the JWT through a Supabase custom access token hook if needed for cleaner authorization checks

This is a better fit than adding `NextAuth/Auth.js`, because Supabase already gives us:

- authentication
- session handling
- database integration
- authorization through RLS
- a clean local development workflow

## Architecture Direction

- Build a single `Next.js` app only
- Use `Server Components` for dashboard reads where possible
- Use `Server Actions` and `Route Handlers` for writes and workflow endpoints
- Use `Supabase Cron` plus SQL/functions for scheduled reminders and escalations
- Keep business rules close to the database for audit-heavy workflows

## Local Development Setup

Run the app locally with:

- `Next.js` dev server
- local `Supabase` stack via CLI and Docker

This gives you local access to:

- Postgres
- Auth
- Studio
- Cron
- test email inbox

## What Not To Add Right Now

Avoid these for v1 unless the project grows significantly:

- `Prisma`
- `Drizzle`
- `NextAuth/Auth.js`
- Redux or other heavy client state tools
- a separate Express or Nest backend

For this project, `Supabase` should be the single backend platform. Adding another ORM is optional, but I do not recommend it for the first version because it adds another layer on top of auth, RLS, migrations, and SQL jobs.

## Final Recommended Stack

- `Next.js` + `TypeScript`
- `Tailwind CSS` + `shadcn/ui`
- `Supabase Auth` + `Postgres` + `RLS` + `Cron` + `Studio`
- `@supabase/supabase-js` + `@supabase/ssr`
- `Zod` + `React Hook Form`
- `TanStack Table` + `Recharts`
- `date-fns`

