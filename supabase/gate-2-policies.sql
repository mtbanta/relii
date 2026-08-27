-- Relii Gate 2: class-owned security rules, and closing the persona leak.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- RUN THE PRE-FLIGHT IN SECTION 0 FIRST, AS A SEPARATE QUERY. It takes ten
-- seconds and it is the one thing that can turn this file into an outage. Do
-- not skip it.
--
-- WHAT THIS IS FOR
-- Gate 1 gave every row a class to belong to. Nothing read it. This file makes
-- the database's security rules read it: an instructor rule now asks "is this
-- person THIS class's instructor" instead of "is this person an instructor".
--
-- MOST OF THIS FILE CHANGES NOTHING YOU CAN SEE, AND THAT IS THE INTENT.
-- The instructor screens do not read through these rules. 32 files use the
-- service-role key, which bypasses row security entirely, and that covers four
-- of the nine instructor pages and eleven of the fourteen instructor routes. So
-- these rules are a BACKSTOP: they are what protects the data if a page is ever
-- rewritten to read as the logged-in user, or if someone calls the web API
-- directly with a browser key. Gate 3 is where isolation actually lands.
--
-- THE ONE PART THAT IS NOT DEFENSIVE is section 9, the column permissions on
-- scenarios. That closes a real, live exposure: today any signed-in student can
-- read persona_system_prompt, the instructions that drive the AI persona for
-- the case they are about to be graded on.
--
-- SAFE TO RUN TWICE. Every policy is dropped before it is created, and the
-- column permissions in section 9 rebuild themselves from scratch on each run.
--
-- WHAT THIS DOES NOT DO
-- No page or route changes (Gate 3). No NOT NULL on class_id (after Gate 3).
-- No Storage rule change (there is no instructor Storage rule to change, see
-- section 8). No super admin and no cascade delete (Gate 4).


-- ---------------------------------------------------------------------------
-- 0. PRE-FLIGHT. RUN THIS BY ITSELF, BEFORE THE REST OF THE FILE.
-- ---------------------------------------------------------------------------
-- WHY. Gate 1 put every assignment that already existed into one class,
-- "Relii Demo (Historical)", owned by the first seeded instructor account.
-- Section 4 below stops an instructor managing an assignment in a class they do
-- not own. Those two facts collide if any OTHER instructor created an
-- assignment before Gate 1 ran: that assignment now sits in a class they do not
-- own, and after this file runs they could no longer edit it from the Manage
-- Assignments page. That is a live break, not a backstop.
--
-- The query below finds exactly those rows. Copy it into a new query and run it
-- on its own.
--
--   select
--     1 as line,
--     coalesce(p.email, '(creator account no longer has a profile row)') as who,
--     coalesce(c.name, '(class row missing)') as class_the_assignment_sits_in,
--     count(*) as assignment_count
--   from public.assignments a
--   left join public.profiles p on p.id = a.created_by
--   left join public.classes  c on c.id = a.class_id
--   where a.created_by is not null
--     and a.class_id  is not null
--     and not exists (
--       select 1
--       from public.classes c2
--       where c2.id = a.class_id
--         and c2.instructor_id = a.created_by
--     )
--   group by 2, 3
--
--   union all
--
--   select
--     2,
--     '(assignments with no creator on record: created_by is null)',
--     '(not a break risk, see the note below)',
--     count(*)
--   from public.assignments
--   where created_by is null
--
--   order by line, assignment_count desc;
--
-- HOW TO READ THE RESULT.
--
-- LINE 1 IS THE BREAK RISK. If it returns no rows, nothing is at risk and you
-- can run the rest of this file as it stands. If it returns rows, run the move
-- statement further down BEFORE running this file.
--
-- LINE 2 IS THE HONESTY LINE, and it exists so "line 1 returned nothing" is not
-- mistaken for "every assignment is accounted for". assignments.created_by is
-- optional and is set to null when the account that created it is deleted, so
-- those rows cannot be matched to an instructor and line 1 cannot see them.
-- They are NOT a break risk, for a reason worth stating plainly: the Manage
-- Assignments page lists only assignments where created_by equals the logged-in
-- instructor (app/instructor/assignments/page.tsx line 55), and a null matches
-- nobody, so no instructor is offered an edit control for these rows in the
-- first place. They stay visible on the student dashboard and in the instructor
-- dashboard selector, both of which are reads, and reads are unaffected by
-- section 4. Whoever owns their class can still manage them through the API.
--
-- IF LINE 1 RETURNED ROWS, run this move statement first. It puts each
-- mis-scoped assignment into the class its own creator owns. It deliberately
-- moves ONLY rows whose creator owns exactly one class, so it can never guess
-- between two classes:
--
--   update public.assignments a
--      set class_id = c.id
--     from public.classes c
--    where c.instructor_id = a.created_by
--      and a.created_by is not null
--      and a.class_id  is not null
--      and not exists (
--        select 1
--        from public.classes c2
--        where c2.id = a.class_id
--          and c2.instructor_id = a.created_by
--      )
--      and (
--        select count(*) from public.classes c3
--        where c3.instructor_id = a.created_by
--      ) = 1;
--
-- THEN RE-RUN THE PRE-FLIGHT. Anything still showing on line 1 has a creator
-- who owns no class, or more than one, and needs a human decision about which
-- class it belongs in. This query names them:
--
--   select
--     a.created_by,
--     coalesce(max(p.email), '(no profile row)') as creator,
--     (select count(*) from public.classes c3
--       where c3.instructor_id = a.created_by)  as classes_this_person_owns,
--     count(*)                                  as assignments_still_mis_scoped
--   from public.assignments a
--   left join public.profiles p on p.id = a.created_by
--   where a.created_by is not null
--     and a.class_id  is not null
--     and not exists (
--       select 1 from public.classes c2
--       where c2.id = a.class_id and c2.instructor_id = a.created_by
--     )
--   group by a.created_by;
--
-- Do not widen section 4 to let people manage anything they created. That would
-- put a creator-based escape hatch into the one rule this gate exists to
-- tighten, and Gate 3 would only have to take it out again.


-- ---------------------------------------------------------------------------
-- 1. instructs_class(): the one place that answers "is this your class?"
-- ---------------------------------------------------------------------------
-- This mirrors is_instructor() from supabase/schema.sql exactly: same language,
-- same security definer, same search_path, same stable marking, same grant. The
-- point of having it is that every rule below reads in plain English, and when
-- co-instructors arrive there is ONE function to change instead of six rules.
--
-- SECURITY DEFINER IS LOAD BEARING HERE. DO NOT REMOVE IT. Gate 1 switched row
-- security ON for the classes table with no rules attached, which means an
-- ordinary logged-in user can read nothing from it at all. Without "security
-- definer" this function would run as the instructor asking the question, see
-- zero rows, and return false for everybody. Every rule below would then deny
-- every instructor, and the instructor screens that still read through row
-- security would go blank. Running as the definer means it reads the classes
-- table with the owner's permission, which is the only way it can work.
--
-- IT RETURNS FALSE WHEN GIVEN NOTHING. instructs_class(null) matches no row, so
-- it is false. That is correct, and it is why section 4 has to say "or the
-- class is empty" out loud rather than leaning on this function to do it.
create or replace function public.instructs_class(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.classes
    where id = target
      and instructor_id = auth.uid()
  );
$$;

grant execute on function public.instructs_class(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. rubrics: only the owning class's instructor may manage them.
-- ---------------------------------------------------------------------------
-- STRICT, with no allowance for an empty class_id, and that is safe because it
-- was checked rather than assumed: nothing in the app creates or edits a rubric
-- from the browser. Every rubrics query in the codebase is a read, and the four
-- of them that go through these rules are covered by the separate "read
-- rubrics" rule, which is untouched.
--
-- The separate "read rubrics" rule still lets any signed-in person READ every
-- rubric. That is deliberate and is Gate 3's to tighten, not this file's: the
-- student results page reads rubric items through it, and narrowing it now
-- would empty the results page for any student who has no class membership yet.
drop policy if exists "instructors manage rubrics" on public.rubrics;
create policy "instructors manage rubrics"
  on public.rubrics for all
  using (public.instructs_class(class_id))
  with check (public.instructs_class(class_id));


-- ---------------------------------------------------------------------------
-- 3. scenarios: only the owning class's instructor may manage them.
-- ---------------------------------------------------------------------------
-- STRICT for the same checked reason as rubrics: every scenario write in the
-- app (the AI Persona Framework generate, edit, choose, disable and discard
-- routes) goes through the server's service-role key, never through the
-- browser. Nothing writes scenarios through these rules, so nothing can break.
--
-- As with rubrics, the separate "read scenarios" rule is untouched and still
-- lets any signed-in person read scenario rows. Section 9 is what makes that
-- acceptable: the two sensitive columns are taken away at the column level,
-- which a row rule cannot do.
drop policy if exists "instructors manage scenarios" on public.scenarios;
create policy "instructors manage scenarios"
  on public.scenarios for all
  using (public.instructs_class(class_id))
  with check (public.instructs_class(class_id));


-- ---------------------------------------------------------------------------
-- 4. assignments: class ownership, BUT an empty class_id is allowed through.
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE "TIDYING UP" THE "or class_id is null" PART. Removing it
-- breaks creating and editing assignments in production, immediately.
--
-- WHY IT IS THERE. Unlike rubrics and scenarios, assignments ARE written from
-- the browser through these rules, in two places:
--   components/create-assignment-form.tsx line 111 (insert)
--   components/edit-assignment-form.tsx   line 166 (update)
-- Neither one sets class_id, because nothing in the app sets it yet. Gate 3 is
-- the piece that teaches the form to set it. Until then, every assignment
-- created from that form arrives with an empty class_id. A flat
-- "instructs_class(class_id)" check would compare an empty value, come back
-- false, and refuse the insert. Creating an assignment would stop working the
-- moment this file ran.
--
-- WHAT IT COSTS, stated honestly. An assignment created between now and Gate 3
-- has no class, so any instructor can manage it. That hole is small and it is
-- bounded on both ends: Gate 1 already gave a class to every assignment that
-- existed before it, so this can only ever cover rows created inside this one
-- window, and Gate 3 closes it by making the form set class_id and by
-- backfilling anything created in the meantime. A rule that leaves a small,
-- time-boxed hole is strictly better than a rule that breaks the app.
--
-- ON AN EDIT, the "using" half is checked against the row as it stands and the
-- "with check" half against the row as it will be. The edit form changes
-- neither class_id nor created_by, so both halves see the same value and both
-- need the same allowance.
drop policy if exists "instructors manage assignments" on public.assignments;
create policy "instructors manage assignments"
  on public.assignments for all
  using      (public.instructs_class(class_id) or class_id is null)
  with check (public.instructs_class(class_id) or class_id is null);


-- ---------------------------------------------------------------------------
-- 5. sessions: students read their own, instructors read their class's.
-- ---------------------------------------------------------------------------
-- ONLY THE INSTRUCTOR HALF CHANGED. The student half is byte for byte what it
-- was, and it must stay that way: it is the rule that lets a student see their
-- own work, and it is the only thing standing between one student and another
-- student's transcript and score.
--
-- THE kind = 'submission' RESTRICTION IS KEPT, deliberately. Practice runs are
-- private to the student. An instructor must not read them, class or no class,
-- and narrowing the rule to a class must not quietly widen it to practice.
--
-- There is still deliberately NO insert, update or delete rule on this table.
-- Only the server's service-role key writes session rows.
--
-- WORTH KNOWING FOR GATE 3: nothing sets class_id on a NEW session yet, so
-- sessions created between now and Gate 3 have an empty class and are invisible
-- to the instructor half of this rule. That costs nothing today, because every
-- instructor read of sessions in the app uses the service-role key and bypasses
-- this rule entirely. It stops being free the moment Gate 3 moves those reads
-- onto the logged-in user, so Gate 3 must set class_id and backfill this window
-- in the same piece.
drop policy if exists "students read own sessions, instructors read submissions" on public.sessions;
create policy "students read own sessions, instructors read submissions"
  on public.sessions for select
  using (
    auth.uid() = student_id
    or (public.instructs_class(class_id) and kind = 'submission')
  );


-- ---------------------------------------------------------------------------
-- 6. submission_resets: the reset log, readable by the owning instructor only.
-- ---------------------------------------------------------------------------
-- Strict, and it cannot break anything: the instructor dashboard reads this
-- table with the service-role key (app/instructor/page.tsx line 169), so no
-- screen depends on this rule today. It is a pure backstop.
--
-- Same Gate 3 note as sessions above: nothing sets class_id on a new audit row
-- yet, so rows written in this window are invisible through this rule. Harmless
-- while the dashboard reads with the service-role key, and Gate 3's problem the
-- moment that changes.
drop policy if exists "instructors read reset log" on public.submission_resets;
create policy "instructors read reset log"
  on public.submission_resets for select
  using (public.instructs_class(class_id));


-- ---------------------------------------------------------------------------
-- 7. assignment_deletes: the delete log, readable by the owning instructor only.
-- ---------------------------------------------------------------------------
-- Strict, and even safer than section 6: no page in the app reads this table at
-- all. It is written by the delete route with the service-role key and read by
-- nobody. Purely a backstop against someone querying the web API by hand.
drop policy if exists "instructors read assignment delete log" on public.assignment_deletes;
create policy "instructors read assignment delete log"
  on public.assignment_deletes for select
  using (public.instructs_class(class_id));


-- ---------------------------------------------------------------------------
-- 8. TWO RULES THIS FILE DELIBERATELY DOES NOT TOUCH. READ BEFORE CHANGING.
-- ---------------------------------------------------------------------------
-- "instructors read invite list" and "instructors add to invite list", both on
-- allowed_emails, both in supabase/schema.sql, both still saying
-- public.is_instructor(). They are the only two of the original eight left that
-- way, and it is not an oversight or an unfinished job.
--
-- THE ADD RULE CANNOT BE SCOPED YET. components/add-email-form.tsx line 27
-- inserts an email and a role into allowed_emails straight from the browser,
-- through these rules, and does not set class_id. A "with check" demanding an
-- owned class would compare an empty value, come back false, and break inviting
-- anybody, in production, the moment it ran. It is the same trap section 4
-- describes, with no equivalent of the "or class_id is null" allowance
-- available, because on the invite list an empty class is the whole problem
-- rather than a survivable side effect.
--
-- SCOPING ONLY THE READ RULE IS NO BETTER. Any invite created between Gate 1
-- and Gate 3 has an empty class_id, so a class-scoped read would make those
-- invites vanish from the Roster page: someone would be invited, unable to be
-- seen, and unable to be un-invited.
--
-- BOTH BELONG IN GATE 3, together, alongside the change that teaches the invite
-- form to set class_id in the first place. Scoping the rules before the form
-- fills in the value is doing it in the wrong order.
--
-- ONE MORE FACT FOR WHOEVER PICKS THIS UP: the Roster page reads allowed_emails
-- with the service-role key (app/instructor/roster/page.tsx), so the read rule
-- currently has no reader in the app at all. That does not make scoping it
-- safe, it just means the damage would show up later, through the web API,
-- instead of immediately on screen.
--
-- AND STORAGE IS NOT A NINTH RULE TO FIX. supabase/stage-5-storage.sql has
-- exactly one rule, "students read own session videos", and it matches the
-- file's folder against the logged-in user's id. It never mentions
-- is_instructor(). Instructor playback runs entirely through the service-role
-- key in lib/instructor-submission.ts, which bypasses Storage rules. Do not add
-- an instructor Storage rule here. Scoping instructor playback is Gate 3's job
-- and it happens in the route, not in Storage.


-- ---------------------------------------------------------------------------
-- 9. THE PERSONA LEAK. This is the part that changes something real.
-- ---------------------------------------------------------------------------
-- THE PROBLEM. Any signed-in student can read scenarios.persona_system_prompt,
-- the hidden instructions that drive the AI persona, and scenario_context.
--
-- WHY NO ROW RULE CAN FIX IT. This is a COLUMN problem wearing a row problem's
-- clothes. A student is legitimately entitled to the scenario row for their own
-- assignment: the session page and the results page both read it to show the
-- case title and the persona's name. Any row rule, however tight, has to let
-- that student read that row. And the row they are entitled to is exactly the
-- one whose hidden prompt they would most want, because it is the case they are
-- about to be graded on. Row scoping cannot help. Column permissions can.
--
-- WHY TAKING THEM AWAY COSTS NOTHING. Every read of these two columns in the
-- whole app happens in server code using the service-role key, which is not
-- affected by column permissions. All six of them:
--   app/api/chat/route.ts                       line  75
--   app/api/assignment/start/route.ts           line 126
--   app/api/voice/token/route.ts                line  75
--   app/api/session/start/route.ts              line  74
--   app/api/instructor/scaffold/edit/route.ts   line 118
--   lib/scaffold-candidates.ts                  line  67 (the AI Persona
--     Framework compare, edit and chain pages read through this file, which is
--     marked server-only and uses the service-role key throughout)
-- Every path that DOES go through these rules selects only title, persona_name,
-- rubric_id, id or enabled. There is no "select *" anywhere in the codebase, on
-- any table, so nothing quietly asks for all fourteen columns.
--
-- THE POSTGRES MECHANIC, AND GETTING IT BACKWARDS IS THE CLASSIC MISTAKE.
-- You cannot take a single column away from someone who holds permission on the
-- whole table. Supabase grants whole-table read to anon and authenticated by
-- default, so the order has to be: take the whole-table read away FIRST, then
-- hand back the columns that are fine. Done in the other order, the file runs,
-- reports success, and changes absolutely nothing.
--
-- WHY THIS IS WRITTEN AS A LOOP rather than as a list of twelve column names:
-- a hand-written list can be wrong, and nobody would notice. The loop asks the
-- database which columns exist and grants all of them except the two, so it
-- cannot be out of date and a second run repairs any drift.
--
-- WHAT THIS COSTS LATER, AND IT IS THE ONE THING TO REMEMBER:
--   ==> IF YOU ADD A NEW COLUMN TO scenarios, RE-RUN THIS FILE. <==
-- A column added after this runs is not granted to anybody, so ordinary users
-- cannot read it and any page that tries fails with "permission denied for
-- column". Re-running this file fixes it. Server code using the service-role
-- key is unaffected either way, so the failure will only ever show up on a
-- student page or an instructor page that reads as the logged-in user.
--
-- service_role IS DELIBERATELY NOT TOUCHED below. That is exactly why all six
-- server reads above keep working.

-- Step one: take the whole-table read away. This must come first.
revoke select on table public.scenarios from anon, authenticated;

-- Step two: hand back every column except the two secret ones.
do $$
declare
  col record;
begin
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'scenarios'
      and column_name not in ('persona_system_prompt', 'scenario_context')
    order by ordinal_position
  loop
    execute format(
      'grant select (%I) on public.scenarios to anon, authenticated',
      col.column_name
    );
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 10. HOW TO CHECK IT WORKED. Run these separately, after the file.
-- ---------------------------------------------------------------------------
-- They are in supabase/gate-2-policies-tests.sql as well, ready to paste.
--
-- IF SOMETHING IS WRONG, supabase/gate-2-revert.sql puts everything back
-- exactly as it was. Read it before you run this file, not after.
