-- Relii Phase 2c, PRE-FLIGHT. Run this FIRST, on its own, before anything else.
--
-- IT CHANGES NOTHING. Every statement in this file only reads. It is safe to
-- run at any time, as many times as you like.
--
-- THE REVERT PATH IS "THERE IS NOTHING TO REVERT". There is no insert, update,
-- delete, grant, policy or schema change anywhere in this file. It is one
-- select. That is stated first because the standing rule says to state it
-- first, not because this file is a special case.
--
-- WHAT IT IS FOR. Phase 2c is a CERTIFICATION session and has no migration and
-- no build. So this file is not a guard on a write. It is two things:
--
--   1. B1's BASELINE, read before anything is created, and read again at the
--      end of the session to prove the class was put back exactly as it was
--      found. Checks 1 to 5.
--
--   2. FOUR FACTS THE RUN'S SHAPE DEPENDS ON, each of which is currently
--      believed on the strength of PROSE in PROJECT_STATE.md rather than
--      measured. The project rule is to check the system rather than the
--      documentation about the system, so each one is checked. Checks 6 to 10.
--
-- ==> CHECK 7 CAN CHANGE WHAT THE OWNER HAS TO DO. The class export in item 5
--     is gated on profiles.is_super_admin. PROJECT_STATE says instructor@test.com
--     is deliberately NOT a super admin. If that is right, the export click
--     belongs to the owner and Claude verifies only the file's content. If the
--     flag is unexpectedly true, that is itself a finding and the session stops
--     to report it, because it would mean a test account can cascade-delete
--     every class in the database. <==
--
-- ==> CHECK 8 DECIDES WHETHER GATE 5 ITEM 12 CAN RUN AT ALL. Its unrun form is
--     "reset a submission that lives in the caller's OWN OTHER class", so the
--     caller needs at least two classes. G6 made several classes per instructor
--     normal operation, and PROJECT_STATE names B1, B2 and B3, but the count
--     has never been read for this purpose. <==
--
-- ==> CHECK 10 CAN SAVE THE SESSION A PIECE OF WORK, AND IT IS WORTH READING
--     BEFORE SHAPING ANYTHING. The CSV's empty Level column needs a score whose
--     items carry no level. Those are the 32 pre-level scores, and the 2b-2
--     handoff says all of them live in another instructor's class. If check 10
--     shows one inside B1, item 3's empty case can be measured on a row that is
--     genuinely legacy, and no shaping is needed. If it reads 0, the handoff is
--     right and the state has to be shaped on this session's own test row.
--
--     It reads only the SHAPE of the stored score (does this item have a
--     "level" key) and returns no student-authored content. <==
--
-- WHAT B1 IS. "B1: A demo class" is the class every piece of test data in this
-- session lives in and is deleted from.


-- ---------------------------------------------------------------------------
-- Every check and every count, in one result set.
-- ---------------------------------------------------------------------------
-- Deliberately one query rather than several, for the reason the 2b-1 and 2b-2
-- pre-flights both give: a long series of separate approval prompts trains the
-- reader to click through them.
with
b1 as (
  select id from public.classes where name = 'B1: A demo class'
),

-- The account this session drives every instructor surface with.
test_instructor as (
  select id from public.profiles where email = 'instructor@test.com'
),

-- ScoreItem.level was added by 2b-1. Every score saved before it carries none.
-- This asks the question twice: once for the whole database (the 32 the handoff
-- counts) and once for B1 alone (the one that decides item 3's shape).
levelless_all as (
  select count(*) as n
  from public.sessions
  where status = 'scored'
    and jsonb_typeof(score->'items') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(score->'items') as item
      where not jsonb_exists(item, 'level')
    )
),
levelless_b1 as (
  select count(*) as n
  from public.sessions
  where status = 'scored'
    and class_id = (select id from b1)
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
         then 'PASSED' else 'FAILED  investigate before creating anything' end

  union all
  select 3,
    'CHECK 3  rubrics in B1',
    '0',
    (select count(*)::text from public.rubrics where class_id = (select id from b1)),
    case when (select count(*) from public.rubrics where class_id = (select id from b1)) = 0
         then 'PASSED' else 'FAILED  investigate before creating anything' end

  union all
  select 4,
    'CHECK 4  sessions in B1',
    '3',
    (select count(*)::text from public.sessions where class_id = (select id from b1)),
    case when (select count(*) from public.sessions where class_id = (select id from b1)) = 3
         then 'PASSED' else 'FAILED  investigate before creating anything' end

  -- The same three sessions broken out by kind and status. The count alone
  -- cannot tell an abandoned in_progress row from a finished practice, and the
  -- difference decides whether B1 is already carrying the invisible-session
  -- trap written up in Open Issues BEFORE this session adds anything to it.
  union all
  select 5,
    'CHECK 5  B1 sessions by kind and status (information, no pass or fail)',
    'read it',
    coalesce((
      select string_agg(kind || '/' || status || ': ' || n::text, ',  ' order by kind, status)
      from (
        select kind, status, count(*) as n
        from public.sessions
        where class_id = (select id from b1)
        group by kind, status
      ) t
    ), 'no sessions'),
    'INFORMATION'

  -- --- The four facts the run's shape depends on. --------------------------
  union all
  select 6,
    'CHECK 6  whole-database totals, to prove nothing outside B1 moved (information)',
    'read it',
    (select 'rubrics: '            || (select count(*) from public.rubrics)::text
         || ',  assignments: '     || (select count(*) from public.assignments)::text
         || ',  scored sessions: ' || (select count(*) from public.sessions where status = 'scored')::text
         || ',  scenarios naming a rubric: '
                                   || (select count(*) from public.scenarios where rubric_id is not null)::text
         || ',  sessions with no assignment: '
                                   || (select count(*) from public.sessions where assignment_id is null)::text),
    'INFORMATION'

  union all
  select 7,
    'CHECK 7  is_super_admin on the two instructor accounts',
    'instructor@test.com false',
    coalesce((
      select string_agg(email || ': ' || is_super_admin::text, ',  ' order by email)
      from public.profiles
      where email in ('instructor@test.com', 'michaeltbanta@gmail.com')
    ), 'neither account found'),
    case when (select is_super_admin from public.profiles where email = 'instructor@test.com') is false
         then 'PASSED  the export click belongs to the owner, as planned'
         else 'FAILED  STOP AND REPORT before running anything' end

  union all
  select 8,
    'CHECK 8  classes owned by instructor@test.com (item 12 needs at least 2)',
    '2 or more',
    coalesce((
      select string_agg(name, ',  ' order by created_at)
      from public.classes
      where instructor_id = (select id from test_instructor)
    ), 'none'),
    case when (select count(*) from public.classes
               where instructor_id = (select id from test_instructor)) >= 2
         then 'PASSED' else 'FAILED  Gate 5 item 12 cannot run in its own-other-class form' end

  union all
  select 9,
    'CHECK 9  2studentb1@gmail.com is a member of B1',
    '1',
    (select count(*)::text
     from public.class_members cm
     join public.profiles p on p.id = cm.user_id
     where cm.class_id = (select id from b1)
       and p.email = '2studentb1@gmail.com'),
    case when (select count(*)
               from public.class_members cm
               join public.profiles p on p.id = cm.user_id
               where cm.class_id = (select id from b1)
                 and p.email = '2studentb1@gmail.com') = 1
         then 'PASSED' else 'FAILED  the student account cannot drive B1' end

  union all
  select 10,
    'CHECK 10  scored sessions holding an item with NO level (whole database, then B1)',
    'the 2b-2 handoff says 32 and 0',
    (select 'whole database: ' || (select n from levelless_all)::text
         || ',  in B1: '        || (select n from levelless_b1)::text),
    case when (select n from levelless_b1) > 0
         then 'INFORMATION  a genuine legacy score is inside B1, so item 3 needs no shaping'
         else 'INFORMATION  none in B1, so item 3 must shape the state on this session own test row' end
) rows
order by sort_order;
