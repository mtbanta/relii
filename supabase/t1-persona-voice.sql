-- Relii T1: the per-assignment persona voice on assignments.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- RUN THIS BEFORE THE NEW CODE GOES LIVE. The updated app reads and writes this
-- column and calls the new 14 argument version of the function below, so if the
-- code is deployed first, creating an assignment with a rubric attached will
-- fail until this file has been run.
--
-- WHAT THIS IS
-- Which of two voices the AI persona speaks in, chosen by the instructor per
-- assignment, beside the meeting length. Two values and no more: "cedar", which
-- every persona in the app speaks in today, and "marin". They are the names
-- OpenAI's realtime API uses for them, and both were confirmed accepted by the
-- live API on this app's model before this file was written.
--
-- WHY IT LIVES ON THE ASSIGNMENT AND NOT ON THE SCENARIO
-- One scenario can back many assignments: assignments.scenario_id is a plain
-- foreign key with an index and no uniqueness rule. If the control sat on the
-- assignment form but wrote to the scenario, an instructor creating a second
-- assignment on Alex and picking the other voice would silently change the
-- voice of the first assignment too. Storing the value where it is chosen is
-- what makes that impossible.
--
-- NULLABLE ON PURPOSE, WITH NO DEFAULT
-- An empty voice means CEDAR, which is what every assignment does today. Every
-- existing assignment simply leaves it empty and keeps sounding exactly as it
-- does now. This is the same shape as duration_minutes in
-- supabase/pd-4-meeting-length.sql: "not set" is a meaning worth keeping, and
-- forcing a value onto old rows would be a change to data the instructor never
-- made. Sessions with no assignment at all (there are 25 of them, from before a
-- practice was always a practice FOR an assignment) reach the same fallback
-- through the app rather than through this column.
--
-- WHY THE CHECK CONSTRAINT
-- Two voices is a decision, not a limitation of the column. The named check is
-- what makes adding a third one a deliberate act rather than a typo: a
-- misspelled voice cannot reach the OpenAI call, where it would come back as
-- HTTP 400 and the student would get no voice at all rather than a wrong one.
--
-- NO COLUMN GRANT IS NEEDED, AND THAT WAS MEASURED RATHER THAN ASSUMED
-- The instructor edit form writes to public.assignments directly from the
-- browser, so a new column that the browser cannot write would fail on save.
-- Measured before this file was written, from pg_class.relacl and
-- pg_attribute.attacl rather than from information_schema.column_privileges
-- (which expands a table level grant across every column and so cannot tell the
-- two apart): public.assignments carries a TABLE level grant to anon and
-- authenticated and has ZERO column level grants, so a new column is covered
-- automatically. public.scenarios is the opposite case and is why the question
-- had to be asked: Gate 2 revoked select on that table and granted it back on
-- 12 of its 14 columns, holding back persona_system_prompt and
-- scenario_context, so a voice column THERE would have needed an explicit
-- grant. This is one more reason the voice belongs on the assignment.
--
-- ==> IF YOU EVER SEE "permission denied for table assignments", DO NOT RUN THE
--     HINT POSTGRES PRINTS WITH IT. That hint suggests a whole table grant. The
--     same hint on public.scenarios would undo Gate 2 and hand every student
--     the hidden persona prompt. See Open Issues in PROJECT_STATE.md. <==
--
-- WHAT THIS DOES NOT DO
-- It creates no table, removes no data, and changes no Row Level Security or
-- Storage rule. It writes nothing to any existing row: every assignment that
-- exists today keeps an empty voice and therefore keeps cedar. It does not
-- touch public.scenarios, sessions, scoring, or the meeting length.


-- ---------------------------------------------------------------------------
-- 1. The voice column.
-- ---------------------------------------------------------------------------
-- Empty (null) means cedar, the voice every persona speaks in today.
alter table public.assignments
  add column if not exists voice text;


-- ---------------------------------------------------------------------------
-- 2. The two voices rule.
-- ---------------------------------------------------------------------------
-- Postgres has no "add constraint if not exists", so this checks for the rule
-- by name first and only adds it when it is missing. That is what makes the
-- file safe to run more than once. Null is allowed, and means cedar.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignments_voice_allowed'
      and conrelid = 'public.assignments'::regclass
  ) then
    alter table public.assignments
      add constraint assignments_voice_allowed
      check (
        voice is null
        or voice in ('cedar', 'marin')
      );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. The function that creates an assignment and its rubric together.
-- ---------------------------------------------------------------------------
-- ==> READ THIS PART TWICE. IT IS A DROP AND RECREATE, NOT A REPLACE, AND THAT
--     IS THE WHOLE REASON THIS SECTION IS LONG.
--
--     public.create_assignment_with_rubric was created in
--     supabase/phase-2a-rubric-intake.sql with THIRTEEN parameters. It is the
--     path the app uses when a rubric is attached to a new assignment, because
--     PostgREST cannot wrap two writes in one transaction and the rubric and
--     the assignment must be written together or not at all.
--
--     Postgres tells two functions apart by their PARAMETER LIST, not by their
--     name. So "create or replace" with a FOURTEENTH parameter would not
--     replace anything: it would create a SECOND function beside the first,
--     both called create_assignment_with_rubric, and PostgREST could resolve a
--     call to either one. The old one ignores the voice entirely, so an
--     instructor would pick a voice, see it saved, and get cedar anyway,
--     intermittently, with nothing failing anywhere.
--
--     Dropping by the full old signature first is what prevents that. The
--     verification at the end of this file counts the functions with this name
--     and expects exactly ONE. "The new one exists" is not the check; a
--     surviving old one is the failure.
--
--     DROPPING ALSO DROPS ITS PERMISSIONS, so every grant statement below has
--     to be re-applied. There are FOUR statements keyed to the signature, not
--     three: two revokes, one grant, and the comment. All four are here. <==
--
-- Read from the database before this file was written, so the old signature
-- below is the real one rather than one copied hopefully from a file:
--   create_assignment_with_rubric(uuid,uuid,text,jsonb,numeric,text,uuid,text,
--     text,text,timestamp with time zone,timestamp with time zone,integer)
--   13 arguments, security definer false, execute held by postgres and
--   service_role only. Exactly one function with this name existed.
drop function if exists public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer
);

-- Recreated with p_voice added at the end. Everything else is exactly as Phase
-- 2a wrote it: same order, same body, same settings.
--
-- NOT "security definer". It runs as whoever calls it, and the only role
-- allowed to call it is service_role, which the server already uses.
--
-- "set search_path = ''" means every name inside has to be written out in full,
-- as they are below. It stops the function resolving a table name against
-- somebody else's schema.
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
  p_duration_minutes  integer,
  p_voice             text
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
    available_date, due_at, duration_minutes, voice, created_by, class_id, rubric_id
  )
  values (
    p_title, p_scenario_id, p_required_mode, p_company_name, p_instructions,
    p_available_date, p_due_at, p_duration_minutes, p_voice, p_created_by, p_class_id, v_rubric_id
  )
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

-- ==> WHO MAY CALL IT. Postgres grants EXECUTE on a new function to PUBLIC by
--     default, which in Supabase means the anon and authenticated roles that
--     every browser holds. That default is removed here and execute is given
--     back to service_role only, which is the key the server uses and which
--     never reaches a browser.
--
--     Without these lines a signed-in student could call this function
--     directly from the browser and create an assignment in any class whose id
--     they could guess. The revoke is not tidiness, it is the control.
--
--     THE DROP ABOVE TOOK THE OLD FUNCTION'S GRANTS WITH IT, so these are not
--     decoration on a re-run: they are the only thing standing between the new
--     function and every browser. <==
revoke all on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer, text
) from public;

revoke all on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer, text
) from anon, authenticated;

grant execute on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer, text
) to service_role;

comment on function public.create_assignment_with_rubric(
  uuid, uuid, text, jsonb, numeric, text, uuid, text, text, text,
  timestamptz, timestamptz, integer, text
) is
  'Phase 2a, extended by T1 with p_voice. Writes a rubric and the assignment '
  'that points at it in one transaction, so neither can exist without the '
  'other. Deliberately does no validation and no class resolution: the calling '
  'route does both before it gets here. service_role only.';


-- ---------------------------------------------------------------------------
-- 4. The column comment.
-- ---------------------------------------------------------------------------
comment on column public.assignments.voice is
  'T1. Which voice the persona speaks in: cedar or marin. Null means cedar, '
  'the voice every assignment used before T1.';


-- ---------------------------------------------------------------------------
-- 5. Check it worked (these change nothing; they just show you the result).
-- ---------------------------------------------------------------------------

-- 5a. EXACTLY ONE function with this name, and it takes 14 arguments ending in
--     text. If this returns TWO rows, the old one survived and the drop above
--     did not do its job: stop, and do not deploy the code.
select
  p.oid::regprocedure::text as full_signature,
  p.pronargs                as argument_count,
  coalesce(array_to_string(p.proacl, ' | '), '(none: execute is PUBLIC, WRONG)') as execute_grants,
  count(*) over ()          as how_many_functions_with_this_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_assignment_with_rubric';

-- 5b. The column exists, and EVERY existing assignment has an empty voice,
--     which means cedar. Nothing should have a value in it yet.
select
  title,
  voice,
  duration_minutes,
  created_at
from public.assignments
order by created_at desc;

-- 5c. The rule is on the table, by name.
select
  conname                          as constraint_name,
  pg_get_constraintdef(oid)        as rule
from pg_constraint
where conrelid = 'public.assignments'::regclass
  and conname = 'assignments_voice_allowed';
