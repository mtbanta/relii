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
--   3. It removes the instructs_class() helper, last, once no rule needs it.
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
-- 5. Remove the helper, last.
-- ---------------------------------------------------------------------------
-- This has to come after sections 1 to 3. A function cannot be dropped while a
-- security rule still refers to it, so dropping it earlier in the file would
-- fail and stop the revert half-done. "if exists" means this is also fine when
-- Gate 2 was never run.
drop function if exists public.instructs_class(uuid);
