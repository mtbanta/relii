-- Relii Phase 2b-1: THE CHECKS. Run this AFTER the migration.
--
-- IT CHANGES NOTHING. Every statement only reads.
--
-- WHAT YOU SHOULD SEE: one row per check, every verdict reading PASSED, plus a
-- few counts that are not checks. If any verdict reads FAILED, STOP and show it
-- to Claude. Do not repair anything by hand.
--
--
-- ==> A NOTE FOR WHOEVER RUNS supabase/phase-2a-tests.sql AFTER THIS PIECE, SO A
--     CHANGED VERDICT THERE IS NOT READ AS A BREAKAGE.
--
--     CHECK 16 of that file is "every assignment's rubric matches its
--     scenario's". It was true because 2a's backfill had just made it so. After
--     2b-1 no assignment carries a rubric at all, so it now passes VACUOUSLY:
--     zero rows to disagree. It is still green and it is no longer measuring
--     anything.
--
--     IT EXPIRES FOR REAL IN 2b-2. The first rubric Tom attaches will differ
--     from his scenario's, and a correct database will make that check report
--     FAILED. The replacement query is written inside phase-2a-tests.sql itself,
--     and the instruction there stands: apply it when the upload field goes
--     live, not before. <==
--
--
-- ==> AND THIS FILE HAS TWO OF ITS OWN THAT EXPIRE THE SAME WAY. CHECK 10 AND
--     CHECK 11 ARE POINT-IN-TIME COUNTS, NOT INVARIANTS.
--
--     They hardcode 32 scored sessions and 5 assignments, which are the numbers
--     measured immediately before this migration. Their job is to prove THIS
--     MIGRATION deleted nothing, and for that one moment an exact number is the
--     right check: "about the same" would not catch a row quietly disappearing.
--
--     THEY GO RED ON A HEALTHY DATABASE THE MOMENT ANYTHING ELSE HAPPENS. The
--     2b-1 proof run itself creates two assignments in B1 and scores a session,
--     so re-running this file DURING the proof reports FAILED on both and
--     nothing is wrong. After 2b-2, every assignment Tom creates moves check 11
--     and every graded submission moves check 10, permanently.
--
--     SO: run this file once, straight after the migration, and read its verdict
--     then. If you are reading a FAILED on 10 or 11 at any later date, compare
--     the number against what has happened since rather than treating it as a
--     defect. This is written down for the same reason the check 16 note is: a
--     later session that finds red here and does not know why will go looking
--     for a bug that is not there. <==


with
shapes as (
  select
    count(*) filter (where jsonb_exists(items->0, 'levels'))     as levels_rubrics,
    count(*) filter (where jsonb_exists(items->0, 'applies_to')) as legacy_rubrics,
    count(*)                                                     as all_rubrics
  from public.rubrics
),

-- The property the whole contract for this session rests on: not one assignment
-- can resolve a rubric, so not one thing in the app is graded.
gradable as (
  select count(*) as n from public.assignments where rubric_id is not null
),

-- A rubric an assignment CAN reach that is not a levels rubric would be the one
-- thing this piece must not leave behind, because the scorer refuses it and the
-- assignment would look graded and never score. Expected 0, and today it is 0
-- for the stronger reason that the row above is 0.
unreadable as (
  select count(*) as n
  from public.assignments a
  join public.rubrics r on r.id = a.rubric_id
  where not jsonb_exists(r.items->0, 'levels')
),

constraints as (
  select
    count(*) filter (where conname = 'assignments_rubric_same_class_fkey') as assignments_fk,
    count(*) filter (where conname = 'scenarios_rubric_same_class_fkey')   as scenarios_fk,
    count(*) filter (where conname = 'rubrics_max_total_positive')         as max_total_rule
  from pg_constraint
),

fn as (
  select count(*) as n
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_assignment_with_rubric'
)

select * from (
  -- ==> THE CONTRACT. This session's whole visible effect is this number. <==
  select
    1 as sort_order,
    'CHECK 1  assignments carrying a rubric (the app scores nothing)' as check_name,
    '0'                                   as expected,
    (select n::text from gradable)        as actual,
    case when (select n from gradable) = 0
         then 'PASSED' else 'FAILED' end  as verdict

  union all
  -- NOTHING WAS DESTROYED. The seeded rubric row is still there, which is what
  -- makes the revert possible and what keeps the historical scores labellable.
  select 2, 'CHECK 2  the Great Northwoods rubric row still exists', '1',
         (select legacy_rubrics::text from shapes),
         case when (select legacy_rubrics from shapes) = 1 then 'PASSED' else 'FAILED' end

  union all
  select 3, 'CHECK 3  rubric rows in total (unchanged)', '1',
         (select all_rubrics::text from shapes),
         case when (select all_rubrics from shapes) = 1 then 'PASSED' else 'FAILED' end

  union all
  -- scenarios.rubric_id is untouched by this piece and both scenarios still name
  -- their rubric. This is what keeps the Great Northwoods row alive through
  -- scenarios_rubric_same_class_fkey, and it is the source the revert reads.
  select 4, 'CHECK 4  scenarios still naming a rubric', '2',
         (select count(*)::text from public.scenarios where rubric_id is not null),
         case when (select count(*) from public.scenarios where rubric_id is not null) = 2
              then 'PASSED' else 'FAILED' end

  union all
  select 5, 'CHECK 5  no assignment can reach a non-levels rubric', '0',
         (select n::text from unreadable),
         case when (select n from unreadable) = 0 then 'PASSED' else 'FAILED' end

  union all
  -- The three rules Phase 2a and Gate 4a added are all still in place. This file
  -- drops nothing, so any of these reading 0 means something else did.
  select 6, 'CHECK 6  assignments_rubric_same_class_fkey intact', '1',
         (select assignments_fk::text from constraints),
         case when (select assignments_fk from constraints) = 1 then 'PASSED' else 'FAILED' end

  union all
  select 7, 'CHECK 7  scenarios_rubric_same_class_fkey intact', '1',
         (select scenarios_fk::text from constraints),
         case when (select scenarios_fk from constraints) = 1 then 'PASSED' else 'FAILED' end

  union all
  select 8, 'CHECK 8  rubrics_max_total_positive intact', '1',
         (select max_total_rule::text from constraints),
         case when (select max_total_rule from constraints) = 1 then 'PASSED' else 'FAILED' end

  union all
  -- 2b-2 needs this function to attach an uploaded rubric atomically. Confirmed
  -- here because a piece that touches rubrics is exactly when it would go
  -- missing by accident.
  select 9, 'CHECK 9  create_assignment_with_rubric() still exists', '1',
         (select n::text from fn),
         case when (select n from fn) = 1 then 'PASSED' else 'FAILED' end

  union all
  -- ==> NO STUDENT WORK WAS TOUCHED. The migration writes to one column on
  --     public.assignments and nothing else. Every stored score is still stored;
  --     what changed is that the STUDENT results page no longer displays them,
  --     because their assignment no longer names a rubric. That is the accepted
  --     consequence, and the number below is the one it was accepted against. <==
  -- POINT IN TIME, NOT AN INVARIANT. See the note at the top of this file.
  select 10, 'CHECK 10  sessions still scored (nothing lost, as at the migration)', '32',
         (select count(*)::text from public.sessions where status = 'scored'),
         case when (select count(*) from public.sessions where status = 'scored') = 32
              then 'PASSED' else 'FAILED  investigate before doing anything else' end

  union all
  -- POINT IN TIME, NOT AN INVARIANT. See the note at the top of this file.
  select 11, 'CHECK 11  assignments in total (nothing deleted, as at the migration)', '5',
         (select count(*)::text from public.assignments),
         case when (select count(*) from public.assignments) = 5 then 'PASSED' else 'FAILED' end

  union all
  -- Not a check. It reads 0 until 2b-2, and it is the number that says the
  -- upload half has started working.
  select 12, 'INFORMATION  uploaded (levels) rubrics stored', 'see actual',
         (select levels_rubrics::text from shapes), 'not a check'

  union all
  -- Not a check either, and recorded here because the 2b-1 kickoff asserted
  -- there were none. There are, they are pre-Stage-7 test practices, and the
  -- rule that governs them is written into the code and PROJECT_STATE: a session
  -- with no assignment is conversation-only.
  select 13, 'INFORMATION  sessions with no assignment_id', 'see actual',
         (select count(*)::text from public.sessions where assignment_id is null), 'not a check'
) as checks
order by sort_order;
