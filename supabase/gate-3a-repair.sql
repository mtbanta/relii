-- Relii Gate 3a, STEP 1 of 3: THE REPAIR BACKFILL. Give every row a class.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run".
-- It is safe to run more than once. Every statement in it says "where class_id
-- is null", so a second run finds nothing left to do and changes nothing.
--
-- ===========================================================================
-- WHEN TO RUN IT: NOW, BEFORE ANY CODE SHIPS. THIS IS THE SAFE ONE.
-- ===========================================================================
-- Gate 3a runs in THREE steps and the order is not the usual one for this
-- project. Normally the SQL runs first and the push follows. Here that order
-- would break the live site, so the SQL is split in two with the deploy in the
-- middle:
--
--   STEP 1  this file, supabase/gate-3a-repair.sql       <-- you are here
--           Pure data repair. It changes NO security rule and NO table
--           structure. Nothing on screen changes. It cannot break anything,
--           which is why it goes first and can be run at any time.
--
--   STEP 2  the application code. Michael commits and pushes; you confirm the
--           deploy is live on relii.vercel.app.
--
--   STEP 3  supabase/gate-3a-policies.sql, ONLY after step 2 is live.
--           That file tightens the security rules. Run it before step 2 is
--           live and creating an assignment on the live site fails outright.
--           It has a pre-flight that refuses to run if THIS file has not been
--           run first.
--
-- ===========================================================================
-- WHAT THIS FILE FIXES, AND WHY THERE ARE SEVEN TABLES RATHER THAN TWO
-- ===========================================================================
-- Gate 1 added a class_id column to seven tables and filled in every row that
-- existed on 2026-08-25. Since then, code that Gate 3a has only now taught to
-- set class_id has been writing NEW rows with the column left empty. This file
-- catches every one of them. Two groups, by consequence:
--
-- BREAK RISK. These are read through the security rules by live pages, and
-- step 3 tightens exactly these three rules. A row left with no class here
-- DISAPPEARS from the screen after step 3, and an assignment with no class can
-- no longer be edited or deleted by anybody.
--   * assignments  (the browser create form has written these with no class
--                   since Gate 2)
--   * scenarios    (the AI Persona Framework has written these with no class
--                   since Gate 1)
--   * rubrics      (nothing in the app writes a rubric, so zero rows expected;
--                   it is here because step 3 tightens this rule too)
--
-- THE INVITE HOLE. This is the one with a live specimen.
--   * allowed_emails with no class. An invite carries the class the student
--     joins: the signup rule in the database reads class_id off the invite row.
--     An invite with no class produced a student with NO class membership.
--   * student profiles with no class_members row. These are the people the
--     hole already swallowed. There is one right now, null-student@yahoo.com,
--     created during the Gate 2 click-through and kept deliberately as the live
--     proof that this repair works. After step 3 an unrepaired account would
--     see an empty dashboard, so this row and the policy change have to agree.
--
-- HYGIENE. These three change NOTHING on screen, now or after step 3. Their
-- security rules already went strict in Gate 2 and no page in the app reads
-- them through those rules (all four instructor read paths use the service-role
-- key). They are repaired anyway for one reason: Gate 3b filters on these
-- columns, and filtering on a half-empty column produces a page that LOOKS
-- scoped and is not, which is the exact trap this whole gate exists to remove.
--   * sessions
--   * submission_resets
--   * assignment_deletes
--
-- ===========================================================================
-- HOW A ROW IS GIVEN ITS CLASS
-- ===========================================================================
--   allowed_emails      -> "Relii Demo (Historical)", the class Gate 1 used.
--   student membership  -> "Relii Demo (Historical)", the same class.
--   rubrics, scenarios,
--   assignments         -> the class owned by the row's created_by, falling
--                          back to "Relii Demo (Historical)". This is the
--                          owner's Gate 2 ruling ("move mis-scoped rows to the
--                          class their creator owns") applied to rows that have
--                          no class at all. With one instructor both rules give
--                          the same answer today.
--   sessions            -> from their SCENARIO, never their assignment. That is
--                          the rule Gate 1's backfill used, and the reason is
--                          that assignment_id is nullable (free practice has no
--                          assignment) while scenario_id never is.
--   submission_resets   -> from the assignment they record.
--   assignment_deletes  -> from the scenario they snapshotted (the assignment
--                          itself is gone by then, which is the point of the
--                          record).
--   Both audit tables fall back to the class owned by the instructor named on
--   the record, then to the historical class, so no audit row is left ownerless.
--
-- NOTE FOR LATER, DELIBERATELY NOT DONE NOW: allowed_emails could be attributed
-- through its added_by column (which only the server-side bulk-invite route
-- fills in) instead of going straight to the historical class. It would give
-- the same answer today, it cannot be tested with only one instructor, and the
-- owner's instruction was the historical class. Left as written.


-- ---------------------------------------------------------------------------
-- 0. Find the class everything falls back to, and stop if it is not there.
-- ---------------------------------------------------------------------------
-- Every statement below leans on "Relii Demo (Historical)", the single class
-- Gate 1 backfilled all existing data into. If it is missing or ambiguous this
-- file must not run at all, because a wrong guess here puts real rows in the
-- wrong class behind a restrict foreign key, which is tedious to undo.
--
-- This is its own small block on purpose, so that if it stops, it stops BEFORE
-- anything has been changed. (Gate 1 learned the other lesson: it put its whole
-- backfill inside one block, so one exception aborted the entire file including
-- unrelated sections.)
--
-- IF THIS STOPS: the class was renamed or deleted. Look at
--   select id, name, instructor_id from public.classes;
-- and either restore the name or edit the name used throughout this file.
do $$
declare
  n integer;
begin
  select count(*) into n
  from public.classes
  where name = 'Relii Demo (Historical)';

  if n = 0 then
    raise exception 'Gate 3a stopped: no class named "Relii Demo (Historical)" exists. Nothing was changed.';
  elsif n > 1 then
    raise exception 'Gate 3a stopped: % classes are named "Relii Demo (Historical)", so the fallback is ambiguous. Nothing was changed.', n;
  end if;

  raise notice 'Gate 3a repair: fallback class found. Starting.';
end $$;


-- ---------------------------------------------------------------------------
-- 1. rubrics. BREAK RISK after step 3.
-- ---------------------------------------------------------------------------
-- Zero rows expected: nothing in the app creates or edits a rubric, from the
-- browser or the server. This is here so all three tables step 3 tightens are
-- covered by the same sweep rather than two of them being covered and the third
-- being assumed.
update public.rubrics r
   set class_id = coalesce(
         (select c.id
            from public.classes c
           where c.instructor_id = r.created_by
           order by c.created_at
           limit 1),
         (select c.id
            from public.classes c
           where c.name = 'Relii Demo (Historical)'
           limit 1))
 where r.class_id is null;


-- ---------------------------------------------------------------------------
-- 2. scenarios. BREAK RISK after step 3, and rows are expected here.
-- ---------------------------------------------------------------------------
-- The AI Persona Framework (app/api/instructor/scaffold/generate/route.ts) has
-- been writing scenario rows with no class since Gate 1. Gate 3a teaches it to
-- set one; these are the ones already written.
--
-- Left unrepaired, after step 3 they vanish from the create-assignment dropdown
-- on Manage Assignments and from the student session and results pages.
--
-- THIS MUST RUN BEFORE SECTION 6 (sessions), which takes its class from here.
update public.scenarios s
   set class_id = coalesce(
         (select c.id
            from public.classes c
           where c.instructor_id = s.created_by
           order by c.created_at
           limit 1),
         (select c.id
            from public.classes c
           where c.name = 'Relii Demo (Historical)'
           limit 1))
 where s.class_id is null;


-- ---------------------------------------------------------------------------
-- 3. assignments. BREAK RISK after step 3.
-- ---------------------------------------------------------------------------
-- The browser create form (components/create-assignment-form.tsx) has been
-- writing assignment rows with no class since Gate 2, which allowed it on
-- purpose so the form kept working. Gate 3a teaches the form to set one and
-- step 3 removes the allowance, so this window has to be closed first.
--
-- Left unrepaired, after step 3 such an assignment disappears from the student
-- home, from the dashboard selector and from Manage Assignments, and NOBODY can
-- edit or delete it.
--
-- THIS MUST RUN BEFORE SECTION 7 (submission_resets), which reads its class.
update public.assignments a
   set class_id = coalesce(
         (select c.id
            from public.classes c
           where c.instructor_id = a.created_by
           order by c.created_at
           limit 1),
         (select c.id
            from public.classes c
           where c.name = 'Relii Demo (Historical)'
           limit 1))
 where a.class_id is null;


-- ---------------------------------------------------------------------------
-- 4. allowed_emails. THE INVITE HOLE, half one: future arrivals.
-- ---------------------------------------------------------------------------
-- An invite row's class_id is what the signup rule reads to put a student into
-- a class the moment they register. Any invite still sitting on the list with
-- no class would produce another classless student. This fills them in so the
-- people already invited land correctly when they sign up.
--
-- Straight to the historical class, as instructed, not through added_by. See
-- the note at the top of this file.
update public.allowed_emails e
   set class_id = (select c.id
                     from public.classes c
                    where c.name = 'Relii Demo (Historical)'
                    limit 1)
 where e.class_id is null;


-- ---------------------------------------------------------------------------
-- 5. class_members. THE INVITE HOLE, half two: the people already through it.
-- ---------------------------------------------------------------------------
-- Every student profile with no membership row gets one. THIS IS THE LINE THAT
-- REPAIRS null-student@yahoo.com, the account created during the Gate 2
-- click-through and kept deliberately as the live specimen. After step 3 an
-- account with no membership sees an empty dashboard, so this is the repair
-- that has to agree with the policy change.
--
-- Students only. An instructor is NOT a member of a class: they own it through
-- classes.instructor_id. Adding an instructor here would be wrong and is not
-- what makes the instructor surface work.
insert into public.class_members (class_id, user_id)
select (select c.id
          from public.classes c
         where c.name = 'Relii Demo (Historical)'
         limit 1),
       p.id
  from public.profiles p
 where p.role = 'student'
   and not exists (select 1
                     from public.class_members m
                    where m.user_id = p.id)
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 6. sessions. HYGIENE. Nothing on screen changes.
-- ---------------------------------------------------------------------------
-- Every role-play started since Gate 1, practice or graded, has a session row
-- with no class. The instructor pages read sessions with the service-role key,
-- which ignores the security rules entirely, so nothing is broken today and
-- nothing looks different after this runs. It is repaired because Gate 3b
-- filters on this column.
--
-- From the SCENARIO, not the assignment. Section 2 above must have run first.
update public.sessions s
   set class_id = sc.class_id
  from public.scenarios sc
 where sc.id = s.scenario_id
   and s.class_id is null
   and sc.class_id is not null;


-- ---------------------------------------------------------------------------
-- 7. submission_resets. HYGIENE. Nothing on screen changes.
-- ---------------------------------------------------------------------------
-- The reset and allow-retake audit log. Its read rule already went strict in
-- Gate 2, and the dashboard reads it with the service-role key, so a row with
-- no class is invisible through the rules and perfectly visible on screen.
-- Repaired for Gate 3b's sake.
--
-- First from the assignment it records (section 3 must have run first).
update public.submission_resets r
   set class_id = a.class_id
  from public.assignments a
 where a.id = r.assignment_id
   and r.class_id is null
   and a.class_id is not null;

-- Then anything left over, because an audit record outlives what it records:
-- its assignment may since have been deleted. Falls back to the class owned by
-- the instructor named on the record, then to the historical class.
update public.submission_resets r
   set class_id = coalesce(
         (select c.id
            from public.classes c
           where c.instructor_id = r.instructor_id
           order by c.created_at
           limit 1),
         (select c.id
            from public.classes c
           where c.name = 'Relii Demo (Historical)'
           limit 1))
 where r.class_id is null;


-- ---------------------------------------------------------------------------
-- 8. assignment_deletes. HYGIENE. Nothing on screen changes.
-- ---------------------------------------------------------------------------
-- The assignment-deletion audit log. Same situation as section 7.
--
-- From the SCENARIO it snapshotted, because the assignment itself is gone by
-- the time this record exists, which is the whole point of the record. Section
-- 2 must have run first.
update public.assignment_deletes d
   set class_id = sc.class_id
  from public.scenarios sc
 where sc.id = d.scenario_id
   and d.class_id is null
   and sc.class_id is not null;

-- Anything left over: the scenario reference is nullable and the scenario may
-- itself have been deleted. Same fallback as section 7.
update public.assignment_deletes d
   set class_id = coalesce(
         (select c.id
            from public.classes c
           where c.instructor_id = d.instructor_id
           order by c.created_at
           limit 1),
         (select c.id
            from public.classes c
           where c.name = 'Relii Demo (Historical)'
           limit 1))
 where d.class_id is null;


-- ---------------------------------------------------------------------------
-- 9. Report what is left. Everything below should say 0.
-- ---------------------------------------------------------------------------
-- These come back as messages, not as a table. In the Supabase SQL editor they
-- appear under the "Messages" tab next to "Results". The full checks, as
-- queries you can read as a table, are in supabase/gate-3a-tests.sql.
do $$
declare
  n_rubrics    integer;
  n_scenarios  integer;
  n_assign     integer;
  n_invites    integer;
  n_students   integer;
  n_sessions   integer;
  n_resets     integer;
  n_deletes    integer;
begin
  select count(*) into n_rubrics   from public.rubrics            where class_id is null;
  select count(*) into n_scenarios from public.scenarios          where class_id is null;
  select count(*) into n_assign    from public.assignments        where class_id is null;
  select count(*) into n_invites   from public.allowed_emails     where class_id is null;
  select count(*) into n_sessions  from public.sessions           where class_id is null;
  select count(*) into n_resets    from public.submission_resets  where class_id is null;
  select count(*) into n_deletes   from public.assignment_deletes where class_id is null;

  select count(*) into n_students
  from public.profiles p
  where p.role = 'student'
    and not exists (select 1 from public.class_members m where m.user_id = p.id);

  raise notice 'Gate 3a repair finished. Rows still with no class (every one should be 0):';
  raise notice '  rubrics %, scenarios %, assignments %', n_rubrics, n_scenarios, n_assign;
  raise notice '  allowed_emails %, students with no membership %', n_invites, n_students;
  raise notice '  sessions %, submission_resets %, assignment_deletes %', n_sessions, n_resets, n_deletes;

  if n_rubrics + n_scenarios + n_assign + n_invites + n_students
     + n_sessions + n_resets + n_deletes = 0 then
    raise notice 'ALL CLEAR. Step 3 (supabase/gate-3a-policies.sql) will be allowed to run once the code is live.';
  else
    raise warning 'SOMETHING IS LEFT OVER. Do not run step 3 yet. Run supabase/gate-3a-tests.sql and show Michael which table is not zero.';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 10. There is no undo for this file, on purpose.
-- ---------------------------------------------------------------------------
-- supabase/gate-3a-revert.sql undoes STEP 3 (the security rules) and nothing
-- else. Undoing this file would mean emptying class_id back out again, which
-- would re-break exactly what it just fixed and would delete the membership row
-- that lets null-student@yahoo.com see a dashboard. Nothing here is
-- destructive: it only fills in blanks and adds membership rows, and it touches
-- no table structure and no security rule.
