-- Relii sprint piece 2c: candidate grouping columns on scenarios.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- RUN THIS BEFORE THE NEW CODE GOES LIVE. The updated app writes to these three
-- columns, so if the code is deployed first it will fail with "column does not
-- exist" until this file has been run.
--
-- WHY THIS EXISTS
-- Piece 2b generates TWO candidate buyer personas and shows them on screen, but
-- saves nothing: close the tab and they are gone. This piece saves them.
--
-- Each generation writes both candidates into the existing scenarios table as
-- real rows, turned OFF (enabled = false) so no student can ever be given one by
-- accident, and with no rubric (conversation practice only, no score). To show
-- the two side by side and compare them, the app needs three things the
-- scenarios table cannot express today:
--
--   1. WHICH TWO ROWS ARE A PAIR. Both candidates from one generation share a
--      single "generation group id", which is just a random identifier created
--      when they are written. The compare view looks up a pair by that id, which
--      is also why the compare page's web address survives a reload.
--
--   2. WHICH PERSON IN THE CHAIN THIS IS. A case can have a gatekeeper (someone
--      who controls access to the real decision maker) or a decision maker (who
--      can say yes themselves). Alex is effectively the first and Jordan the
--      second. Recording it lets the app label the pair correctly and, in the
--      next chunk, generate the matching second persona.
--
--   3. THE GENERATED FIELDS THEMSELVES. The AI produces a structured list of
--      facts about the persona (their demeanor, decision criteria, hidden facts,
--      objections, and so on). The scenario columns we already have store the
--      finished paragraphs assembled from those facts, not the facts themselves.
--      The compare view reads the facts, so they have to be stored too.
--
-- WHAT THIS DOES NOT DO
-- It changes nothing about Alex and Jordan. All three columns are OPTIONAL, so
-- those two rows simply leave them empty and keep working exactly as they do
-- now (Alex scored out of 180, Jordan out of 220). It creates no table, removes
-- nothing, and changes no Row Level Security or Storage rule. The existing
-- scenario rules (anyone logged in can read, only instructors can manage) are
-- untouched.

-- ---------------------------------------------------------------------------
-- 1. The generation group id: what ties a pair of candidates together.
-- ---------------------------------------------------------------------------
-- A "uuid" is a long random identifier, the same kind of value every row in this
-- database already uses as its id. The app generates one per run and stamps it
-- on both candidates of that run.
--
-- It is deliberately a plain column and NOT a link to another table. There is no
-- "generations" table to point at, and inventing one would mean a second row to
-- keep in step for no benefit: a group is only ever "the rows carrying this id".
alter table public.scenarios
  add column if not exists generation_group_id uuid;

-- ---------------------------------------------------------------------------
-- 2. The chain role: gatekeeper, or decision maker.
-- ---------------------------------------------------------------------------
-- Empty for Alex, Jordan, and any hand-written scenario. Filled in for every
-- generated candidate.
alter table public.scenarios
  add column if not exists chain_role text;

-- The check below is the database refusing to store a typo. Only the two words
-- 'gatekeeper' and 'decision_maker' are allowed, and empty is allowed too
-- (that is what "chain_role is null or ..." means), which is what lets Alex and
-- Jordan leave it blank.
--
-- This is wrapped in a do-block purely so the file can be run twice without
-- erroring. Postgres has no "add constraint if not exists", so we ask whether
-- the rule is already there and add it only if it is not.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scenarios_chain_role_check'
  ) then
    alter table public.scenarios
      add constraint scenarios_chain_role_check
      check (chain_role is null or chain_role in ('gatekeeper', 'decision_maker'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The generated fields, stored as JSON.
-- ---------------------------------------------------------------------------
-- "jsonb" is a column that holds structured data rather than one piece of text.
-- The rubrics table already uses it, so this is a pattern the project uses.
--
-- It holds one object shaped like this:
--
--   {
--     "version": 1,              -- so a future change can be told apart
--     "candidate_index": 1,      -- 1 or 2: which of the pair this is
--     "candidate": { ... },      -- the AI's structured output, exactly as returned
--     "inputs": { ... }          -- the form answers the admin typed
--   }
--
-- Why candidate_index is in there: both rows of a pair are written by one
-- statement, so the database stamps them with the SAME created_at time down to
-- the microsecond. Sorting by date would put "Candidate 1" on the left one time
-- and on the right the next. The stored index makes the order fixed.
--
-- Why inputs is in there: the next chunk generates the matching second persona
-- from the same case, and keeping the original answers means the instructor is
-- not asked to retype them.
--
-- Note this does NOT replace the existing scenario columns. The assembled
-- paragraphs still live in scenario_context and persona_system_prompt, and are
-- still what actually drives the role-play. Both come from this same JSON, which
-- is the point: the fields you compare on screen and the persona the student
-- meets are built from one source, so they cannot drift apart.
alter table public.scenarios
  add column if not exists generation_fields jsonb;

-- ---------------------------------------------------------------------------
-- 4. An index, so looking up a pair by its group id stays fast.
-- ---------------------------------------------------------------------------
-- This is a performance helper only. It changes no data and no rules.
create index if not exists scenarios_generation_group_idx
  on public.scenarios (generation_group_id);

-- ---------------------------------------------------------------------------
-- 5. Check it worked (this changes nothing; it just shows you the result).
-- ---------------------------------------------------------------------------
-- Expect your existing scenarios (Alex, Jordan, and any test rows) listed with
-- an EMPTY generation group, an EMPTY chain role, and has_fields = false. That
-- is correct: nothing has been generated yet. Their rubric and enabled values
-- should be exactly what they were before you ran this.
select
  title,
  persona_name,
  meeting_type,
  enabled,
  (rubric_id is not null) as has_rubric,
  generation_group_id,
  chain_role,
  (generation_fields is not null) as has_fields
from public.scenarios
order by created_at asc;
