-- Relii Phase 2a: RUBRIC INTAKE. The schema half.
--
-- RUN supabase/phase-2a-preflight.sql FIRST and read its output. This file
-- assumes every check in that file passed.
--
-- THE REVERT IS supabase/phase-2a-rubric-intake-revert.sql. It undoes only what
-- this file adds and nothing else. Read it before you run this one.
--
-- WHAT THIS FILE DOES, in plain English:
--
--   1. Gives an assignment its own rubric, as an optional link.
--   2. Gives a rubric a place to record the total number of points it is
--      worth, which the uploaded spreadsheet states.
--   3. Copies each existing assignment's rubric across from its scenario, so
--      nothing that works today stops working.
--   4. Adds the rule that an assignment's rubric must be in the same class as
--      the assignment.
--   5. Adds one small database function whose ONLY job is to write a rubric and
--      an assignment together, so a failure cannot leave one without the other.
--
-- ==> NOTHING A USER CAN SEE CHANGES. The rubric field on the Create
--     Assignment form stays switched off until Phase 2b. This file is the
--     foundation that 2b builds on. <==
--
-- IT IS SAFE TO RUN TWICE. Every step checks for its own work first. The
-- backfill in step 3 only fills a rubric that is currently empty, so a re-run
-- can never overwrite a rubric somebody has attached in the meantime.


-- ---------------------------------------------------------------------------
-- 1. assignments.rubric_id. NULLABLE, and that is the design, not a shortcut.
-- ---------------------------------------------------------------------------
-- An assignment with no rubric is a CONVERSATION-ONLY assignment: something a
-- student practises but is not graded on. That is an existing, supported state
-- in this app (supabase/piece-2a-conversation-only.sql), so the column has to
-- allow it.
--
-- ==> THE NULL IS ALSO WHAT MAKES THE SAME-CLASS RULE IN STEP 4 SAFE. Postgres
--     composite foreign keys default to MATCH SIMPLE, which SKIPS the rule
--     entirely when any column of the pair is null. So an assignment with no
--     rubric is exempt from the rule, which is exactly right: a row pointing at
--     no rubric cannot possibly point at the wrong class's rubric.
--
--     This is the same mechanic and the same reasoning as
--     scenarios_rubric_same_class_fkey, written out at line 345 of
--     supabase/gate-4a-constraints.sql. It is quoted here rather than
--     cross-referenced because the next person to read this file should not
--     have to open another one to find out whether the null is deliberate. <==
alter table public.assignments
  add column if not exists rubric_id uuid;


-- ---------------------------------------------------------------------------
-- 2. rubrics.max_total. Its own column, and NOT a value hidden inside items.
-- ---------------------------------------------------------------------------
-- The uploaded spreadsheet states its own maximum, next to a cell reading
-- "Maximum points:". Discovery says 100, Presentation says 200. That number has
-- to be stored.
--
-- ==> WHY IT IS NOT STORED INSIDE THE items COLUMN, which was the first idea
--     and was wrong. rubrics.items carries
--
--         check (jsonb_typeof(items) = 'array')
--
--     so items is always an ARRAY, and every consumer walks it expecting each
--     element to be one criterion. Putting the maximum in there would mean
--     smuggling it in as an extra array element. It would pass the check
--     constraint and then read as a criterion to every piece of code that
--     iterates the list, including the scoring model in 2b. A number that is
--     silently treated as a grading criterion is precisely the class of bug
--     this project keeps paying for. It gets its own column. <==
--
-- NULLABLE, because the rubric that exists today (Great Northwoods) came from a
-- seed file and not from a spreadsheet, so it has no stated maximum. It is
-- deliberately NOT backfilled: its maximum is implied by its items, and writing
-- a derived number into a column meant for a stated one would create a second
-- record that can disagree with the first.
alter table public.rubrics
  add column if not exists max_total numeric;

-- A stated maximum of zero or less is not a rubric, it is a typo. This is the
-- only rule on the column.
--
-- NOTE FOR THE READER: this is a small addition beyond what the brief asked
-- for. It is NOT the "do the criteria sum to the maximum" check, which was
-- ruled out and is not here and is not coming. Strike this statement if you
-- would rather the column carried no rule at all.
alter table public.rubrics
  drop constraint if exists rubrics_max_total_positive;
alter table public.rubrics
  add constraint rubrics_max_total_positive
  check (max_total is null or max_total > 0);


-- ---------------------------------------------------------------------------
-- 3. THE BACKFILL. Every existing assignment inherits its scenario's rubric.
-- ---------------------------------------------------------------------------
-- Today an assignment has no rubric of its own: scoring finds one by going
-- through the assignment's scenario. From 2b the assignment's own rubric is
-- what counts. This step makes those two answers identical for every row that
-- exists right now, so the changeover in 2b moves nobody's grade.
--
-- ==> "and a.rubric_id is null" IS WHAT MAKES THIS FILE SAFE TO RUN TWICE. On
--     the first run every rubric_id is empty, so it changes nothing. On any
--     later run it protects a rubric that has been attached through the form
--     since, instead of quietly resetting it to the scenario's. <==
--
-- The pre-flight file proved this cannot write a row that breaks step 4.
update public.assignments a
   set rubric_id = s.rubric_id
  from public.scenarios s
 where s.id = a.scenario_id
   and s.rubric_id is not null
   and a.rubric_id is null;


-- ---------------------------------------------------------------------------
-- 4. THE RULE: an assignment's rubric lives in the assignment's class.
-- ---------------------------------------------------------------------------
-- Written to match scenarios_rubric_same_class_fkey exactly, because a rule
-- that looks different from the one beside it invites somebody to wonder which
-- one is right.
--
-- "on delete restrict" means a rubric in use cannot be deleted out from under
-- the assignment that points at it. That is what makes the rubric cleanup in
-- the delete route have to CHECK before it deletes, rather than delete and
-- hope.
alter table public.assignments
  drop constraint if exists assignments_rubric_same_class_fkey;
alter table public.assignments
  add constraint assignments_rubric_same_class_fkey
  foreign key (rubric_id, class_id)
  references public.rubrics (id, class_id)
  on delete restrict on update restrict;


-- ---------------------------------------------------------------------------
-- 5. scenarios.rubric_id IS DELIBERATELY KEPT. Do not tidy it away.
-- ---------------------------------------------------------------------------
-- ==> A NOTE TO WHOEVER READS THIS NEXT, INCLUDING A LATER CLAUDE SESSION.
--     From Phase 2b onward nothing reads scenarios.rubric_id to decide a
--     grade. It will look like a leftover. IT IS NOT, AND DROPPING IT IS NOT
--     A CLEANUP:
--
--       - It is the source the backfill in step 3 reads. Drop it and this file
--         can never be re-run or re-reasoned about.
--       - scenarios_rubric_same_class_fkey depends on it. That constraint was
--         built by Gate 4a and certified by Gate 5.
--       - Every historical score in the app was produced against the rubric it
--         points at, and the labels for those scores are still read through it.
--
--     Leaving a column in place costs nothing. Dropping it is destructive and
--     is not in the scope of any session that has been planned. <==
comment on column public.scenarios.rubric_id is
  'DELIBERATELY RETAINED, NO LONGER AUTHORITATIVE FOR GRADING. From Phase 2a the '
  'authoritative rubric for a graded submission is assignments.rubric_id. This '
  'column stays because the Phase 2a backfill reads it, because '
  'scenarios_rubric_same_class_fkey depends on it, and because historical scores '
  'were produced against the rubric it names. Do not drop it as a cleanup.';

comment on column public.assignments.rubric_id is
  'Phase 2a. The rubric this assignment is graded against, or null for a '
  'conversation-only assignment that is practised but not scored. Null is '
  'deliberate: assignments_rubric_same_class_fkey is MATCH SIMPLE, so a null '
  'here exempts the row from the same-class rule rather than weakening it.';

comment on column public.rubrics.max_total is
  'Phase 2a. The total points the uploaded rubric states it is worth, taken from '
  'the cell beside "Maximum points:" in the spreadsheet. Null for rubrics that '
  'did not come from a spreadsheet. Kept out of items on purpose: items is '
  'constrained to an array and every consumer treats each element as a criterion.';


-- ---------------------------------------------------------------------------
-- 6. THE ONE FUNCTION. It writes two rows together and does NOTHING else.
-- ---------------------------------------------------------------------------
-- WHY IT EXISTS. Creating an assignment with an uploaded rubric means writing
-- two rows: the rubric first, then the assignment that points at it. The app
-- talks to the database through PostgREST, which has no way to wrap two
-- separate writes in one transaction. So without this function, a failure on
-- the second write would leave a rubric attached to nothing.
--
-- ==> IT IS DELIBERATELY DUMB, AND MUST STAY DUMB. It validates nothing. It
--     branches on nothing. It derives nothing, and in particular it does NOT
--     work out which class the caller may write to. Every one of those
--     decisions belongs in the route, which has already checked who the caller
--     is and which class they are working in before it gets here. The function
--     supplies exactly one thing that the route cannot supply for itself: a
--     transaction boundary.
--
--     THIS IS THE PHASE 5 SHAPE HONOURED, NOT REVERSED. Phase 5 put enforcement
--     in the database because the browser could skip the server entirely. Here
--     the server is already unavoidable, so the database is not being asked to
--     make a judgement. Adding a class check in here would create a SECOND
--     place that decides who may write where, and two such places drift. <==
--
-- It takes class_id and created_by as plain arguments and writes them to BOTH
-- rows, so the rubric and the assignment cannot end up in different classes:
-- there is only one value, used twice.
--
-- NOT "security definer". It runs as whoever calls it, and the only role
-- allowed to call it is service_role, which the server already uses. A definer
-- function would run with the owner's rights no matter who reached it, which is
-- a bigger blast radius than this needs.
--
-- "set search_path = ''" means every name inside has to be written out in full,
-- as they are below. It stops the function resolving a table name against
-- somebody else's schema.
create or replace function public.create_assignment_with_rubric(
  p_class_id          uuid,
  p_created_by        uuid,
  p_rubric_name       text,
  p_rubric_items      jsonb,
  p_rubric_max_total  numeric,
  p_title             text,
  p_scenario_id       uuid,
  p_required_mode     text,
  p_company_name      text,
  p_instructions      text,
  p_available_date    timestamptz,
  p_due_at            timestamptz,
  p_duration_minutes  integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_rubric_id     uuid;
  v_assignment_id uuid;
begin
  -- The rubric first, because the assignment points at it.
  insert into public.rubrics (name, items, max_total, created_by, class_id)
  values (p_rubric_name, p_rubric_items, p_rubric_max_total, p_created_by, p_class_id)
  returning id into v_rubric_id;

  -- Then the assignment. Same class_id value as the rubric above.
  insert into public.assignments (
    title, scenario_id, required_mode, company_name, instructions,
    available_date, due_at, duration_minutes, created_by, class_id, rubric_id
  )
  values (
    p_title, p_scenario_id, p_required_mode, p_company_name, p_instructions,
    p_available_date, p_due_at, p_duration_minutes, p_created_by, p_class_id, v_rubric_id
  )
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

-- ==> WHO MAY CALL IT. Postgres grants EXECUTE on a new function to PUBLIC by
--     default, which in Supabase means the anon and authenticated roles that
--     every browser holds. That default is removed here and execute is given
--     back to service_role only, which is the key the server uses and which
--     never reaches a browser.
--
--     Without these three lines a signed-in student could call this function
--     directly from the browser and create an assignment in any class whose id
--     they could guess. The revoke is not tidiness, it is the control. <==
revoke all on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) from public;

revoke all on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) from anon, authenticated;

grant execute on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) to service_role;

comment on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) is
  'Phase 2a. Writes a rubric and the assignment that points at it in one '
  'transaction, so neither can exist without the other. Deliberately does no '
  'validation and no class resolution: the calling route does both before it '
  'gets here. service_role only.';


-- ---------------------------------------------------------------------------
-- AFTERWARDS: run supabase/phase-2a-tests.sql and read every verdict.
-- ---------------------------------------------------------------------------
