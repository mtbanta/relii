-- Relii pre-demo sprint PD-8g: the company name column on assignments.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- RUN THIS BEFORE THE NEW CODE GOES LIVE. The updated app reads and writes this
-- column, so if the code is deployed first, creating or editing an assignment
-- will fail with "column does not exist" until this file has been run.
--
-- WHAT THIS IS
-- The name of the company the BUYER works for in this role-play, for example
-- "Bunzl". The instructor types it on the create-assignment form, can change it
-- on the edit form, and it is shown on the instructor's own assignment card. It
-- is a NEW field: there was no company anywhere on assignments before this, and
-- nothing existing is repurposed or renamed.
--
-- NULLABLE ON PURPOSE, WITH NO DEFAULT
-- An empty company name means NO COMPANY WAS NAMED, and the card simply leaves
-- the line out. Every existing assignment keeps working untouched with an empty
-- value. There is deliberately no default (there is no sensible company to
-- invent for an assignment nobody named one for) and no NOT NULL rule (that
-- would force a value onto rows the instructor never filled in). This is the
-- same shape as available_date and duration_minutes.
--
-- HOW IT IS WRITTEN, AND WHY THERE IS NO NEW SERVER ROUTE
-- Straight from the browser by the create and edit forms, exactly the way
-- title, instructions, available_date, due_at and duration_minutes are already
-- written, under the EXISTING "instructors manage assignments" rule from
-- supabase/stage-2-data-model.sql. That rule is FOR ALL and covers every column
-- of the table, so a new column needs no policy change and no new write path.
--
-- WHAT THIS DOES NOT DO
-- It creates no table, removes nothing, and changes no Row Level Security or
-- Storage rule. It does not touch sessions, scoring, the student view, or any
-- other column. Nothing reads this value except the instructor's own assignment
-- card: it is not shown to students and it is not sent to the AI.

-- ---------------------------------------------------------------------------
-- 1. The company name column.
-- ---------------------------------------------------------------------------
-- Free text. Empty (null) means no company was named for this assignment.
alter table public.assignments
  add column if not exists company_name text;

-- ---------------------------------------------------------------------------
-- 2. Check it worked (this changes nothing; it just shows you the result).
-- ---------------------------------------------------------------------------
-- Expect every existing assignment listed with an EMPTY company_name, and with
-- its title, dates and meeting length unchanged.
select
  title,
  company_name,
  duration_minutes,
  available_date,
  due_at,
  created_at
from public.assignments
order by created_at desc;
