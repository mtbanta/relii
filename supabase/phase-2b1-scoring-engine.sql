-- Relii Phase 2b-1: THE SCORING ENGINE. The schema half.
--
-- RUN supabase/phase-2b1-preflight.sql FIRST and read its output. This file
-- assumes CHECK 1 there read exactly 2.
--
-- THE REVERT IS supabase/phase-2b1-scoring-engine-revert.sql. It undoes only
-- what this file does and nothing else. Read it before you run this one.
--
--
-- WHAT THIS FILE DOES, in plain English: it detaches the rubric from the two
-- assignments that carry one, so that no assignment in the app is graded.
--
-- ==> WHEN THIS RUNS, THE APP SCORES NOTHING, AND THAT IS THE INTENDED STATE,
--     NOT AN ACCIDENT.
--
--     Scoring has just moved from the scenario's rubric to the assignment's.
--     No assignment will carry one, because the upload control does not turn on
--     until Phase 2b-2. So every assignment becomes conversation-only: students
--     can hold the role-play and read the transcript, and nothing is graded.
--
--     IT IS SAFE. No real student exists yet, everything on the platform is
--     demo and test data, and Tom's students register the week of 2026-09-14.
--     IT IS NOT SAFE TO LEAVE SITTING. 2b-2 follows immediately. <==
--
--
-- ==> WHY DETACH RATHER THAN TEACH THE READERS TO TELL TWO SHAPES APART.
--
--     rubrics.items has been able to hold two different shapes since Phase 2a:
--     the legacy 29 flat items, and the criteria-with-levels shape the upload
--     parser writes. Both are arrays, so the check constraint accepts either and
--     NOTHING IN THE DATABASE DISTINGUISHES THEM.
--
--     That was safe while every reader resolved its rubric through
--     scenarios.rubric_id, because 2a never wrote that column. The moment
--     grading reads assignments.rubric_id instead, a reader could receive either
--     shape and would have to guess.
--
--     The owner's ruling is to CUT THE SECOND SHAPE OUT OF REACH instead. After
--     this file runs, every rubric any reader can resolve is a levels rubric.
--     THERE IS NO DISCRIMINATOR AND NO SECOND CODE PATH, AND THAT IS THE POINT.
--     Do not add one. <==
--
--
-- NOTHING IS DESTROYED. The Great Northwoods rubric row survives untouched,
-- because both scenarios still reference it through
-- scenarios_rubric_same_class_fkey. Every stored score stays exactly as it is.
-- What changes is that the Alex and Jordan results pages become
-- conversation-only, which hides 32 historical scores from the STUDENT view
-- while leaving them in the database and still visible to an instructor. The
-- owner accepted that explicitly, against that number.
--
--
-- ==> THIS FILE IS NOT SAFE TO RUN TWICE, AND THAT IS DELIBERATE. IT DISARMS
--     ITSELF.
--
--     Almost every migration in this project says it is safe to re-run. This one
--     says the opposite, for one specific reason: AFTER PHASE 2b-2 SHIPS, TOM
--     WILL HAVE ATTACHED REAL RUBRICS, AND A RE-RUN OF THE STATEMENT BELOW WOULD
--     NULL EVERY ONE OF THEM. That is a silent, total loss of instructor work.
--
--     So the guard refuses unless the count is EXACTLY 2, which is true only in
--     the narrow window this file was written for. A second run raises and
--     changes nothing. A run after 2b-2 raises and changes nothing.
--
--     A FILE THAT FAILS LOUDLY IS STRICTLY BETTER THAN ONE THAT SUCCEEDS AND
--     QUIETLY REVERTS SOMETHING, which is already this project's stated rule
--     (see PROJECT_STATE Open Issues on the migration files that silently
--     un-scope the isolation gate). This is that rule applied on purpose rather
--     than discovered afterwards. <==


-- ---------------------------------------------------------------------------
-- 1. THE GUARD AND THE UPDATE, IN ONE STATEMENT.
-- ---------------------------------------------------------------------------
-- ==> THEY ARE IN THE SAME do BLOCK ON PURPOSE, AND NOT MERELY FOR TIDINESS. A
--     raise inside a do block aborts that whole statement, so the update it
--     contains is rolled back with it. Written as a separate guard statement
--     followed by a separate update, the two would depend on the surrounding
--     transaction behaving as expected, which is an assumption about the tool
--     running the file rather than a property of the file. This way the
--     all-or-nothing is guaranteed by the file itself. <==
do $$
declare
  v_attached integer;
  v_updated  integer;
begin
  select count(*) into v_attached
    from public.assignments
   where rubric_id is not null;

  if v_attached <> 2 then
    raise exception
      'Phase 2b-1 stop: expected exactly 2 assignments carrying a rubric, found %.', v_attached
      using hint =
        'If this reads 0, this migration has already run and there is nothing to do. '
        'If it reads more than 2, rubrics have been attached since Phase 2a and this '
        'file must NOT be run: it would detach every one of them. Stop and re-read the '
        'file with the owner.';
  end if;

  -- The whole of the change. One statement.
  update public.assignments
     set rubric_id = null
   where rubric_id is not null;

  get diagnostics v_updated = row_count;
  raise notice 'Phase 2b-1: detached % assignment(s) from their rubric. The app now scores nothing, which is the intended state until 2b-2.', v_updated;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. THE COMMENTS. What the columns mean from here.
-- ---------------------------------------------------------------------------
-- 2a wrote a comment on this column saying the authoritative rubric for a graded
-- submission is assignments.rubric_id. That was true of the DESIGN then and is
-- true of the CODE now, so the comment is extended rather than replaced.
comment on column public.scenarios.rubric_id is
  'DELIBERATELY RETAINED, NO LONGER AUTHORITATIVE FOR GRADING. From Phase 2b-1 '
  'the application reads assignments.rubric_id and nothing reads this column to '
  'decide a grade. It stays because the Phase 2a backfill and the Phase 2b-1 '
  'revert both read it, because scenarios_rubric_same_class_fkey depends on it, '
  'and because historical scores were produced against the rubric it names. Do '
  'not drop it as a cleanup.';

comment on column public.assignments.rubric_id is
  'THE authoritative rubric for grading, since Phase 2b-1. Null means the '
  'assignment is conversation-only: practised but never scored. Null is '
  'deliberate: assignments_rubric_same_class_fkey is MATCH SIMPLE, so a null '
  'here exempts the row from the same-class rule rather than weakening it. '
  'Phase 2b-1 set every existing row to null, so the app scores nothing until '
  'Phase 2b-2 turns the rubric upload control on.';

-- ==> THE SENTENCE THAT MATTERS MOST IS ON items, BECAUSE items IS WHERE THE
--     AMBIGUITY LIVED AND WHERE SOMEBODY WOULD OTHERWISE GO LOOKING FOR A
--     VERSION FIELD. <==
comment on column public.rubrics.items is
  'The grading criteria, as a JSON array. SINCE PHASE 2b-1 THERE IS EXACTLY ONE '
  'SHAPE IN REACH: weighted criteria, each carrying six performance levels with '
  'their own points. The older flat shape (29 items with applies_to and meetings '
  'tags) still exists on the seeded Great Northwoods row, but no assignment '
  'points at it, so no reader can resolve it. THERE IS NO DISCRIMINATOR AND NO '
  'SECOND CODE PATH, AND THAT IS THE POINT: do not add a version field or a '
  'shape probe. The scorer REFUSES a rubric whose criteria carry no levels, '
  'which is the backstop, not an invitation to support both.';


-- ---------------------------------------------------------------------------
-- AFTERWARDS: run supabase/phase-2b1-tests.sql and read every verdict.
-- ---------------------------------------------------------------------------
