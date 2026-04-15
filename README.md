# PMS Platform Foundation

This repository now contains the first implementation foundation for the Performance Management System described in:

- `project_goal.md`
- `implementation.md`
- `techstack.md`

## What is included

- Next.js App Router project structure
- TypeScript and Tailwind configuration
- Role-aware application shell and route scaffolding
- Demo workflow services for dashboard, goals, approvals, and probation
- Supabase-ready schema with UUID primary keys throughout
- Seed SQL with pseudo data aligned to the PMS domain

## Current focus

This foundation intentionally targets the first milestone from the plan:

- authentication structure for all three roles
- employee and manager goal workflows
- probation Day 30/60/80 modeling
- cross-share workflow foundation
- Admin monitoring surface
- audit-oriented schema

## Important notes

- The workspace did not start with an existing app, so this implementation begins from scratch.
- Runtime packages are declared but not yet installed.
- Supabase Auth wiring is represented by placeholders and demo session data until the environment is installed and connected.
- The SQL schema is designed for Supabase Postgres with RLS and `gen_random_uuid()`.

## Next steps

1. Install dependencies with `npm install`
2. Create `.env.local` with your Supabase and app values
3. Run the Supabase migration and seed files
4. Replace demo session/data helpers with real Supabase SSR reads and writes
5. Implement the first server actions for goal submission, approval, and probation feedback
