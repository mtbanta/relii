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
-- ==> B1's AUDIT BASELINE IS NOT ZERO AND MUST NOT BE "CLEANED UP". Phase 3a and
--     Phase 4a left rows behind ON PURPOSE, each one the record of something
--     that really happened, and they have no foreign key precisely so that a
--     later delete cannot blank them:
--       assignment_deletes    1   (Phase 3a, d1492d69)
--       submission_ai_scores  1   (Phase 4a, 0a9b783e)
--       submission_reviews    7   (Phase 4a)
--       submission_resets     4
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
