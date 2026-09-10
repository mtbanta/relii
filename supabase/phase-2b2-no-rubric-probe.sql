-- Relii Phase 2b-2. THE NO-RUBRIC PROBE. Three statements, run one at a time.
--
-- ==> WHY THIS EXISTS. Decision B of this session says that when a submission's
--     assignment names no rubric, the instructor page states that the score
--     cannot be itemized instead of listing internal ids, and the CSV carries one
--     matching line in its header block. BOTH OF THOSE ARE BRANCHES NOTHING HAS
--     EXECUTED. The 32 stored scores that are in exactly that state all live in
--     another instructor's class, and B1 holds no historical submission, so the
--     live run cannot reach either branch by ordinary means.
--
--     A branch that ships unexecuted is the thing this project keeps paying for.
--     This detaches the rubric from the test assignment for as long as it takes
--     to look at two screens, then puts it back.
--
-- ==> WHAT IT TOUCHES: one column, on one assignment, created for this session.
--     `assignments.rubric_id` on "ZZ 2b2 graded (Discovery)" in B1. No rubric row
--     is edited or deleted, no session is touched, and the stored score stays
--     exactly as it is: the point of the exercise is that the SCORE survives while
--     the rubric that explains it cannot be resolved.
--
-- ==> THE REVERT PATH, STATED BEFORE ANYTHING IS APPLIED. Statement 3 puts the
--     same rubric id back, and it reads that id from statement 1's output rather
--     than from anywhere it could drift. Statement 1 must therefore be run and
--     its output kept BEFORE statement 2 is run.
--
--     ==> AND THE REASON THE REVERT IS NOT OPTIONAL HERE, WHICH IS EASY TO MISS.
--         Cleanup deletes this assignment at the end of the session, and the app
--         cleans up a rubric that nothing references at that moment
--         (deleteRubricIfUnused, 2a's "orphan" branch). If the assignment is
--         deleted while detached, THE RUBRIC ROW IS NOT SEEN AS ORPHANED BY
--         ANYTHING AND SURVIVES, leaving B1 with 1 rubric instead of its
--         baseline 0. The re-attach is what keeps the cleanup honest. <==


-- ---------------------------------------------------------------------------
-- STATEMENT 1 of 3. READ ONLY. Run this on its own and KEEP THE OUTPUT.
-- ---------------------------------------------------------------------------
-- rubric_id here is the value statement 3 restores.
select
  a.id           as assignment_id,
  a.title        as assignment_title,
  c.name         as class_name,
  a.rubric_id    as rubric_id,
  r.name         as rubric_name
from public.assignments a
join public.classes c on c.id = a.class_id
left join public.rubrics r on r.id = a.rubric_id
where a.title = 'ZZ 2b2 graded (Discovery)'
  and c.name = 'B1: A demo class';


-- ---------------------------------------------------------------------------
-- STATEMENT 2 of 3. DETACH. The submission keeps its score; the rubric behind
-- it stops being resolvable.
-- ---------------------------------------------------------------------------
update public.assignments a
set rubric_id = null
where a.id = (
  select a2.id
  from public.assignments a2
  join public.classes c on c.id = a2.class_id
  where a2.title = 'ZZ 2b2 graded (Discovery)'
    and c.name = 'B1: A demo class'
)
returning a.id as assignment_id, a.title, a.rubric_id as rubric_id_now;


-- ---------------------------------------------------------------------------
-- STATEMENT 3 of 3. RE-ATTACH. Run this as soon as the two screens have been
-- looked at. Paste the rubric_id from statement 1 in place of PUT_RUBRIC_ID_HERE.
-- ---------------------------------------------------------------------------
-- It is written with the id spelled out rather than re-derived, so that it
-- restores THE ROW THAT WAS THERE and cannot quietly attach something else if
-- anything has changed in between.
update public.assignments a
set rubric_id = 'PUT_RUBRIC_ID_HERE'::uuid
where a.id = (
  select a2.id
  from public.assignments a2
  join public.classes c on c.id = a2.class_id
  where a2.title = 'ZZ 2b2 graded (Discovery)'
    and c.name = 'B1: A demo class'
)
returning a.id as assignment_id, a.title, a.rubric_id as rubric_id_now;
