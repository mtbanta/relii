-- Relii Gate 3a REVERT: put the four security rules back exactly as they were.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run".
-- It is safe to run more than once, and it is safe to run even if
-- supabase/gate-3a-policies.sql was never run at all.
--
-- ===========================================================================
-- IT UNDOES STEP 3 ONLY. THE STEP 1 DATA REPAIR IS NOT UNDONE, ON PURPOSE.
-- ===========================================================================
-- Gate 3a has two SQL files. This reverts the SECOND one, the security rules.
-- It does NOT revert supabase/gate-3a-repair.sql, and there is no file that
-- does, deliberately:
--
--   * Emptying class_id back out would re-break exactly what the repair fixed,
--     and would leave the system worse than before Gate 3a, because the
--     deployed code would keep filling the column back in.
--   * It would delete the class membership row that lets
--     null-student@yahoo.com see a dashboard at all.
--   * The repair changed no rule, no column and no table. There is nothing
--     unsafe about it left standing after this file runs. Rows carrying a class
--     they are not yet filtered by is precisely the state Gate 1 and Gate 2 ran
--     in for three days.
--
-- So after running this file the system sits where it stood before step 3: the
-- data is repaired, the deployed code sets class_id on every write, and the
-- three read rules are open again.
--
-- WHEN TO USE IT. If anything on the Gate 3a click-through fails after running
-- supabase/gate-3a-policies.sql. THE ONE TO WATCH FIRST: if Manage Assignments
-- lists no assignments, or the create-assignment scenario dropdown is empty, or
-- the dashboard's assignment selector is empty, then can_read_class has its
-- owner half wrong and every instructor is being treated as a non-member. Run
-- this file immediately rather than debugging forward.
--
-- WHAT IT PUTS BACK
--   1. "read rubrics", "read scenarios" and "read assignments", returned word
--      for word to "auth.uid() is not null".
--   2. "instructors manage assignments", returned word for word to the Gate 2
--      version, with its "or class_id is null" allowance restored.
--   3. It removes the can_read_class() helper, LAST, once no rule needs it.
--
-- WHAT IT DOES NOT TOUCH, because Gate 3a did not touch them either: the Gate 2
-- helper instructs_class() (three other rules still depend on it, so removing
-- it would break Gate 2), the Gate 2 column permissions on scenarios, the five
-- other Gate 2 rules, the two allowed_emails rules, the profiles rule and the
-- Storage rule.
--
-- THE FOUR RULES BELOW ARE COPIED VERBATIM from their source files:
--   supabase/stage-2-data-model.sql   lines 111 to 138  (the three read rules)
--   supabase/gate-2-policies.sql      lines 253 to 257  (manage assignments)
-- If you ever need to check this file is faithful, diff it against those two.


-- ---------------------------------------------------------------------------
-- 1. read rubrics: back to "anyone signed in".
-- ---------------------------------------------------------------------------
drop policy if exists "read rubrics" on public.rubrics;
create policy "read rubrics"
  on public.rubrics for select
  using (auth.uid() is not null);


-- ---------------------------------------------------------------------------
-- 2. read scenarios: back to "anyone signed in".
-- ---------------------------------------------------------------------------
-- NOTE: this restores the ROW rule only. Gate 2's COLUMN work still stands, so
-- persona_system_prompt and scenario_context remain hidden from ordinary users.
-- That is correct: the persona leak has nothing to do with Gate 3a and must not
-- be reopened by reverting it. supabase/gate-2-revert.sql is the file that
-- undoes the column work, and it should not be run for a Gate 3a problem.
drop policy if exists "read scenarios" on public.scenarios;
create policy "read scenarios"
  on public.scenarios for select
  using (auth.uid() is not null);


-- ---------------------------------------------------------------------------
-- 3. read assignments: back to "anyone signed in".
-- ---------------------------------------------------------------------------
drop policy if exists "read assignments" on public.assignments;
create policy "read assignments"
  on public.assignments for select
  using (auth.uid() is not null);


-- ---------------------------------------------------------------------------
-- 4. instructors manage assignments: back to the Gate 2 version.
-- ---------------------------------------------------------------------------
-- The "or class_id is null" allowance comes back. With the deployed Gate 3a
-- code still live this is harmless, because every new assignment carries a
-- class anyway; the allowance simply stops being exercised.
drop policy if exists "instructors manage assignments" on public.assignments;
create policy "instructors manage assignments"
  on public.assignments for all
  using      (public.instructs_class(class_id) or class_id is null)
  with check (public.instructs_class(class_id) or class_id is null);


-- ---------------------------------------------------------------------------
-- 5. Remove the helper, last.
-- ---------------------------------------------------------------------------
-- Last, because dropping a function three rules above still depended on would
-- fail. By this point nothing references it.
--
-- instructs_class() is NOT dropped: it is Gate 2's, and rubrics, scenarios,
-- sessions and both audit logs still use it.
drop function if exists public.can_read_class(uuid);


-- ---------------------------------------------------------------------------
-- 6. Confirm it worked.
-- ---------------------------------------------------------------------------
-- Paste this separately afterwards. All four rules should read
-- "(auth.uid() IS NOT NULL)" for the three reads, and the manage rule should
-- once again contain "class_id IS NULL".
--
--   select tablename, policyname, qual
--     from pg_policies
--    where schemaname = 'public'
--      and policyname in ('read rubrics', 'read scenarios', 'read assignments',
--                         'instructors manage assignments')
--    order by tablename, policyname;
--
-- And this should return no rows, meaning the helper is gone:
--
--   select proname from pg_proc
--    where proname = 'can_read_class'
--      and pronamespace = 'public'::regnamespace;
