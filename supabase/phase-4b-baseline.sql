-- PHASE 4b BASELINE. Read only. Run before anything in the 4b proof run touches
-- the live site, and again at the end; every number must return to where it
-- started except where this file says otherwise.
--
-- ==> EVERY SECTION RETURNS ITS ANSWER AS ITS LAST STATEMENT. The Supabase MCP
--     does not surface `raise notice`, so a section that reports through notices
--     comes back as `[]`, which is indistinguishable from a section that never
--     ran, one whose every check failed, and a typo. Phase 4a lost a whole probe
--     to exactly that. COUNTS BEAT "expect zero rows" for the same reason: zero
--     rows is also what a broken query returns.
--
-- ==> B1's AUDIT BASELINE IS NOT ZERO AND MUST NOT BE "CLEANED UP". Phases 3a,
--     4a and 4b each left rows behind ON PURPOSE, every one the record of
--     something that really happened, and they carry no foreign key precisely
--     so that a later delete cannot blank them. THE PRACTICE THESE THREE 4b ROWS
--     DESCRIBE HAS ITSELF BEEN DELETED, and they still point at its id: that is
--     the audit precedent working exactly as Gate 1 designed it, not orphan data.
--
--     ==> THE NUMBERS BELOW ARE THE BASELINE FROM 2026-09-11 ONWARD, AFTER 4b.
--         THE FIRST VERSION OF THIS FILE CARRIED THE PRE-4b NUMBERS AND WAS
--         COMMITTED WITH THEM, WHICH WOULD HAVE HAD THE NEXT SESSION MEASURE
--         AGAINST A COMMENT RATHER THAN AGAINST THE DATABASE. Same shape as
--         check 16 of phase-2a-tests.sql, which was red for a whole phase
--         because three documents quoted each other.
--
--       assignment_deletes    1   (Phase 3a, d1492d69)
--       submission_ai_scores  2   (4a 0a9b783e; 4b 6d692810, total 20)
--       submission_reviews    8   (4a's seven; 4b 4fb89844, 20 to 32)
--       submission_resets     5   (4b fd185315, prior 32)
--
--     assignment_deletes IS STILL 1 AND NOT 2. 4b's throwaway assignment held no
--     student work when it was deleted, and a clean delete of an empty
--     assignment is not logged, by design.
--
--     A future session measuring B1 and reading these as litter will go looking
--     for a cleanup that must not happen.

-- SECTION A. B1 as it stands, plus the whole-database invariants.
with b1 as (
  select id from public.classes where name ilike 'B1%' limit 1
)
select
  (select count(*) from public.assignments a, b1 where a.class_id = b1.id)           as b1_assignments,
  (select count(*) from public.rubrics r, b1 where r.class_id = b1.id)               as b1_rubrics,
  (select count(*) from public.sessions s, b1 where s.class_id = b1.id)              as b1_sessions,
  (select count(*) from public.class_members m, b1 where m.class_id = b1.id)         as b1_members,
  (select count(*) from public.submission_ai_scores x, b1 where x.class_id = b1.id)  as b1_ai_originals,
  (select count(*) from public.submission_reviews x, b1 where x.class_id = b1.id)    as b1_reviews,
  (select count(*) from public.submission_resets x, b1 where x.class_id = b1.id)     as b1_resets,
  (select count(*) from public.assignment_deletes x, b1 where x.class_id = b1.id)    as b1_assignment_deletes,
  -- Whole database. reviewed_at null EVERYWHERE is the one that says the rule
  -- "nobody reviews real student work between 4a and 4b" has not been broken.
  (select count(*) from public.sessions where reviewed_at is not null)               as db_reviewed_rows,
  (select count(*) from public.sessions where assignment_id is null)                 as db_sessions_no_assignment,
  (select count(*) from public.scenarios where rubric_id is not null)                as db_scenarios_naming_rubric,
  (select count(*) from public.sessions where kind = 'submission')                   as db_submissions,
  -- The guard on the student home's badge exists for this number being able to
  -- move off zero. It is zero today, so the guard is unreachable and is there
  -- because a scoring failure creates the state. See Open Issues.
  (select count(*) from public.sessions where kind = 'submission' and score is null) as db_submissions_no_score;
