-- Relii Phase 3a. THE SCORING-FAILURE PROBE, REUSED FROM 2b-2 AND AIMED TWICE.
-- Statements are run ONE AT A TIME, and statement 1 is read and KEPT before
-- statement 2 is applied.
--
-- ==> WHAT THIS IS FOR. Fix 1 and Fix 2 both need a REAL scoring failure, and a
--     real scoring failure is the only honest way to reach a graded practice
--     sitting at 'completed' with no score. The way in is to break a rubric the
--     scorer will meet: strip the performance levels off one criterion, and
--     lib/scoring.ts refuses with "The criterion ... has no performance levels.
--     This is not a levels rubric."
--
-- ==> WHAT IT DELIBERATELY DOES NOT DO: fake a session's status. Nothing in this
--     file touches the sessions table. The kickoff forbids it and the reason is
--     the one that matters: a manufactured status proves the SCREEN can draw a
--     message, which nobody doubts. What needs proving is that the real failure
--     path reaches the real student, and after a RELOAD.
--
-- ==> IT IS AIMED TWICE, AT TWO THROWAWAY ASSIGNMENTS CREATED FOR IT, because
--     the two fixes need opposite things from the same broken state:
--
--       'ZZ 3a fix1'  is broken, used to produce the retry screen, and then
--                     RESTORED (see phase-3a-fix1-restore.sql) so the retry can
--                     be pressed and succeed. Fix 1 needs the failure to end.
--
--       'ZZ 3a fix2'  is broken and LEFT BROKEN, so its voice practice stays at
--                     'completed' with a real recording and is still unfinished
--                     when the plain delete runs. Fix 2 needs the failure to
--                     persist.
--
--     They are separate assignments with separate uploaded rubric rows, so
--     restoring one cannot repair the other. Each WHERE clause names the
--     assignment by title AND requires it to be in B1.
--
-- ==> THE REVERT PATH, STATED BEFORE ANYTHING IS APPLIED.
--
--     FOR 'ZZ 3a fix1': phase-3a-fix1-restore.sql puts the levels back, using
--     the array statement 1 below prints. Run statement 1 FIRST and keep its
--     output; that is the only reason it exists and it is the only restore
--     material there is.
--
--     FOR 'ZZ 3a fix2': THE REVERT IS THE FIX ITSELF, and this is the neat part.
--     The plain delete removes the assignment and deleteRubricIfUnused takes the
--     orphaned broken rubric row with it. Nothing needs putting back, because
--     nothing survives. That is exactly the cleanup 2b-2 could NOT perform,
--     which is why supabase/phase-2b2-scoring-failure-restore.sql had to exist
--     at all: the plain delete is the repair for the state that file was written
--     to work around.
--
--     BACKSTOP FOR BOTH: B1 held 0 rubrics at baseline. Both throwaway rubrics
--     must be gone at the end, so re-running statement 3 of phase-3a-baseline
--     .sql and reading rubrics = 0 is the end-state assertion for this file.
--
--     NOTHING ELSE IS READABLE OR WRITABLE FROM THESE STATEMENTS. No session, no
--     transcript, no score, no student-authored content.
--
-- ==> ON :'assignment_title' BELOW. That is psql's variable syntax and the
--     Supabase MCP does not expand it. Each statement is run with the literal
--     title pasted in ('ZZ 3a fix1' or 'ZZ 3a fix2'), and the run is recorded
--     with the literal it was run with. The placeholder is here so the file
--     reads as one probe aimed twice rather than as two near-identical files
--     that could drift apart in their WHERE clauses, which is the failure mode
--     this project keeps meeting.


-- ---------------------------------------------------------------------------
-- STATEMENT 1. READ ONLY. Run on its own and KEEP THE OUTPUT. Restore material.
-- ---------------------------------------------------------------------------
-- Names the row about to be changed and prints the exact levels array that
-- statement 2 removes. Set the title to whichever throwaway is being broken.
select
  r.id                              as rubric_id,
  r.name                            as rubric_name,
  a.title                           as attached_to,
  c.name                            as class_name,
  jsonb_array_length(r.items)       as criteria_count,
  r.items -> 4 ->> 'name'           as criterion_to_break,
  r.items -> 4 -> 'levels'          as levels_that_will_be_removed
from public.rubrics r
join public.assignments a on a.rubric_id = r.id
join public.classes c on c.id = a.class_id
where a.title = :'assignment_title'
  and c.name = 'B1: A demo class';


-- ---------------------------------------------------------------------------
-- STATEMENT 2. THE ONE WRITE. Only after statement 1 has been read and kept.
-- ---------------------------------------------------------------------------
-- Removes the "levels" key from criterion 5 of that one rubric (index 4 in the
-- items array, which is Communication Skills in Tom's Discovery file). The
-- criterion itself STAYS, which is what makes this the exact shape the scorer's
-- refusal exists for: a criterion that is present and has no ladder.
--
-- The `returning` clause makes the result readable rather than a bare row count:
-- exactly ONE row, whose criterion_now_has_levels reads false.
update public.rubrics r
set items = r.items #- '{4,levels}'
where r.id = (
  select r2.id
  from public.rubrics r2
  join public.assignments a on a.rubric_id = r2.id
  join public.classes c on c.id = a.class_id
  where a.title = :'assignment_title'
    and c.name = 'B1: A demo class'
)
returning
  r.id                                        as rubric_id,
  r.items -> 4 ->> 'name'                     as criterion_broken,
  jsonb_exists(r.items -> 4, 'levels')        as criterion_now_has_levels,
  jsonb_array_length(r.items)                 as criteria_still_present;
