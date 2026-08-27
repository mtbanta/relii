-- Relii Gate 2 CHECKS. Read-only. Nothing here changes anything.
--
-- HOW TO USE: SQL Editor, New query, paste ONE of the four queries below at a
-- time, and click "Run". They are separated so each result is easy to read.
--
-- Run checks A and B AFTER supabase/gate-2-policies.sql.
-- Check C is the one to run FIRST if anything looks wrong, because it catches
-- the single failure that looks like success.


-- ===========================================================================
-- CHECK A: every security rule on every table Gate 2 cares about.
-- ===========================================================================
-- WHAT YOU SHOULD SEE.
--   SIX rules mentioning instructs_class:
--     rubrics            "instructors manage rubrics"
--     scenarios          "instructors manage scenarios"
--     assignments        "instructors manage assignments"   (also says "class_id IS NULL")
--     sessions           "students read own sessions, ..."  (also says "auth.uid() = student_id")
--     submission_resets  "instructors read reset log"
--     assignment_deletes "instructors read assignment delete log"
--
--   TWO rules STILL mentioning is_instructor, on allowed_emails:
--     "instructors read invite list"
--     "instructors add to invite list"
--   These two are left alone on purpose. See section 8 of gate-2-policies.sql.
--
--   The three "read" rules (read rubrics, read scenarios, read assignments)
--   should still say "auth.uid() IS NOT NULL". Gate 2 does not touch them.
--
--   On the sessions row, confirm "auth.uid() = student_id" is still in the
--   using_expression and that "kind = 'submission'" is still there too.

select
  tablename,
  policyname,
  cmd                                          as applies_to,
  case
    when qual like '%instructs_class%'
      or with_check like '%instructs_class%'   then 'CLASS OWNERSHIP (rewritten by Gate 2)'
    when qual like '%is_instructor%'
      or with_check like '%is_instructor%'     then 'is_instructor (left alone on purpose)'
    else                                            'not an instructor rule'
  end                                          as what_it_says,
  qual                                         as using_expression,
  with_check                                   as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'rubrics',
    'scenarios',
    'assignments',
    'sessions',
    'submission_resets',
    'assignment_deletes',
    'allowed_emails',
    'profiles'
  )
order by tablename, policyname;


-- ===========================================================================
-- CHECK B: the column permissions on scenarios.
-- ===========================================================================
-- WHAT YOU SHOULD SEE. Fourteen rows. Exactly TWO of them say NO:
--     persona_system_prompt   NO
--     scenario_context        NO
-- The other twelve say yes. If more than two say NO, a column was missed and
-- something will be broken; re-run supabase/gate-2-policies.sql, which repairs
-- itself. If none say NO, read check C: the revoke did not take effect.
--
-- This reads the answer out of the database rather than trusting the file.
-- information_schema.column_privileges reports both kinds of permission, the
-- per-column sort and the whole-table sort, so a "yes" here means genuinely
-- readable by a logged-in user and a "NO" means genuinely not.

select
  c.ordinal_position                                    as col_no,
  c.column_name,
  case when cp.privilege_type is null then 'NO' else 'yes' end
                                                        as authenticated_can_read,
  case
    when c.column_name in ('persona_system_prompt', 'scenario_context')
      then 'should be NO'
    else 'should be yes'
  end                                                   as expected
from information_schema.columns c
left join information_schema.column_privileges cp
       on cp.table_schema    = c.table_schema
      and cp.table_name      = c.table_name
      and cp.column_name     = c.column_name
      and cp.grantee         = 'authenticated'
      and cp.privilege_type  = 'SELECT'
where c.table_schema = 'public'
  and c.table_name   = 'scenarios'
order by c.ordinal_position;


-- ===========================================================================
-- CHECK C: who still holds whole-table read on scenarios.
-- ===========================================================================
-- THIS IS THE ONE THAT CATCHES A SILENT FAILURE. Per-column permissions mean
-- nothing while somebody still holds read on the whole table, so if check B
-- showed no NOs, this query explains why.
--
-- WHAT YOU SHOULD SEE:
--   service_role   SELECT     <== MUST still be here. All six server reads of
--                                 the persona prompt depend on it. If it is
--                                 missing, the role-plays will fail.
--   postgres / supabase_admin / other maintenance roles may appear. Fine.
--
--   anon           <== must NOT appear with SELECT
--   authenticated  <== must NOT appear with SELECT
--   PUBLIC         <== must NOT appear with SELECT. If PUBLIC ever shows up
--                      here, every logged-in user inherits read on all fourteen
--                      columns through it and the column work is defeated. It
--                      is not granted by default and should not be present.
--                      If you see it, stop and say so before going further.

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'scenarios'
  and privilege_type = 'SELECT'
order by grantee;


-- ===========================================================================
-- CHECK D: the helper function exists and is set up correctly.
-- ===========================================================================
-- WHAT YOU SHOULD SEE. One row:
--   instructs_class | security definer? true | stable? true | search_path set
-- "security definer" being true is the important one. If it is false, every
-- instructor rule above silently denies every instructor, because Gate 1 locked
-- the classes table and only a definer function can read it.

select
  p.proname                                   as function_name,
  p.prosecdef                                 as is_security_definer,
  p.provolatile = 's'                         as is_stable,
  p.proconfig                                 as search_path_setting,
  pg_get_function_identity_arguments(p.oid)   as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('instructs_class', 'is_instructor')
order by p.proname;
