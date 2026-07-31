-- Relii pre-demo sprint PD-4: the per-assignment meeting length on assignments.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- RUN THIS BEFORE THE NEW CODE GOES LIVE. The updated app reads and writes this
-- column, so if the code is deployed first it will fail with "column does not
-- exist" until this file has been run.
--
-- WHAT THIS IS
-- How long the role-play meeting runs, in minutes, chosen by the instructor per
-- assignment, from 5 to 30. It is the number the student's practice clock counts
-- up to: the clock still starts at 00:00 and counts UP, and when it reaches this
-- length the practice automatically ends through the student's normal End
-- routine, exactly the way the fixed 30:00 does today. It replaces a single
-- hardcoded 30 in the app, so a short case can be a real 5 minute meeting.
--
-- NULLABLE ON PURPOSE, WITH NO DEFAULT
-- An empty duration means THIRTY MINUTES, which is what every assignment does
-- today. Every existing assignment simply leaves it empty and keeps behaving
-- exactly as it does now, auto-ending at 30:00. There is deliberately NO default
-- value and no NOT NULL rule: "not set" is a meaning we want to keep (it reads
-- as the standard 30 minute meeting), and forcing a number onto old rows would
-- be a change to data the instructor never made.
--
-- WHY THE 5 TO 30 CHECK
-- The instructor forms already limit the input to 5 through 30. The check here
-- is the database saying the same thing, so a value outside that range cannot
-- get in by any route. Under 5 minutes is not a meeting; over 30 is longer than
-- the app has ever allowed a practice to run.
--
-- WHAT THIS DOES NOT DO
-- It creates no table, removes nothing, and changes no Row Level Security or
-- Storage rule. The existing "everyone logged in reads assignments" and
-- "instructors manage assignments" rules are untouched, so the instructor forms
-- write this column from the browser exactly the way they already write the due
-- date and the available date, and no new server write path was needed for it.
-- It also does not touch sessions, scoring, or the graded-submission lock
-- window: this is only about when the practice clock auto-ends.

-- ---------------------------------------------------------------------------
-- 1. The meeting length column.
-- ---------------------------------------------------------------------------
-- A whole number of minutes. Empty (null) means the standard 30 minute meeting.
alter table public.assignments
  add column if not exists duration_minutes integer;

-- ---------------------------------------------------------------------------
-- 2. The 5 to 30 rule.
-- ---------------------------------------------------------------------------
-- Postgres has no "add constraint if not exists", so this checks for the rule
-- by name first and only adds it when it is missing. That is what makes the
-- file safe to run more than once.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignments_duration_minutes_range'
      and conrelid = 'public.assignments'::regclass
  ) then
    alter table public.assignments
      add constraint assignments_duration_minutes_range
      check (
        duration_minutes is null
        or (duration_minutes >= 5 and duration_minutes <= 30)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Check it worked (this changes nothing; it just shows you the result).
-- ---------------------------------------------------------------------------
-- Expect every existing assignment listed with an EMPTY duration_minutes, which
-- means the standard 30 minute meeting, and with its dates unchanged.
select
  title,
  duration_minutes,
  available_date,
  due_at,
  created_at
from public.assignments
order by created_at desc;
