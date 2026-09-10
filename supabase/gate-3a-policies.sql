-- Relii Gate 3a, STEP 3 of 3: tighten the three read rules, and drop the
-- empty-class allowance on assignments.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run".
-- It is safe to run more than once.
--
-- ===========================================================================
-- ==> DO NOT RUN THIS UNTIL THE NEW CODE IS LIVE ON relii.vercel.app. <==
-- ===========================================================================
-- Gate 3a runs in three steps, and the order is the REVERSE of this project's
-- usual one. Normally the SQL goes first. Here it cannot:
--
--   STEP 1  supabase/gate-3a-repair.sql, the data repair. Safe at any time.
--   STEP 2  the application code. Michael pushes; you confirm the deploy is
--           live on relii.vercel.app.
--   STEP 3  this file.                                   <-- you are here
--
-- WHAT BREAKS IF YOU RUN THIS FILE EARLY, stated plainly, against the live
-- site and immediately:
--   * CREATING AN ASSIGNMENT FAILS OUTRIGHT. The deployed form sends no class,
--     and section 5 below removes the rule that allowed that.
--   * EDITING AN ASSIGNMENT FAILS for any assignment whose class is still
--     empty.
--   * Any assignment or scenario with an empty class DISAPPEARS from the
--     student home, the student session and results pages, the instructor
--     dashboard selector and Manage Assignments.
--   * Generating a persona still works but writes scenarios with no class,
--     which are then invisible in the create-assignment dropdown.
--   * Any student with no class membership row sees an EMPTY dashboard.
--
-- Section 0 catches the DATA half of that and refuses to run. It cannot tell
-- which version of the code is deployed, so that half is on the ordering above.
--
-- IF ANYTHING GOES WRONG: supabase/gate-3a-revert.sql puts every rule in this
-- file back exactly as it was. Read it before you run this, not after.
--
-- ===========================================================================
-- WHAT THIS FILE CHANGES, AND WHAT ACTUALLY READS THROUGH THESE RULES
-- ===========================================================================
-- Four rules:
--   1. "read rubrics", "read scenarios" and "read assignments" all currently
--      say "auth.uid() is not null", which means ANY signed-in person reads
--      EVERY row on all three tables. They become class-scoped.
--   2. "instructors manage assignments" currently ends in "or class_id is
--      null". Gate 2 put that there so the browser create and edit forms kept
--      working before anything set a class. Step 2 makes the form set one, so
--      the allowance becomes a hole and comes out here.
--
-- THE READS THIS ACTUALLY TOUCHES. Checked file by file rather than assumed.
-- Everything else in the app reads these three tables with the service-role
-- key, which ignores security rules completely. In particular BOTH SCORING
-- READS are service-role (app/api/session/end line 176 reads rubrics,
-- app/api/practice/submit line 141 reads scenarios), so scoring a role-play is
-- not affected by this file at all.
--
--   Students:
--     app/student/page.tsx                        assignments (+ scenarios joined)
--     app/student/session/[id]/page.tsx           scenarios, assignments
--     app/student/session/[id]/results/page.tsx   scenarios, rubrics
--   Instructors, and there are exactly two:
--     app/instructor/page.tsx line 126            assignments, for the dashboard
--                                                 selector
--     app/instructor/assignments/page.tsx         scenarios (the create form's
--       lines 48 and 55                           dropdown) AND assignments (the
--                                                 published list)
--
-- ==> THE SECOND ONE IS THE CANARY. Manage Assignments reads BOTH tables as
--     the logged-in user, so it is the page a wrong helper blanks. See the
--     trap in section 1. <==
--
-- SIDE EFFECT WORTH NAMING: the instructor dashboard selector becomes scoped to
-- the instructor's own class by this file, before Gate 3b touches any code.
-- That is correct and is invisible while there is one instructor with one
-- class. The stale comment on that line was corrected in the same commit.


-- ---------------------------------------------------------------------------
-- 0. PRE-FLIGHT. This file refuses to run if step 1 has not been run.
-- ---------------------------------------------------------------------------
-- Modelled on Gate 2's section 0, which did the same job for that piece.
--
-- Everything checked here is something that would BREAK after this file runs.
-- A row on rubrics, scenarios or assignments with no class becomes unreadable
-- and, for an assignment, unmanageable. A student with no membership row sees
-- an empty dashboard. An invite with no class produces another such student.
--
-- It stops BEFORE any rule is changed, so a stop leaves the system exactly as
-- it is now. IF IT STOPS: run supabase/gate-3a-repair.sql, then run this again.
--
-- The three hygiene tables (sessions and the two audit logs) get a message
-- rather than a stop. Their rules already went strict in Gate 2 and no page
-- reads them through the rules, so they cannot break anything today. They do
-- matter to Gate 3b, so the count is reported rather than ignored.
do $$
declare
  n_rubrics   integer;
  n_scenarios integer;
  n_assign    integer;
  n_invites   integer;
  n_students  integer;
  n_hygiene   integer;
  n_blocking  integer;
begin
  select count(*) into n_rubrics   from public.rubrics        where class_id is null;
  select count(*) into n_scenarios from public.scenarios      where class_id is null;
  select count(*) into n_assign    from public.assignments    where class_id is null;
  select count(*) into n_invites   from public.allowed_emails where class_id is null;

  select count(*) into n_students
  from public.profiles p
  where p.role = 'student'
    and not exists (select 1 from public.class_members m where m.user_id = p.id);

  select (select count(*) from public.sessions           where class_id is null)
       + (select count(*) from public.submission_resets  where class_id is null)
       + (select count(*) from public.assignment_deletes where class_id is null)
    into n_hygiene;

  n_blocking := n_rubrics + n_scenarios + n_assign + n_invites + n_students;

  if n_blocking > 0 then
    raise exception
      'Gate 3a stopped: % rows still have no class, so this file would break the app. rubrics %, scenarios %, assignments %, invites %, students with no membership %. Run supabase/gate-3a-repair.sql first. NOTHING WAS CHANGED.',
      n_blocking, n_rubrics, n_scenarios, n_assign, n_invites, n_students;
  end if;

  if n_hygiene > 0 then
    raise notice 'Gate 3a note: % rows on sessions or the two audit logs still have no class. Nothing here breaks and this file will continue, but Gate 3b filters on those columns, so re-run supabase/gate-3a-repair.sql before starting Gate 3b.', n_hygiene;
  end if;

  raise notice 'Gate 3a pre-flight passed. Every row has a class. Tightening the rules.';
end $$;


-- ---------------------------------------------------------------------------
-- 1. A second helper: can this person READ things belonging to this class?
-- ---------------------------------------------------------------------------
-- ==> THE TRAP THIS FUNCTION EXISTS TO AVOID, and getting it wrong blanks the
--     instructor surface: CLASS MEMBERSHIP IS STUDENTS ONLY. <==
--
-- An instructor does NOT appear in class_members. They own a class through
-- classes.instructor_id. So a rule written as "is a member of this class"
-- denies every instructor, and the failure is quiet: Manage Assignments renders
-- perfectly and shows nothing at all. That is why this helper answers BOTH
-- halves, and why it is a separate function from the Gate 2 one.
--
-- It builds on public.instructs_class() from Gate 2 rather than repeating that
-- logic, so there is one definition of "owns this class" in the system.
--
-- SECURITY DEFINER IS LOAD BEARING AND MUST NEVER BE REMOVED, for the same
-- reason it is on instructs_class(). Gate 1 switched Row Level Security ON for
-- both classes and class_members with NO policies attached. A function that is
-- not security definer would read zero rows from either table, return false for
-- everybody, and blank every screen this rule governs.
--
-- IT RETURNS FALSE WHEN GIVEN NOTHING. can_read_class(null) matches no class
-- and no membership, so it is false. That is correct and deliberate: it is what
-- makes a row with no class invisible, and it is exactly why section 0 above
-- has to refuse to run while any such row exists.
create or replace function public.can_read_class(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.instructs_class(target)
      or exists (
        select 1
        from public.class_members
        where class_id = target
          and user_id = auth.uid()
      );
$$;

grant execute on function public.can_read_class(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. rubrics: read only the ones belonging to your class.
-- ---------------------------------------------------------------------------
-- WAS: any signed-in person could read every rubric in the system.
--
-- Who reads this through the rules: the student results page, to show each
-- rubric item's label and category next to its score. The rubric behind a
-- student's own assignment is in the class that student belongs to, so this
-- keeps working.
--
-- The instructor submission detail view also shows rubric labels, but it reads
-- with the service-role key, so it is unaffected either way.
drop policy if exists "read rubrics" on public.rubrics;
create policy "read rubrics"
  on public.rubrics for select
  using (public.can_read_class(class_id));


-- ---------------------------------------------------------------------------
-- 3. scenarios: read only the ones belonging to your class.
-- ---------------------------------------------------------------------------
-- WAS: any signed-in person could read every scenario in the system.
--
-- Who reads this through the rules: the student session page and results page
-- (case title and persona name), the student home (joined in beneath each
-- assignment), the instructor dashboard selector (joined in the same way), and
-- the create-assignment dropdown on Manage Assignments.
--
-- This is a ROW rule and it does not replace Gate 2's COLUMN work. Gate 2 took
-- persona_system_prompt and scenario_context away from ordinary users because
-- no row rule can protect them: a student is legitimately entitled to the row
-- for their own case, which is exactly the row whose hidden prompt they would
-- want. Both are needed. Neither replaces the other.
--
-- ==> STILL TRUE, AND STILL THE THING TO REMEMBER: IF A NEW COLUMN IS EVER
--     ADDED TO scenarios, RE-RUN supabase/gate-2-policies.sql. <==
drop policy if exists "read scenarios" on public.scenarios;
create policy "read scenarios"
  on public.scenarios for select
  using (public.can_read_class(class_id));


-- ---------------------------------------------------------------------------
-- 4. assignments: read only the ones belonging to your class.
-- ---------------------------------------------------------------------------
-- WAS: any signed-in person could read every assignment in the system.
--
-- Who reads this through the rules: the student home, the student session page,
-- the instructor dashboard selector, and the published list on Manage
-- Assignments.
--
-- THIS IS THE ONE THAT MAKES THE STUDENT SPECIMEN TEST MEAN SOMETHING. Before
-- the repair, null-student@yahoo.com had no membership row. After this rule
-- lands, an account in that state reads no assignments at all and its dashboard
-- is empty. That account showing its assignments is the proof that the repair
-- and this rule agree with each other.
drop policy if exists "read assignments" on public.assignments;
create policy "read assignments"
  on public.assignments for select
  using (public.can_read_class(class_id));


-- ---------------------------------------------------------------------------
-- 5. assignments: drop the empty-class allowance from the manage rule.
-- ---------------------------------------------------------------------------
-- Gate 2 shipped this rule as "instructs_class(class_id) or class_id is null"
-- for one stated reason: components/create-assignment-form.tsx inserted and
-- components/edit-assignment-form.tsx updated from the browser, through these
-- rules, and neither set a class because nothing did until Gate 3. A flat check
-- would have refused the insert and broken the live site. Gate 2 recorded the
-- cost out loud: an assignment created in that window has no class and ANY
-- instructor can manage it.
--
-- Step 2 of this piece teaches the create form to set a class, and step 1
-- repaired every assignment written during the window. So the allowance is now
-- a hole and nothing more, and it comes out here.
--
-- THE EDIT FORM NEEDS NO CHANGE and that is not an oversight: it updates the
-- low-risk fields and never touches class_id, so once the row has a class it
-- passes both halves of this rule unchanged. That is why write path 1 of Gate
-- 3a is the create form and there is no write path for the edit form.
--
-- Otherwise word for word what Gate 2 shipped.
--
-- ===========================================================================
-- ==> PHASE 2a NOTE, ADDED 2026-09-09. THIS RULE IS NO LONGER THE ENFORCEMENT.
--     IT IS THE BACKSTOP. DO NOT DELETE IT.
--
--     WHY IT WILL LOOK LIKE DEAD CODE. Until Phase 2a, this rule WAS the
--     authorisation for creating an assignment, because
--     components/create-assignment-form.tsx inserted straight from the browser
--     with the ordinary logged-in client and the database refused anything
--     else. Phase 2a moved that write to
--     app/api/instructor/assignment/create/route.ts, WHICH USES THE
--     SERVICE-ROLE KEY AND THEREFORE BYPASSES ROW LEVEL SECURITY COMPLETELY.
--
--     So nothing in the browser writes assignments any more, and a search for
--     callers of this rule will come back empty. A tidy-minded session will
--     conclude it is unused. IT IS NOT UNUSED, IT IS UNTRIGGERED, AND THOSE ARE
--     DIFFERENT THINGS.
--
--     WHAT IT STILL DOES:
--       - It is the reason a browser CANNOT go back to writing assignments
--         directly. Delete it and the anon key plus a crafted request is once
--         again a write path into any class.
--       - It still governs the ordinary logged-in client everywhere else,
--         including any future browser read or write of this table.
--       - It is what Gate 2 and Gate 3a built it to be: defence in depth
--         underneath the application check, not a substitute for it.
--
--     THE APPLICATION CHECK THAT NOW SITS ABOVE IT is requireInstructorRequest()
--     plus refuseOutsideClass() in that route. Gate Finding 1 says the isolation
--     lives in the application layer or it does not exist. This rule is the
--     floor under that, and a floor you never stand on is still holding you up.
-- ===========================================================================
drop policy if exists "instructors manage assignments" on public.assignments;
create policy "instructors manage assignments"
  on public.assignments for all
  using      (public.instructs_class(class_id))
  with check (public.instructs_class(class_id));


-- ---------------------------------------------------------------------------
-- 6. WHAT IS DELIBERATELY NOT IN THIS FILE.
-- ---------------------------------------------------------------------------
-- THE TWO allowed_emails RULES STILL SAY is_instructor(), on purpose. Gate 2
-- left them and Gate 3a leaves them too. Step 2 makes both invite paths set a
-- class, which is the prerequisite for scoping them, but scoping the read half
-- changes what the Roster shows and that belongs with Gate 3b's read work, in
-- one reviewable piece, rather than being split across two sessions.
--
-- NO READ FILTERING WAS ADDED TO ANY PAGE OR ROUTE, and lib/instructor-submission.ts
-- is untouched. It still reads any submission by id with only a role check,
-- which is the recordings hole. That is Gate 3b's headline fix.
--
-- NO "not null" WAS ADDED TO ANY class_id COLUMN. That is a cleanup step after
-- Gate 3b, once every write is proven in production rather than in principle.


-- ---------------------------------------------------------------------------
-- 7. HOW TO CHECK IT WORKED.
-- ---------------------------------------------------------------------------
-- The queries are in supabase/gate-3a-tests.sql, group C, ready to paste.
-- The click-through starts with Manage Assignments, and the failure signature
-- is one line: if Manage Assignments lists no assignments, or either dropdown
-- is empty, then can_read_class has the owner half wrong. Run
-- supabase/gate-3a-revert.sql immediately rather than debugging forward.
