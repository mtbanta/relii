-- Relii Gate 4a: the checks. Read-only apart from query 4, which undoes itself.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor", "New query",
-- and RUN EACH NUMBERED QUERY ON ITS OWN by pasting just that one in. The SQL
-- Editor only shows you the result of the LAST thing it ran, so pasting the
-- whole file at once would hide queries 1 to 3.
--
-- Run these AFTER supabase/gate-4a-constraints.sql. They can be re-run at any
-- time afterwards.
--
-- WHAT IS HERE:
--   1. All seven class_id columns are now required.
--   2. The three same-class rules exist, by name, with their definitions.
--   3. public.is_instructor() is gone and the two helpers that replaced it
--      are still here.
--   4. FOUR DELIBERATE ATTEMPTS TO BREAK THE NEW RULES, all of which must fail.
--
-- ==> QUERY 4 IS THE POINT OF THIS FILE. A rule nobody has tried to violate has
--     not been tested, it has only been observed to exist. Queries 1 to 3 prove
--     the rules are PRESENT. Query 4 proves they BITE. <==


-- ===========================================================================
-- 1. ALL SEVEN class_id COLUMNS ARE REQUIRED.
-- ===========================================================================
-- EXPECTED: seven rows, every one of them saying is_nullable = NO.
--
-- If any row says YES, the migration did not finish and the three rules in
-- query 2 may be present while enforcing nothing. See the MATCH SIMPLE
-- explanation at the top of supabase/gate-4a-constraints.sql.
select
  table_name,
  column_name,
  is_nullable,
  case when is_nullable = 'NO' then 'required (correct)'
       else '>>> STILL OPTIONAL, THE MIGRATION DID NOT FINISH <<<'
  end as verdict
from information_schema.columns
where table_schema = 'public'
  and column_name  = 'class_id'
  and table_name in ('rubrics', 'scenarios', 'assignments', 'sessions',
                     'allowed_emails', 'submission_resets', 'assignment_deletes')
order by table_name;


-- ===========================================================================
-- 2. THE THREE SAME-CLASS RULES, BY NAME, WITH WHAT THEY ACTUALLY SAY.
-- ===========================================================================
-- EXPECTED: exactly five rows. The three same-class rules and the two unique
-- pairs they need.
--
-- READ THE definition COLUMN, not just the names. Each of the three should end
-- in "REFERENCES ... (id, class_id)". A definition naming only ONE column would
-- mean the rule was created against the wrong columns and checks nothing about
-- classes at all.
select
  conname as rule_name,
  case contype when 'f' then 'same-class rule' when 'u' then 'unique pair' end as kind,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in ('assignments_scenario_same_class_fkey',
                  'scenarios_rubric_same_class_fkey',
                  'sessions_scenario_same_class_fkey',
                  'rubrics_id_class_unique',
                  'scenarios_id_class_unique')
order by contype desc, conname;


-- ===========================================================================
-- 3. is_instructor IS GONE, AND ITS TWO REPLACEMENTS ARE STILL HERE.
-- ===========================================================================
-- EXPECTED: two rows, instructs_class and can_read_class, both with
-- security_definer = true. is_instructor must NOT appear.
--
-- ==> SECURITY DEFINER ON BOTH OF THESE IS LOAD BEARING AND MUST NEVER BE
--     REMOVED. Gate 1 switched security on for the classes and class_members
--     tables with no rules attached, so a function without it would read zero
--     rows, answer false for every instructor, and silently blank every
--     instructor screen that reads through the security rules. This check is
--     here so that never goes unnoticed. <==
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  case when p.proname = 'is_instructor'
       then '>>> STILL EXISTS, THE DELETE DID NOT RUN <<<'
       else 'correct'
  end as verdict
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_instructor', 'instructs_class', 'can_read_class')
order by p.proname;


-- ===========================================================================
-- 4. FOUR DELIBERATE ATTEMPTS TO BREAK THE RULES. ALL FOUR MUST FAIL.
-- ===========================================================================
-- ==> RUN THIS ON ITS OWN. IT ENDS WITH A RED ERROR MESSAGE ON PURPOSE, AND
--     THAT ERROR MESSAGE IS THE TEST REPORT. Read it. <==
--
-- WHY IT ENDS IN A DELIBERATE ERROR. Everything this test does (creating a
-- throwaway class, moving rows into it) has to be undone afterwards or the
-- database is left dirty. The most reliable way to undo work in Postgres is to
-- end with an error, because that throws away everything the block did. So the
-- last thing it does is raise one on purpose, carrying the whole report.
--
-- NOTHING IS LEFT BEHIND. Not the throwaway class, not a single moved row. If
-- you re-run this ten times the database is identical afterwards.
--
-- THE FOUR TESTS:
--   1. Move an assignment into another class while its scenario stays put.
--      Must be refused by assignments_scenario_same_class_fkey.
--   2. Move a rubric into another class while a scenario still points at it.
--      Must be refused by scenarios_rubric_same_class_fkey.
--   3. Move a session into another class while its scenario stays put.
--      Must be refused by sessions_scenario_same_class_fkey.
--   4. Empty the class on one row of each of the seven tables.
--      All seven must be refused, each with error 23502 (not null violation).
--
-- ==> WHY TEST 2 MOVES THE RUBRIC RATHER THAN THE SCENARIO, WHICH LOOKS
--     BACKWARDS. It is the only way to get a trustworthy answer. Moving the
--     SCENARIO would break up to three rules at once (its own rubric rule, plus
--     the assignment and session rules pointing back at it), and Postgres makes
--     no promise about which one it reports first, so the name in the error
--     would not be proof of anything. NOTHING points at rubrics except
--     scenarios, so moving the rubric can only ever trip the one rule under
--     test. Same rule, exercised from the only side that gives a clean answer.
--
-- ONE HONEST NOTE ON TEST 4. The brief asked for an INSERT with an empty class.
-- This empties the class on a row that already exists instead. It is the same
-- column and the same rule, and it avoids inventing brand new rows whose other
-- required values would have to be guessed at, which would risk failing for the
-- wrong reason and reading as a pass.
do $$
declare
  test_class     uuid;
  any_owner      uuid;
  target_assign  uuid;
  target_rubric  uuid;
  target_session uuid;
  report         text := '';
  tbl            text;
  n_rows         bigint;
  passed         integer := 0;
  failed         integer := 0;
  skipped        integer := 0;

  summary text;
begin
  -- A throwaway class to move things into. It is owned by whoever already owns
  -- a class, because classes.instructor_id must point at a real instructor.
  select instructor_id into any_owner from public.classes order by created_at limit 1;
  if any_owner is null then
    raise exception 'GATE 4A TEST 4 CANNOT RUN: there are no classes in the database at all.';
  end if;

  insert into public.classes (name, instructor_id)
  values ('GATE 4A TEST CLASS (rolled back automatically)', any_owner)
  returning id into test_class;

  -- -------------------------------------------------------------------------
  -- TEST 1: an assignment cannot be moved away from its scenario's class.
  -- -------------------------------------------------------------------------
  select id into target_assign from public.assignments limit 1;
  if target_assign is null then
    report := report || chr(10) || '| TEST 1  SKIPPED: there are no assignments to test with.';
    skipped := skipped + 1;
  else
    begin
      update public.assignments set class_id = test_class where id = target_assign;
      report := report || chr(10) || '| TEST 1  *** FAILED *** The assignment was moved into another class and NOTHING STOPPED IT. assignments_scenario_same_class_fkey is missing or is not doing its job.';
      failed := failed + 1;
    exception when others then
      report := report || chr(10) || '| TEST 1  PASSED. Refused, SQLSTATE ' || sqlstate || ': ' || sqlerrm;
      raise notice 'TEST 1 PASSED: %', sqlerrm;
      passed := passed + 1;
    end;
  end if;

  -- -------------------------------------------------------------------------
  -- TEST 2: a rubric cannot be moved away from the class of a scenario using it.
  -- -------------------------------------------------------------------------
  select r.id into target_rubric
    from public.rubrics r
   where exists (select 1 from public.scenarios s where s.rubric_id = r.id)
   limit 1;
  if target_rubric is null then
    report := report || chr(10) || '| TEST 2  SKIPPED: no rubric is currently used by any scenario, so this rule cannot be exercised. That is not a failure, but this rule is then UNTESTED.';
    skipped := skipped + 1;
  else
    begin
      update public.rubrics set class_id = test_class where id = target_rubric;
      report := report || chr(10) || '| TEST 2  *** FAILED *** The rubric was moved into another class while a scenario still points at it, and NOTHING STOPPED IT. scenarios_rubric_same_class_fkey is missing or is not doing its job.';
      failed := failed + 1;
    exception when others then
      report := report || chr(10) || '| TEST 2  PASSED. Refused, SQLSTATE ' || sqlstate || ': ' || sqlerrm;
      raise notice 'TEST 2 PASSED: %', sqlerrm;
      passed := passed + 1;
    end;
  end if;

  -- -------------------------------------------------------------------------
  -- TEST 3: a session cannot be moved away from its scenario's class.
  -- -------------------------------------------------------------------------
  select id into target_session from public.sessions limit 1;
  if target_session is null then
    report := report || chr(10) || '| TEST 3  SKIPPED: there are no sessions to test with.';
    skipped := skipped + 1;
  else
    begin
      update public.sessions set class_id = test_class where id = target_session;
      report := report || chr(10) || '| TEST 3  *** FAILED *** The session was moved into another class and NOTHING STOPPED IT. sessions_scenario_same_class_fkey is missing or is not doing its job.';
      failed := failed + 1;
    exception when others then
      report := report || chr(10) || '| TEST 3  PASSED. Refused, SQLSTATE ' || sqlstate || ': ' || sqlerrm;
      raise notice 'TEST 3 PASSED: %', sqlerrm;
      passed := passed + 1;
    end;
  end if;

  -- -------------------------------------------------------------------------
  -- TEST 4: the class cannot be emptied, on any of the seven tables.
  -- -------------------------------------------------------------------------
  -- "ctid" is Postgres's built-in name for a row's physical position. It is used
  -- here because it exists on every table, which matters: allowed_emails is
  -- keyed by email and has no "id" column at all, so there is no one column name
  -- that would work for all seven.
  foreach tbl in array array['rubrics', 'scenarios', 'assignments', 'sessions',
                             'allowed_emails', 'submission_resets', 'assignment_deletes']
  loop
    execute format('select count(*) from public.%I', tbl) into n_rows;

    if n_rows = 0 then
      report := report || chr(10) || '| TEST 4  ' || rpad(tbl, 20)
             || ' SKIPPED: the table is empty, so there is no row to try this on.';
      skipped := skipped + 1;
    else
      begin
        execute format(
          'update public.%I set class_id = null where ctid = (select ctid from public.%I limit 1)',
          tbl, tbl);
        report := report || chr(10) || '| TEST 4  ' || rpad(tbl, 20)
               || ' *** FAILED *** The class was emptied and NOTHING STOPPED IT. This column is still optional.';
        failed := failed + 1;
      exception when others then
        report := report || chr(10) || '| TEST 4  ' || rpad(tbl, 20)
               || ' PASSED. Refused, SQLSTATE ' || sqlstate
               || case when sqlstate = '23502' then ' (not null violation, exactly right)'
                       else ' (expected 23502, look at this one)' end;
        passed := passed + 1;
      end;
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- The report, delivered as a deliberate error so that everything above is
  -- thrown away.
  -- -------------------------------------------------------------------------
  if failed > 0 then
    summary := '>>> ' || failed || ' TEST(S) FAILED. THE RULES ARE NOT DOING THEIR JOB. Show this whole message to Claude. <<<';
  elsif skipped > 0 then
    summary := 'All ' || passed || ' test(s) that could run PASSED, and ' || skipped
                   || ' were skipped for lack of data. A skipped rule is UNTESTED, not proven.';
  else
    summary := 'ALL ' || passed || ' TESTS PASSED. Every rule refused every attempt to break it.';
  end if;

  raise exception E'GATE 4A VIOLATION TESTS FINISHED. THIS ERROR IS DELIBERATE AND IS HOW THE TEST UNDOES ITSELF. NOTHING WAS CHANGED IN YOUR DATABASE.\n\n%\n%\n\n(passed %, failed %, skipped %)',
    summary, report, passed, failed, skipped;
end $$;


-- ===========================================================================
-- WHAT GATE 4a HANDS TO GATE 4b AND GATE 5.
-- ===========================================================================
-- Nothing below is a query. It is the handoff, written here rather than only in
-- PROJECT_STATE.md so that the next person to open this file finds it.
--
-- ---------------------------------------------------------------------------
-- TO GATE 4b (the super admin section, instructor add and remove, and the
-- export-first cascade delete):
-- ---------------------------------------------------------------------------
--   1. EVERY ROW PROVABLY CARRIES A CLASS. That is the whole reason Gate 4a
--      went first. The cascade delete does not have to defend that assumption,
--      handle a "what about rows with no class" branch, or sweep for orphans.
--
--   2. THE DELETE ORDER IS NOW FORCED, and getting it wrong fails loudly rather
--      than quietly. All three new rules, and the single-column links they sit
--      beside, are "on delete restrict". So a class must be emptied in this
--      order: sessions, then assignments, then scenarios, then rubrics, then
--      allowed_emails and class_members, then the class row itself. Any other
--      order stops with a foreign key error and changes nothing.
--
--   3. CONTENT CANNOT BE MOVED BETWEEN CLASSES ONE TABLE AT A TIME. The rules
--      are also "on update restrict", so changing a scenario's class while an
--      assignment still points at it is refused. This does NOT affect handing a
--      class to a different instructor, which changes classes.instructor_id and
--      no class_id at all. It only matters if Gate 4b ever wants to MOVE content
--      rather than delete it, in which case parent and child have to change in
--      one statement.
--
--   4. THE TWO AUDIT LOGS NOW REQUIRE A CLASS AND STILL HAVE NO LINK TO ONE.
--      submission_resets.class_id and assignment_deletes.class_id are plain
--      snapshot values with no foreign key, which was Gate 1's deliberate
--      decision so that a later account or assignment delete could never remove
--      or blank a log entry. Gate 4a made them required and did NOT add a link,
--      which keeps that decision intact. THE CONSEQUENCE GATE 4b MUST RULE ON:
--      after a class is deleted, its audit rows survive, pointing at a class id
--      that no longer exists. That is the log working as designed. Gate 4b
--      decides whether the export carries them and whether anything reads them
--      afterwards.
--
--   5. public.is_instructor() IS GONE. If the super admin surface wants an "is
--      this person any kind of instructor" check, it needs a NEW function
--      written for that purpose. Do not resurrect this one: its whole problem
--      was that it answered "any instructor" where the caller meant "this
--      instructor", and bringing the name back invites that confusion into a
--      brand new surface. Note that supabase/gate-4a-revert.sql, and both of the
--      earlier revert files, re-create it for their own use, which is a rollback
--      path and not a licence to call it from new code.
--
--   6. THE role CHECK ON profiles AND allowed_emails WAS NOT TOUCHED, exactly as
--      instructed, because how a super admin is identified is Gate 4b's decision
--      and it may or may not need that constraint changed.
--
-- ---------------------------------------------------------------------------
-- TO GATE 5 (isolation testing with the second instructor account):
-- ---------------------------------------------------------------------------
--   7. ONE OF THE TWO ITEMS THAT NEEDED A RULING IS NOW SETTLED. The Gate 5
--      matrix at the bottom of supabase/gate-3b-tests.sql asked whether the
--      model wanted a same-class constraint on those foreign keys, a check at
--      creation time, or neither. THE ANSWER IS A CONSTRAINT, and it is built.
--      Gate 5 no longer has to detect a silent failure there, because the
--      database refuses it outright.
--
--   8. THE OTHER ONE IS STILL OPEN, AND GATE 4a MADE IT MORE VISIBLE RATHER THAN
--      SMALLER. allowed_emails.email is the PRIMARY KEY, so an address belongs
--      to exactly one instructor's invite list. A student taking two of the five
--      instructors' courses hits this on day one. Gate 4a's four new messages
--      make the collision LEGIBLE (they say whose list it is and where to go)
--      but they do not remove it. Whether the model should allow one address on
--      two invite lists is still a ruling nobody has made.
--
--   9. TWO NEW THINGS TO TEST AS INSTRUCTOR B, and neither can be seen with one
--      instructor, which is why they belong here and not in the Gate 4a
--      click-through:
--        a. B invites an address that is already on A's invite list. Expect
--           "was invited by another instructor, so they cannot be invited again.
--           Ask your administrator." It must NOT name A or A's class.
--        b. B invites an address that is already on B's OWN invite list. Expect
--           "is already on your invite list."
--      The whole point of the extra read is telling those two apart. With one
--      instructor only case b is reachable, so case a is untested until Gate 5.
--      The same pair exists for the CSV path, with four reasons rather than two,
--      because a bulk import also knows whether the person has registered:
--      "Already a registered user in your class" and "Already registered with
--      another instructor (ask your administrator)".
--
--  10. QUERY 4 ABOVE IS RE-RUNNABLE AND SHOULD BE RE-RUN once Gate 4b's cascade
--      delete exists, because a delete path is exactly the kind of code that
--      relaxes a constraint to get itself working.
