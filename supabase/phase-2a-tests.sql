-- Relii Phase 2a: TESTS. Run AFTER supabase/phase-2a-rubric-intake.sql.
--
-- ==> THIS FILE IS IN TWO SECTIONS AND THEY ARE RUN AS TWO SEPARATE CALLS.
--     That is not untidiness, it is forced: SECTION B ends in a deliberate
--     error, and an error aborts everything sent in the same call. If both
--     sections went in together the error would throw away Section A's results.
--
--     Two calls is still the batched shape this project asks for. Nineteen
--     checks arrive as one table and one verdict, rather than as nineteen
--     approval prompts nobody reads by the end. <==
--
-- SECTION A  reads only. 22 rows: 19 checks, plus 3 marked "not a check" that
--            report a number for comparison rather than passing or failing.
-- SECTION B  the behaviour test. Writes, and ALWAYS rolls the writes back.
--
--
-- ==> WHAT THIS FILE STILL DOES NOT PROVE, AND THE ONE THING TO DO FIRST NEXT
--     SESSION.
--
--     create_assignment_with_rubric() HAS NEVER BEEN CALLED. Checks 11 to 15
--     prove it EXISTS and prove WHO MAY EXECUTE IT. They prove nothing about
--     whether its two inserts actually work.
--
--     THE REASON THAT GAP IS INVISIBLE: a plpgsql function body is not resolved
--     against the tables when the function is created. A wrong column name, or
--     a parameter whose type does not match the column it is written to, is
--     accepted at creation time without complaint and fails on the FIRST REAL
--     CALL, which would be an instructor creating an assignment.
--
--     THIS IS THE PHASE 5 SHAPE. The instructor branch of the signup trigger
--     had never run either. Finding it cost ten minutes; not finding it would
--     have cost a launch week.
--
--     CLOSED 2026-09-09, BEFORE ANY ROUTE WAS BUILT ON IT. The function was
--     called for real, with real class, scenario and instructor ids so the
--     foreign keys were exercised rather than sidestepped, inside a block that
--     always raises and therefore always rolls back. Result:
--
--       FUNCTION PROOF PASSED. assignment_id=7219ce43-a30f-41cb-82b0-0852fce80925
--       rubric_id=9acf3adb-bd80-49b7-8954-e4af721efb40 max_total=100
--       criteria_in_items=1 rubric_and_assignment_same_class=t
--
--     Both inserts ran, the assignment came back pointing at the new rubric,
--     max_total landed in its own column, the criteria jsonb round-tripped, and
--     both rows landed in the same class. A follow-up read confirmed 1 rubric
--     and 5 assignments afterwards, unchanged.
--
--     THE POINT OF RECORDING IT RATHER THAN JUST DOING IT: the thirteen
--     parameters had already been checked by hand against
--     components/create-assignment-form.tsx and they matched, so this was
--     "expected to pass". Expected to pass is exactly what makes an unrun path
--     feel safe to leave unrun. It is no longer unrun. <==


-- ###########################################################################
-- SECTION A. Run this on its own. It only reads.
-- ###########################################################################
-- WHAT YOU SHOULD SEE: every verdict reading PASSED. Rows 10, 21 and 22 are
-- marked "not a check" and report a number instead, and ROW 21 should match the
-- "assignments the backfill will give a rubric" number that the pre-flight file
-- reported BEFORE the migration ran. If those two numbers differ, the backfill
-- did not do what the pre-flight predicted, and that is worth stopping for.
--
-- RUN OF 2026-09-09: pre-flight predicted 2, row 21 reported 2, row 22 reported
-- 3, and all 19 checks passed. Section B reported NEGATIVE TEST PASSED.
with fn as (
  select p.oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_assignment_with_rubric'
),
fk as (
  select *
  from pg_constraint
  where conname = 'assignments_rubric_same_class_fkey'
)
select * from (

  -- --- The two new columns exist, and both allow null. ---------------------
  select 1 as sort_order,
    'assignments.rubric_id exists and is nullable' as check_name,
    'YES' as expected,
    coalesce((
      select case when is_nullable = 'YES' then 'YES' else 'NO, and it must be' end
      from information_schema.columns
      where table_schema='public' and table_name='assignments' and column_name='rubric_id'
    ), 'MISSING') as actual,
    case when (
      select is_nullable from information_schema.columns
      where table_schema='public' and table_name='assignments' and column_name='rubric_id'
    ) = 'YES' then 'PASSED' else 'FAILED' end as verdict

  union all select 2,
    'rubrics.max_total exists and is nullable',
    'YES',
    coalesce((
      select case when is_nullable = 'YES' then 'YES' else 'NO, and it must be' end
      from information_schema.columns
      where table_schema='public' and table_name='rubrics' and column_name='max_total'
    ), 'MISSING'),
    case when (
      select is_nullable from information_schema.columns
      where table_schema='public' and table_name='rubrics' and column_name='max_total'
    ) = 'YES' then 'PASSED' else 'FAILED' end

  -- --- max_total is a column, NOT smuggled into the items array. -----------
  -- The check constraint on items is what makes hiding it there a bug. This
  -- confirms that constraint is still exactly as it was: this migration must
  -- not have relaxed it to make room for anything.
  union all select 3,
    'rubrics.items is still constrained to an array',
    'YES',
    case when exists (
      select 1 from pg_constraint
      where conrelid = 'public.rubrics'::regclass
        and pg_get_constraintdef(oid) ilike '%jsonb_typeof(items)%array%'
    ) then 'YES' else 'NO' end,
    case when exists (
      select 1 from pg_constraint
      where conrelid = 'public.rubrics'::regclass
        and pg_get_constraintdef(oid) ilike '%jsonb_typeof(items)%array%'
    ) then 'PASSED' else 'FAILED' end

  union all select 4,
    'rubrics_max_total_positive check exists',
    'YES',
    case when exists (select 1 from pg_constraint where conname='rubrics_max_total_positive')
         then 'YES' else 'NO' end,
    case when exists (select 1 from pg_constraint where conname='rubrics_max_total_positive')
         then 'PASSED' else 'FAILED' end

  -- --- The same-class rule, checked part by part. --------------------------
  union all select 5,
    'assignments_rubric_same_class_fkey exists',
    'YES',
    case when exists (select 1 from fk) then 'YES' else 'NO' end,
    case when exists (select 1 from fk) then 'PASSED' else 'FAILED' end

  union all select 6,
    'it is a FOREIGN KEY (not some other kind of rule)',
    'f',
    coalesce((select contype::text from fk), 'MISSING'),
    case when (select contype from fk) = 'f' then 'PASSED' else 'FAILED' end

  union all select 7,
    'it points at public.rubrics',
    'rubrics',
    coalesce((select confrelid::regclass::text from fk), 'MISSING'),
    case when (select confrelid from fk) = 'public.rubrics'::regclass
         then 'PASSED' else 'FAILED' end

  union all select 8,
    'ON DELETE is RESTRICT',
    'r',
    coalesce((select confdeltype::text from fk), 'MISSING'),
    case when (select confdeltype from fk) = 'r' then 'PASSED' else 'FAILED' end

  union all select 9,
    'ON UPDATE is RESTRICT',
    'r',
    coalesce((select confupdtype::text from fk), 'MISSING'),
    case when (select confupdtype from fk) = 'r' then 'PASSED' else 'FAILED' end

  -- The full text, for the eye. Not a pass or fail: it is here so the pair of
  -- columns can be read directly rather than inferred from the checks above.
  union all select 10,
    'INFORMATION  the rule as the database states it',
    'see actual',
    coalesce((select pg_get_constraintdef(oid) from fk), 'MISSING'),
    'not a check'

  -- --- The function, and who may call it. ----------------------------------
  union all select 11,
    'create_assignment_with_rubric() exists',
    'YES',
    case when exists (select 1 from fn) then 'YES' else 'NO' end,
    case when exists (select 1 from fn) then 'PASSED' else 'FAILED' end

  -- ==> THE THREE CHECKS THAT MATTER MOST IN THIS FILE. Postgres grants
  --     EXECUTE on a new function to PUBLIC by default, which in Supabase
  --     means every browser. If either of the next two reads YES, a signed-in
  --     student can create an assignment in any class whose id they can guess.
  union all select 12,
    'anon may NOT execute it',
    'NO',
    coalesce((select case when has_function_privilege('anon', oid, 'EXECUTE')
                          then 'YES, AND THAT IS A HOLE' else 'NO' end from fn), 'MISSING'),
    case when (select has_function_privilege('anon', oid, 'EXECUTE') from fn) = false
         then 'PASSED' else 'FAILED  STOP' end

  union all select 13,
    'authenticated may NOT execute it',
    'NO',
    coalesce((select case when has_function_privilege('authenticated', oid, 'EXECUTE')
                          then 'YES, AND THAT IS A HOLE' else 'NO' end from fn), 'MISSING'),
    case when (select has_function_privilege('authenticated', oid, 'EXECUTE') from fn) = false
         then 'PASSED' else 'FAILED  STOP' end

  union all select 14,
    'service_role MAY execute it',
    'YES',
    coalesce((select case when has_function_privilege('service_role', oid, 'EXECUTE')
                          then 'YES' else 'NO' end from fn), 'MISSING'),
    case when (select has_function_privilege('service_role', oid, 'EXECUTE') from fn) = true
         then 'PASSED' else 'FAILED' end

  union all select 15,
    'the function is NOT security definer',
    'NO',
    coalesce((select case when prosecdef then 'YES' else 'NO' end
              from pg_proc where oid = (select oid from fn)), 'MISSING'),
    case when (select prosecdef from pg_proc where oid = (select oid from fn)) = false
         then 'PASSED' else 'FAILED' end

  -- --- The backfill did what the pre-flight predicted. ---------------------
  -- Every assignment whose scenario carries a rubric must now carry that SAME
  -- rubric. Expected: zero disagreements.
  --
  -- ==> THIS CHECK EXPIRED, AND PHASE 2b-2 REPLACED IT ON 2026-09-11. THE
  --     REPLACEMENT IS THE `exists` CLAUSE AT THE BOTTOM OF THE QUERY BELOW.
  --
  --     WHAT IT USED TO SAY, KEPT BECAUSE THE SEQUENCE IS THE LESSON. This note
  --     used to predict that the check would go red "when 2b enables the field",
  --     and it said to leave it alone until then. THAT PREDICTION WAS RIGHT
  --     ABOUT THE OUTCOME AND WRONG ABOUT THE MOMENT, AND NOBODY NOTICED FOR A
  --     WHOLE PHASE. It went red at 2b-1, not at 2b-2.
  --
  --     HERE IS WHY, AND IT IS ONE LINE OF SQL SEMANTICS. The unscoped check
  --     counted an assignment whose SCENARIO carries a rubric and whose own
  --     rubric `is distinct from` it. 2b-1 set every assignments.rubric_id to
  --     NULL, and in SQL `null is distinct from <uuid>` is TRUE. So from the
  --     moment 2b-1 ran, every assignment sitting on a rubric-naming scenario
  --     was counted. MEASURED ON 2026-09-11 BY supabase/phase-2b2-preflight.sql:
  --     it returned 2, on a database in exactly the state it was designed to be
  --     in. Both the 2b-1 handoff and the 2b-2 kickoff asserted in prose that it
  --     "passes vacuously at zero rows"; both were written from the sentence
  --     describing the check rather than from the query, and both were wrong.
  --
  --     THE RULE THAT COMES OUT OF IT, WHICH IS NOT THE ONE ABOUT EXPIRY DATES:
  --     a check that is going to expire needs its EXPIRY CONDITION written in
  --     SQL terms, not in project terms. "When the upload field goes live" is a
  --     fact about a roadmap. "When any assignment's rubric_id stops equalling
  --     its scenario's, INCLUDING BY BECOMING NULL" is a fact about the query,
  --     and it is the one that would have caught this a phase earlier.
  --
  --     WHAT THE REPLACEMENT DOES. It counts only an assignment whose rubric
  --     CAME FROM a scenario, which is identifiable because an uploaded rubric
  --     is referenced by its assignment and by no scenario. So a detached
  --     assignment (rubric_id null) is excluded, and so is every rubric Tom
  --     uploads from 2b-2 onward. What remains measured is the thing this check
  --     was always for: that 2a's backfill did not mismatch a pair. It returned
  --     0 on the pre-flight before it was applied here. <==
  union all select 16,
    'assignments whose SCENARIO-DERIVED rubric does not match their scenario''s',
    '0',
    (select count(*)::text
     from public.assignments a
     join public.scenarios s on s.id = a.scenario_id
     where s.rubric_id is not null
       and a.rubric_id is distinct from s.rubric_id
       and exists (select 1 from public.scenarios s2
                    where s2.rubric_id = a.rubric_id)),
    case when (select count(*)
               from public.assignments a
               join public.scenarios s on s.id = a.scenario_id
               where s.rubric_id is not null
                 and a.rubric_id is distinct from s.rubric_id
                 and exists (select 1 from public.scenarios s2
                              where s2.rubric_id = a.rubric_id)) = 0
         then 'PASSED' else 'FAILED' end

  -- Belt and braces on the rule itself. The constraint should make this
  -- impossible, which is exactly why it is worth measuring once.
  union all select 17,
    'assignments holding a rubric from another class',
    '0',
    (select count(*)::text
     from public.assignments a
     join public.rubrics r on r.id = a.rubric_id
     where r.class_id is distinct from a.class_id),
    case when (select count(*)
               from public.assignments a
               join public.rubrics r on r.id = a.rubric_id
               where r.class_id is distinct from a.class_id) = 0
         then 'PASSED' else 'FAILED' end

  -- --- Nothing that existed before was disturbed. --------------------------
  union all select 18,
    'scenarios.rubric_id still exists (deliberately retained)',
    'YES',
    case when exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='scenarios' and column_name='rubric_id'
    ) then 'YES' else 'NO' end,
    case when exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='scenarios' and column_name='rubric_id'
    ) then 'PASSED' else 'FAILED' end

  union all select 19,
    'scenarios_rubric_same_class_fkey untouched (Gate 4a)',
    'YES',
    case when exists (select 1 from pg_constraint where conname='scenarios_rubric_same_class_fkey')
         then 'YES' else 'NO' end,
    case when exists (select 1 from pg_constraint where conname='scenarios_rubric_same_class_fkey')
         then 'PASSED' else 'FAILED' end

  -- The column number comes from pg_attribute.attnum, NOT from
  -- information_schema's ordinal_position. The two agree only on a table that
  -- has never had a column dropped, and reading the wrong one would describe a
  -- different column while looking perfectly correct.
  union all select 20,
    'the "do not drop me" comment is on scenarios.rubric_id',
    'YES',
    case when coalesce((
           select col_description(a.attrelid, a.attnum)
           from pg_attribute a
           where a.attrelid = 'public.scenarios'::regclass
             and a.attname = 'rubric_id'
             and a.attnum > 0 and not a.attisdropped
         ), '') <> '' then 'YES' else 'NO' end,
    case when coalesce((
           select col_description(a.attrelid, a.attnum)
           from pg_attribute a
           where a.attrelid = 'public.scenarios'::regclass
             and a.attname = 'rubric_id'
             and a.attnum > 0 and not a.attisdropped
         ), '') <> '' then 'PASSED' else 'FAILED' end

  -- --- Counts, for comparison against the pre-flight. ----------------------
  union all select 21,
    'INFORMATION  assignments now carrying a rubric',
    'match the pre-flight number',
    (select count(*)::text from public.assignments where rubric_id is not null),
    'not a check'

  union all select 22,
    'INFORMATION  assignments carrying no rubric',
    'see actual',
    (select count(*)::text from public.assignments where rubric_id is null),
    'not a check'

) as tests
order by sort_order;


-- ###########################################################################
-- SECTION B. Run this SECOND, on its own.
-- ###########################################################################
-- ==> IT IS SUPPOSED TO END IN A RED ERROR MESSAGE. READ THE MESSAGE: it says
--     PASSED, FAILED or SKIPPED. The error is the mechanism, not the result.
--
--     WHY IT WORKS THAT WAY. The checks in Section A read the database's own
--     catalogue and prove the rule is WRITTEN DOWN correctly. This proves it
--     actually FIRES, which is a different claim, and the only honest way to
--     prove it is to try the thing it must refuse.
--
--     IT MAKES TWO WRITES AND KEEPS NEITHER. It creates a throwaway rubric in
--     another class, then tries to attach it. The block always ends by raising
--     an exception, and an exception rolls the whole thing back. There is no
--     path through it that commits, including the path where the rule fails to
--     fire and the attach succeeds.
--
--     If you ever see a rubric named "PHASE 2A NEGATIVE TEST RUBRIC" in the
--     database, something aborted this block's rollback and it should be
--     deleted by hand. It should never appear. <==
do $$
declare
  v_assignment      uuid;
  v_class           uuid;
  v_other_class     uuid;
  v_foreign_rubric  uuid;
  v_rule_fired      boolean := false;
begin
  -- Pick any assignment, and note the class it is in.
  select a.id, a.class_id
    into v_assignment, v_class
  from public.assignments a
  order by a.created_at
  limit 1;

  if v_assignment is null then
    raise exception
      'NEGATIVE TEST SKIPPED: there are no assignments to test against. Nothing was written.';
  end if;

  -- ==> BUILD THE THING THE RULE MUST REFUSE, RATHER THAN HOPING ONE EXISTS.
  --
  --     The obvious version of this test looks for a rubric that already sits
  --     in another class. It would almost certainly find none: there is about
  --     one rubric in this database, so the test would report SKIPPED, and a
  --     test that skips proves nothing. The same-class rule would then rest on
  --     catalogue inspection alone, which is the exact gap this section exists
  --     to close.
  --
  --     So the rubric is CREATED here, in a class the assignment does not
  --     belong to. That is no more dangerous than the update below: it happens
  --     inside the same block, and the block always ends by raising, so the
  --     insert is rolled back with everything else. It converts a near-certain
  --     skip into a real measurement. <==
  select c.id
    into v_other_class
  from public.classes c
  where c.id is distinct from v_class
  order by c.created_at
  limit 1;

  if v_other_class is null then
    raise exception
      'NEGATIVE TEST SKIPPED: only one class exists, so there is no other class to put a rubric in. This is not a failure. Nothing was written.';
  end if;

  insert into public.rubrics (name, items, class_id)
  values (
    'PHASE 2A NEGATIVE TEST RUBRIC, ALWAYS ROLLED BACK, SHOULD NEVER BE VISIBLE',
    '[]'::jsonb,
    v_other_class
  )
  returning id into v_foreign_rubric;

  -- The attempt. The rule should stop this.
  begin
    update public.assignments
       set rubric_id = v_foreign_rubric
     where id = v_assignment;
  exception when foreign_key_violation then
    v_rule_fired := true;
  end;

  if v_rule_fired then
    raise exception
      'NEGATIVE TEST PASSED: assignments_rubric_same_class_fkey refused a rubric from another class. This error is intentional and is what rolls the attempt back. Nothing was written.';
  else
    raise exception
      'NEGATIVE TEST FAILED: a rubric from another class was ACCEPTED onto assignment %. The same-class rule is not working. This error is intentional and rolls the attempt back, so nothing was written, but the rule needs fixing before Phase 2b.', v_assignment;
  end if;
end $$;
