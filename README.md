# User Flow Quest

A gamified UX-learning workshop app. Participants work through a series of quests — from
identifying a user's real goal to building a full interactive user flow diagram with branching
logic and error recovery — while an admin manages sessions, participants, and reviews results in
real time.

Built with Next.js (App Router), Prisma 7, and Supabase Postgres.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Prisma 7** (driver-adapter model) against Supabase Postgres
- Custom email/password auth (bcrypt), no Supabase Auth / NextAuth
- **Supabase Realtime** (Broadcast) for the admin's live activity feed, with a polling fallback
  when Realtime credentials aren't configured
- **Vitest** for the scoring-engine unit tests

## Getting Started

1. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` / `DIRECT_URL` — your Supabase Postgres connection strings (pooled + direct)
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — optional, enables the admin
     activity feed's live push updates (falls back to polling if left blank)
   - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — the admin account created by the seed script
   - `SEED_DEMO_PARTICIPANT_EMAIL` / `SEED_DEMO_PARTICIPANT_PASSWORD` — a demo participant account
   - `AUTH_SECRET` — any random hex string

2. Install dependencies and generate the Prisma client:

   ```bash
   npm install
   npx prisma generate
   ```

3. **Important:** this app is designed to run against an existing, already-populated Supabase
   database (see `prisma/schema.prisma`, introspected from the live schema). The seed script is
   additive only — it never modifies or deletes pre-existing rows:

   ```bash
   npx tsx --env-file=.env prisma/seed.ts
   ```

   Re-running it is safe (idempotent upserts). Row Level Security is enabled on every table so the
   Supabase anon key can't read/write data directly — the app's own server always connects with a
   role that bypasses RLS.

4. Run the dev server:

   ```bash
   npm run dev
   ```

5. Run the test suite:

   ```bash
   npm test
   ```

## Project shape

- `src/app/(participant)/…` — participant-facing quest flow (brief, quests 1-5, results)
- `src/app/admin/…` — admin dashboard, session activation/timing, participant management,
  submission review
- `src/components/FlowBuilderCanvas.tsx` — the drag-and-drop flow builder shared by quests 2-5
  (mouse + touch via Pointer Events)
- `src/lib/flowScoring.ts` — the scoring engine (unit tested in `flowScoring.test.ts`)
- `prisma/seed.ts` — seeds this app's own Scenario/Quest/Session content as new rows alongside
  whatever else already lives in the database
- `src/app/(participant)/latihan` + `src/components/practice/` — Modul Latihan Flow (see below);
  its content, rule checker and diagram layout live in `src/lib/practice/` (unit tested in
  `practice.test.ts`)

## Admin quick start

After seeding, log in at `/login` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, then:

1. **Kelola Peserta** — bulk-add participants (paste one name per line); credentials are shown
   once, so copy them before navigating away.
2. **Pengaturan Session** — activate the session and set the time window / per-quest timers.
   You can also start a new batch here without touching any prior session's data.
3. **Modul Latihan** — review each participant's follow-up learning path and progress (see below).

## Modul Latihan Flow

The follow-up to the five quests, opened from `/brief` once a participant has finished them all
(it isn't gated by the session schedule, so it keeps working after the workshop). Six core modules
(A-F) each run *Coba dulu → Penjelasan → Latihan*, and the centrepiece is a flow fixer: switch
connections on and off until every rule holds. On top of that, a mentor can give each participant a
personal plan (which modules, what they're already strong at, and a *latihan utama* rebuilt from
their own quest answers). Participants without a plan get all six modules.

- Plans, progress and written answers live in the `PracticePlan` table, one row per
  `SessionParticipant`.
- Plans are imported from a JSON file. Copy `prisma/practice-plans/example.json`, then check it
  and save it:

  ```bash
  npx tsx --env-file=.env prisma/seed-practice-plans.ts prisma/practice-plans/<batch>.json --dry-run
  npx tsx --env-file=.env prisma/seed-practice-plans.ts prisma/practice-plans/<batch>.json
  ```

  Nothing is written unless every plan validates, including a check that each fixer's example
  solution actually satisfies its own rules. Re-importing replaces the plan but keeps the
  participant's progress and answers.
- Plan files contain personal notes about real participants, so everything in
  `prisma/practice-plans/` except `example.json` is git-ignored.
- `/admin/latihan` lists every participant's path and progress. From there you can open their page
  in preview mode, where it's fully interactive but nothing is saved, or view all six modules on one
  page.
