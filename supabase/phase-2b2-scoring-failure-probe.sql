-- Relii Phase 2b-2. THE SCORING-FAILURE PROBE. Two statements, run one at a time.
--
-- ==> WHAT THIS IS FOR. The student-facing note "The AI scoring encountered a
--     problem. Ask your instructor to provide a score or try again." has to be
--     EXECUTED rather than described, which means making the scorer genuinely
--     refuse. The honest way in is to break a rubric the scorer will meet: strip
--     the performance levels off one criterion, and lib/scoring.ts refuses with
--     "The criterion ... has no performance levels. This is not a levels rubric."
--
-- ==> WHAT IT DELIBERATELY DOES NOT DO: fake a session's status. Nothing here
--     touches sessions. A manufactured status would prove that the SCREEN can
--     draw the message, which nobody doubts; what needs proving is that the real
--     failure path reaches the real student.
--
-- ==> IT TOUCHES ONE ROW, AND THAT ROW WAS CREATED FOR IT AN HOUR AGO.
--     "ZZ 2b2 scoring failure" is a throwaway assignment in B1 carrying its own
--     uploaded copy of the Discovery rubric. The rubric attached to the OTHER
--     test assignment ("ZZ 2b2 graded (Discovery)"), which holds the run that
--     scored 69 out of 100 and the submitted one, is not touched: the WHERE
--     clause names the assignment by title AND requires it to be in B1, and the
--     two rubric rows are separate uploads.
--
-- ==> THE REVERT PATH, STATED BEFORE ANYTHING IS APPLIED.
--
--     PRIMARY: delete the "ZZ 2b2 scoring failure" assignment through the
--     instructor interface at the end of the session. Deleting it takes the
--     orphaned rubric row with it (2a's "orphan" branch, executed and proved in
--     that session), so the broken row ceases to exist. This is the intended
--     path and it needs no SQL at all.
--
--     IF THE ROW EVER HAS TO BE PUT BACK INSTEAD: statement 1 below prints the
--     original levels array for the criterion statement 2 breaks. Putting it
--     back is one jsonb_set with that array. Run statement 1 FIRST and keep its
--     output; that is the only reason it exists.
--
--     NOTHING ELSE IN THE DATABASE IS READABLE OR WRITABLE FROM THESE TWO
--     STATEMENTS. No session, no transcript, no student-authored content.


-- ---------------------------------------------------------------------------
-- STATEMENT 1 of 2. READ ONLY. Run this on its own and keep the output.
-- ---------------------------------------------------------------------------
-- It names the row about to be changed and prints the exact levels array that
-- statement 2 removes, which is the revert material.
select
  r.id                              as rubric_id,
  r.name                            as rubric_name,
  a.title                           as attached_to,
  c.name                            as class_name,
  r.items -> 4 ->> 'name'           as criterion_to_break,
  r.items -> 4 -> 'levels'          as levels_that_will_be_removed
from public.rubrics r
join public.assignments a on a.rubric_id = r.id
join public.classes c on c.id = a.class_id
where a.title = 'ZZ 2b2 scoring failure'
  and c.name = 'B1: A demo class';


-- ---------------------------------------------------------------------------
-- STATEMENT 2 of 2. THE ONE WRITE. Run it only after statement 1 has been read.
-- ---------------------------------------------------------------------------
-- Removes the "levels" key from criterion 5 of that one rubric (index 4 in the
-- items array, which is Communication Skills in Tom's Discovery file). The
-- criterion itself stays, which is what makes this the shape the scorer's
-- refusal exists for: a criterion that is present and has no ladder.
--
-- The `returning` clause makes the result readable rather than a bare row count:
-- it should return exactly ONE row, whose criterion_now_has_levels reads false.
update public.rubrics r
set items = r.items #- '{4,levels}'
where r.id = (
  select r2.id
  from public.rubrics r2
  join public.assignments a on a.rubric_id = r2.id
  join public.classes c on c.id = a.class_id
  where a.title = 'ZZ 2b2 scoring failure'
    and c.name = 'B1: A demo class'
)
returning
  r.id                                        as rubric_id,
  r.items -> 4 ->> 'name'                     as criterion_broken,
  jsonb_exists(r.items -> 4, 'levels')        as criterion_now_has_levels,
  jsonb_array_length(r.items)                 as criteria_still_present;
