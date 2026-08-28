-- Relii Gate 3a CHECKS. Read-only. Nothing here changes anything, so any query
-- in this file can be run at any time, as often as you like.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor", click "New
-- query", and paste ONE numbered query at a time. Running the whole file at
-- once only shows you the last result.
--
-- THE FILE IS IN THREE GROUPS, matching Gate 3a's three steps:
--   GROUP A  after step 1 (supabase/gate-3a-repair.sql)
--   GROUP B  after step 2 (the code is live on relii.vercel.app)
--   GROUP C  after step 3 (supabase/gate-3a-policies.sql)
--
-- Group A also doubles as the go/no-go for step 3. If anything in group A is
-- not zero, do not run step 3. It will refuse anyway, but knowing why first is
-- better than reading an error.


-- ===========================================================================
-- GROUP A: after step 1, the repair backfill.
-- ===========================================================================

-- A1. THE MAIN CHECK. Every count must be 0.
--
-- The first five are BLOCKING: step 3 refuses to run while any of them is above
-- zero, because each one turns into something broken on screen.
-- The last three are HYGIENE: they break nothing today, and they matter to Gate
-- 3b, which filters on those columns.
select 'BLOCKING  rubrics with no class'          as what_is_checked,
       count(*) as should_be_zero from public.rubrics where class_id is null
union all
select 'BLOCKING  scenarios with no class',
       count(*) from public.scenarios where class_id is null
union all
select 'BLOCKING  assignments with no class',
       count(*) from public.assignments where class_id is null
union all
select 'BLOCKING  invites with no class',
       count(*) from public.allowed_emails where class_id is null
union all
select 'BLOCKING  students with no class membership',
       count(*) from public.profiles p
       where p.role = 'student'
         and not exists (select 1 from public.class_members m where m.user_id = p.id)
union all
select 'hygiene   sessions with no class',
       count(*) from public.sessions where class_id is null
union all
select 'hygiene   submission_resets with no class',
       count(*) from public.submission_resets where class_id is null
union all
select 'hygiene   assignment_deletes with no class',
       count(*) from public.assignment_deletes where class_id is null
order by 1;


-- A2. THE SPECIMEN, BY NAME. null-student@yahoo.com specifically.
--
-- This is the account created during the Gate 2 click-through, invited after
-- Gate 1, so its invite had no class and it got no membership row. It is being
-- kept deliberately because it is the only live proof this repair works.
--
-- Expect ONE row. invite_class and membership_class must both be
-- "Relii Demo (Historical)". If either says "MISSING", the repair did not reach
-- this account and step 3 would leave it looking at an empty dashboard.
select e.email                                as invited_email,
       coalesce(ic.name, 'MISSING')           as invite_class,
       coalesce(p.role, 'not registered yet') as profile_role,
       coalesce(mc.name, 'MISSING')           as membership_class
  from public.allowed_emails e
  left join public.classes  ic on ic.id = e.class_id
  left join public.profiles p  on lower(p.email) = lower(e.email)
  left join public.class_members m  on m.user_id = p.id
  left join public.classes       mc on mc.id = m.class_id
 where lower(e.email) = 'null-student@yahoo.com';


-- A3. Everyone on the roster, and the class they are in. Context for A1 and A2.
--
-- Every student should show a class. Instructors show none, and THAT IS
-- CORRECT, not a fault: an instructor OWNS a class (the owns_class column),
-- they are never a member of one. This is the single most misread fact in the
-- whole gate, so it is spelled out here.
select p.email,
       p.role,
       coalesce(mc.name, '(none, correct for an instructor)') as member_of,
       coalesce(oc.name, '(none)')                            as owns_class
  from public.profiles p
  left join public.class_members m  on m.user_id = p.id
  left join public.classes       mc on mc.id = m.class_id
  left join public.classes       oc on oc.instructor_id = p.id
 order by p.role, p.email;


-- ===========================================================================
-- GROUP B: after step 2, the code is live. One query per write path.
-- ===========================================================================
-- ALL NINE PATHS CAN BE TRIGGERED FROM THE UI. There is nothing here you cannot
-- reach by clicking. Three notes on how to set the click-through up, because the
-- tests feed each other and two of them will block you if you do this in the
-- wrong order:
--
--   * CREATE TWO ASSIGNMENTS IN TEST 1, not one. Call them A and B.
--     A is the one you do student work against: paths 5 and 9 both use it.
--     B is never touched, so it stays unused and path 8 can clean-delete it.
--     One assignment cannot do both jobs: the moment path 5 puts a graded
--     submission on it, deleting it becomes the strong type-DELETE confirm and
--     destroys the very submission path 9 needs.
--
--   * WHEN YOU CREATE ASSIGNMENT A, PICK A SCENARIO THAT HAS A RUBRIC (Alex or
--     Jordan), not a persona you generated in the AI Persona Framework. A
--     generated persona is conversation-only until a rubric is attached, and a
--     conversation-only assignment cannot be submitted for a grade at all: the
--     server refuses it with "This is a practice-only assignment with no
--     grade". That refusal is correct behaviour from before Gate 3a, not a
--     Gate 3a fault, but it makes path 5 impossible to test.
--
--   * A graded submission can only be started once per assignment. If you have
--     already used up assignment A's one attempt, run the allow-retake test
--     (path 9) to free it, then start path 5 again.
--
-- Every query below shows the newest rows first with the class name spelled
-- out. In each one, the row you just created must show a real class name and
-- not "NO CLASS".

-- B1. Path 1: create TWO assignments on Manage Assignments (A and B, see the
--     note above). Expect both to appear here with a real class name.
select a.created_at, a.title, coalesce(c.name, '>>> NO CLASS <<<') as class
  from public.assignments a
  left join public.classes c on c.id = a.class_id
 order by a.created_at desc
 limit 5;


-- B2. Path 2: invite ONE person with the "Invite someone" form.
--     Path 3: invite several at once with the CSV bulk form.
--
-- The two paths are told apart by added_by: the bulk route records who ran the
-- import, the single-invite form does not. So "single invite form" rows come
-- from path 2 and "bulk CSV import" rows come from path 3, and you need one of
-- each to show a class.
select e.created_at,
       e.email,
       case when e.added_by is null then 'single invite form (path 2)'
            else 'bulk CSV import (path 3)' end as written_by,
       coalesce(c.name, '>>> NO CLASS <<<')     as class
  from public.allowed_emails e
  left join public.classes c on c.id = e.class_id
 order by e.created_at desc
 limit 10;


-- B3. Path 4: generate a persona in the AI Persona Framework.
--
-- One generation writes TWO scenario rows (the two candidates), so expect two
-- new rows sharing a generation group, both with a class.
select s.created_at, s.title, s.persona_name,
       coalesce(c.name, '>>> NO CLASS <<<') as class
  from public.scenarios s
  left join public.classes c on c.id = s.class_id
 order by s.created_at desc
 limit 6;


-- B4. Paths 5, 6 and 7: the three ways a session row is created.
--     Path 5  a GRADED submission          (kind submission, either mode)
--     Path 6  a VOICE practice             (kind practice, mode voice_video)
--     Path 7  a TEXT practice              (kind practice, mode text)
--
-- Run one of each from the student side. A session takes its class from its
-- SCENARIO, so the last column is a cross-check: session_class and
-- scenario_class must be the same name on every row.
select s.created_at,
       case when s.kind = 'submission' then 'path 5 graded submission'
            when s.mode = 'voice_video' then 'path 6 voice practice'
            else 'path 7 text practice' end   as path,
       coalesce(sc.name, '>>> NO CLASS <<<')  as session_class,
       coalesce(scc.name, '(scenario has none)') as scenario_class
  from public.sessions s
  left join public.classes   sc  on sc.id = s.class_id
  left join public.scenarios sn  on sn.id = s.scenario_id
  left join public.classes   scc on scc.id = sn.class_id
 order by s.created_at desc
 limit 10;


-- B5. Path 8: delete assignment B, the unused one, from Manage Assignments.
--     It should offer the light confirm, not the strong type-DELETE one. If it
--     asks you to type DELETE, you are deleting the wrong assignment: that one
--     has student work on it and is the one paths 5 and 9 need.
select d.created_at, d.assignment_title,
       coalesce(c.name, '>>> NO CLASS <<<') as class
  from public.assignment_deletes d
  left join public.classes c on c.id = d.class_id
 order by d.created_at desc
 limit 5;


-- B6. Path 9: reset an interrupted submission, or allow a retake.
select r.created_at, r.reset_type, r.student_email, r.assignment_title,
       coalesce(c.name, '>>> NO CLASS <<<') as class
  from public.submission_resets r
  left join public.classes c on c.id = r.class_id
 order by r.created_at desc
 limit 5;


-- B7. ALL NINE AT ONCE. The short version of B1 to B6.
--
-- Run this after the click-through. Every "written since" count should match
-- what you did, and every "still with no class" count must be 0.
select 'assignments'        as table_name,
       count(*) filter (where created_at > now() - interval '1 day') as written_today,
       count(*) filter (where class_id is null) as still_with_no_class
  from public.assignments
union all
select 'allowed_emails',
       count(*) filter (where created_at > now() - interval '1 day'),
       count(*) filter (where class_id is null)
  from public.allowed_emails
union all
select 'scenarios',
       count(*) filter (where created_at > now() - interval '1 day'),
       count(*) filter (where class_id is null)
  from public.scenarios
union all
select 'sessions',
       count(*) filter (where created_at > now() - interval '1 day'),
       count(*) filter (where class_id is null)
  from public.sessions
union all
select 'assignment_deletes',
       count(*) filter (where created_at > now() - interval '1 day'),
       count(*) filter (where class_id is null)
  from public.assignment_deletes
union all
select 'submission_resets',
       count(*) filter (where created_at > now() - interval '1 day'),
       count(*) filter (where class_id is null)
  from public.submission_resets
 order by 1;


-- ===========================================================================
-- GROUP C: after step 3, the policy file.
-- ===========================================================================

-- C1. The four rules, in words. This is the whole point of step 3.
--
-- EXPECTED:
--   read rubrics                     ->  can_read_class(class_id)
--   read scenarios                   ->  can_read_class(class_id)
--   read assignments                 ->  can_read_class(class_id)
--   instructors manage assignments   ->  instructs_class(class_id)
--
-- NOTHING in the "reads" column may still say "auth.uid() IS NOT NULL", and
-- NOTHING in either column may still say "class_id IS NULL".
select tablename,
       policyname,
       qual       as reads,
       with_check as writes
  from pg_policies
 where schemaname = 'public'
   and policyname in ('read rubrics', 'read scenarios', 'read assignments',
                      'instructors manage assignments')
 order by policyname;


-- C2. The null tolerance is gone. Expect ZERO rows.
--
-- If this returns the assignments rule, step 3 did not take and any assignment
-- with no class is still manageable by any instructor.
select tablename, policyname, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and (qual like '%class_id IS NULL%' or with_check like '%class_id IS NULL%');


-- C3. The new helper exists and is SECURITY DEFINER.
--
-- ==> security_definer MUST be true. <==
-- Gate 1 switched security ON for classes and class_members with no rules
-- attached. A helper that is not security definer reads zero rows from both,
-- returns false for everybody, and blanks every screen these rules govern.
-- Both helpers are listed so they can be compared side by side.
select p.proname                     as function_name,
       p.prosecdef                   as security_definer,
       pg_get_function_result(p.oid) as return_type
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('can_read_class', 'instructs_class')
 order by p.proname;


-- C4. The helper answers BOTH halves. This is the trap, checked directly.
--
-- Expect two rows, one per half, and both must say PASS:
--   owner half   an instructor must be able to read their own class. If this
--                fails, Manage Assignments and the dashboard selector both go
--                blank while looking perfectly healthy.
--   member half  a student must be able to read the class they belong to. If
--                this fails, every student dashboard is empty.
--
-- This checks the DATA the helper reads rather than calling it, because
-- can_read_class depends on auth.uid() and there is no logged-in user in the
-- SQL editor.
select 'owner half: instructors who own a class' as half,
       case when count(*) > 0 then 'PASS' else 'FAIL' end as result,
       count(*) as how_many
  from public.classes
union all
select 'member half: students who belong to a class',
       case when count(*) > 0 then 'PASS' else 'FAIL' end,
       count(*)
  from public.class_members;


-- C5. Everything Gate 2 left standing is still standing. Expect five rows,
--     all still on instructs_class or is_instructor, none of them changed by
--     Gate 3a. This is here so a later session can see at a glance that Gate 3a
--     did not quietly "finish the job" on the two allowed_emails rules.
select tablename, policyname, qual
  from pg_policies
 where schemaname = 'public'
   and policyname in ('instructors manage rubrics',
                      'instructors manage scenarios',
                      'instructors read reset log',
                      'instructors read invite list',
                      'instructors add to invite list')
 order by tablename, policyname;
