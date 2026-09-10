-- Relii Phase 2c. The CSV's EMPTY Level column, measured on a real download.
--
-- ==> THE REVERT PATH, STATED FIRST AND WRITTEN BEFORE THE CHANGE IS MADE.
--     STEP 3 BELOW IS THE REVERT. It is the exact inverse of step 2 and it
--     needs nothing that is not already in the database, because step 2 does
--     not DELETE anything: it RENAMES the "level" key on each score item to
--     "level_2c_backup", and step 3 renames it back. A delete would need the
--     original values kept somewhere outside the row, and anything kept outside
--     the row can be lost with the session. A rename cannot be.
--
--     The assignment's rubric_id is restored from the value step 1 prints. Run
--     step 1 and keep its output before running step 2. <==
--
-- WHY THIS EXISTS. The 2b-2 handoff records that the CSV's Level column has
-- never been seen EMPTY on a real download. That state needs a score whose
-- items carry no level AND an assignment carrying no rubric. All 32 such scores
-- predate 2b-1 and every one of them lives in another instructor's class, which
-- the 2c run is not permitted to touch. The pre-flight's check 10 confirmed it:
-- 32 in the database, 0 in B1.
--
-- ==> THE THREE BEHAVIOURS ARE INDEPENDENTLY TRIGGERED, WHICH IS THE WHOLE
--     REASON THIS FILE SHAPES BOTH HALVES RATHER THAN ONE.
--     Reading app/api/instructor/submission/[id]/csv/route.ts:
--       the BLANK Level cell   comes from `item.level ?? ""`
--       the INTERNAL IDs       come from the criterion lookup missing
--       the header NOTE        fires on `score && !rubricAttached` ALONE
--     supabase/phase-2b2-no-rubric-probe.sql shaped only the rubric half, which
--     produces a note reading "no level was recorded" printed above a POPULATED
--     Level column. That is half the state, and it would have certified the
--     wrong thing. <==
--
-- WHAT IT TOUCHES: one session created by this session's own run, in B1, which
-- is deleted in cleanup an hour later. No student's real work exists anywhere
-- in this database.
--
-- RUN ONE STATEMENT AT A TIME. Step 1, then step 2, download the file, then
-- step 3. Do not leave the database sitting in step 2's state.


-- ---------------------------------------------------------------------------
-- STEP 1. READ. Changes nothing. Keep this output: step 3 needs the rubric id.
-- ---------------------------------------------------------------------------
select
  a.id                                   as assignment_id,
  a.title,
  a.rubric_id                            as rubric_id_to_restore,
  s.id                                   as session_id,
  jsonb_array_length(s.score->'items')   as score_items,
  (select count(*) from jsonb_array_elements(s.score->'items') it where it ? 'level')             as items_with_level,
  (select count(*) from jsonb_array_elements(s.score->'items') it where it ? 'level_2c_backup')   as items_already_shaped
from public.sessions s
join public.assignments a on a.id = s.assignment_id
where s.id = '55e32eda-7c27-4899-b59b-889cfd541eca';


-- ---------------------------------------------------------------------------
-- STEP 2. SHAPE. Two statements, run one at a time.
-- ---------------------------------------------------------------------------
-- 2a. Rename "level" to "level_2c_backup" on every item of this ONE session's
--     score. Nothing is deleted. Item ORDER is preserved by the ordinality.
update public.sessions s
set score = jsonb_set(
      s.score,
      '{items}',
      (select jsonb_agg(
                case when it ? 'level'
                     then (it - 'level') || jsonb_build_object('level_2c_backup', it->'level')
                     else it
                end
                order by ord)
         from jsonb_array_elements(s.score->'items') with ordinality t(it, ord))
    )
where s.id = '55e32eda-7c27-4899-b59b-889cfd541eca';

-- 2b. Detach the rubric from this ONE assignment.
update public.assignments
set rubric_id = null
where id = 'a2f63215-103e-4df8-8d89-3f6455972808';


-- ---------------------------------------------------------------------------
-- STEP 3. THE REVERT. Run both, one at a time, as soon as the file is captured.
-- ---------------------------------------------------------------------------
-- 3a. Rename the key back. Exactly the inverse of 2a.
update public.sessions s
set score = jsonb_set(
      s.score,
      '{items}',
      (select jsonb_agg(
                case when it ? 'level_2c_backup'
                     then (it - 'level_2c_backup') || jsonb_build_object('level', it->'level_2c_backup')
                     else it
                end
                order by ord)
         from jsonb_array_elements(s.score->'items') with ordinality t(it, ord))
    )
where s.id = '55e32eda-7c27-4899-b59b-889cfd541eca';

-- 3b. Re-attach the rubric. Substitute the id step 1 printed.
--     update public.assignments
--     set rubric_id = '<rubric_id_to_restore from step 1>'
--     where id = 'a2f63215-103e-4df8-8d89-3f6455972808';
