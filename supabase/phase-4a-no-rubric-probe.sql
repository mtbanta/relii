-- Relii Phase 4a. THE NO-RUBRIC PROBE. Three statements, run one at a time.
--
-- It is supabase/phase-2b2-no-rubric-probe.sql with one title changed, and it is
-- a copy rather than a re-use because the assignment it names is this phase's
-- throwaway and not that one's. The reasoning below is 2b-2's, still true.
--
-- ==> WHY IT EXISTS. Phase 4a has a branch that says an instructor CANNOT review
--     a score whose assignment names no rubric: the editor does not render and
--     the route refuses in plain words. That is exactly the shape of thing that
--     ships unexecuted. The 32 stored scores genuinely in that state all live in
--     another instructor's class, and this phase is confined to B1, so the live
--     run cannot reach the branch by ordinary means.
--
--     A BRANCH THAT SHIPS UNEXECUTED IS THE THING THIS PROJECT KEEPS PAYING FOR.
--     This detaches the rubric from the throwaway assignment for as long as it
--     takes to look at one screen and send one request, then puts it back.
--
-- ==> BOTH HALVES ARE MEASURED, NOT JUST THE SCREEN. The page hiding the editor
--     and the route refusing the request are two different rules, and a screen
--     that hides a control in front of a route that would have accepted the
--     request is a rule enforced by nothing. So while it is detached: look at
--     the page AND post to /api/instructor/submission/<id>/review.
--
-- ==> WHAT IT TOUCHES: one column, on one assignment, created for this session.
--     `assignments.rubric_id` on "ZZ 4a review (Discovery)" in B1. No rubric row
--     is edited or deleted, no session is touched, and the stored score stays
--     exactly as it is: the point is that the SCORE survives while the rubric
--     that explains it cannot be resolved.
--
-- ==> RUN IT AFTER THE CLASS EXPORT, NOT BEFORE. Detaching a rubric changes the
--     assignments section of the class snapshot, so an export taken on either
--     side of this describes a different class and its fingerprint moves for a
--     reason that has nothing to do with reviews.
--
-- ==> AND THE REASON THE RE-ATTACH IS NOT OPTIONAL, WHICH IS EASY TO MISS.
--     Cleanup deletes this assignment at the end of the session, and the app
--     cleans up a rubric that nothing references at that moment
--     (deleteRubricIfUnused, 2a's "orphan" branch). If the assignment is deleted
--     while detached, THE RUBRIC ROW IS NOT SEEN AS ORPHANED BY ANYTHING AND
--     SURVIVES, leaving B1 with 1 rubric instead of its baseline 0. The
--     re-attach is what keeps the cleanup honest.


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
where a.title = 'ZZ 4a review (Discovery)'
  and c.name = 'B1: A demo class';


-- ---------------------------------------------------------------------------
-- STATEMENT 2 of 3. DETACH. The submission keeps its score; the rubric behind
-- it stops being resolvable, so there are no performance levels to choose from.
-- ---------------------------------------------------------------------------
update public.assignments a
set rubric_id = null
where a.id = (
  select a2.id
  from public.assignments a2
  join public.classes c on c.id = a2.class_id
  where a2.title = 'ZZ 4a review (Discovery)'
    and c.name = 'B1: A demo class'
)
returning a.id as assignment_id, a.title, a.rubric_id as rubric_id_now;


-- ---------------------------------------------------------------------------
-- STATEMENT 3 of 3. RE-ATTACH. Run this as soon as the screen and the refused
-- request have been recorded. Paste the rubric_id from statement 1 in place of
-- PUT_RUBRIC_ID_HERE.
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
  where a2.title = 'ZZ 4a review (Discovery)'
    and c.name = 'B1: A demo class'
)
returning a.id as assignment_id, a.title, a.rubric_id as rubric_id_now;
