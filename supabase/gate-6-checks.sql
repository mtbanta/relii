-- ===========================================================================
-- GATE 6: MULTIPLE CLASSES PER INSTRUCTOR. CHECKS ONLY.
-- ===========================================================================
--
-- ==> READ THIS FIRST. THIS FILE CHANGES NOTHING. IT IS ALL SELECTs.
--
--     Every gate piece before this one shipped a migration, a revert and a
--     tests file. GATE 6 SHIPS NONE OF THEM, because it needs no schema change
--     and no policy change: Gate 1 built `classes` and `class_members` to allow
--     several classes per instructor deliberately, and public.instructs_class()
--     has always answered "any class this instructor owns" rather than "their
--     one class". The whole piece is application code.
--
--     A PIECE WITH NO SQL IS NOT A PIECE WITH NO PROOF, so this file is the SQL
--     half of the evidence and docs/Relii-Gate6-Handoff.md is the click-through
--     half. It is safe to run at any time, before or after the deploy, as often
--     as you like. Gate 5 runs next and can re-run all of it. <==
--
-- HOW TO RUN IT: paste into the Supabase SQL editor, one query at a time, and
-- compare against the expectation written above each one.


-- ---------------------------------------------------------------------------
-- 1. THE STANDING CHECK, INVERTED. THIS IS THE HEADLINE OF THE WHOLE PIECE.
-- ---------------------------------------------------------------------------
-- ==> THIS QUERY USED TO MEAN CORRUPTION AND NOW MEANS THE FEATURE WORKS.
--
--     PROJECT_STATE has carried it since Gate 4b as a check that "should always
--     return no rows", because getInstructorClassId() took an instructor's
--     OLDEST class and stopped, so a second class meant one of them was silently
--     invisible. Gate 6 replaced that function with resolveWorkingClassId(),
--     which honours the instructor's own selection.
--
--     AFTER GATE 6, ROWS HERE ARE NORMAL OPERATION. An instructor holding three
--     sections shows up as a 3. Do not "repair" it. <==
--
-- EXPECTED: at least one row once you have created a second class, and 0 rows
-- before that. Neither answer is a failure.
select p.email,
       count(*) as classes_owned,
       string_agg(c.name, ', ' order by c.created_at) as class_names
  from public.classes c
  join public.profiles p on p.id = c.instructor_id
 group by p.email
having count(*) > 1
 order by p.email;


-- ---------------------------------------------------------------------------
-- 2. EVERY CLASS, AND EVERYTHING IN IT, SIDE BY SIDE.
-- ---------------------------------------------------------------------------
-- This is query 5 of supabase/gate-3b-tests.sql with the owner's email added,
-- and it is the one to keep a copy of BEFORE and AFTER the click-through.
--
-- ==> "scenarios" IS THE DATABASE'S WORD FOR WHAT THE APP CALLS A PERSONA, and
--     the owner rightly flagged the mismatch while running these on 2026-09-03.
--     The table has been called scenarios since Stage 2; the screen that manages
--     them is the AI Persona Framework, and every label on it says persona. The
--     counts are the same thing under two names, so a scenarios number that
--     matches the personas you can see is a PASS rather than a coincidence.
--     Renaming the table is not worth a migration, and renaming the UI would be
--     wrong, since "persona" is the word Tom and the students use. <==
--
-- ==> RECORDINGS ARE COUNTED HERE, added on 2026-09-03 after the owner noticed
--     they were missing from the first version of this file. It is not
--     redundant with `sessions`: a recording is a FILE IN STORAGE, which no
--     database foreign key protects and no cascade removes, which is why Gate
--     4b's delete has to remove Storage by hand and BEFORE any row. Query 5 of
--     supabase/gate-4b-tests.sql counts the same thing for the same reason. A
--     class whose sessions moved but whose recordings did not would show up
--     nowhere else. <==
--
-- EXPECTED: each class carries its OWN rows. Creating a second class adds a row
-- of zeroes; working inside it moves NEW rows into that row and NEVER moves an
-- existing row out of another one. That is the "no row moved between classes"
-- half of the test.
select c.name                                                        as class,
       p.email                                                       as instructor,
       (select count(*) from public.rubrics        where class_id = c.id) as rubrics,
       (select count(*) from public.scenarios      where class_id = c.id) as scenarios_aka_personas,
       (select count(*) from public.assignments    where class_id = c.id) as assignments,
       (select count(*) from public.sessions       where class_id = c.id) as sessions,
       (select count(*) from public.sessions       where class_id = c.id
                                                     and video_path is not null) as recordings,
       (select count(*) from public.allowed_emails where class_id = c.id) as invites,
       (select count(*) from public.class_members  where class_id = c.id) as students
  from public.classes c
  join public.profiles p on p.id = c.instructor_id
 order by p.email, c.created_at;


-- ---------------------------------------------------------------------------
-- 3. NO ROW BELONGS TO NOBODY, AND NO ROW BELONGS TO A CLASS THAT IS GONE.
-- ---------------------------------------------------------------------------
-- Gate 4a made class_id NOT NULL on all seven tables and added foreign keys, so
-- both halves are enforced by the database. This asks the database to say so
-- out loud after a piece that touched every scoped surface.
--
-- EXPECTED: every count 0.
select 'rubrics with no class'        as check, count(*) from public.rubrics        where class_id is null
union all
select 'scenarios with no class',            count(*) from public.scenarios      where class_id is null
union all
select 'assignments with no class',          count(*) from public.assignments    where class_id is null
union all
select 'sessions with no class',             count(*) from public.sessions       where class_id is null
union all
select 'invites with no class',              count(*) from public.allowed_emails where class_id is null
union all
select 'memberships pointing nowhere',       count(*) from public.class_members m
        where not exists (select 1 from public.classes c where c.id = m.class_id);


-- ---------------------------------------------------------------------------
-- 4. A STUDENT IS IN EXACTLY ONE CLASS.
-- ---------------------------------------------------------------------------
-- ==> THIS IS THE RULING GATE 6 IS BUILT ON, AND THE SCHEMA DOES NOT ENFORCE IT.
--     class_members is keyed (class_id, user_id), so two rows for one person are
--     structurally legal. The rule is held by the application: the signup
--     trigger writes one row, and /api/instructor/add-student MOVES a student
--     rather than adding a second membership.
--
--     Gate 4b's cascade delete already relies on this being enforced somewhere
--     (its "is this student in another class" check decides whether an account
--     is deleted), which is why it is worth a standing query rather than a
--     comment. <==
--
-- EXPECTED: 0 rows, always. A row here is a bug in a write path, not a feature.
select p.email, count(*) as classes_joined
  from public.class_members m
  join public.profiles p on p.id = m.user_id
 group by p.email
having count(*) > 1;


-- ---------------------------------------------------------------------------
-- 5. THE INVITE ROW AND THE MEMBERSHIP AGREE ABOUT WHICH CLASS SOMEBODY IS IN.
-- ---------------------------------------------------------------------------
-- ==> NEW IN GATE 6, AND IT IS THE CHECK FOR THE ONE OPERATION IN THE PIECE THAT
--     CANNOT BE A SINGLE TRANSACTION. /api/instructor/add-student writes the
--     membership first and moves allowed_emails.class_id second, because these
--     are two separate API calls. If the second half ever fails, this query is
--     what finds it; re-running the add for that student fixes it, and the route
--     says so in its own failure message.
--
--     IT MATTERS BEYOND TIDINESS: Gate 4b's cascade delete decides which invites
--     to destroy from allowed_emails.class_id and which accounts to keep from
--     class_members, so a disagreement here means those two halves disagree
--     about the same person. <==
--
-- EXPECTED: 0 rows.
select p.email,
       ae.class_id  as invite_class,
       m.class_id   as membership_class
  from public.profiles p
  join public.allowed_emails ae on lower(ae.email) = lower(p.email)
  join public.class_members m   on m.user_id = p.id
 where p.role = 'student'
   and ae.class_id is distinct from m.class_id;


-- ---------------------------------------------------------------------------
-- 6. THE SAME-CLASS CONSTRAINTS STILL HOLD ACROSS THE NEW CLASSES.
-- ---------------------------------------------------------------------------
-- Query 6 of supabase/gate-3b-tests.sql, re-run because Gate 6 is the first
-- piece that makes a SECOND class reachable from inside one instructor's own
-- surface, which is exactly the situation these Gate 4a constraints exist for.
--
-- ==> THE FIRST TWO LINES CANNOT FAIL, and that is the point: Gate 4a's
--     assignments_scenario_same_class_fkey and scenarios_rubric_same_class_fkey
--     enforce them at the database. Seeing 0 here after creating an assignment
--     in a second class is what confirms the scenario dropdown on Manage
--     Assignments is genuinely scoped, rather than confirming the constraint.
--
--     THE THIRD LINE IS ALLOWED TO BE NON-ZERO AND IS DELIBERATELY NOT
--     CONSTRAINED. A session takes its class from its SCENARIO while an
--     assignment takes its class from its CREATOR, and a session may have no
--     assignment at all (free practice). Report it, never enforce it. <==
--
-- EXPECTED: the first two 0. The third is informational.
select 'assignment using another class''s scenario' as check,
       count(*)
  from public.assignments a
  join public.scenarios s on s.id = a.scenario_id
 where a.class_id is distinct from s.class_id
union all
select 'scenario scored by another class''s rubric',
       count(*)
  from public.scenarios s
  join public.rubrics r on r.id = s.rubric_id
 where s.class_id is distinct from r.class_id
union all
select 'session whose class differs from its assignment''s class (allowed)',
       count(*)
  from public.sessions s
  join public.assignments a on a.id = s.assignment_id
 where s.class_id is distinct from a.class_id;


-- ---------------------------------------------------------------------------
-- 7. NOBODY ACQUIRED A CLASS THEY SHOULD NOT HAVE.
-- ---------------------------------------------------------------------------
-- Every class has an owner and that owner is an instructor. The foreign key
-- guarantees the first half; this checks the ROLE, which nothing enforces.
--
-- EXPECTED: 0 rows.
select c.name, p.email, p.role
  from public.classes c
  join public.profiles p on p.id = c.instructor_id
 where p.role is distinct from 'instructor';


-- ---------------------------------------------------------------------------
-- 8. THE POLICY SURFACE IS UNCHANGED BY THIS PIECE.
-- ---------------------------------------------------------------------------
-- ==> GATE 6 CHANGED NO POLICY AND NO FUNCTION. This is query 1 of
--     supabase/gate-3b-tests.sql, re-run so that "we changed no SQL" is a
--     measured fact rather than an assertion. If any number here differs from
--     the Gate 3b result, something outside this piece has run.
--
-- EXPECTED, unchanged from the Gate 3b pass on 2026-08-31:
--   still_on_is_instructor 0, now_on_instructs_class 8, on_can_read_class 3.
select count(*) filter (where qual like '%is_instructor%'
                           or with_check like '%is_instructor%') as still_on_is_instructor,
       count(*) filter (where qual like '%instructs_class%'
                           or with_check like '%instructs_class%') as now_on_instructs_class,
       count(*) filter (where qual like '%can_read_class%'
                           or with_check like '%can_read_class%') as on_can_read_class
  from pg_policies
 where schemaname = 'public';


-- ===========================================================================
-- HANDOFF: WHAT GATE 6 LEAVES FOR GATE 5.
-- ===========================================================================
-- ==> GATE 5'S MATRIX GROWS RATHER THAN SHRINKS. A second class under ONE
--     instructor is a new isolation boundary that did not exist when the
--     twenty-three items at the bottom of supabase/gate-3b-tests.sql were
--     written, and it is a boundary of a different KIND: those items ask "can B
--     reach A's data", and these ask "does one instructor's own surface follow
--     the class they chose". <==
--
--   1. ITEMS 1 TO 7 EACH BECOME TWO TESTS WITH DIFFERENT EXPECTED ANSWERS.
--      As instructor B aimed at instructor A: still 404, unchanged. As ONE
--      instructor aimed at their OWN other class: the "this is in your other
--      class" panel with a switch button. The second run is the one that proves
--      the friendly answer did not weaken the 404, and the first is the one that
--      proves it did not leak.
--
--   2. ITEMS 8, 9 AND 10 BECOME PER-CLASS SWEEPS UNDER ONE INSTRUCTOR. Switch
--      the picker and confirm the Roster, the dashboard "enrolled" tile and
--      Recent generations all change together. A surface that does not follow
--      the picker is a surface that was missed.
--
--   3. ITEMS 11 TO 19 EACH GET A SECOND RUN aimed at the caller's OWN other
--      class, and every one must still be REFUSED. The eleven routes keep
--      answering 404 for a cross-class target, deliberately: the friendly answer
--      belongs on pages a person navigates to, and a route is reached from a
--      page that is already scoped. This is the check that item 1's answer did
--      not leak into the write paths.
--
--   4. ITEM 20 GAINS A NEW FAILURE MODE. "Discard all unused test generations"
--      must count and delete only the WORKING class's rows, not every class the
--      instructor owns. planBulkDiscard() takes the working class id, so the
--      test is: generate in class A, switch to B, discard all, confirm A's
--      candidate count is unchanged.
--
--   5. ITEM 21 CHANGES MEANING, AND IT IS EXPECTED RATHER THAN A BUG. The read
--      policy on allowed_emails is public.instructs_class(class_id), which
--      answers "any class you own". So over the web API with a browser key, an
--      instructor now sees invites from EVERY class they own, while the Roster
--      shows only the working class. That is the policy being a backstop against
--      another INSTRUCTOR and the application being what scopes a listing. B
--      still sees none of A's.
--
--   6. ITEMS 22 AND 23 ARE UNCHANGED. The invite collision is settled (a student
--      is in one class at a time, so allowed_emails.email stays a primary key),
--      and the cross-class reference question was settled by Gate 4a with a
--      constraint.
--
--   7. NEW: THE COOKIE-TAMPER MATRIX, AND IT IS THE ITEM THAT CERTIFIES THIS
--      PIECE. The working class is remembered in a cookie, which the person
--      holding it can edit. Edit it to a class you do not own and load EVERY
--      instructor page and route. Every one must fall back to your own oldest
--      class or refuse, and none may render another instructor's data. The check
--      lives in resolveWorkingClassId() in lib/instructor-auth.ts and runs on
--      every request. Exact steps are in docs/Relii-Gate6-Handoff.md.
--
--   8. NEW: THE ADD-STUDENT ROUTE'S REFUSALS, all four, and the third is the one
--      with a ruling behind it: a student who has already done work cannot be
--      moved, because their sessions stay in the old class and the student
--      surface reads scenarios AND rubrics through can_read_class(), so they
--      would lose their own results page's title and its item labels.
--
--   9. NEW: BOTH INVITE PATHS REFUSE role = instructor FROM AN ORDINARY
--      INSTRUCTOR, ON THE SERVER. Test the CSV path by posting the row directly
--      rather than only through the form, and test the single path the same way,
--      since the point of the ruling is that the server holds the rule. Then
--      confirm a super admin still can, by both paths.
--
--  10. NEW: THE RELAXED REASSIGN. A class can now be handed to an instructor who
--      already owns one, and the receiver keeps everything they had. The one
--      remaining refusal is a NAME CLASH, because classes carries
--      unique (instructor_id, name). Also test the DONOR whose working class was
--      the one handed away: their remembered selection now names a class they no
--      longer own, so they must fall back to their own oldest class.
