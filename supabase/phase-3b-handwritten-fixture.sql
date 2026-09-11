-- PHASE 3b. A hand-written scenario in B1, so one refusal can be measured.
--
-- ==> WHY THIS FILE EXISTS, WHICH IS THE ONLY REASON IT SHOULD EVER BE RUN.
--
--     The new /api/instructor/scaffold/enable route has four refusals. Three of
--     them can be measured against rows that already exist. The fourth, "that
--     scenario was not created by the AI Persona Framework", cannot: B1 holds
--     exactly one scenario and it is a generated one, so B1 has no hand-written
--     persona to point the route at.
--
--     The guards run in this order, and the order is deliberate: the CLASS check
--     comes before the hand-written check, so that a caller learns nothing about
--     a row in a class that is not theirs. That is why pointing the route at
--     Alex or Jordan in another class proves nothing about this refusal: it
--     would return the class refusal and stop. The hand-written refusal can only
--     be measured on a hand-written row inside the caller's OWN class.
--
--     So this inserts one, the owner having approved it in place of running the
--     test outside B1.
--
-- WHAT THE ROW IS, and why each column is what it is:
--
--   generation_group_id NULL   THE POINT OF THE WHOLE FIXTURE. This is the one
--                              column that says "a human wrote this, the AI did
--                              not", and it is what every scaffold route keys
--                              its refusal on. Alex and Jordan leave it empty
--                              for the same reason.
--   enabled false              So it is invisible to students and to the
--                              create-assignment picker while it exists. A
--                              disabled scenario is hidden from the picker and
--                              refused by all three start routes.
--   rubric_id NULL             Conversation only. It names no rubric, so it
--                              cannot pull a rubric from another class and trip
--                              scenarios_rubric_same_class_fkey.
--   chain_role NULL            A hand-written scenario has no chain position.
--   generation_fields NULL     Nothing generated it, so there is nothing to
--                              store.
--
-- IT IS NOT PERMANENT. Section 2 removes it, and the removal is verified by a
-- count rather than by the delete reporting success.
--
-- Run through the Supabase MCP, one section at a time.

-- ---------------------------------------------------------------------------
-- 1. INSERT. Run this once, before the refusal test. Note the id it returns.
-- ---------------------------------------------------------------------------
insert into public.scenarios (
  title,
  persona_name,
  persona_system_prompt,
  scenario_context,
  rubric_id,
  meeting_type,
  enabled,
  generation_group_id,
  chain_role,
  generation_fields,
  class_id
)
values (
  'Phase 3b fixture: hand-written persona, safe to delete',
  'Wren',
  'You are Wren. This row exists only so a refusal can be measured, and no student will ever meet you.',
  'A test fixture created during Phase 3b. It is switched off and is deleted at the end of the session.',
  null,
  'discovery',
  false,
  null,
  null,
  null,
  '196770e0-cdd5-4fe4-80e4-421ee6c7d13f'
)
returning id, title, class_id, enabled, generation_group_id;

-- ---------------------------------------------------------------------------
-- 2. CLEANUP. Run this at the end of the session.
-- ---------------------------------------------------------------------------
-- Scoped THREE ways, so it cannot reach anything else even if the title were
-- ever reused: the class, the exact title, and generation_group_id is null,
-- which no generated persona can satisfy.
--
-- delete from public.scenarios
--  where class_id = '196770e0-cdd5-4fe4-80e4-421ee6c7d13f'
--    and title = 'Phase 3b fixture: hand-written persona, safe to delete'
--    and generation_group_id is null;

-- ---------------------------------------------------------------------------
-- 3. VERIFY THE REMOVAL, by counting rather than by trusting the delete.
-- ---------------------------------------------------------------------------
-- Expect hand_written_in_b1 = 0 and scenarios_in_b1 back at its baseline.
--
-- select
--   count(*) filter (where generation_group_id is null) as hand_written_in_b1,
--   count(*)                                            as scenarios_in_b1
-- from public.scenarios
-- where class_id = '196770e0-cdd5-4fe4-80e4-421ee6c7d13f';
