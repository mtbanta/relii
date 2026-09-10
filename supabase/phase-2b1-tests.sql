-- Relii Phase 2b-1: THE CHECKS. Run this AFTER the migration.
--
-- IT CHANGES NOTHING. Every statement only reads.
--
-- WHAT YOU SHOULD SEE: one row per check, every verdict reading PASSED, plus a
-- few counts that are not checks. If any verdict reads FAILED, STOP and show it
-- to Claude. Do not repair anything by hand.
--
--
-- ==> THE NOTE THAT USED TO BE HERE WAS WRONG, AND PHASE 2b-2 CORRECTED IT ON
--     2026-09-10. IT IS REWRITTEN RATHER THAN DELETED BECAUSE THE ERROR IS MORE
--     USEFUL THAN THE CORRECTION.
--
--     IT SAID: check 16 of supabase/phase-2a-tests.sql ("every assignment's
--     rubric matches its scenario's") passes VACUOUSLY after this migration,
--     because no assignment carries a rubric at all, and that it would expire
--     for real in 2b-2 when Tom attaches his first one.
--
--     THE FIRST HALF WAS FALSE THE MOMENT THIS MIGRATION RAN. That check counts
--     assignments whose SCENARIO carries a rubric and whose own rubric `is
--     distinct from` it, and `null is distinct from <uuid>` is TRUE in SQL. This
--     migration set every assignments.rubric_id to null, so it did not empty the
--     count, it FILLED it. Measured on 2026-09-10 by
--     supabase/phase-2b2-preflight.sql: 2 rows, on a database in exactly the
--     state 2b-1 intended.
--
--     SO THE CHECK SPENT A WHOLE PHASE REPORTING FAILED ON CORRECT DATA while
--     two handoff documents said it was green, because both were written from
--     the sentence describing the check rather than from the query. 2b-2 applied
--     the replacement, and the corrected note lives in phase-2a-tests.sql beside
--     it. Nothing here needs re-running on that account.
--
--     THE TRANSFERABLE PART: prose describing a check is not the check, and a
--     handoff that quotes the prose inherits whatever the prose got wrong. Read
--     the query. <==
--
--
-- ==> CHECKS 10 AND 11 WERE POINT-IN-TIME COUNTS AND PHASE 2b-2 TURNED THEM INTO
--     INFORMATION ROWS ON 2026-09-10. THEY NO LONGER CARRY A VERDICT.
--
--     They hardcoded 32 scored sessions and 5 assignments, the numbers measured
--     immediately before this migration. Their job was to prove THIS MIGRATION
--     deleted nothing, and for that one moment an exact number was the right
--     check: "about the same" would not catch a row quietly disappearing.
--
--     THAT MOMENT HAS PASSED AND CANNOT COME BACK. The migration ran on
--     2026-09-10 and its verdict was read then, which is recorded in
--     PROJECT_STATE. From 2b-2 onward every assignment Tom creates moves the
--     second number and every graded submission moves the first, permanently and
--     correctly. A check that can only ever go red from here is not a check; it
--     is a trap for whoever runs this file next, and this session had just
--     finished paying for exactly that with check 16 above.
--
--     WHY INFORMATION AND NOT A LOOSER CHECK. "At least 32" was the obvious
--     alternative and it is worse: it would go red on a legitimate cleanup (this
--     session's own proof run creates rows in B1 and deletes them again), and a
--     threshold nobody can act on trains a reader to click past a red verdict.
--     What these two numbers are actually good for now is COMPARISON, so they
--     print the migration-day baseline in the label and the live count beside it,
--     and the reader does the subtraction knowing what has happened since. <==


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
  -- NOT A CHECK SINCE 2b-2. See the note at the top of this file. The number in
  -- the label is what this read returned on migration day; the actual column is
  -- what it returns now, and every scored submission since then moves it up.
  select 10, 'INFORMATION  sessions scored (32 on migration day, 2026-09-10)', 'compare, do not judge',
         (select count(*)::text from public.sessions where status = 'scored'),
         'not a check'

  union all
  -- NOT A CHECK SINCE 2b-2. See the note at the top of this file. Every
  -- assignment created since migration day moves this up, which is the upload
  -- field working rather than anything being wrong.
  select 11, 'INFORMATION  assignments in total (5 on migration day, 2026-09-10)', 'compare, do not judge',
         (select count(*)::text from public.assignments),
         'not a check'

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
