-- Relii Phase 2b-2. UNDOING THE SCORING-FAILURE PROBE. Two statements.
--
-- ==> WHY THIS IS NEEDED AT ALL, WHICH WAS NOT FORESEEN WHEN THE PROBE WAS
--     WRITTEN. The probe's stated revert was "delete the throwaway assignment,
--     which takes its orphaned rubric with it". THAT IS BLOCKED, and the reason
--     is a real property of the app rather than an accident of this run:
--
--       A PRACTICE WHOSE SCORING FAILED SITS AT status = 'completed' ON A GRADED
--       ASSIGNMENT, AND NOTHING IN THE APP WILL SHOW IT OR DELETE IT. The student
--       home deliberately filters it out (app/student/page.tsx says so in a
--       comment: it must stay out of that list). It is not a submission, so no
--       instructor surface lists it either. And an assignment that still has any
--       session cannot be deleted with the ordinary confirm: it demands the
--       instructor type the word DELETE.
--
--     So the throwaway assignment cannot be cleaned up while that session exists,
--     and the session cannot be removed through any interface.
--
-- ==> THE ROUTE TAKEN, AND WHY IT IS THE HONEST ONE. Put the levels back, then
--     have the student press End again on that same session. The scorer succeeds,
--     the practice becomes an ordinary scored practice, it appears on the student
--     home, and the student deletes it with the app's own control. The assignment
--     then deletes with the plain two-step confirm and takes its rubric with it.
--
--     THE ALTERNATIVE WAS TO DELETE THE SESSION ROW WITH SQL, and it was refused:
--     it would clean up the evidence of a state the app cannot reach, using a
--     path no user has, and it would leave the "or try again" half of the
--     student-facing message unexecuted. This route exercises it instead.
--
-- ==> WHAT IT TOUCHES: the same one rubric row the probe broke, putting back the
--     exact six levels the probe's statement 1 printed before removing them.
--     Statement 2 below carries them literally, copied from that output.


-- ---------------------------------------------------------------------------
-- STATEMENT 1 of 2. READ ONLY. What is actually sitting on that assignment.
-- ---------------------------------------------------------------------------
-- Ids and statuses only. No transcript, no score, no student-authored content.
select
  s.id            as session_id,
  s.kind          as kind,
  s.status        as status,
  s.score_total   as score_total,
  a.title         as assignment_title
from public.sessions s
join public.assignments a on a.id = s.assignment_id
join public.classes c on c.id = a.class_id
where a.title = 'ZZ 2b2 scoring failure'
  and c.name = 'B1: A demo class';


-- ---------------------------------------------------------------------------
-- STATEMENT 2 of 2. THE RESTORE. Puts the six levels back on criterion 5.
-- ---------------------------------------------------------------------------
-- The array is verbatim from the probe's statement 1 output, which was read and
-- kept before anything was changed. `criterion_now_has_levels` must read true and
-- `levels_restored` must read 6.
update public.rubrics r
set items = jsonb_set(
  r.items,
  '{4,levels}',
  '[{"name":"Excellent","points":5,"descriptor":"Ready for an entry-level sales role."},
    {"name":"Proficient","points":4.5,"descriptor":"Emerging professional skills"},
    {"name":"Developing","points":4,"descriptor":"Growth opportunity"},
    {"name":"Limited","points":3.5,"descriptor":"Partially conducted this aspect"},
    {"name":"Minimal","points":2.5,"descriptor":"Initial effort shown"},
    {"name":"Unsatisfactory","points":0.5,"descriptor":"No effort shown or does not meet expectations"}]'::jsonb
)
where r.id = '3eb004e8-d654-4102-9e70-2cc30af76942'::uuid
returning
  r.id                                          as rubric_id,
  r.items -> 4 ->> 'name'                       as criterion_restored,
  jsonb_exists(r.items -> 4, 'levels')          as criterion_now_has_levels,
  jsonb_array_length(r.items -> 4 -> 'levels')  as levels_restored;
