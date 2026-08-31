-- Relii Gate 2 REVERT: put the security rules back exactly as they were.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run".
-- It is safe to run more than once, and it is safe to run even if
-- supabase/gate-2-policies.sql was never run at all.
--
-- WHEN TO USE IT. If anything on the Gate 2 checklist fails after running
-- supabase/gate-2-policies.sql, run this. It takes the system back to exactly
-- where it stood on the morning of 2026-08-26, with Gate 1 in place and Gate 2
-- undone. Nothing is lost: this file changes only permissions and security
-- rules, and touches no data, no table and no column.
--
-- WHAT IT PUTS BACK
--   1. The six instructor rules, returned word for word to public.is_instructor().
--   2. Whole-table read on scenarios for anon and authenticated, which undoes
--      the column restriction and makes persona_system_prompt readable again.
--   3. It LEAVES the instructs_class() helper in place. See section 5.
--   0. And, since Gate 4a, it FIRST re-creates public.is_instructor(), because
--      Gate 4a deleted it and all six rules below call it. See section 0.
--
-- WHAT IT DOES NOT TOUCH, because Gate 2 did not touch them either: the two
-- allowed_emails rules, the three "read" rules on rubrics, scenarios and
-- assignments, the profiles rule, and the Storage rule.
--
-- THE SIX RULES BELOW ARE COPIED VERBATIM from their original files:
--   supabase/stage-2-data-model.sql          (rubrics, scenarios, assignments, sessions)
--   supabase/stage-8-reset-audit.sql         (submission_resets)
--   supabase/stage-8-assignment-delete-audit.sql (assignment_deletes)
-- If you ever need to check this file is faithful, diff it against those three.


-- ---------------------------------------------------------------------------
-- 0. FIRST, BRING BACK public.is_instructor(). ADDED BY GATE 4a.
-- ---------------------------------------------------------------------------
-- ==> WHY A GATE 2 FILE GAINED A SECTION LONG AFTER GATE 2 SHIPPED, AND WHY
--     REMOVING THIS SECTION BREAKS THE WHOLE FILE. <==
--
-- Every rule below calls public.is_instructor(). That function existed
-- continuously from Stage 1 until 2026-08-31, so this file never had to think
-- about it. Then supabase/gate-4a-constraints.sql DELETED it, correctly: Gate 2
-- moved six rules off it and Gate 3b moved the last two, so by then it was
-- called by nothing at all.
--
-- Without this section, running this file after Gate 4a fails on the very first
-- rule with "function public.is_instructor() does not exist", and it fails
-- HALFWAY, leaving some rules reverted and some not. That is the worst possible
-- state to be in during the emergency that made you open this file.
--
-- The alternative was to write "run supabase/gate-4a-revert.sql first" in the
-- header. A documented two-step is exactly what gets forgotten under pressure,
-- and this is nine lines, so the file simply carries what it needs.
--
-- VERBATIM from supabase/schema.sql lines 87 to 98, with the grant from line
-- 101. schema.sql line 100 grants a DIFFERENT function (is_email_allowed) and is
-- deliberately not copied here: the two grants sit next to each other and are
-- easy to confuse.
--
-- "create or replace" means this is correct whether the function is currently
-- missing (after Gate 4a) or already present (before it). Either way this file
-- works on its own, which is the whole point.

-- Is the person making this request an instructor?
create or replace function public.is_instructor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'instructor'
  );
$$;

grant execute on function public.is_instructor() to authenticated;


-- ---------------------------------------------------------------------------
-- 1. The four rules from stage-2-data-model.sql.
-- ---------------------------------------------------------------------------
drop policy if exists "instructors manage rubrics" on public.rubrics;
create policy "instructors manage rubrics"
  on public.rubrics for all
  using (public.is_instructor())
  with check (public.is_instructor());

drop policy if exists "instructors manage scenarios" on public.scenarios;
create policy "instructors manage scenarios"
  on public.scenarios for all
  using (public.is_instructor())
  with check (public.is_instructor());

drop policy if exists "instructors manage assignments" on public.assignments;
create policy "instructors manage assignments"
  on public.assignments for all
  using (public.is_instructor())
  with check (public.is_instructor());

drop policy if exists "students read own sessions, instructors read submissions" on public.sessions;
create policy "students read own sessions, instructors read submissions"
  on public.sessions for select
  using (
    auth.uid() = student_id
    or (public.is_instructor() and kind = 'submission')
  );


-- ---------------------------------------------------------------------------
-- 2. The reset log rule from stage-8-reset-audit.sql.
-- ---------------------------------------------------------------------------
drop policy if exists "instructors read reset log" on public.submission_resets;
create policy "instructors read reset log"
  on public.submission_resets for select
  using (public.is_instructor());


-- ---------------------------------------------------------------------------
-- 3. The delete log rule from stage-8-assignment-delete-audit.sql.
-- ---------------------------------------------------------------------------
drop policy if exists "instructors read assignment delete log" on public.assignment_deletes;
create policy "instructors read assignment delete log"
  on public.assignment_deletes for select
  using (public.is_instructor());


-- ---------------------------------------------------------------------------
-- 4. Give the scenarios table back its whole-table read.
-- ---------------------------------------------------------------------------
-- ONE LINE IS ENOUGH, and it is worth knowing why. Permission on the whole
-- table covers every column in it, including any column that has its own
-- separate permission, so this immediately restores read access to all fourteen
-- columns. That is the same rule that made section 9 of the Gate 2 file have to
-- take the whole-table read away first: you cannot subtract a column from a
-- whole-table grant.
--
-- The twelve per-column grants Gate 2 left behind are not removed. They are
-- harmless, because the whole-table grant already covers them, and leaving them
-- keeps this revert to a single low-risk line at the moment you are most likely
-- to be running it in a hurry.
grant select on table public.scenarios to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. instructs_class() IS DELIBERATELY LEFT IN PLACE. DO NOT ADD A DROP HERE.
-- ---------------------------------------------------------------------------
-- This section used to end with "drop function if exists
-- public.instructs_class(uuid)". THAT LINE WAS REMOVED ON 2026-08-31 BY THE
-- OWNER'S RULING, and it was removed rather than made conditional: a leftover
-- helper that nothing calls costs nothing, while a conditional is a second thing
-- that can be wrong later.
--
-- ==> THE REASON, AND IT IS THE GENERAL RULE RATHER THAN A DETAIL ABOUT THIS
--     FILE: A REVERT UNDOES ONLY WHAT ITS OWN PIECE ADDED, AND instructs_class()
--     OUTLIVED GATE 2 THE MOMENT GATE 3a BUILT ON IT. <==
--
-- The specifics, so nobody puts the line back. Gate 3a's public.can_read_class()
-- CALLS instructs_class(), on purpose, so that there is one definition of "owns
-- this class" in the system, and three Gate 3a read rules use can_read_class.
-- These are old-style SQL functions whose body is a string, and Postgres records
-- NO dependency on what such a body calls, so the drop SUCCEEDED and
-- can_read_class then failed at the moment somebody used it: every read of
-- rubrics, scenarios and assignments through the security rules, which is the
-- student home, the student session and results pages, the instructor dashboard
-- selector and Manage Assignments. All at once, and only after this file had
-- reported success.
--
-- A SECOND THING THE REMOVAL FIXED, worth knowing: section 4 of
-- supabase/gate-3a-revert.sql re-creates a rule that CALLS instructs_class(). So
-- running this file and then that one used to fail outright. Now it does not.
