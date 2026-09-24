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
- **Zod** for the case content schema, **Vitest** for the unit tests

## Getting Started

1. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` / `DIRECT_URL` — your Supabase Postgres connection strings (pooled + direct)
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — optional, enables the admin
     activity feed's live push updates (falls back to polling if left blank)
   - `SUPABASE_SERVICE_ROLE_KEY` — optional, server-only; lets the question builder upload images
     and audio to Supabase Storage (bucket `content-media`, created on first upload). Without it,
     media is added by URL
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

   It creates the admin and demo accounts, imports `prisma/cases/klub-fotografi.json` (see
   *Cases* below), and creates the demo session `UFQ-0926` pinned to that case if it doesn't exist
   yet. Re-running it is safe. Row Level Security is enabled on every table so the
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

- `prisma/cases/*.json` — the content: one file per case (see *Cases* below)
- `src/lib/content/` — the case schema and its checks (`case.ts`, `questions.ts`), the flow rubric
  engine (`rubric.ts`), the answer-key-free question model the browser gets (`publicQuestion.ts`),
  and the markdown subset authored text is written in (`markdown.ts`); for the builder, drafts and
  publishing (`drafts.ts`), whole-case edits (`caseEdit.ts`), JSON export/import (`transfer.ts`) and
  version locks (`versionLock.ts`)
- `src/app/builder/…` + `src/components/builder/` — the content builder (case, quest and module
  views) and the participant plan editor
- `src/app/(participant)/…` — participant pages: `/brief`, `/quest/[order]` (any quest of the
  session's case), `/result/[order]`, `/latihan`
- `src/components/quiz/` — the quiz player and the inputs for the twelve question types
- `src/components/FlowBuilderCanvas.tsx` — the drag-and-drop flow builder for flow questions
  (mouse + touch via Pointer Events)
- `src/lib/questPlay.ts` — starting, timing and completing quest attempts (`QuestAttempt`,
  `QuestionResponse`), including XP
- `src/app/admin/…` — admin dashboard, sessions (each pinned to a case version), participant
  management, submission review, reports and CSV export
- `src/app/(participant)/latihan` + `src/components/practice/` — Modul Latihan Flow (see below);
  its rule checker, plans and diagram layout live in `src/lib/practice/`

## Admin quick start

After seeding, log in at `/login` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, then:

1. **Kelola Peserta** — bulk-add participants (paste one name per line); credentials are shown
   once, so copy them before navigating away.
2. **Pengaturan Session** — activate the session and set the time window / per-quest timers
   (they start from the case's own limits; leave one empty for a quest without a timer). You can
   also start a new batch here — pick its case — without touching any prior session's data.
3. **Modul Latihan** — review each participant's follow-up learning path and progress, and write
   their personal plan (see below).
4. **Konten** — start, copy, import or export a case, and edit it in the builder (see below).

## Cases

Everything participants see — the story, the quests, their questions and answer keys, the flow
rubrics, and the Modul Latihan modules — comes from a **case**: one JSON file under
`prisma/cases/`, validated by `caseContentSchema` and `findCaseProblems` in
`src/lib/content/case.ts`. A case has any number of quests; a quest mixes any of the twelve quiz
question types (single choice, multi-select, yes/no, number, range, matching, grouping, word blank,
sequencing, odd one out, hotspot, branching story) with at most one flow question, checked either
per question (`"checkMode": "instant"`) or after submitting (`"end"`). Authored text is markdown
(paragraphs, `-`/`1.` lists, `**bold**`, `*italic*`), never HTML.

`prisma/cases/klub-fotografi.json` is the original workshop; `prisma/cases/ruang-belajar.json` is a
smaller second case that exists to show a case plays from its file alone.

- Import a case (or a new version of one):

  ```bash
  npx tsx --env-file=.env prisma/import-case.ts prisma/cases/<case>.json --dry-run
  npx tsx --env-file=.env prisma/import-case.ts prisma/cases/<case>.json --note "what changed"
  ```

  Nothing is written unless the file passes every check, and an unchanged file is a no-op. Each
  import is a new `ScenarioVersion`; a session is pinned to the version it was created with, so
  editing a case never changes what a running or finished session was scored against. New sessions
  get the latest version. For a change that only adds display text, `--move-sessions` moves the
  sessions on the previous version onto the new one.
- After changing a flow rubric, `prisma/verify-rubrics.ts [prisma/cases/<case>.json]` re-scores
  every scored submission of that case and reports any that would change (read-only).
- `prisma/backfill-attempts.ts [case-key] [--dry-run]` brings sessions recorded by the pre-case
  version of the app onto `QuestAttempt`/`QuestionResponse`. It only ever creates missing rows, so
  it is safe to re-run — run it once more after deploying, to pick up what the old deployment
  recorded in the meantime.

## Content builder

`/admin/konten` lists every case with its quests, the versions sessions use, and actions to start a
case (blank, or as a copy of another), import a case file, and export any version as JSON. A new or
imported case is only a draft until it's published. Each case opens in the full-screen builder at
`/builder/<case>?view=kasus|quest|modul`, which has three views over the same draft:

- **Kasus** — the story participants read (description, persona, user goal, the `/brief` text), the
  node library (icon, label, type and key; renaming a key renames it everywhere the case uses it,
  and a node still in use can't be deleted), and the quest list: add, reorder, duplicate, delete,
  and export or import a quest as JSON. The case itself can be exported or replaced from a file.
- **Quest** — one quest at a time, laid out like the Formulir prototype: the question list (add by
  type, drag to reorder, duplicate, delete), the editor, and a panel for the question, the quest
  (title, intro, XP, timer, check mode) and the list of what still needs fixing.
- **Modul** — the Modul Latihan modules (add, reorder, duplicate, delete, export/import), each with
  its key, title, duration, colour and tagline and its *Coba dulu*, *Penjelasan* and *Latihan*
  widgets. Every widget type has its own form (plus raw JSON), and the flow fixer's editor checks
  each rule live against the starting flow and the example solution. The page's closing checklist
  is edited here too. **Preview** shows a module exactly as participants get it.

An exported quest or module carries the library nodes it uses, so importing it into another case
offers to add the ones that case doesn't have.

In the Quest view:

- **Build** edits all thirteen question types, answer keys and feedback included. A flow question
  has its palette, an answer key drawn on the participant's own canvas, a rubric proposed from that
  key (then tuned: labels, points, tier messages, or JSON), and a test canvas that scores any flow
  as it's drawn. The key must earn full marks, or the builder says why not.
- **Preview** shows the selected question and **Play** runs the whole quest, both with the
  participant's components and scoring done in the browser. Nothing is recorded.
- **Simpan** (Ctrl+S) saves the case's draft, its `ScenarioVersion` 0 with status DRAFT.
  Participants never see a draft. Saves from two tabs can't overwrite each other.
- **Publish** is only possible once every check passes. It makes the draft the case's next version,
  which new sessions get; it can also move sessions nobody has started yet. Everything else keeps
  its version.

A session is **locked** to its version while it's `ACTIVE` and for good once a participant has any
progress in it (`src/lib/content/versionLock.ts`). Any other session can be moved onto the latest
version, from the publish dialog or with *Perbarui* on `/admin/konten` or the session history;
moving it also brings its quest list in line with the new version.

## Gamification & analytics

- A quest can have `rewards`: XP for each quiz question answered right (partial credit earns its
  share), a combo bonus for right answers in a row, and reactions after each checked answer
  (instant-check quests). XP is added on the server when the quest completes, and the result page
  shows the breakdown (`src/lib/content/rewards.ts`; set in the builder's Quest tab).
- `/admin/analitik` shows, per session, how hard each question was: average score, how many got it
  fully right, which options were picked, the wrong answers given most often, and for flow
  questions the tier spread and how many canvases met each rubric check.
- `/admin/konten/panduan` is the guide for making content in the builder;
  `docs/panduan-konten.md` is the JSON reference for case files.

## Modul Latihan Flow

The follow-up to the quests, opened from `/brief` once a participant has finished them all (it
isn't gated by the session schedule, so it keeps working after the workshop). The case's modules
each run *Coba dulu → Penjelasan → Latihan*, and the centrepiece is a flow fixer: switch
connections on and off until every rule holds. On top of that, a mentor can give each participant a
personal plan (which modules, what they're already strong at, and a *latihan utama* rebuilt from
their own quest answers). Participants without a plan get every module of the case.

- Plans, progress and written answers live in the `PracticePlan` table, one row per
  `SessionParticipant`.
- Plans are written in the plan editor, `/builder/rencana/<sessionParticipantId>` (*Buat/Edit
  rencana* on `/admin/latihan`): the greeting and strengths, which modules in which order, and the
  latihan utama. **Buat dari jawaban Quest X** turns the flow the participant submitted into a
  fixer: their arrows are its starting state, rules are proposed from the flow's nodes and the ones
  their flow doesn't meet yet are pre-selected (and become the steps), alongside the rubric checks
  they missed. With an answer key on the question, its arrows become the example solution;
  otherwise the mentor ticks it in the fixer editor, which checks it as they go. Saving runs the
  same checks as before (every fixer's example solution must satisfy its rules) and keeps the
  participant's progress and answers. Plans can be exported and imported as JSON there too.
- The batch importer still works for many plans at once. Copy `prisma/practice-plans/example.json`,
  then check it (against the case of each participant's session) and save it:

  ```bash
  npx tsx --env-file=.env prisma/seed-practice-plans.ts prisma/practice-plans/<batch>.json --dry-run
  npx tsx --env-file=.env prisma/seed-practice-plans.ts prisma/practice-plans/<batch>.json
  ```
- Plan files contain personal notes about real participants, so everything in
  `prisma/practice-plans/` except `example.json` is git-ignored.
- `/admin/latihan` lists every participant's path and progress. From there you can open their page
  in preview mode, where it's fully interactive but nothing is saved, or view all of the case's
  modules on one page.
