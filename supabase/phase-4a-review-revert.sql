-- REVERT for supabase/phase-4a-review.sql.
--
-- ==> READ THIS BEFORE RUNNING IT. THIS FILE DESTROYS GRADE DATA.
--
--     Dropping public.submission_ai_scores throws away every record of what the
--     AI originally said, which is the one thing that cannot be reconstructed
--     from anywhere else. Dropping public.submission_reviews throws away the log
--     of who changed which grade and when. Dropping sessions.reviewed_at
--     forgets which submissions a human has already been through.
--
--     ==> IT DOES NOT PUT ANY OVERRIDDEN GRADE BACK. sessions.score and
--         sessions.score_total keep whatever the last review wrote. After this
--         file runs, a reviewed submission still carries the instructor's
--         levels and there is no longer anything anywhere that says what the AI
--         had chosen. RESTORING THE AI'S SCORES IS ONLY POSSIBLE BEFORE THIS
--         FILE RUNS, from submission_ai_scores, and section 0 below is how. <==
--
--     THIS IS FOR ONE SITUATION ONLY: the migration has just been applied, the
--     code has NOT been pushed, no review has been saved, and the piece is being
--     abandoned. In that situation all three objects are empty and this file
--     costs nothing.
--
-- HOW TO USE: read section 0 first and run it on its own. If it reports any
-- review at all, STOP and decide deliberately, because past that point this is
-- not an undo, it is a deletion.

-- ---------------------------------------------------------------------------
-- 0. IS THIS SAFE RIGHT NOW? Run this ALONE, first.
--    Every number must be 0. If any is not, this file destroys real work.
-- ---------------------------------------------------------------------------
select 'SAFE TO REVERT?' as label,
       (select count(*) from public.submission_ai_scores)      as ai_originals_stored,
       (select count(*) from public.submission_reviews)        as reviews_logged,
       (select count(*) from public.sessions
         where reviewed_at is not null)                        as submissions_reviewed;

-- ---------------------------------------------------------------------------
-- 0b. THE ESCAPE HATCH, and it only works while the table is still there.
--     If section 0 was not all zeros and you want the AI's grades back before
--     dropping anything, run THIS FIRST. It puts every stored AI original back
--     onto its session and clears the reviewed marker, which is exactly what
--     "Allow retake" does for one submission.
--
--     IT IS COMMENTED OUT ON PURPOSE. Uncomment it only if you mean it.
-- ---------------------------------------------------------------------------
-- update public.sessions as s
--    set score       = a.score,
--        score_total = a.score_total,
--        reviewed_at = null
--   from public.submission_ai_scores as a
--  where a.session_id = s.id;

-- ---------------------------------------------------------------------------
-- 1. The function.
-- ---------------------------------------------------------------------------
drop function if exists public.save_submission_review(
  uuid, text, uuid, text, jsonb, numeric
);

-- ---------------------------------------------------------------------------
-- 2. The two tables. Dropping a table drops its policies and its indexes with
--    it, so there is nothing else to undo here.
-- ---------------------------------------------------------------------------
drop table if exists public.submission_reviews;
drop table if exists public.submission_ai_scores;

-- ---------------------------------------------------------------------------
-- 3. The column. It has no index of its own to drop: see the note in section 1
--    of the migration for why there deliberately is not one.
-- ---------------------------------------------------------------------------
alter table public.sessions
  drop column if exists reviewed_at;

-- ---------------------------------------------------------------------------
-- 4. Confirm. Every count must be 0 and every list must be empty.
-- ---------------------------------------------------------------------------
select 'REVERTED?' as label,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'sessions'
           and column_name = 'reviewed_at')                     as reviewed_at_column,
       (select count(*) from information_schema.tables
         where table_schema = 'public'
           and table_name in ('submission_ai_scores', 'submission_reviews')) as new_tables,
       (select count(*) from pg_proc as p
          join pg_namespace as n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'save_submission_review')            as new_function;

-- ==> AND THE THING THE REVERT CANNOT UNDO, RE-STATED AT THE END BECAUSE A LONG
--     FILE IS READ FROM BOTH ENDS: any grade an instructor overrode is still
--     overridden. sessions.score was never rolled back by anything above. <==
