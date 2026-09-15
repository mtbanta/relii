-- Relii T1: THE PERSONA VOICE, REVERT.
--
-- Undoes supabase/t1-persona-voice.sql and NOTHING ELSE. Nothing that existed
-- before T1 is touched by this file.
--
-- ==> READ THIS BEFORE YOU RUN IT.
--
--     THIS FILE DESTROYS DATA, in one specific way. Dropping assignments.voice
--     throws away every voice an instructor has chosen. There is no other copy
--     of those choices anywhere.
--
--     THAT IS HARMLESS ONLY WHILE NO ASSIGNMENT HAS MARIN ON IT, because an
--     empty voice and cedar mean the same thing. The moment one assignment is
--     set to marin, this file is a way to lose that choice silently: nothing
--     errors, the assignment simply goes back to speaking in cedar. The query
--     at the end of this file lists what would be lost, and it is worth running
--     that query FIRST, on its own, before running anything above it. <==
--
-- ==> AND IT MUST BE RUN BEFORE, NOT AFTER, THE CODE IS ROLLED BACK. The live
--     app calls the 14 argument function and writes this column. If you drop
--     them while the new code is still deployed, creating an assignment breaks
--     immediately. Roll the code back first, then run this. That is the same
--     rule, in reverse, as the one on the migration itself. <==
--
-- The order below is deliberate: the function first (it is the thing most
-- likely to be half-applied), then the rule, then the column.


-- ---------------------------------------------------------------------------
-- 0. WHAT YOU ARE ABOUT TO LOSE. Run this on its own first.
-- ---------------------------------------------------------------------------
-- Every assignment whose voice is not empty. An empty voice was always cedar,
-- so a row that is empty or already cedar loses nothing. A row reading marin
-- loses a real choice.
select
  id,
  title,
  voice,
  created_at,
  case
    when voice = 'marin' then 'A REAL CHOICE IS LOST: this goes back to cedar.'
    else 'No audible change: this already sounds like cedar.'
  end as what_the_revert_costs
from public.assignments
where voice is not null
order by created_at desc;


-- ---------------------------------------------------------------------------
-- 1. The function, back to its thirteen argument Phase 2a form.
-- ---------------------------------------------------------------------------
-- ==> BOTH SIGNATURES ARE DROPPED HERE, AND THAT IS ON PURPOSE. Dropping the
--     14 argument one undoes T1. Dropping the 13 argument one as well means
--     this file is correct even if a previous run left both in place, which is
--     exactly the overload hazard the migration was written to avoid. After
--     these two statements there is no function with this name at all, and the
--     next statement creates the one Phase 2a shipped. <==
--
-- Dropping a function removes its grants with it. "if exists" makes each of
-- these correct on a database where that signature was never created.
drop function if exists public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer, text
);

drop function if exists public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
);

-- Recreated exactly as supabase/phase-2a-rubric-intake.sql wrote it: same
-- thirteen parameters, same order, same body, same settings, no voice.
create or replace function public.create_assignment_with_rubric(
  p_class_id          uuid,
  p_created_by        uuid,
  p_rubric_name       text,
  p_rubric_items      jsonb,
  p_rubric_max_total  numeric,
  p_title             text,
  p_scenario_id       uuid,
  p_required_mode     text,
  p_company_name      text,
  p_instructions      text,
  p_available_date    timestamptz,
  p_due_at            timestamptz,
  p_duration_minutes  integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_rubric_id     uuid;
  v_assignment_id uuid;
begin
  -- The rubric first, because the assignment points at it.
  insert into public.rubrics (name, items, max_total, created_by, class_id)
  values (p_rubric_name, p_rubric_items, p_rubric_max_total, p_created_by, p_class_id)
  returning id into v_rubric_id;

  -- Then the assignment. Same class_id value as the rubric above.
  insert into public.assignments (
    title, scenario_id, required_mode, company_name, instructions,
    available_date, due_at, duration_minutes, created_by, class_id, rubric_id
  )
  values (
    p_title, p_scenario_id, p_required_mode, p_company_name, p_instructions,
    p_available_date, p_due_at, p_duration_minutes, p_created_by, p_class_id, v_rubric_id
  )
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

-- The permissions the recreated function needs, exactly as Phase 2a set them.
-- Without these a signed-in student could call it from the browser.
revoke all on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) from public;

revoke all on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) from anon, authenticated;

grant execute on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) to service_role;

comment on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
) is
  'Phase 2a. Writes a rubric and the assignment that points at it in one '
  'transaction, so neither can exist without the other. Deliberately does no '
  'validation and no class resolution: the calling route does both before it '
  'gets here. service_role only.';


-- ---------------------------------------------------------------------------
-- 2. The two voices rule.
-- ---------------------------------------------------------------------------
-- Dropped explicitly, before the column it depends on. Dropping the column
-- would take the rule with it, but naming it here means this file says out loud
-- everything it removes.
alter table public.assignments
  drop constraint if exists assignments_voice_allowed;


-- ---------------------------------------------------------------------------
-- 3. The voice column. THE DESTRUCTIVE STEP. See the warning at the top.
-- ---------------------------------------------------------------------------
-- The column comment goes with the column, so there is nothing separate to
-- undo for it.
alter table public.assignments
  drop column if exists voice;


-- ---------------------------------------------------------------------------
-- 4. Check it worked (these change nothing; they just show you the result).
-- ---------------------------------------------------------------------------

-- 4a. EXACTLY ONE function with this name again, taking 13 arguments and
--     ending in integer rather than text.
select
  p.oid::regprocedure::text as full_signature,
  p.pronargs                as argument_count,
  coalesce(array_to_string(p.proacl, ' | '), '(none: execute is PUBLIC, WRONG)') as execute_grants,
  count(*) over ()          as how_many_functions_with_this_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_assignment_with_rubric';

-- 4b. The column is gone. Expect NO rows.
select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'assignments'
  and column_name = 'voice';
