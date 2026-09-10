-- Relii Phase 2a: RUBRIC INTAKE, REVERT.
--
-- Undoes supabase/phase-2a-rubric-intake.sql and NOTHING ELSE. Nothing that
-- existed before Phase 2a is touched by this file.
--
-- ==> READ THIS BEFORE YOU RUN IT.
--
--     THIS FILE DESTROYS DATA, in one specific way. Dropping
--     assignments.rubric_id throws away every rubric attachment stored in that
--     column, including the ones the migration's backfill wrote.
--
--     THAT IS HARMLESS WHILE PHASE 2A IS THE CURRENT STATE, because the rubric
--     field on the Create Assignment form is switched OFF, so no attachment has
--     been made by hand. Every value in the column was copied from
--     scenarios.rubric_id, which this file does not touch, so re-running the
--     migration reproduces all of it exactly.
--
--     IT STOPS BEING HARMLESS THE MOMENT PHASE 2B SWITCHES THAT FIELD ON. From
--     then on the column holds attachments that exist nowhere else, and this
--     file becomes a way to lose them. If you are reading this after 2b has
--     shipped, do not run it without a backup of the column. <==
--
-- WHAT IT DOES NOT DELETE, on purpose: any rubric ROW created through the new
-- route. Those rows stay in public.rubrics after this file runs, with nothing
-- pointing at them. Deleting them is not a revert of this migration, it is a
-- separate destructive act on content an instructor uploaded, and it is not
-- done automatically here. The query at the end of this file lists them so you
-- can decide.


-- ---------------------------------------------------------------------------
-- 1. The function, and the permissions that were set on it.
-- ---------------------------------------------------------------------------
-- Dropping the function removes its grants with it. "if exists" makes this
-- correct on a database where the migration never ran.
drop function if exists public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
);


-- ---------------------------------------------------------------------------
-- 2. The same-class rule.
-- ---------------------------------------------------------------------------
-- Dropped explicitly, before the column it depends on. Dropping the column
-- would take the constraint with it, but naming it here means this file says
-- out loud everything it removes.
alter table public.assignments
  drop constraint if exists assignments_rubric_same_class_fkey;


-- ---------------------------------------------------------------------------
-- 3. The comments this migration wrote.
-- ---------------------------------------------------------------------------
-- scenarios.rubric_id carried no comment before Phase 2a, so the revert is to
-- have no comment again. THE COLUMN ITSELF IS NOT TOUCHED. It was never part of
-- this migration, it is still read by the app, and Gate 4a's
-- scenarios_rubric_same_class_fkey still depends on it.
comment on column public.scenarios.rubric_id is null;


-- ---------------------------------------------------------------------------
-- 4. rubrics.max_total and its rule.
-- ---------------------------------------------------------------------------
alter table public.rubrics
  drop constraint if exists rubrics_max_total_positive;

alter table public.rubrics
  drop column if exists max_total;


-- ---------------------------------------------------------------------------
-- 5. assignments.rubric_id. THE DESTRUCTIVE STEP. See the warning at the top.
-- ---------------------------------------------------------------------------
alter table public.assignments
  drop column if exists rubric_id;


-- ---------------------------------------------------------------------------
-- 6. What is left behind, so you can decide about it deliberately.
-- ---------------------------------------------------------------------------
-- Rubrics that no scenario points at. Before Phase 2a every rubric was reached
-- through a scenario, so anything listed here was created by the Phase 2a
-- route. THIS ONLY LISTS THEM. Nothing is deleted.
--
-- If the list is empty, the revert is complete and the database is exactly as
-- it was before the migration ran.
select
  r.id,
  r.name,
  r.class_id,
  r.created_at,
  'orphaned by the Phase 2a revert. Nothing points at it. Delete by hand only if you are sure.' as note
from public.rubrics r
where not exists (
  select 1 from public.scenarios s where s.rubric_id = r.id
)
order by r.created_at desc;
