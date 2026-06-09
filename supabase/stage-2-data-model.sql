-- Relii database setup for Stage 2 (the data model).
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", paste this
-- whole file in, and click "Run". It is safe to run more than once.
--
-- This file ADDS to Stage 1. It does not change or remove anything in
-- supabase/schema.sql. It reuses the is_instructor() helper from Stage 1.
--
-- What this creates:
--   1. rubrics     - grading criteria, stored as flexible JSON.
--   2. scenarios   - the role-play cases (persona + context), each scored by a rubric.
--   3. assignments - an instructor assigns a scenario in a required mode.
--   4. sessions    - one row per role-play attempt (practice or submission).
--   5. Security rules (Row Level Security):
--        - students can read only their own sessions,
--        - instructors can read submissions (not practice runs),
--        - only the server (service role) can write sessions,
--        - everyone logged in can read scenarios/rubrics/assignments,
--        - only instructors can create or edit scenarios/rubrics/assignments.

-- ---------------------------------------------------------------------------
-- 1. rubrics: the grading criteria, stored as flexible JSON.
-- ---------------------------------------------------------------------------
-- The "items" list holds objects shaped like:
--   { "id": "open-discovery", "label": "...", "points": 20, "applies_to": "both" }
-- where applies_to is "both" or "voice-only".
create table if not exists public.rubrics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. scenarios: the role-play cases. Each is scored by exactly one rubric.
-- ---------------------------------------------------------------------------
create table if not exists public.scenarios (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  persona_name          text not null,
  persona_system_prompt text not null,
  scenario_context      text not null,
  rubric_id             uuid not null references public.rubrics (id) on delete restrict,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists scenarios_rubric_idx on public.scenarios (rubric_id);

-- ---------------------------------------------------------------------------
-- 3. assignments: an instructor assigns a scenario in a required mode.
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  instructions  text,
  scenario_id   uuid not null references public.scenarios (id) on delete restrict,
  required_mode text not null check (required_mode in ('text', 'voice_video')),
  due_at        timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists assignments_scenario_idx on public.assignments (scenario_id);

-- ---------------------------------------------------------------------------
-- 4. sessions: one row per role-play attempt.
-- ---------------------------------------------------------------------------
-- "kind"   is practice or submission.
-- "mode"   is text or voice_video.
-- "status" moves in_progress -> completed -> scored.
-- A submission must belong to an assignment (you cannot submit toward nothing);
-- a practice may belong to an assignment or be free practice.
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references auth.users (id) on delete cascade,
  scenario_id   uuid not null references public.scenarios (id) on delete restrict,
  assignment_id uuid references public.assignments (id) on delete restrict,
  kind          text not null check (kind in ('practice', 'submission')),
  mode          text not null check (mode in ('text', 'voice_video')),
  status        text not null default 'in_progress'
                  check (status in ('in_progress', 'completed', 'scored')),
  transcript    jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  video_path    text,
  score         jsonb,
  score_total   numeric,
  submitted_at  timestamptz,
  scored_at     timestamptz,
  created_at    timestamptz not null default now(),
  constraint submission_needs_assignment
    check (kind <> 'submission' or assignment_id is not null)
);

create index if not exists sessions_student_idx on public.sessions (student_id);
create index if not exists sessions_assignment_idx on public.sessions (assignment_id);
-- Speeds up the "how many practice runs so far?" cap check in Stage 7.
create index if not exists sessions_practice_cap_idx
  on public.sessions (assignment_id, student_id, kind);

-- ---------------------------------------------------------------------------
-- 5. Security rules (Row Level Security)
-- ---------------------------------------------------------------------------
alter table public.rubrics     enable row level security;
alter table public.scenarios   enable row level security;
alter table public.assignments enable row level security;
alter table public.sessions    enable row level security;

-- --- rubrics: everyone logged in reads; only instructors manage ------------
drop policy if exists "read rubrics" on public.rubrics;
create policy "read rubrics"
  on public.rubrics for select
  using (auth.uid() is not null);

drop policy if exists "instructors manage rubrics" on public.rubrics;
create policy "instructors manage rubrics"
  on public.rubrics for all
  using (public.is_instructor())
  with check (public.is_instructor());

-- --- scenarios: everyone logged in reads; only instructors manage ----------
drop policy if exists "read scenarios" on public.scenarios;
create policy "read scenarios"
  on public.scenarios for select
  using (auth.uid() is not null);

drop policy if exists "instructors manage scenarios" on public.scenarios;
create policy "instructors manage scenarios"
  on public.scenarios for all
  using (public.is_instructor())
  with check (public.is_instructor());

-- --- assignments: everyone logged in reads; only instructors manage --------
drop policy if exists "read assignments" on public.assignments;
create policy "read assignments"
  on public.assignments for select
  using (auth.uid() is not null);

drop policy if exists "instructors manage assignments" on public.assignments;
create policy "instructors manage assignments"
  on public.assignments for all
  using (public.is_instructor())
  with check (public.is_instructor());

-- --- sessions: students read their own; instructors read submissions -------
-- There is deliberately NO insert/update/delete policy here. With RLS on and
-- no write policy, ordinary users (students, instructors) cannot write rows.
-- Only the server, using the service-role key, may write sessions. That key
-- bypasses RLS and must live on the server, never in the browser.
drop policy if exists "students read own sessions, instructors read submissions" on public.sessions;
create policy "students read own sessions, instructors read submissions"
  on public.sessions for select
  using (
    auth.uid() = student_id
    or (public.is_instructor() and kind = 'submission')
  );

-- ---------------------------------------------------------------------------
-- NOT BUILT YET (Stage 7 lifecycle, the schema supports them):
--   - enforcing the cap of 3 practice rows per student per assignment,
--   - deleting a student's practice rows for an assignment when they submit.
-- Both are simple operations on the sessions table and are added in Stage 7.
-- ---------------------------------------------------------------------------
