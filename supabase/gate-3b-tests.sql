-- Relii Gate 3b CHECKS. Read-only. Nothing here changes anything, so any query
-- in this file can be run at any time, as often as you like.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor", click "New
-- query", and paste ONE numbered query at a time. Running the whole file at
-- once only shows you the last result.
--
-- ==> THE HONEST LIMIT OF EVERY CHECK IN THIS FILE, and of the click-through
--     that goes with it: WITH ONE INSTRUCTOR, CORRECT ISOLATION AND BROKEN
--     ISOLATION LOOK IDENTICAL. Everything you own is everything there is. So
--     nothing here proves the isolation works. What it proves is that the rules
--     say what they should say, that nothing else regressed, and it records the
--     BASELINE that Gate 5 will compare a second instructor's account against.
--     Proving the isolation itself needs that second account, and that is Gate
--     5's whole job. The list of what only it can prove is at the bottom of this
--     file. <==
--
-- Queries 1 to 3 are the migration checks: run them after
-- supabase/gate-3b-policies.sql.
-- Queries 4 to 6 are the Gate 5 baseline: run them any time and keep the output.


-- ===========================================================================
-- THE MIGRATION CHECKS
-- ===========================================================================

-- 1. THE ONE THAT MATTERS MOST. "is_instructor" must now appear in ZERO live
--    policies.
--
--    This is the only check that can tell you supabase/gate-3b-policies.sql has
--    actually run, because NOTHING ON SCREEN CHANGES WHEN IT DOES. The invite
--    list is read with the service-role key, so the app looks exactly the same
--    whether the rule says is_instructor() or instructs_class(). If the code
--    ships and the SQL is forgotten, this query is the only thing that catches
--    it.
--
--    EXPECTED: still_on_is_instructor = 0, and now_on_instructs_class = 2.
select
  count(*) filter (
    where coalesce(qual, '') like '%is_instructor%'
       or coalesce(with_check, '') like '%is_instructor%'
  ) as still_on_is_instructor,
  count(*) filter (
    where coalesce(qual, '') like '%instructs_class%'
       or coalesce(with_check, '') like '%instructs_class%'
  ) as now_on_instructs_class,
  count(*) filter (
    where coalesce(qual, '') like '%can_read_class%'
       or coalesce(with_check, '') like '%can_read_class%'
  ) as on_can_read_class
from pg_policies
where schemaname = 'public';


-- 2. EVERY POLICY ON EVERY TABLE, so you can read the whole security surface in
--    one screen and confirm nothing else moved.
--
--    WHAT TO LOOK FOR:
--      * The two allowed_emails rows now say "instructs_class (Gate 3b)".
--      * Nothing anywhere says "is_instructor (NOT SCOPED)".
--      * classes and class_members appear with NO policy rows at all. That is
--        correct and deliberate: Gate 1 switched Row Level Security ON for both
--        with no rules attached, so ordinary users cannot read them and only the
--        server's service-role key can. The two helper functions read them on
--        everyone's behalf, which is why both are SECURITY DEFINER.
select
  t.tablename,
  coalesce(p.policyname, '(no policies: service-role only)') as policy_name,
  coalesce(p.cmd, '') as applies_to,
  case
    when p.policyname is null then ''
    when coalesce(p.qual, '') like '%instructs_class%'
      or coalesce(p.with_check, '') like '%instructs_class%' then 'instructs_class (owner only)'
    when coalesce(p.qual, '') like '%can_read_class%'
      or coalesce(p.with_check, '') like '%can_read_class%' then 'can_read_class (owner or member)'
    when coalesce(p.qual, '') like '%is_instructor%'
      or coalesce(p.with_check, '') like '%is_instructor%' then '>>> is_instructor (NOT SCOPED) <<<'
    else 'own-row or other'
  end as scoping
from (
  select unnest(array[
    'profiles', 'allowed_emails', 'rubrics', 'scenarios', 'assignments',
    'sessions', 'submission_resets', 'assignment_deletes',
    'classes', 'class_members'
  ]) as tablename
) t
left join pg_policies p
  on p.schemaname = 'public' and p.tablename = t.tablename
order by t.tablename, p.policyname;


-- 3. THE TWO INVITE RULES ON THEIR OWN, in full, so you can read the actual
--    text rather than my summary of it.
--
--    EXPECTED: both say instructs_class(class_id), and NEITHER says
--    can_read_class. That difference is deliberate and is the one thing to check
--    by eye here: can_read_class also answers true for class MEMBERS, who are
--    students, and using it would hand every student the email address of every
--    classmate.
select policyname, cmd, qual as using_rule, with_check as insert_rule
from pg_policies
where schemaname = 'public' and tablename = 'allowed_emails'
order by policyname;


-- ===========================================================================
-- THE GATE 5 BASELINE. Run these and KEEP THE OUTPUT.
-- ===========================================================================

-- 4. YOUR CLASS, and everything in it. This is the number Gate 5 compares a
--    second instructor's account against.
--
--    EDIT THE EMAIL on the first line if you are checking a different account.
--    (auth.uid() is null in the SQL editor, so these queries cannot ask "who am
--    I" and have to be told.)
with me as (
  select id from public.profiles
  where lower(email) = lower('michaeltbanta@gmail.com') and role = 'instructor'
),
my_class as (
  select c.id, c.name from public.classes c join me on c.instructor_id = me.id
)
select
  (select name from my_class)                                              as class_name,
  (select count(*) from public.class_members m
     where m.class_id = (select id from my_class))                         as students,
  (select count(*) from public.allowed_emails e
     where e.class_id = (select id from my_class))                         as invites,
  (select count(*) from public.rubrics r
     where r.class_id = (select id from my_class))                         as rubrics,
  (select count(*) from public.scenarios s
     where s.class_id = (select id from my_class))                         as scenarios,
  (select count(*) from public.assignments a
     where a.class_id = (select id from my_class))                         as assignments,
  (select count(*) from public.sessions s
     where s.class_id = (select id from my_class) and s.kind = 'submission') as submissions,
  (select count(*) from public.sessions s
     where s.class_id = (select id from my_class) and s.kind = 'practice')   as practices;


-- 5. THE SAME COUNTS FOR EVERY CLASS IN THE SYSTEM, side by side.
--
--    Today this returns one row with content in it (plus an empty class for any
--    other registered instructor). The moment it returns TWO rows with real
--    numbers, Gate 5 has something to test and query 4's numbers become the
--    thing that must not change when the other instructor signs in.
select
  c.name                                             as class_name,
  p.email                                            as owned_by,
  (select count(*) from public.class_members m   where m.class_id = c.id) as students,
  (select count(*) from public.allowed_emails e  where e.class_id = c.id) as invites,
  (select count(*) from public.scenarios s       where s.class_id = c.id) as scenarios,
  (select count(*) from public.assignments a     where a.class_id = c.id) as assignments,
  (select count(*) from public.sessions s        where s.class_id = c.id) as sessions
from public.classes c
join public.profiles p on p.id = c.instructor_id
order by c.created_at;


-- 6. THE CROSS-CLASS REFERENCE CHECK. Every count must be 0 today.
--
--    ==> THIS IS THE ONE TO CARRY INTO GATE 5, and it is a DESIGN QUESTION
--        rather than a test that can fail. NOTHING IN THE SCHEMA PREVENTS A
--        CROSS-CLASS REFERENCE ANYWHERE. An assignment may point at a scenario in
--        another class, a scenario at a rubric in another class, and a session
--        carries the class of its SCENARIO while its assignment carries the class
--        of its CREATOR, so those two can legitimately disagree.
--
--        WHY IT IS ALL ZERO TODAY: there is one instructor and one class with
--        content in it, and both creation paths read through the security rules
--        (the create-assignment dropdown reads scenarios as the logged-in user),
--        so only same-class options are ever offered.
--
--        WHAT IT WOULD LOOK LIKE IF IT HAPPENED, and every one of these is
--        SILENT rather than loud:
--          line 1: an assignment whose submissions would vanish from any
--                  class-filtered view of sessions. This is exactly why Gate 3b
--                  did NOT put a class filter on the dashboard's submissions
--                  read.
--          line 2: a results page showing a student scores with no item labels
--                  beside them, because the scenario and its rubric are read as
--                  two separate rules-bound reads.
--          line 3: the same divergence seen from the session side.
--
--        THE RULING GATE 5 NEEDS: does the model want a same-class constraint on
--        these foreign keys, or a check at creation time, or neither? <==
select 'assignment pointing at another class''s scenario' as what_is_checked,
       count(*) as should_be_zero
  from public.assignments a
  join public.scenarios s on s.id = a.scenario_id
 where a.class_id is distinct from s.class_id
union all
select 'scenario pointing at another class''s rubric',
       count(*)
  from public.scenarios s
  join public.rubrics r on r.id = s.rubric_id
 where s.class_id is distinct from r.class_id
union all
select 'session whose class differs from its assignment''s class',
       count(*)
  from public.sessions s
  join public.assignments a on a.id = s.assignment_id
 where s.class_id is distinct from a.class_id;


-- ===========================================================================
-- WHAT NONE OF THIS CAN PROVE. THE GATE 5 TEST MATRIX.
-- ===========================================================================
-- Every item below needs a SECOND INSTRUCTOR ACCOUNT with its own class and its
-- own content. None of them is checkable today, and none of them should be
-- attempted by reasoning about the code instead. Sign in as instructor B and
-- aim each one at instructor A's data by id.
--
-- READS, which should all answer "not found" rather than "forbidden":
--   1. Open /instructor/submission/<A's submission id>. Expect a 404 page.
--   2. GET /api/instructor/submission/<A's id>/video      -> 404, no redirect.
--   3. GET /api/instructor/submission/<A's id>/transcript -> 404.
--   4. GET /api/instructor/submission/<A's id>/csv        -> 404.
--   5. Open /instructor/scaffold/compare/<A's group id>   -> 404.
--   6. Open /instructor/scaffold/edit/<A's candidate id>  -> 404.
--   7. Open /instructor/scaffold/chain/<A's gatekeeper>   -> 404.
--   8. B's Roster shows B's students and B, and none of A's people.
--   9. B's dashboard "enrolled" count is B's students only.
--  10. B's Recent generations lists none of A's generations.
--
-- WRITES AND DELETES, each aimed at A's data by id:
--  11. POST /api/instructor/assignment/<A's id>/delete    -> refused.
--  12. POST /api/instructor/submission/<A's id>/reset     -> refused.
--  13. POST /api/instructor/delete-student  with A's student -> refused.
--  14. POST /api/instructor/uninvite        with A's pending invite -> refused.
--  15. POST /api/instructor/scaffold/choose   with A's candidate -> refused.
--  16. POST /api/instructor/scaffold/disable  with A's persona   -> refused.
--  17. POST /api/instructor/scaffold/edit     with A's candidate -> refused.
--  18. POST /api/instructor/scaffold/discard  with A's group id  -> not found.
--  19. POST /api/instructor/scaffold/generate chaining from A's gatekeeper -> refused.
--  20. "Discard all unused test generations" as B counts and deletes B's rows
--      only, and A's candidate count is unchanged afterwards.
--
-- THE INVITE LIST OVER THE WEB API, which is the only thing the two policies in
-- this piece actually protect:
--  21. As B, with an ordinary browser key, select from allowed_emails. Expect
--      B's invites only, never A's.
--
-- AND TWO THINGS THAT NEED A RULING RATHER THAN A PASS OR A FAIL:
--  22. THE INVITE COLLISION, and it is not hypothetical. allowed_emails.email is
--      the PRIMARY KEY, so an address exists once across the WHOLE SYSTEM rather
--      than once per class. If A has invited x@y.com, B cannot invite that
--      address at all: the insert fails as a duplicate and B is told the person
--      is "already on the invite list", with no way to see or reach that invite.
--      Tom works with four other instructors, and a student taking two of their
--      courses hits this on day one.
--  23. The cross-class reference question in query 6 above.
