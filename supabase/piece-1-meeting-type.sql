-- Relii sprint piece 1: add a meeting type to scenarios.
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", paste this
-- whole file in, and click "Run". It is safe to run more than once.
--
-- WHY THIS EXISTS
-- The Great Northwoods rubric covers TWO meetings. Each rubric item is tagged
-- with the meeting(s) it belongs to: "discovery" (Alex) or "presentation"
-- (Jordan). Until now the scorer simply assumed every session was a discovery
-- meeting, because Alex was the only scenario. Adding Jordan makes that
-- assumption wrong, so each scenario now states which meeting it is, and the
-- scorer reads that instead of guessing.
--
-- WHAT THIS DOES
--   1. Adds a meeting_type column to scenarios.
--   2. Fills in every existing row with 'discovery' (today that is Alex, and
--      only Alex: verified as the single scenarios row before writing this).
--   3. Locks the column down: it can never be blank, and the only two values
--      it will accept are 'discovery' and 'presentation'.
--
-- This is ADDITIVE only. It creates no table, removes nothing, and changes no
-- Row Level Security or Storage rule. The existing scenario rules (anyone
-- logged in can read, only instructors can manage) keep working untouched.
--
-- Note there is deliberately NO default value, matching how every other choice
-- column in this database works (assignments.required_mode, sessions.kind,
-- sessions.mode). A default of 'discovery' would look convenient, but it would
-- silently mislabel a future presentation scenario as a discovery one, which is
-- exactly the bug this column exists to prevent. Better to require the answer.

-- ---------------------------------------------------------------------------
-- 1. Add the column, empty for now.
-- ---------------------------------------------------------------------------
-- It starts out allowed to be blank ONLY so that step 2 has a chance to fill in
-- the rows that already exist. Step 3 then closes that door. Adding, filling,
-- and locking in that order is what makes this safe to run on a live database.
alter table public.scenarios
  add column if not exists meeting_type text;

-- ---------------------------------------------------------------------------
-- 2. Backfill every existing scenario as a discovery meeting.
-- ---------------------------------------------------------------------------
-- Alex is a discovery meeting, and Alex is the only scenario that exists, so
-- this touches exactly one row and leaves nothing blank. Running this file a
-- second time updates nothing, because by then no row is blank.
update public.scenarios
   set meeting_type = 'discovery'
 where meeting_type is null;

-- ---------------------------------------------------------------------------
-- 3. Lock the column down.
-- ---------------------------------------------------------------------------
-- "not null" means every scenario, now and in the future, must say which
-- meeting it is. If any row were still blank, this line would fail and stop the
-- whole file rather than leave things half-done.
alter table public.scenarios
  alter column meeting_type set not null;

-- The check constraint is the database refusing, permanently, to store anything
-- other than these two words. A typo like 'Presentation' or 'presentaton' is
-- rejected at write time instead of quietly causing a session to be scored
-- against the wrong rubric items. Dropped first so this file can be re-run.
alter table public.scenarios
  drop constraint if exists scenarios_meeting_type_check;

alter table public.scenarios
  add constraint scenarios_meeting_type_check
  check (meeting_type in ('discovery', 'presentation'));

-- ---------------------------------------------------------------------------
-- 4. Check it worked (this changes nothing; it just shows you the result).
-- ---------------------------------------------------------------------------
-- Expect exactly one row: the Alex scenario, with meeting_type = discovery.
select title, persona_name, meeting_type
  from public.scenarios
 order by created_at asc;
