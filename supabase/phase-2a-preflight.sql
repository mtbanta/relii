-- Relii Phase 2a, PRE-FLIGHT. Run this FIRST, on its own, before anything else.
--
-- HOW TO USE: this runs through the Supabase MCP as a single call, or you can
-- paste it into the Supabase dashboard SQL Editor and click "Run".
--
-- IT CHANGES NOTHING. Every statement in this file only reads. It is safe to
-- run at any time, as many times as you like.
--
-- WHAT IT IS FOR. Phase 2a adds a rule to the database saying that an
-- assignment's rubric must belong to the same class as the assignment. Before
-- that rule is added, the migration BACKFILLS every existing assignment with
-- its scenario's rubric. If that backfill would write even one row that breaks
-- the new rule, the constraint would refuse to be created and the migration
-- would stop halfway.
--
-- ==> THE POINT OF THIS FILE IS TO PROVE THAT CANNOT HAPPEN, RATHER THAN TO
--     HOPE IT DOES NOT. <==
--
-- THE ARGUMENT, WHICH THIS FILE CHECKS RATHER THAN ASSERTS. Two rules already
-- exist, both added by supabase/gate-4a-constraints.sql:
--
--   scenarios_rubric_same_class_fkey     a scenario's rubric is in the
--                                        scenario's class
--   assignments_scenario_same_class_fkey an assignment's class equals its
--                                        scenario's class
--
-- Chain them together and the property we need falls out: if an assignment
-- takes its rubric from its own scenario, that rubric is already in the
-- assignment's class. So the backfill is safe BY CONSTRUCTION. This file
-- measures the same thing directly, because a chain of reasoning about
-- constraints is worth less than a count of the rows that would break.
--
-- WHAT YOU SHOULD SEE. One row per check, every verdict reading PASSED, plus a
-- plain count of what the backfill is going to do. If any verdict reads FAILED,
-- STOP and show it to Claude. Do not repair anything by hand.


-- ---------------------------------------------------------------------------
-- The checks, and a preview of the backfill, in one result set.
-- ---------------------------------------------------------------------------
-- Deliberately one query rather than several. Every read in this piece is
-- batched into as few calls as possible, because a long series of separate
-- approval prompts trains the reader to click through them, and the prompt
-- straight after these is the migration itself.
with
-- Every assignment that the backfill will touch, paired with the rubric it
-- will be given and the class that rubric belongs to.
backfill_preview as (
  select
    a.id            as assignment_id,
    a.title         as assignment_title,
    a.class_id      as assignment_class,
    s.rubric_id     as rubric_to_be_set,
    r.class_id      as rubric_class
  from public.assignments a
  join public.scenarios s on s.id = a.scenario_id
  join public.rubrics   r on r.id = s.rubric_id
  where s.rubric_id is not null
),

-- CHECK 1. THE ONE THAT MATTERS. Not one row the backfill writes may put a
-- rubric from class X onto an assignment in class Y. Expected: zero.
mismatched as (
  select count(*) as n
  from backfill_preview
  where rubric_class is distinct from assignment_class
),

-- CHECK 2. No assignment may be missing the class the rule compares against.
-- Gate 4a made assignments.class_id NOT NULL, so this should be zero and is
-- checked here because a null on either side of the pair would make the new
-- rule silently skip the row rather than enforce it.
missing_class as (
  select count(*) as n
  from public.assignments
  where class_id is null
),

-- CHECK 3. The target of the new foreign key has to be uniquely addressable by
-- the pair (id, class_id), or Postgres will refuse to create the key at all.
-- supabase/gate-4a-constraints.sql line 225 added this. Confirmed here rather
-- than assumed, because the whole migration depends on it existing.
unique_target as (
  select count(*) as n
  from pg_constraint
  where conname = 'rubrics_id_class_unique'
),

-- CHECK 4. The new column must NOT already exist. If it does, this file has
-- already been run, or something else added it, and the migration should be
-- read again before it goes anywhere near the database.
column_absent as (
  select count(*) as n
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'assignments'
    and column_name  = 'rubric_id'
),

-- CHECK 5. Same for the max_total column on rubrics.
max_total_absent as (
  select count(*) as n
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'rubrics'
    and column_name  = 'max_total'
)

select * from (
  select
    1 as sort_order,
    'CHECK 1  backfill rows landing in the wrong class' as check_name,
    '0'                                                as expected,
    (select n::text from mismatched)                   as actual,
    case when (select n from mismatched) = 0
         then 'PASSED' else 'FAILED  STOP HERE' end    as verdict

  union all
  select
    2,
    'CHECK 2  assignments with no class_id',
    '0',
    (select n::text from missing_class),
    case when (select n from missing_class) = 0
         then 'PASSED' else 'FAILED  STOP HERE' end

  union all
  select
    3,
    'CHECK 3  rubrics_id_class_unique exists (the key target)',
    '1',
    (select n::text from unique_target),
    case when (select n from unique_target) = 1
         then 'PASSED' else 'FAILED  STOP HERE' end

  union all
  select
    4,
    'CHECK 4  assignments.rubric_id does not exist yet',
    '0',
    (select n::text from column_absent),
    case when (select n from column_absent) = 0
         then 'PASSED' else 'ALREADY PRESENT  read the migration again' end

  union all
  select
    5,
    'CHECK 5  rubrics.max_total does not exist yet',
    '0',
    (select n::text from max_total_absent),
    case when (select n from max_total_absent) = 0
         then 'PASSED' else 'ALREADY PRESENT  read the migration again' end

  -- Not a pass or fail. This is the plain statement of what the migration is
  -- about to write, so the number can be compared against the tests file
  -- afterwards. If this says 3, then 3 assignments should carry a rubric when
  -- the migration has run, and the tests file checks exactly that.
  union all
  select
    6,
    'INFORMATION  assignments the backfill will give a rubric',
    'see actual',
    (select count(*)::text from backfill_preview),
    'not a check'

  union all
  select
    7,
    'INFORMATION  assignments that will keep no rubric',
    'see actual',
    (
      select (count(*) - (select count(*) from backfill_preview))::text
      from public.assignments
    ),
    'not a check'
) as preflight
order by sort_order;
