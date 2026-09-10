-- Relii Phase 2b-1, PRE-FLIGHT. Run this FIRST, on its own, before anything else.
--
-- IT CHANGES NOTHING. Every statement in this file only reads. It is safe to
-- run at any time, as many times as you like.
--
-- WHAT IT IS FOR. Phase 2b-1 detaches every rubric currently attached to an
-- assignment, which moves the whole app to conversation-only until 2b-2 turns
-- the upload field on. That is the intended state and it was agreed in writing.
--
-- ==> THE ONE NUMBER THAT DECIDES WHETHER THE MIGRATION MAY RUN IS CHECK 1, AND
--     IT MUST READ EXACTLY 2. Those two are the assignments 2a's backfill gave a
--     rubric to. If it reads anything else, something has changed since 2a and
--     the migration must not run: STOP and show the output to Claude. <==
--
-- The migration re-checks this same number itself and refuses to run if it is
-- wrong, so this file is the reader's copy of a guard the database also
-- enforces, not the only thing standing between a mistake and the data.


-- ---------------------------------------------------------------------------
-- Every check and every count, in one result set.
-- ---------------------------------------------------------------------------
-- Deliberately one query rather than several. Every read in this piece is
-- batched into as few calls as possible, because a long series of separate
-- approval prompts trains the reader to click through them, and the prompt
-- straight after these is the migration itself.
with
attached as (
  select a.id, a.title, a.rubric_id, a.class_id, s.rubric_id as scenario_rubric_id
  from public.assignments a
  left join public.scenarios s on s.id = a.scenario_id
  where a.rubric_id is not null
),

-- A rubric written by 2a's upload route stores CRITERIA, each carrying a
-- "levels" array. The legacy seeded rubric stores flat items carrying
-- "applies_to". Both are arrays, so nothing in the database distinguishes them
-- and this probe is the only way to tell them apart by eye.
shapes as (
  select
    count(*) filter (where jsonb_exists(items->0, 'levels'))     as levels_rubrics,
    count(*) filter (where jsonb_exists(items->0, 'applies_to')) as legacy_rubrics,
    count(*)                                                     as all_rubrics
  from public.rubrics
)

select * from (
  select
    1 as sort_order,
    'CHECK 1  assignments carrying a rubric' as check_name,
    '2'                                      as expected,
    (select count(*)::text from attached)    as actual,
    case when (select count(*) from attached) = 2
         then 'PASSED' else 'FAILED  STOP HERE' end as verdict

  union all
  -- Each of the two, named, so the reader can see they are the pair the 2a
  -- backfill created rather than two rubrics somebody attached by hand. On both
  -- of them the assignment's rubric equals its scenario's, which is the
  -- backfill's signature: nothing else in the app produces that.
  select
    2,
    'INFORMATION  ' || a.title,
    'assignment rubric = scenario rubric',
    case when a.rubric_id = a.scenario_rubric_id then 'yes' else 'NO' end,
    'not a check'
  from attached a

  union all
  select
    3,
    'CHECK 2  the legacy seeded rubric still exists',
    '1',
    (select legacy_rubrics::text from shapes),
    case when (select legacy_rubrics from shapes) = 1
         then 'PASSED' else 'FAILED  STOP HERE' end

  union all
  -- Expected to be 0 today and it is the fact the whole plan leans on: there is
  -- no uploaded rubric anywhere yet, so nothing this migration does can strand
  -- one. If this is not 0, the upload field has been used and the migration must
  -- be re-read before it goes anywhere near the database.
  select
    4,
    'CHECK 3  uploaded (levels) rubrics stored',
    '0',
    (select levels_rubrics::text from shapes),
    case when (select levels_rubrics from shapes) = 0
         then 'PASSED' else 'FAILED  STOP HERE' end

  union all
  select
    5,
    'CHECK 4  assignments.rubric_id exists (2a ran)',
    '1',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name = 'assignments'
        and column_name = 'rubric_id'),
    case when (select count(*) from information_schema.columns
                where table_schema = 'public' and table_name = 'assignments'
                  and column_name = 'rubric_id') = 1
         then 'PASSED' else 'FAILED  STOP HERE' end

  union all
  -- Not a check, but the numbers the tests file compares against afterwards. If
  -- any of these moves and the migration is the only thing that ran, something
  -- happened that this piece did not intend.
  select 6, 'BASELINE  rubric rows in total',      'see actual',
         (select all_rubrics::text from shapes), 'not a check'
  union all
  select 7, 'BASELINE  assignments in total',      'see actual',
         (select count(*)::text from public.assignments), 'not a check'
  union all
  select 8, 'BASELINE  scenarios naming a rubric', 'see actual',
         (select count(*)::text from public.scenarios where rubric_id is not null), 'not a check'
  union all
  select 9, 'BASELINE  sessions already scored',   'see actual',
         (select count(*)::text from public.sessions where status = 'scored'), 'not a check'
  union all
  -- ==> RECORDED BECAUSE THE 2b-1 KICKOFF SAID NO SUCH ROW EXISTS AND IT WAS
  --     WRONG. sessions.assignment_id is nullable and these are pre-Stage-7
  --     test practices. Every current start route sets an assignment, so no NEW
  --     row can be one, but these are here and they are governed by the rule
  --     this piece writes down: a session with no assignment is
  --     conversation-only. They are not corruption. <==
  select 10, 'BASELINE  sessions with no assignment_id', 'see actual',
         (select count(*)::text from public.sessions where assignment_id is null), 'not a check'
) as preflight
order by sort_order, check_name;
