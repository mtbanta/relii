-- Relii Phase 2b-1: THE SCORING ENGINE, REVERT.
--
-- Undoes supabase/phase-2b1-scoring-engine.sql and NOTHING ELSE. It re-attaches
-- the rubric to the two assignments that file detached, and puts the three
-- column comments back the way they were.
--
-- ==> READ THIS BEFORE YOU RUN IT.
--
--     THIS FILE DESTROYS NOTHING. The migration it reverses deleted no row and
--     changed no column definition; it emptied one field on two rows. This file
--     fills those two fields back in.
--
--     THE THING TO GET RIGHT IS NOT WHAT IT RESTORES, IT IS WHAT IT MUST NOT
--     TOUCH. See the guards below. <==
--
--
-- ==> WHY THIS FILE NAMES TWO ASSIGNMENT IDS INSTEAD OF RE-RUNNING 2a'S
--     BACKFILL, WHICH IS WHAT THE PLAN ORIGINALLY SAID.
--
--     2a's backfill is "give every assignment its scenario's rubric where it has
--     none". Re-running that today restores the two rows this piece detached,
--     which is correct. RUN AFTER PHASE 2b-2 IT DOES SOMETHING ELSE ENTIRELY:
--     any NEW conversation-only assignment built on the Alex or Jordan scenarios
--     would ALSO be given Great Northwoods, silently turning an assignment the
--     instructor deliberately left ungraded into a graded one, against a legacy
--     rubric the scorer cannot even read.
--
--     A REVERT THAT DOES SOMETHING THE ORIGINAL DID NOT IS NOT A REVERT. That is
--     the same defect this project already found and wrote down once, in
--     gate-2-revert.sql dropping a function a later gate had come to depend on.
--     The rule that came out of it is in PROJECT_STATE: A REVERT UNDOES ONLY
--     WHAT ITS OWN PIECE DID.
--
--     So this file addresses EXACTLY the two rows the migration changed, by id.
--     Hardcoding a generated id is normally wrong in a migration; in the revert
--     of a one-time data change on one specific database it is the only way to
--     be exact, and being exact is the whole requirement here. The scenario is
--     still the SOURCE of the value (the join below), so the rubric restored is
--     the one the scenario names rather than a constant typed into this file. <==


-- ---------------------------------------------------------------------------
-- 1. THE GUARDS AND THE RESTORE, IN ONE STATEMENT.
-- ---------------------------------------------------------------------------
-- Same reasoning as the migration: a raise inside a do block rolls back the
-- update inside the same block, so the all-or-nothing is a property of this file
-- and not an assumption about the tool running it.
do $$
declare
  -- The two assignments supabase/phase-2b1-scoring-engine.sql detached, recorded
  -- at the moment it ran (2026-09-10). Both carried the Great Northwoods rubric,
  -- both had it from 2a's backfill, and no other row in the database did.
  --   6aa78b60...  Bunzl: Discovery meeting - Alex
  --   9d884360...  Bunzl: Presentation call, Jordan (extra new again)
  k_detached uuid[] := array[
    '6aa78b60-fcbd-4bf6-8d5c-1c88ccedd897'::uuid,
    '9d884360-d672-476b-a722-b6889b66fda7'::uuid
  ];
  v_levels    integer;
  v_occupied  integer;
  v_present   integer;
  v_restored  integer;
begin
  -- ==> GUARD 1. HAS PHASE 2b-2 SHIPPED? If any rubric in the database is a
  --     LEVELS rubric, somebody has uploaded one through the control 2b-2 turns
  --     on, which means this database has moved past the state this file
  --     reverses. Re-attaching a legacy 29-item rubric to an assignment in a
  --     world where the scorer only reads levels rubrics would produce an
  --     assignment that LOOKS graded and refuses to score. Stop instead. <==
  select count(*) into v_levels
    from public.rubrics
   where jsonb_exists(items->0, 'levels');

  if v_levels > 0 then
    raise exception
      'Phase 2b-1 revert stop: % uploaded (levels) rubric(s) exist, so Phase 2b-2 has shipped.', v_levels
      using hint =
        'This file reverses a migration that only made sense before rubrics could be '
        'uploaded. Re-attaching the legacy Great Northwoods rubric now would give an '
        'assignment a rubric the scorer refuses to read. Decide what you actually want '
        'with the owner rather than running this.';
  end if;

  -- ==> GUARD 2. HAS EITHER OF THE TWO BEEN GIVEN A RUBRIC SINCE? If so, this
  --     file would overwrite an attachment somebody made deliberately. Restoring
  --     an old value over a newer one is not a revert either. <==
  select count(*) into v_occupied
    from public.assignments
   where id = any(k_detached)
     and rubric_id is not null;

  if v_occupied > 0 then
    raise exception
      'Phase 2b-1 revert stop: % of the two assignments already carries a rubric.', v_occupied
      using hint =
        'Something has attached a rubric since the migration ran. This file would '
        'overwrite it. Stop and look at the rows before deciding.';
  end if;

  -- How many of the two still exist. An assignment deleted in the meantime is
  -- not an error (deleting one is an ordinary instructor action), but the count
  -- is reported so the reader is never left guessing how much was restored.
  select count(*) into v_present
    from public.assignments
   where id = any(k_detached);

  -- THE RESTORE. Scoped to those two ids, taking the value from the scenario the
  -- way 2a's backfill did, and only where the field is currently empty.
  update public.assignments a
     set rubric_id = s.rubric_id
    from public.scenarios s
   where s.id = a.scenario_id
     and a.id = any(k_detached)
     and s.rubric_id is not null
     and a.rubric_id is null;

  get diagnostics v_restored = row_count;
  raise notice 'Phase 2b-1 revert: % of the 2 recorded assignments still exist; % re-attached to their scenario''s rubric.', v_present, v_restored;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. THE COMMENTS, PUT BACK EXACTLY AS PHASE 2a LEFT THEM.
-- ---------------------------------------------------------------------------
comment on column public.scenarios.rubric_id is
  'DELIBERATELY RETAINED, NO LONGER AUTHORITATIVE FOR GRADING. From Phase 2a the '
  'authoritative rubric for a graded submission is assignments.rubric_id. This '
  'column stays because the Phase 2a backfill reads it, because '
  'scenarios_rubric_same_class_fkey depends on it, and because historical scores '
  'were produced against the rubric it names. Do not drop it as a cleanup.';

comment on column public.assignments.rubric_id is
  'Phase 2a. The rubric this assignment is graded against, or null for a '
  'conversation-only assignment that is practised but not scored. Null is '
  'deliberate: assignments_rubric_same_class_fkey is MATCH SIMPLE, so a null '
  'here exempts the row from the same-class rule rather than weakening it.';

-- rubrics.items carried NO comment before Phase 2b-1, so the revert is to have
-- none again. The column itself is not touched: it long predates this piece.
comment on column public.rubrics.items is null;
