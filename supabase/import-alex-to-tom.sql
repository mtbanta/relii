-- ===========================================================================
-- Copy the ORIGINAL hand-written Alex into every class Tom owns.
--
-- A one-off data session between Phase 3b and Phase 3c. No code change and no
-- migration: one approved insert, read back.
--
-- WHAT THIS FILE IS NOT ALLOWED TO DO, per the owner's rulings of 2026-09-11.
-- It never signs in as Tom, never reads his students, invites, sessions or
-- assignments, and never changes a row that already exists anywhere in the
-- database. THE ONLY WRITE IN THIS FILE IS THE SINGLE INSERT IN SECTION 3.
-- Section 5 is a revert that is not run unless the owner asks for it.
--
-- Run it section by section through the Supabase MCP. Each section ends with
-- the statement that returns its answer.
--
-- THE ROW BEING COPIED: a21ce861-ebbd-4a29-b915-052e55668fec,
-- "Discovery-Close: Alex (procurement director)", in the owner's own class
-- "Relii Demo (Historical)" (b03df6d8-8485-4d27-a712-b78d8bfc9453). That is the
-- hand-written Alex the course has always used, not the generated
-- "Scaffold candidate 1 (decision maker): Alex, Regional Manager" that also
-- exists in that class and is not chosen.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- SECTION 0: DISCOVERY (read only)
--
-- The column list is read from information_schema rather than from any SQL file
-- in this repo, because public.scenarios has been altered several times since
-- stage 2 and the files record the history, not the present shape.
-- ---------------------------------------------------------------------------

-- 0a. Every column of public.scenarios, as the database has it today.
--     ANSWER ON 2026-09-11: 14 columns, listed in the mapping in section 2.
select
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'scenarios'
order by ordinal_position;

-- 0b. Every constraint on public.scenarios, so the insert is written against
--     the rules the database actually enforces. This is where
--     scenarios_rubric_same_class_fkey lives, which is the constraint that
--     would refuse the original's rubric in another class.
--     ANSWER ON 2026-09-11:
--       scenarios_pkey                    PRIMARY KEY (id)
--       scenarios_id_class_unique         UNIQUE (id, class_id)
--       scenarios_class_id_fkey           class_id -> classes(id) on delete restrict
--       scenarios_created_by_fkey         created_by -> auth.users(id) on delete set null
--       scenarios_rubric_same_class_fkey  (rubric_id, class_id) -> rubrics(id, class_id)
--       scenarios_meeting_type_check      meeting_type in ('discovery','presentation')
--       scenarios_chain_role_check        chain_role is null or in ('gatekeeper','decision_maker')
select
  con.conname,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'scenarios'
order by con.conname;


-- ---------------------------------------------------------------------------
-- SECTION 1: BEFORE (read only)
-- ---------------------------------------------------------------------------

-- 1a. Which accounts could be Tom, so "one class" is a fact about one account
--     rather than an assumption. ANSWER ON 2026-09-11: exactly two accounts
--     match, the owner (michaeltbanta@gmail.com, 4bca9090-7744-4015-8499-8cea8d7e4221)
--     and Tom (tbbanta@ksu.edu, 976e5d01-c1dd-484d-ac2e-4ead5a8d429d).
select id, email, created_at
from auth.users
where email ilike '%ksu.edu%' or email ilike '%banta%'
order by created_at;

-- 1b. THE CLASSES TOM OWNS. Id and name only, which is the whole of the narrow
--     exception the owner authorised for this session.
--     ANSWER ON 2026-09-11: ONE class,
--       9a4af990-13f9-49ef-80c9-f9d3ab556cc5  "Sales 300 Fall 2026"
--     created 2026-09-11 13:58:02 UTC, which matches what the owner read on
--     /admin. Any other answer stops the session.
select
  c.id,
  c.name,
  c.created_at
from public.classes c
join auth.users u on u.id = c.instructor_id
where lower(u.email) = 'tbbanta@ksu.edu'
order by c.created_at;

-- 1c. The scenario count in each of Tom's classes, as COUNTS ONLY. Nothing in
--     his classes is read beyond how many rows are in them.
--     ANSWER ON 2026-09-11: Sales 300 Fall 2026 holds 0 scenarios, 0 of them
--     generated, 0 of them switched on.
select
  c.id as class_id,
  c.name as class_name,
  count(s.id) as scenario_count,
  count(s.id) filter (where s.generation_group_id is not null) as generated_count,
  count(s.id) filter (where s.enabled) as enabled_count
from public.classes c
left join public.scenarios s on s.class_id = c.id
join auth.users u on u.id = c.instructor_id
where lower(u.email) = 'tbbanta@ksu.edu'
group by c.id, c.name
order by c.name;

-- 1d. THE ORIGINAL'S FINGERPRINT, which is what every "byte for byte" claim in
--     section 4 is measured against.
--     ANSWER ON 2026-09-11:
--       persona_system_prompt  5737 chars  md5 18c4d8f12f78f82eaa238807cea9220d
--       scenario_context        920 chars  md5 70d3c9c96bbc97a5c4c0ca4b2bba0918
--       meeting_type discovery, chain_role null, enabled true,
--       rubric_id a1e3f39e-b989-4d74-9406-6860e5b27f78,
--       generation_group_id null, generation_fields null, created_by null,
--       class_id b03df6d8-8485-4d27-a712-b78d8bfc9453
select
  id,
  title,
  persona_name,
  meeting_type,
  chain_role,
  enabled,
  rubric_id,
  generation_group_id,
  generation_fields,
  created_by,
  class_id,
  length(persona_system_prompt) as prompt_chars,
  md5(persona_system_prompt) as prompt_md5,
  length(scenario_context) as context_chars,
  md5(scenario_context) as context_md5
from public.scenarios
where id = 'a21ce861-ebbd-4a29-b915-052e55668fec';


-- ---------------------------------------------------------------------------
-- SECTION 2: THE MAPPING, COLUMN BY COLUMN
--
-- All 14 columns of public.scenarios as enumerated in 0a. Every one is
-- accounted for: nothing is left to chance and nothing is invented.
--
--  1. id                     DEFAULT gen_random_uuid(). A new id per copy.
--  2. title                  COPIED byte for byte.
--  3. persona_name           COPIED byte for byte.
--  4. persona_system_prompt  COPIED byte for byte. This is the role-play.
--  5. scenario_context       COPIED byte for byte. This is the briefing.
--  6. rubric_id              SET TO NULL. Scoring comes from the assignment's
--                            rubric, and scenarios_rubric_same_class_fkey would
--                            refuse the original's rubric in another class
--                            anyway, because that rubric belongs to the owner's
--                            class.
--  7. created_by             SET TO NULL. The original is null, and nothing in
--                            the app reads scenarios.created_by: it is written
--                            once by the generate route and never read for any
--                            display or guard (class_id is what every guard
--                            uses). Tom's id would assert that Tom created a
--                            row the owner imported for him, and it would buy
--                            no behaviour at all.
--  8. created_at             DEFAULT now(). The copy is made today; the June
--                            date belongs to the original.
--  9. meeting_type           COPIED byte for byte ('discovery').
-- 10. enabled                SET TO TRUE, so Tom can assign it at once.
-- 11. generation_group_id    A NEW, DISTINCT uuid per copy, from
--                            gen_random_uuid(). Two things need it: the 3b
--                            toggle refuses an empty group id, and
--                            loadPersonaList only reads rows whose group id is
--                            not null. A group of one row is "chosen" by 3b's
--                            one-row rule, and this row is also switched on,
--                            which is the first of the three chosen tests.
-- 12. chain_role             COPIED byte for byte, which is NULL. Alex has no
--                            pair here, so the list will read "Not recorded"
--                            where a generated persona reads "Gatekeeper".
-- 13. generation_fields      SET TO NULL, which is the shape ruling 6 proved
--                            and the shape scripts/check-persona-list.mjs
--                            renders. No partial object is invented.
-- 14. class_id               Each class Tom owns, from section 1b.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- SECTION 3: THE INSERT. THE ONLY WRITE IN THIS FILE.
--
-- One statement for all of Tom's classes: the class list is derived from his
-- email at run time rather than typed in, so the row can only ever land in a
-- class whose instructor really is Tom.
--
-- THREE GUARDS, AND WHY EACH IS THERE.
--
--   1. t.id in (...) pins the statement to the class the owner APPROVED. The
--      derivation by email says "a class of Tom's"; this says "the class of
--      Tom's that was on screen when he approved this". If Tom creates a second
--      class later, this file is re-approved rather than quietly reused.
--   2. "no scenario already in that class carries this persona's prompt" makes
--      the statement SAFE TO RUN TWICE. id defaults to a fresh uuid, so without
--      this a second run would hand Tom two Alexes and no constraint would stop
--      it. The test is on the stored prompt, not on the title: a title is text
--      an instructor can change, and PROJECT_STATE's rule is that display names
--      are not load bearing.
--   3. "that class holds no scenarios at all" is the precondition the owner is
--      actually approving, as measured in 1c. If the facts change between the
--      approval and the run, the insert writes NOTHING rather than running
--      against facts nobody approved. Section 4a then reads back zero rows,
--      which is visible rather than silent.
--
-- THE REVERT, stated here beside the insert: section 5. It counts sessions and
-- assignments for the new ids first and deletes only by those ids.
-- ---------------------------------------------------------------------------

-- RUN ON 2026-09-11 20:55:36 UTC, APPROVED BY THE OWNER. ONE ROW INSERTED:
--   id                  901058cf-bb33-4fc1-baab-fdaf86edb08e
--   class_id            9a4af990-13f9-49ef-80c9-f9d3ab556cc5  (Sales 300 Fall 2026)
--   generation_group_id 2e32e9b6-dc8d-4ee3-9a4b-552fbff13ced
--   enabled true, rubric_id null, generation_fields null, created_by null

insert into public.scenarios (
  title,
  persona_name,
  persona_system_prompt,
  scenario_context,
  meeting_type,
  chain_role,
  rubric_id,
  enabled,
  generation_group_id,
  generation_fields,
  created_by,
  class_id
)
select
  o.title,
  o.persona_name,
  o.persona_system_prompt,
  o.scenario_context,
  o.meeting_type,
  o.chain_role,
  null::uuid                   as rubric_id,
  true                         as enabled,
  gen_random_uuid()            as generation_group_id,
  null::jsonb                  as generation_fields,
  null::uuid                   as created_by,
  t.id                         as class_id
from public.scenarios o
cross join (
  select c.id
  from public.classes c
  join auth.users u on u.id = c.instructor_id
  where lower(u.email) = 'tbbanta@ksu.edu'
) t
where o.id = 'a21ce861-ebbd-4a29-b915-052e55668fec'
  and t.id in ('9a4af990-13f9-49ef-80c9-f9d3ab556cc5')
  and not exists (
    select 1
    from public.scenarios x
    where x.class_id = t.id
      and x.persona_system_prompt = o.persona_system_prompt
  )
  and not exists (
    select 1
    from public.scenarios x
    where x.class_id = t.id
  )
returning
  id,
  class_id,
  title,
  persona_name,
  enabled,
  rubric_id,
  generation_group_id,
  generation_fields,
  created_at;


-- ---------------------------------------------------------------------------
-- SECTION 4: AFTER (read only)
-- ---------------------------------------------------------------------------

-- 4a. ANSWER ON 2026-09-11: one copy, and EVERY same_ column reads true.
--     prompt_md5 18c4d8f12f78f82eaa238807cea9220d and context_md5
--     70d3c9c96bbc97a5c4c0ca4b2bba0918, both equal to the original's;
--     rubric_is_null, generation_fields_is_null, is_enabled and has_group_id
--     all true; created_by null.
-- 4a. EACH COPY READ BACK AND COMPARED TO THE ORIGINAL IN ONE ROW. The read is
--     by class, not by the ids the insert returned, so it cannot be fooled by
--     reporting back what was sent: it asks the database what is in Tom's
--     classes now. Every "same_" column must read true.
select
  s.id as copy_id,
  s.class_id,
  c.name as class_name,
  s.title,
  s.persona_name,
  s.enabled,
  s.rubric_id,
  s.generation_fields,
  s.generation_group_id,
  s.created_by,
  s.created_at,
  md5(s.persona_system_prompt) as prompt_md5,
  md5(s.scenario_context) as context_md5,
  md5(s.persona_system_prompt) = md5(o.persona_system_prompt) as same_prompt,
  md5(s.scenario_context) = md5(o.scenario_context) as same_context,
  s.title = o.title as same_title,
  s.persona_name = o.persona_name as same_persona_name,
  s.meeting_type = o.meeting_type as same_meeting_type,
  s.chain_role is not distinct from o.chain_role as same_chain_role,
  s.rubric_id is null as rubric_is_null,
  s.generation_fields is null as generation_fields_is_null,
  s.enabled as is_enabled,
  s.generation_group_id is not null as has_group_id
from public.scenarios s
join public.classes c on c.id = s.class_id
join auth.users u on u.id = c.instructor_id
cross join public.scenarios o
where lower(u.email) = 'tbbanta@ksu.edu'
  and o.id = 'a21ce861-ebbd-4a29-b915-052e55668fec'
order by c.name, s.created_at;

-- 4b. ANSWER ON 2026-09-11: copies 1, distinct_group_ids 1,
--     shared_with_any_other_row 0.
-- 4b. THE GROUP IDS ARE DISTINCT PER COPY, and none of them collides with a
--     generation that already exists anywhere in the database. Expected on
--     2026-09-11: copies 1, distinct_group_ids 1, shared_with_any_other_row 0.
select
  count(*) as copies,
  count(distinct s.generation_group_id) as distinct_group_ids,
  (
    select count(*)
    from public.scenarios a
    join public.scenarios b
      on b.generation_group_id = a.generation_group_id
     and b.id <> a.id
    join public.classes ac on ac.id = a.class_id
    join auth.users au on au.id = ac.instructor_id
    where lower(au.email) = 'tbbanta@ksu.edu'
  ) as shared_with_any_other_row
from public.scenarios s
join public.classes c on c.id = s.class_id
join auth.users u on u.id = c.instructor_id
where lower(u.email) = 'tbbanta@ksu.edu';

-- 4c. ANSWER ON 2026-09-11: Sales 300 Fall 2026 reads 1, 1, 1 where 1c read
--     0, 0, 0.
-- 4c. EACH OF TOM'S CLASS COUNTS HAS RISEN BY EXACTLY ONE. Same statement as
--     1c, so the two are read side by side. Expected: 1, 1, 1 where 1c read
--     0, 0, 0.
select
  c.id as class_id,
  c.name as class_name,
  count(s.id) as scenario_count,
  count(s.id) filter (where s.generation_group_id is not null) as generated_count,
  count(s.id) filter (where s.enabled) as enabled_count
from public.classes c
left join public.scenarios s on s.class_id = c.id
join auth.users u on u.id = c.instructor_id
where lower(u.email) = 'tbbanta@ksu.edu'
group by c.id, c.name
order by c.name;

-- 4d. ANSWER ON 2026-09-11: identical to 1d field for field, including both
--     md5s, enabled true, rubric_id a1e3f39e-b989-4d74-9406-6860e5b27f78,
--     generation_group_id null and class_id b03df6d8-8485-4d27-a712-b78d8bfc9453.
-- 4d. THE ORIGINAL IS UNCHANGED. Same statement as 1d; every value must match
--     what 1d returned, including both md5s, enabled, class_id and the null
--     group id.
select
  id,
  title,
  persona_name,
  meeting_type,
  chain_role,
  enabled,
  rubric_id,
  generation_group_id,
  generation_fields,
  created_by,
  class_id,
  length(persona_system_prompt) as prompt_chars,
  md5(persona_system_prompt) as prompt_md5,
  length(scenario_context) as context_chars,
  md5(scenario_context) as context_md5
from public.scenarios
where id = 'a21ce861-ebbd-4a29-b915-052e55668fec';

-- 4e. ONE ROW WAS CREATED IN THE WHOLE TABLE TODAY, AND IT IS THIS ONE.
--     ==> STATED PRECISELY, BECAUSE IT IS WEAKER THAN IT LOOKS. No global row
--         count was taken BEFORE the insert, so this is not a difference of two
--         numbers. What it does measure is that exactly one scenario row in the
--         entire database carries today's date, which is the copy. The claim
--         that the original did not move is 4d, which IS a before and after
--         comparison. <==
--     ANSWER ON 2026-09-11: total_scenarios 12, scenarios_created_today 1,
--     generation_fields_null_rows 3 (the original Alex, the original Jordan,
--     and this copy), enabled_rows 7.
select
  count(*) as total_scenarios,
  count(*) filter (where created_at >= '2026-09-11 00:00:00+00') as scenarios_created_today,
  count(*) filter (where generation_fields is null) as generation_fields_null_rows,
  count(*) filter (where enabled) as enabled_rows
from public.scenarios;


-- ---------------------------------------------------------------------------
-- SECTION 5: THE REVERT. NOT RUN UNLESS THE OWNER ASKS FOR IT.
--
-- It deletes BY THE NEW IDS ONLY, and only while nothing references them. Fill
-- id list below is what section 3 actually returned on 2026-09-11.
--
-- COUNTED ON 2026-09-11, RIGHT AFTER THE INSERT: Tom's classes hold 0
-- assignments and 0 sessions, so nothing references the new row and the
-- revert would succeed today.
-- ---------------------------------------------------------------------------

-- 5a. COUNT FIRST. Both foreign keys are "on delete restrict", so a delete
--     would fail loudly rather than cascade, but the count is what decides
--     whether to run 5b at all. Both numbers must be 0.
-- select
--   (select count(*) from public.sessions
--      where scenario_id in ('901058cf-bb33-4fc1-baab-fdaf86edb08e')) as sessions_using_them,
--   (select count(*) from public.assignments
--      where scenario_id in ('901058cf-bb33-4fc1-baab-fdaf86edb08e')) as assignments_using_them;

-- 5b. THE DELETE. Only the rows this file created, by id.
-- delete from public.scenarios
-- where id in ('901058cf-bb33-4fc1-baab-fdaf86edb08e')
-- returning id, class_id, title;

-- 5c. Verify by COUNTING, not by the delete reporting success. Expected: 0.
-- select count(*) as still_there from public.scenarios
-- where id in ('901058cf-bb33-4fc1-baab-fdaf86edb08e');
