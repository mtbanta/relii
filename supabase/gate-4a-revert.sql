-- Relii Gate 4a: THE UNDO for supabase/gate-4a-constraints.sql.
--
-- HOW TO USE: only if something has actually gone wrong. Open your Supabase
-- dashboard, click "SQL Editor", "New query", paste this whole file in, and
-- click "Run". It is safe to run more than once, and safe to run even if the
-- Gate 4a migration was never applied.
--
-- WHAT IT DOES. It puts the database back exactly as it was before Gate 4a:
--   1. Removes the three same-class rules.
--   2. Removes the two unique pairs those rules needed.
--   3. Makes all seven class_id columns optional again.
--   4. Brings back public.is_instructor(), word for word from
--      supabase/schema.sql lines 87 to 98, with its grant from line 101.
--
-- ==> THIS PIECE IS FULLY REVERSIBLE, INCLUDING THE DELETED FUNCTION. Deleting
--     a function sounds permanent and is not: its definition is nine lines of
--     text and section 4 below holds a verbatim copy. <==
--
-- THE ORDER IN THIS FILE IS THE REVERSE OF THE MIGRATION'S, AND IT HAS TO BE.
-- A unique pair cannot be removed while a rule still points at it, so the three
-- rules come out first. Running these sections out of order fails with "cannot
-- drop constraint because other objects depend on it".
--
-- WHAT IT DOES NOT DO. It does not touch the Gate 2, Gate 3a or Gate 3b
-- security rules, the column permissions on scenarios, Storage, or any data
-- anywhere. It changes no row. It only removes rules about what a row may
-- contain.
--
-- ===========================================================================
-- ==> THE ONE THING THIS FILE CANNOT REACH, STATED PLAINLY. <==
-- ===========================================================================
-- Running the Gate 4a migration breaks TWO OTHER FILES, and this revert fixes
-- the cause but cannot reach into them:
--
--   supabase/gate-2-revert.sql   uses is_instructor() nine times
--   supabase/gate-3b-revert.sql  uses is_instructor() twice
--
-- Both of those files were edited in the same commit as Gate 4a so that each
-- one now recreates the function itself before using it. That is what keeps
-- them working standalone. If you are reading this after a checkout of an older
-- commit, run THIS file first and both of them will work again.


-- ---------------------------------------------------------------------------
-- 1. Remove the three same-class rules.
-- ---------------------------------------------------------------------------
-- The single-column links underneath them (assignments.scenario_id,
-- scenarios.rubric_id, sessions.scenario_id) were never touched by Gate 4a and
-- are not touched here either. They stay exactly as they have always been.
alter table public.assignments drop constraint if exists assignments_scenario_same_class_fkey;
alter table public.scenarios   drop constraint if exists scenarios_rubric_same_class_fkey;
alter table public.sessions    drop constraint if exists sessions_scenario_same_class_fkey;


-- ---------------------------------------------------------------------------
-- 2. Remove the two unique pairs.
-- ---------------------------------------------------------------------------
-- These existed only to satisfy Postgres's requirement that a two-column rule
-- point at a declared-unique pair of columns. With the rules in section 1 gone,
-- they do nothing at all, so they go too.
alter table public.rubrics   drop constraint if exists rubrics_id_class_unique;
alter table public.scenarios drop constraint if exists scenarios_id_class_unique;


-- ---------------------------------------------------------------------------
-- 3. Make all seven class_id columns optional again.
-- ---------------------------------------------------------------------------
-- This removes a REQUIREMENT. It does not empty anything: every row keeps the
-- class it already has. It simply allows a future row to be saved without one
-- again, which is how the system behaved from Gate 1 through Gate 3b.
alter table public.rubrics            alter column class_id drop not null;
alter table public.scenarios          alter column class_id drop not null;
alter table public.assignments        alter column class_id drop not null;
alter table public.sessions           alter column class_id drop not null;
alter table public.allowed_emails     alter column class_id drop not null;
alter table public.submission_resets  alter column class_id drop not null;
alter table public.assignment_deletes alter column class_id drop not null;


-- ---------------------------------------------------------------------------
-- 4. Bring back public.is_instructor().
-- ---------------------------------------------------------------------------
-- VERBATIM from supabase/schema.sql lines 87 to 98, with the grant from line
-- 101. Note that schema.sql line 100 grants a DIFFERENT function
-- (is_email_allowed) and is deliberately not copied here: the two grants sit
-- next to each other and are easy to confuse.
--
-- "create or replace" means this is safe whether the function is currently
-- missing or already present.
--
-- WHAT BRINGING IT BACK DOES AND DOES NOT DO. It restores the function. It does
-- NOT put it back into any security rule, because Gate 4a never removed it from
-- one: Gate 2 and Gate 3b had already moved all eight rules off it long before,
-- and this piece only deleted the leftover. So after running this file the
-- system is exactly as it was before Gate 4a: the function exists, and nothing
-- calls it. It is there so that supabase/gate-2-revert.sql and
-- supabase/gate-3b-revert.sql have something to call if they are ever needed.

-- Is the person making this request an instructor?
create or replace function public.is_instructor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'instructor'
  );
$$;

grant execute on function public.is_instructor() to authenticated;


-- ---------------------------------------------------------------------------
-- 5. Confirm the revert landed.
-- ---------------------------------------------------------------------------
-- EXPECTED after a successful revert: required_class_columns 0,
-- same_class_rules 0, unique_pairs 0, is_instructor_exists_again true.
select
  (select count(*)
     from information_schema.columns
    where table_schema = 'public'
      and column_name = 'class_id'
      and is_nullable = 'NO'
      and table_name in ('rubrics', 'scenarios', 'assignments', 'sessions',
                         'allowed_emails', 'submission_resets', 'assignment_deletes')
  ) as required_class_columns,
  (select count(*)
     from pg_constraint
    where conname in ('assignments_scenario_same_class_fkey',
                      'scenarios_rubric_same_class_fkey',
                      'sessions_scenario_same_class_fkey')
  ) as same_class_rules,
  (select count(*)
     from pg_constraint
    where conname in ('rubrics_id_class_unique', 'scenarios_id_class_unique')
  ) as unique_pairs,
  (to_regprocedure('public.is_instructor()') is not null) as is_instructor_exists_again;
