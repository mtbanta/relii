-- Relii sprint piece 2a: conversation-only scenarios, plus an enabled flag.
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", paste this
-- whole file in, and click "Run". It is safe to run more than once.
--
-- WHY THIS EXISTS
-- Every scenario so far (Alex, Jordan) is a GRADED case: it points at a rubric,
-- and when the session ends the app scores it. Piece 2 lets an instructor have
-- the AI build personas for other industries, and those cases are for
-- CONVERSATION PRACTICE ONLY: there is no rubric written for them, so there is
-- nothing to score. This file makes that possible in two ways.
--
--   1. A scenario's rubric link becomes OPTIONAL. No rubric means
--      conversation-only: the session runs normally, saves the transcript and
--      the recording, and simply produces no score.
--
--   2. Scenarios gain an on/off switch (enabled). A disabled scenario is hidden
--      from the instructor's create-assignment picker. This exists because a
--      later chunk (2c) writes AI-generated candidate personas into this table
--      turned OFF, so half-finished drafts can never be assigned to a student by
--      accident.
--
-- WHAT THIS DOES NOT DO
-- It changes nothing about Alex and Jordan. They keep their rubric link and are
-- still scored exactly as before (Alex out of 180, Jordan out of 220). Both
-- become enabled, which is what they already were in practice.
--
-- This is ADDITIVE only. It creates no table, removes nothing, and changes no
-- Row Level Security or Storage rule. The existing scenario rules (anyone logged
-- in can read, only instructors can manage) keep working untouched.

-- ---------------------------------------------------------------------------
-- 1. Make the rubric link optional.
-- ---------------------------------------------------------------------------
-- "drop not null" only REMOVES a requirement; it does not change a single
-- existing row. Alex and Jordan still point at the Great Northwoods rubric
-- afterward, exactly as they do now. It simply becomes legal for a NEW scenario
-- to be stored with no rubric at all, which is how the app recognises a
-- conversation-only case.
--
-- Everything else about the link is left alone. In particular the "on delete
-- restrict" rule still stands, so a rubric that is in use by any scenario still
-- cannot be deleted out from under it.
alter table public.scenarios
  alter column rubric_id drop not null;

-- ---------------------------------------------------------------------------
-- 2. Add the on/off switch.
-- ---------------------------------------------------------------------------
-- This is ONE statement, unlike the three-step add-then-backfill-then-lock we
-- used for meeting_type in piece 1, and the difference is deliberate.
--
-- Because this column has a default of true, the database fills in every row
-- that already exists as it adds the column. So Alex and Jordan are switched on
-- automatically; there is nothing to backfill by hand.
--
-- In piece 1 a default would have been WRONG: meeting_type is a real choice
-- (discovery or presentation), and defaulting it would have let a future
-- scenario be silently mislabelled, which was the exact bug that column existed
-- to prevent. Here the opposite is true. "A scenario is on unless somebody
-- turns it off" is genuinely the intended meaning, so defaulting to true is the
-- correct behaviour, not a shortcut. Chunk 2c will write generated candidates
-- with enabled = false explicitly.
alter table public.scenarios
  add column if not exists enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- 3. Check it worked (this changes nothing; it just shows you the result).
-- ---------------------------------------------------------------------------
-- Expect your existing scenarios (Alex and Jordan) with:
--   has_rubric = true   (their scoring is untouched)
--   enabled    = true   (both switched on)
select
  title,
  persona_name,
  meeting_type,
  (rubric_id is not null) as has_rubric,
  enabled
from public.scenarios
order by created_at asc;
