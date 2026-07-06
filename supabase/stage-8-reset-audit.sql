-- Relii database setup for Stage 8 (piece 2): the reset / allow-retake audit log.
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", click "New
-- query", paste this whole file in, and click "Run". It is safe to run more than
-- once.
--
-- This file ADDS one new table. It does not change or remove any existing table
-- or any existing rule. No existing data is touched.
--
-- WHY A SNAPSHOT: an instructor reset DELETES a submission row (to recover a
-- stuck attempt, or to allow a retake). So this log keeps its OWN copy (a
-- snapshot) of the key facts, so the record still makes sense after the
-- submission is gone. It stores plain copies (not live links) of who did it,
-- which student, and which assignment, so a later account or assignment delete
-- can never remove or blank a log entry. This is the standard way to keep a
-- permanent audit log.

create table if not exists public.submission_resets (
  id uuid primary key default gen_random_uuid(),

  -- WHO did the reset (a copy of the instructor's id and email).
  instructor_id    uuid,
  instructor_email text not null,

  -- WHICH student the reset was for (a copy of their id and email).
  student_id    uuid,
  student_email text not null,

  -- WHICH assignment (a copy of its id and title).
  assignment_id    uuid,
  assignment_title text not null,

  -- The DELETED submission, snapshotted (its row is gone after the reset).
  session_id   uuid not null,
  session_kind text not null,            -- always 'submission' for this feature
  prior_status text not null,            -- 'in_progress' (interrupted) or 'scored' (retake)
  reset_type   text not null check (reset_type in ('interrupted', 'retake')),

  -- The wiped score, only for a graded retake (left empty for an interrupted
  -- recovery, which never had a score).
  prior_score_total numeric,
  prior_score_max   numeric,

  created_at timestamptz not null default now()
);

-- Speeds up the dashboard's "resets for this assignment, newest first" read.
create index if not exists submission_resets_assignment_idx
  on public.submission_resets (assignment_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: only instructors may READ the log. There is deliberately
-- NO insert/update/delete rule: with security on and no write rule, ordinary
-- users (students, instructors) cannot write. Only the server, using the
-- service-role key, writes audit rows. That key bypasses these rules and lives
-- only on the server, never in the browser, exactly like session rows are
-- server-written (data-model decision A). This is purely additive and weakens
-- no existing rule.
-- ---------------------------------------------------------------------------
alter table public.submission_resets enable row level security;

drop policy if exists "instructors read reset log" on public.submission_resets;
create policy "instructors read reset log"
  on public.submission_resets for select
  using (public.is_instructor());
