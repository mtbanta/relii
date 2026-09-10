-- Relii Phase 3a. THE BASELINE, READ ONLY. Three statements, run one at a time.
--
-- ==> THE REVERT IS "NOTHING". Every statement here is a SELECT. No row in this
--     file is written, updated or deleted, so there is nothing to undo. It is
--     stated anyway because the standing rule is that a revert is stated before
--     anything is applied, and "none needed" is an answer rather than an
--     omission.
--
-- ==> WHAT IT DELIBERATELY DOES NOT READ. No transcript, no score JSON, no
--     student-authored content, no student name or address. Statements 2 and 3
--     read assignment titles (instructor-authored), session KINDS and STATUSES,
--     and counts. Nothing else.
--
-- ==> WHY EACH ONE EXISTS.
--
--     1. Phase 3a's whole definition of "unfinished" assumes sessions.status
--        holds exactly three values. supabase/stage-2-data-model.sql line 84
--        says so, but a FILE saying so is not the DATABASE saying so, and this
--        project has already paid once for a document quoting another document.
--        A fourth value would make the rule wrong rather than incomplete.
--
--     2. Fix 2 changes which delete control an assignment shows. It is aimed at
--        throwaways, but it lands on every assignment in the class. This
--        statement computes, per assignment, the control shown TODAY and the
--        control shown AFTER, and flags the ones that differ, so a real
--        assignment moving from the typed DELETE to the plain confirm is seen
--        BEFORE the code changes rather than discovered afterwards.
--
--     3. The plain count to return B1 to at the end of the session.


-- ---------------------------------------------------------------------------
-- STATEMENT 1 of 3. The allowed values of sessions.status, from the database.
-- ---------------------------------------------------------------------------
-- Expected: one row, whose definition is
--   CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'scored'::text])))
-- Anything else means the unfinished rule has to be rewritten before any code is.
select
  con.conname                                  as constraint_name,
  pg_get_constraintdef(con.oid)                as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'sessions'
  and con.contype = 'c'
order by con.conname;


-- ---------------------------------------------------------------------------
-- STATEMENT 2 of 3. Every B1 assignment, and whether Fix 2 changes its control.
-- ---------------------------------------------------------------------------
-- THE UNFINISHED RULE, WRITTEN OUT ONCE HERE IN SQL exactly as lib/assignment
-- -sessions.ts will write it in TypeScript:
--   a submission is ALWAYS finished work (an in_progress one is the Interrupted
--     state, which has its own reset flow);
--   a practice at in_progress is unfinished;
--   a practice at completed is unfinished ONLY IF its assignment has a rubric
--     (that is a scoring failure); with no rubric, completed IS its finished
--     state;
--   a practice at scored is finished.
--
-- control_today  = the plain confirm only when the assignment has NO sessions.
-- control_after  = the plain confirm when it has no FINISHED work.
-- changed        = the column to read. Any 'YES' on a real assignment is the
--                  thing to show the owner before writing any code.
with b1 as (
  select id from public.classes where name = 'B1: A demo class'
),
tally as (
  select
    a.id,
    a.title,
    (a.rubric_id is not null)                                    as has_rubric,
    count(s.id)                                                  as sessions_total,
    count(s.id) filter (where s.kind = 'submission')             as submissions,
    count(s.id) filter (where s.kind = 'practice')               as practices,
    count(s.id) filter (
      where s.kind = 'practice'
        and (
          s.status = 'in_progress'
          or (s.status = 'completed' and a.rubric_id is not null)
        )
    )                                                            as unfinished
  from public.assignments a
  join b1 on b1.id = a.class_id
  left join public.sessions s on s.assignment_id = a.id
  group by a.id, a.title, a.rubric_id
)
select
  title,
  has_rubric,
  sessions_total,
  submissions,
  practices,
  unfinished,
  sessions_total - unfinished                                    as finished,
  case when sessions_total = 0 then 'plain' else 'typed DELETE' end        as control_today,
  case when sessions_total - unfinished = 0 then 'plain' else 'typed DELETE' end as control_after,
  case
    when (case when sessions_total = 0 then 'plain' else 'typed DELETE' end)
       = (case when sessions_total - unfinished = 0 then 'plain' else 'typed DELETE' end)
    then 'no'
    else 'YES'
  end                                                            as changed
from tally
order by changed desc, title;


-- ---------------------------------------------------------------------------
-- STATEMENT 3 of 3. B1's plain totals, to return the class to at the end.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.assignments a join b1 on b1.id = a.class_id)  as assignments,
  (select count(*) from public.sessions s
     join public.assignments a on a.id = s.assignment_id
     join b1 on b1.id = a.class_id)                                          as sessions,
  (select count(*) from public.rubrics r
     join b1 on b1.id = r.class_id)                                          as rubrics,
  (select count(*) from public.assignment_deletes d join b1 on b1.id = d.class_id) as audit_rows
from (select id from public.classes where name = 'B1: A demo class') b1;


-- ---------------------------------------------------------------------------
-- WHAT THE THREE STATEMENTS ACTUALLY RETURNED, 2026-09-10, BEFORE ANY CODE
-- CHANGED. Pasted from the run rather than described.
-- ---------------------------------------------------------------------------
--
-- STATEMENT 1. The database's own answer, and it matches stage-2-data-model.sql
-- line 84. Two constraints matter to Phase 3a and both are exhaustive:
--   sessions_status_check  CHECK ((status = ANY (ARRAY['in_progress','completed','scored'])))
--   sessions_kind_check    CHECK ((kind   = ANY (ARRAY['practice','submission'])))
-- ==> THREE STATUSES AND TWO KINDS, SO THE UNFINISHED RULE IS TOTAL RATHER THAN
--     MERELY BROAD: every (kind, status) pair the database permits is one of the
--     six the helper decides. There is no fourth value to fall through it. <==
-- A third constraint is worth writing down because it is load-bearing elsewhere:
--   submission_needs_assignment  CHECK (kind <> 'submission' OR assignment_id IS NOT NULL)
-- so a submission ALWAYS has an assignment, and only a practice can be one of the
-- 25 legacy null-assignment rows.
--
-- STATEMENT 2. One assignment in B1, and NOTHING CHANGES FOR IT.
--   title           | HVAC Alex - trial close
--   has_rubric      | false        <- conversation-only
--   sessions_total  | 3
--   submissions     | 0
--   practices       | 3
--   unfinished      | 0
--   finished        | 3
--   control_today   | typed DELETE
--   control_after   | typed DELETE
--   changed         | no
-- ==> WHY unfinished IS 0 AND THAT IS THE INTERESTING HALF. All three practices
--     sit at 'completed' on an assignment with NO rubric, which is that
--     assignment's FINISHED state, not a scoring failure. Had this assignment
--     carried a rubric, the same three rows would have read as three unfinished
--     practices and its control would have moved to the plain confirm. The rule
--     turns on the rubric, exactly as the kickoff says, and this row is the
--     living example of the case that would be got wrong by keying on status. <==
--
-- STATEMENT 3. B1's totals to return to at the end of the session:
--   assignments 1 | sessions 3 | rubrics 0 | audit_rows 0
-- ==> rubrics 0 CONFIRMS 2b-2 CLEANED UP AFTER ITSELF: both "ZZ 2b2" throwaway
--     rubrics are gone, which is deleteRubricIfUnused's orphan branch having
--     worked. audit_rows 0 is what makes proof item 3 legible: the plain path
--     writing its audit row takes this class from 0 to 1. <==
