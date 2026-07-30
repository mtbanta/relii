-- Relii pre-demo sprint PD-3: the Available Date column on assignments.
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
-- The date an assignment UNLOCKS for students. It lets an instructor set up a
-- whole semester of role-plays at once and have them open over time. It is a NEW
-- field that sits alongside the existing due date: due_at is NOT repurposed and
-- is not touched. It mirrors due_at exactly (a nullable timestamptz), so the
-- date picker, the UTC date formatting, and the "left blank" handling all work
-- the same way they already do for the due date.
--
-- NULLABLE ON PURPOSE
-- An empty Available Date means AVAILABLE NOW. Every existing assignment simply
-- leaves it empty and keeps working exactly as it does today, appearing
-- immediately and unlocked. There is deliberately NO default value, because "no
-- date" is itself the meaning we want, and no NOT NULL rule, because that would
-- force a date onto assignments that should just be open.
--
-- WHAT THIS DOES NOT DO
-- It creates no table, removes nothing, and changes no Row Level Security or
-- Storage rule. The existing "everyone logged in reads assignments" and
-- "instructors manage assignments" rules are untouched, so the instructor forms
-- write this column from the browser exactly the way they already write the due
-- date, and no new server write path was needed for it.

-- ---------------------------------------------------------------------------
-- 1. The Available Date column.
-- ---------------------------------------------------------------------------
-- Stored as midnight UTC, the same as due_at: the date picker sends a plain day
-- like "2026-08-14" and it is read back in UTC everywhere, so a date picked as
-- "Aug 14" always reads "Aug 14" on screen.
alter table public.assignments
  add column if not exists available_date timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Check it worked (this changes nothing; it just shows you the result).
-- ---------------------------------------------------------------------------
-- Expect every existing assignment listed with an EMPTY available_date, which
-- means available now, and with its due date unchanged.
select
  title,
  available_date,
  due_at,
  created_at
from public.assignments
order by created_at desc;
