-- Relii Phase 2b-2, PRE-FLIGHT. Run this FIRST, on its own, before anything else.
--
-- IT CHANGES NOTHING. Every statement in this file only reads. It is safe to
-- run at any time, as many times as you like.
--
-- WHAT IT IS FOR. Phase 2b-2 turns the rubric upload field on and rewrites the
-- rendering. It has NO MIGRATION: nothing in this session changes the schema.
-- So this file is not a guard on a write. It is the BASELINE, and it is the
-- measurement of one number the 2b-2 kickoff got wrong.
--
-- ==> THE NUMBER THIS FILE EXISTS FOR IS CHECK 5. The 2b-2 kickoff says check
--     16 of supabase/phase-2a-tests.sql "asserts every assignment's rubric
--     matches its scenario's. True today at zero rows." READING THE QUERY, THAT
--     IS NOT WHAT IT DOES. It counts assignments whose SCENARIO carries a
--     rubric and whose own rubric DIFFERS, and in SQL a null differs from a
--     uuid: `null is distinct from <uuid>` is true. 2b-1 set every assignment's
--     rubric to null, so every assignment sitting on a rubric-naming scenario
--     is counted RIGHT NOW.
--
--     If check 5 below reads anything above 0, that check is RED TODAY on a
--     perfectly correct database, and the note inside supabase/phase-2b1-tests.sql
--     saying it "passes vacuously" is wrong prose in a test file. Both get
--     fixed this session. If it reads 0, the kickoff was right by accident and
--     the replacement query still goes in, because the first rubric Tom
--     attaches makes it red either way.
--
--     CHECK 6 IS THE SAME QUERY WITH THE REPLACEMENT CLAUSE ALREADY APPLIED, so
--     the two rows side by side show what the fix does before it is made. <==
--
-- WHAT B1 IS. "B1: A demo class" is the class every piece of test data in this
-- session lives in and is deleted from. Checks 2 to 4 are its baseline, and the
-- same numbers get read again at the end of the session to prove it was put
-- back exactly as it was found.


-- ---------------------------------------------------------------------------
-- Every check and every count, in one result set.
-- ---------------------------------------------------------------------------
-- Deliberately one query rather than several, for the reason the 2b-1
-- pre-flight gives: a long series of separate approval prompts trains the
-- reader to click through them.
with
b1 as (
  select id from public.classes where name = 'B1: A demo class'
),

-- Check 16 of phase-2a-tests.sql, reproduced EXACTLY as that file writes it
-- today. Nothing here is adjusted or corrected: the point is to read what the
-- shipped check actually returns.
check16_today as (
  select count(*) as n
  from public.assignments a
  join public.scenarios s on s.id = a.scenario_id
  where s.rubric_id is not null
    and a.rubric_id is distinct from s.rubric_id
),

-- The same query with the replacement clause the file itself proposes: only
-- count an assignment whose rubric came FROM a scenario. An uploaded rubric is
-- referenced by its assignment and by no scenario, so it is excluded, and so is
-- an assignment carrying no rubric at all.
check16_replacement as (
  select count(*) as n
  from public.assignments a
  join public.scenarios s on s.id = a.scenario_id
  where s.rubric_id is not null
    and a.rubric_id is distinct from s.rubric_id
    and exists (select 1 from public.scenarios s2 where s2.rubric_id = a.rubric_id)
),

-- A rubric written by the upload route stores CRITERIA, each carrying a
-- "levels" array. The legacy seeded rubric stores flat items carrying
-- "applies_to". Both are arrays, so nothing in the database distinguishes them
-- and this probe is the only way to tell them apart by eye.
shapes as (
  select
    count(*) filter (where jsonb_exists(items->0, 'levels'))     as levels_rubrics,
    count(*) filter (where jsonb_exists(items->0, 'applies_to')) as legacy_rubrics
  from public.rubrics
),

-- ScoreItem.level was added by 2b-1. Every score saved before it carries none,
-- and the renderer being built this session must not assume it is there. This
-- counts the scored sessions holding at least one item with no level. It reads
-- the SHAPE of the stored score and returns no student-authored content.
levelless as (
  select count(*) as n
  from public.sessions
  where status = 'scored'
    and jsonb_typeof(score->'items') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(score->'items') as item
      where not jsonb_exists(item, 'level')
    )
)

select * from (
  -- --- The class this session works in. -------------------------------------
  -- If this reads anything but 1, every B1 number below is meaningless rather
  -- than reassuring, which is why it is checked rather than assumed.
  select
    1 as sort_order,
    'CHECK 1  exactly one class named "B1: A demo class"' as check_name,
    '1'                                                   as expected,
    (select count(*)::text from public.classes where name = 'B1: A demo class') as actual,
    case when (select count(*) from public.classes where name = 'B1: A demo class') = 1
         then 'PASSED' else 'FAILED  STOP HERE' end       as verdict

  -- --- B1's baseline, to be restored at the end of the session. -------------
  union all
  select 2,
    'CHECK 2  assignments in B1',
    '1',
    (select count(*)::text from public.assignments where class_id = (select id from b1)),
    case when (select count(*) from public.assignments where class_id = (select id from b1)) = 1
         then 'PASSED' else 'FAILED  investigate before building anything' end

  union all
  select 3,
    'CHECK 3  rubrics in B1',
    '0',
    (select count(*)::text from public.rubrics where class_id = (select id from b1)),
    case when (select count(*) from public.rubrics where class_id = (select id from b1)) = 0
         then 'PASSED' else 'FAILED  investigate before building anything' end

  union all
  select 4,
    'CHECK 4  sessions in B1',
    '3',
    (select count(*)::text from public.sessions where class_id = (select id from b1)),
    case when (select count(*) from public.sessions where class_id = (select id from b1)) = 3
         then 'PASSED' else 'FAILED  investigate before building anything' end

  -- --- The number this file exists for. See the note at the top. -----------
  union all
  select 5,
    'MEASUREMENT  phase-2a-tests check 16 AS WRITTEN TODAY (above 0 means it is RED now)',
    'the kickoff says 0',
    (select n::text from check16_today),
    case when (select n from check16_today) = 0
         then 'the kickoff was right'
         else 'THE KICKOFF WAS WRONG: that check is red today' end

  union all
  -- Each assignment the check counts, named, so the reader can see for
  -- themselves that these are ordinary rows on the two rubric-naming scenarios
  -- and not damage.
  select 6,
    'INFORMATION  counted by check 16 as it stands: ' || a.title,
    'why it is counted',
    case when a.rubric_id is null
         then 'the assignment has no rubric, its scenario does'
         else 'the assignment names a different rubric' end,
    'not a check'
  from public.assignments a
  join public.scenarios s on s.id = a.scenario_id
  where s.rubric_id is not null
    and a.rubric_id is distinct from s.rubric_id

  union all
  select 7,
    'CHECK 7  the same check WITH the replacement clause applied',
    '0',
    (select n::text from check16_replacement),
    case when (select n from check16_replacement) = 0
         then 'PASSED  the replacement is correct' else 'FAILED  do not apply it' end

  -- --- The state 2b-1 left, which 2b-2 starts from. -------------------------
  union all
  select 8,
    'CHECK 8  assignments carrying a rubric, anywhere (the app grades nothing)',
    '0',
    (select count(*)::text from public.assignments where rubric_id is not null),
    case when (select count(*) from public.assignments where rubric_id is not null) = 0
         then 'PASSED' else 'FAILED  investigate before building anything' end

  union all
  select 9,
    'CHECK 9  uploaded (levels) rubrics stored',
    '0',
    (select levels_rubrics::text from shapes),
    case when (select levels_rubrics from shapes) = 0
         then 'PASSED' else 'FAILED  investigate before building anything' end

  union all
  select 10,
    'CHECK 10  the legacy seeded (flat) rubric still exists',
    '1',
    (select legacy_rubrics::text from shapes),
    case when (select legacy_rubrics from shapes) = 1
         then 'PASSED' else 'FAILED  investigate before building anything' end

  union all
  select 11,
    'CHECK 11  scenarios naming a rubric',
    '2',
    (select count(*)::text from public.scenarios where rubric_id is not null),
    case when (select count(*) from public.scenarios where rubric_id is not null) = 2
         then 'PASSED' else 'FAILED  investigate before building anything' end

  union all
  select 12,
    'CHECK 12  assignments in total',
    '5',
    (select count(*)::text from public.assignments),
    case when (select count(*) from public.assignments) = 5
         then 'PASSED' else 'FAILED  investigate before building anything' end

  union all
  select 13,
    'CHECK 13  scored sessions in total',
    '32',
    (select count(*)::text from public.sessions where status = 'scored'),
    case when (select count(*) from public.sessions where status = 'scored') = 32
         then 'PASSED' else 'FAILED  investigate before building anything' end

  -- --- The two facts the new renderer has to survive. -----------------------
  union all
  -- Expected to equal check 13: every stored score predates ScoreItem.level.
  -- The renderer must show a score with no level rather than assume one.
  select 14,
    'CHECK 14  scored sessions holding at least one item with NO level',
    '32',
    (select n::text from levelless),
    case when (select n from levelless) = 32
         then 'PASSED' else 'FAILED  investigate before building anything' end

  union all
  -- A session with no assignment is conversation-only. These are the
  -- pre-Stage-7 practices, counted again so the number in PROJECT_STATE is not
  -- taken on trust.
  select 15,
    'CHECK 15  sessions with no assignment (pre-Stage-7 practices)',
    '25',
    (select count(*)::text from public.sessions where assignment_id is null),
    case when (select count(*) from public.sessions where assignment_id is null) = 25
         then 'PASSED' else 'FAILED  investigate before building anything' end

  -- --- The function the upload path needs the moment the field goes live. ---
  union all
  select 16,
    'CHECK 16  create_assignment_with_rubric() still exists',
    '1',
    (select count(*)::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_assignment_with_rubric'),
    case when (select count(*)
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'create_assignment_with_rubric') = 1
         then 'PASSED' else 'FAILED  the upload cannot work without it' end
) as preflight
order by sort_order, check_name;
