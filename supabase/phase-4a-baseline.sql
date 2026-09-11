-- PHASE 4a BASELINE. READ ONLY. Run this BEFORE the migration and before any
-- code is pushed.
--
-- HOW TO USE: this file is READ ONLY. It creates nothing, changes nothing and
-- deletes nothing. It is the "what was here before we touched it" record, so
-- that the cleanup at the end of the phase can be checked against a number
-- rather than against a memory.
--
-- ==> ONE NUMBER IN HERE IS NOT ZERO AND MUST NOT BE READ AS LITTER.
--     assignment_deletes in B1 is 1, not 0. That row is id
--     d1492d69-42bb-418d-8314-991593aafbd2, written by Phase 3a's own proof run
--     when it really did delete an assignment holding two practices. The audit
--     row is the record of a real deletion and deleting it would defeat the
--     point of having an audit. B1's audit baseline has been 1 since
--     2026-09-10. <==
--
-- Queries 1 to 4 describe B1. Queries 5 and 6 are the whole database, which is
-- where the invariants PROJECT_STATE tracks live. Queries 7 to 9 are the
-- "before" half of this phase's own migration: they must show the new things
-- ABSENT, so that a later run showing them present is evidence the migration
-- landed rather than evidence somebody assumed it did.

-- ---------------------------------------------------------------------------
-- 1. B1 itself, looked up by name so this file needs no id pasted into it.
-- ---------------------------------------------------------------------------
select 'QUERY 1  the class' as label, c.id, c.name, p.email as instructor
  from public.classes as c
  left join public.profiles as p on p.id = c.instructor_id
 where c.name like 'B1%';

-- ---------------------------------------------------------------------------
-- 2. What B1 holds, one row per table.
-- ---------------------------------------------------------------------------
with b1 as (select id from public.classes where name like 'B1%' limit 1)
select 'QUERY 2  B1 contents' as label,
       (select count(*) from public.assignments       where class_id = (select id from b1)) as assignments,
       (select count(*) from public.rubrics           where class_id = (select id from b1)) as rubrics,
       (select count(*) from public.scenarios         where class_id = (select id from b1)) as scenarios,
       (select count(*) from public.sessions          where class_id = (select id from b1)) as sessions,
       (select count(*) from public.allowed_emails    where class_id = (select id from b1)) as invites,
       (select count(*) from public.class_members     where class_id = (select id from b1)) as members,
       -- BOTH AUDIT TABLES. assignment_deletes is EXPECTED TO BE 1.
       (select count(*) from public.submission_resets   where class_id = (select id from b1)) as submission_resets,
       (select count(*) from public.assignment_deletes  where class_id = (select id from b1)) as assignment_deletes;

-- ---------------------------------------------------------------------------
-- 3. B1's sessions broken out by kind and status, because "3 sessions" hides
--    whether any of them is unfinished.
-- ---------------------------------------------------------------------------
with b1 as (select id from public.classes where name like 'B1%' limit 1)
select 'QUERY 3  B1 sessions' as label, s.kind, s.status, count(*) as n
  from public.sessions as s
 where s.class_id = (select id from b1)
 group by s.kind, s.status
 order by s.kind, s.status;

-- ---------------------------------------------------------------------------
-- 4. B1's audit rows in full, so the ones that exist now can be told apart
--    from the ones this phase writes.
-- ---------------------------------------------------------------------------
with b1 as (select id from public.classes where name like 'B1%' limit 1)
select 'QUERY 4  B1 assignment_deletes' as label, id, assignment_title,
       instructor_email, submissions_deleted, practices_deleted, created_at
  from public.assignment_deletes
 where class_id = (select id from b1)
 order by created_at;

-- ---------------------------------------------------------------------------
-- 5. The whole database. These are the numbers PROJECT_STATE tracks as
--    invariants, and none of them should move during this phase.
-- ---------------------------------------------------------------------------
select 'QUERY 5  whole database' as label,
       (select count(*) from public.rubrics)                                as rubrics,
       (select count(*) from public.assignments)                            as assignments,
       (select count(*) from public.sessions)                               as sessions,
       (select count(*) from public.sessions where status = 'scored')       as scored_sessions,
       (select count(*) from public.sessions where assignment_id is null)   as sessions_with_no_assignment,
       (select count(*) from public.scenarios where rubric_id is not null)  as scenarios_naming_a_rubric;

-- ---------------------------------------------------------------------------
-- 6. THE LEGACY SCORES, which this phase has to refuse rather than edit.
--    A stored score item with no "level" predates Phase 2b-1. There are 32 of
--    them and they live on assignments that carry no rubric.
-- ---------------------------------------------------------------------------
select 'QUERY 6  legacy scores' as label,
       count(*) filter (where s.score is not null)                                  as scores_stored,
       count(*) filter (where s.score is not null and a.rubric_id is null)           as scores_whose_assignment_has_no_rubric,
       count(*) filter (where s.score is not null
                          and not (s.score -> 'items' -> 0 ? 'level'))               as scores_whose_first_item_has_no_level
  from public.sessions as s
  left join public.assignments as a on a.id = s.assignment_id;

-- ---------------------------------------------------------------------------
-- 7. THE STATUS CONSTRAINT, READ FROM pg_constraint RATHER THAN FROM A FILE.
--
--    Phase 4 handoff item 3: lib/assignment-sessions.ts is total only while the
--    database permits exactly these three statuses and two kinds. This phase
--    adds NO status, and this query is the measurement that says so. Re-run it
--    after the migration: it must be byte for byte the same.
-- ---------------------------------------------------------------------------
select 'QUERY 7  session constraints' as label, con.conname,
       pg_get_constraintdef(con.oid) as definition
  from pg_constraint as con
  join pg_class as rel on rel.oid = con.conrelid
  join pg_namespace as ns on ns.oid = rel.relnamespace
 where ns.nspname = 'public' and rel.relname = 'sessions'
   and con.conname in ('sessions_status_check', 'sessions_kind_check')
 order by con.conname;

-- ---------------------------------------------------------------------------
-- 8. NOTHING THIS PHASE ADDS IS THERE YET. Every number must be 0.
-- ---------------------------------------------------------------------------
-- ==> IT COUNTS RATHER THAN LISTING, AND THAT IS THE POINT OF THE QUERY. The
--     obvious way to write this is to select the matching rows and say "expect
--     none". An empty result is the weakest evidence there is: it looks exactly
--     the same whether the thing is genuinely absent or the query had a typo in
--     a table name and was never going to match anything. A zero is an answer;
--     an empty list is the absence of one. Re-run this query AFTER the migration
--     and every number must be 1, which is what turns this into a before and
--     after pair rather than a hopeful look. <==
select 'QUERY 8  what this phase adds, before' as label,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'sessions'
           and column_name = 'reviewed_at')                         as reviewed_at_column,
       (select count(*) from information_schema.tables
         where table_schema = 'public'
           and table_name = 'submission_ai_scores')                 as ai_scores_table,
       (select count(*) from information_schema.tables
         where table_schema = 'public'
           and table_name = 'submission_reviews')                   as reviews_table,
       (select count(*) from pg_proc as p
          join pg_namespace as n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'save_submission_review')                as review_function;
