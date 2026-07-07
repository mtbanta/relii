-- Relii database setup for Stage 8 (piece 4): the assignment-delete audit log.
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", click "New
-- query", paste this whole file in, and click "Run". It is safe to run more than
-- once.
--
-- This file ADDS one new table. It does not change or remove any existing table
-- or any existing rule. No existing data is touched.
--
-- WHY A SNAPSHOT: deleting an assignment that has student work also DELETES that
-- assignment row and all of its sessions (the students' submissions and
-- practices for it). So this log keeps its OWN copy (a snapshot) of the key
-- facts, so the record still makes sense after everything is gone. It stores
-- plain copies (not live links) of who did it, which assignment, and how much
-- was destroyed, so a later account or scenario change can never remove or blank
-- a log entry. This is the standard way to keep a permanent audit log, and it
-- matches the reset log added in piece 2 (supabase/stage-8-reset-audit.sql).
--
-- Note: a "clean" delete of an UNUSED assignment (one with no sessions) destroys
-- nothing but the empty assignment row, so it is not logged here. Only deletions
-- of an IN-USE assignment (which destroy student submissions and/or practices)
-- write a row to this table.

create table if not exists public.assignment_deletes (
  id uuid primary key default gen_random_uuid(),

  -- WHO deleted it (a copy of the instructor's id and email).
  instructor_id    uuid,
  instructor_email text not null,

  -- WHICH assignment was deleted (a snapshot; the row is gone after this).
  assignment_id    uuid not null,
  assignment_title text not null,
  scenario_id      uuid,            -- a plain copy, for reference
  scenario_title   text,            -- readable scenario name after deletion
  required_mode    text not null,   -- 'text' or 'voice_video'

  -- HOW MUCH student work was destroyed along with it.
  submissions_deleted integer not null,
  practices_deleted   integer not null,

  created_at timestamptz not null default now()
);

-- Speeds up a newest-first read of the log.
create index if not exists assignment_deletes_created_idx
  on public.assignment_deletes (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: only instructors may READ the log. There is deliberately
-- NO insert/update/delete rule: with security on and no write rule, ordinary
-- users (students, instructors) cannot write. Only the server, using the
-- service-role key, writes audit rows. That key bypasses these rules and lives
-- only on the server, never in the browser, exactly like session rows are
-- server-written (data-model decision A). This is purely additive and weakens
-- no existing rule.
-- ---------------------------------------------------------------------------
alter table public.assignment_deletes enable row level security;

drop policy if exists "instructors read assignment delete log" on public.assignment_deletes;
create policy "instructors read assignment delete log"
  on public.assignment_deletes for select
  using (public.is_instructor());
