-- Relii Gate 4a, PRE-FLIGHT. Run this FIRST, on its own, before anything else.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run".
--
-- IT CHANGES NOTHING. Every statement in this file only reads. It is safe to
-- run at any time, as many times as you like.
--
-- WHAT IT IS FOR. Gate 4a adds two kinds of rule to the database, and both of
-- them will refuse to be added if the data already breaks them. This file finds
-- that out in ten seconds, before anything is changed, and tells you exactly
-- which rows are in the way.
--
--   PRE-FLIGHT 1  Every class_id must be filled in, on all seven tables.
--   PRE-FLIGHT 2  No row may already point at something in another class.
--
-- WHAT YOU SHOULD SEE. If both pass, you get one row of results saying PASSED.
-- If either fails, you get a red error message that names the tables and lists
-- the offending rows. NOTHING IS CHANGED EITHER WAY.
--
-- IF A PRE-FLIGHT FAILS: stop and show the error to Claude. Do not repair
-- anything by hand. The right repair is different for each kind of failure, and
-- guessing is how a class ends up owning the wrong content.


-- ---------------------------------------------------------------------------
-- PRE-FLIGHT 1: every class_id is filled in, on all seven tables.
-- ---------------------------------------------------------------------------
-- WHY THIS IS CHECKED RATHER THAN ASSUMED. Gate 3a taught all nine write paths
-- to set a class and repaired every row that already existed, so this should
-- pass. "Should pass" is exactly the kind of belief this gate exists to replace
-- with a check: if it is wrong, the migration fails halfway through instead of
-- stopping cleanly here.
--
-- ALL SEVEN COLUMNS BLOCK. Gate 3a's version of this check treated three of
-- them (sessions and the two audit logs) as a warning rather than a stop,
-- because nothing on screen read them. That was right for Gate 3a and is wrong
-- here: Gate 4a puts "not null" on all seven, so an empty value in any of them
-- stops the migration.
do $$
declare
  n_rubrics   integer;
  n_scenarios integer;
  n_assign    integer;
  n_sessions  integer;
  n_invites   integer;
  n_resets    integer;
  n_deletes   integer;
  n_total     integer;
begin
  select count(*) into n_rubrics   from public.rubrics            where class_id is null;
  select count(*) into n_scenarios from public.scenarios          where class_id is null;
  select count(*) into n_assign    from public.assignments        where class_id is null;
  select count(*) into n_sessions  from public.sessions           where class_id is null;
  select count(*) into n_invites   from public.allowed_emails     where class_id is null;
  select count(*) into n_resets    from public.submission_resets  where class_id is null;
  select count(*) into n_deletes   from public.assignment_deletes where class_id is null;

  n_total := n_rubrics + n_scenarios + n_assign + n_sessions
           + n_invites + n_resets + n_deletes;

  if n_total > 0 then
    raise exception
      'GATE 4A PRE-FLIGHT 1 FAILED. % rows still have an empty class, so "not null" cannot be added. Counts by table: rubrics %, scenarios %, assignments %, sessions %, allowed_emails %, submission_resets %, assignment_deletes %. THE FIX: run supabase/gate-3a-repair.sql, which fills these in, then run this pre-flight again. NOTHING WAS CHANGED.',
      n_total, n_rubrics, n_scenarios, n_assign, n_sessions,
      n_invites, n_resets, n_deletes;
  end if;

  raise notice 'Gate 4a pre-flight 1 passed: all seven class_id columns are completely filled in.';
end $$;


-- ---------------------------------------------------------------------------
-- PRE-FLIGHT 2: nothing already points at another class's content.
-- ---------------------------------------------------------------------------
-- The three rules Gate 4a is about to add, in plain English:
--
--   1. An assignment must use a scenario from its OWN class.
--   2. A scenario must be scored by a rubric from its OWN class.
--   3. A session's class must agree with its scenario's class.
--
-- Any row that already breaks one of these would make the migration fail, so
-- they are all checked here first.
--
-- ==> CHECK 1 IS THE ONE MOST LIKELY TO BITE, and the reason is that the two
--     columns it compares are filled in from DIFFERENT places. An assignment's
--     class comes from the instructor who created it. Its scenario's class
--     comes from the instructor who generated the scenario. With one instructor
--     those are always the same person, so they always agree. They are not the
--     same rule, and nothing has ever forced them to match. <==
--
-- THIS REPORTS THE ACTUAL ROWS, NOT JUST A COUNT, because the repair is
-- different for each one: sometimes the assignment is in the wrong class and
-- sometimes the scenario is. It lists up to twenty rows per check, which is far
-- more than anyone expects to see.
--
-- NOTE ON CHECK 2. A scenario is allowed to have NO rubric at all: that is a
-- conversation-only case, added in supabase/piece-2a-conversation-only.sql.
-- Those scenarios are simply not part of this check, which is correct. The
-- section 3 comment in supabase/gate-4a-constraints.sql explains why the new
-- rule skips them too, and why that is deliberate rather than a gap.
do $$
declare
  n_assign    integer;
  n_scenario  integer;
  n_session   integer;
  bad_assign   text;
  bad_scenario text;
  bad_session  text;
  report       text := '';
begin
  -- 1. An assignment using another class's scenario.
  select count(*) into n_assign
    from public.assignments a
    join public.scenarios s on s.id = a.scenario_id
   where a.class_id is distinct from s.class_id;

  -- 2. A scenario scored by another class's rubric. The join drops
  --    conversation-only scenarios (no rubric), which is what we want.
  select count(*) into n_scenario
    from public.scenarios s
    join public.rubrics r on r.id = s.rubric_id
   where s.class_id is distinct from r.class_id;

  -- 3. A session whose class disagrees with its scenario's class.
  select count(*) into n_session
    from public.sessions se
    join public.scenarios s on s.id = se.scenario_id
   where se.class_id is distinct from s.class_id;

  if n_assign + n_scenario + n_session = 0 then
    raise notice 'Gate 4a pre-flight 2 passed: no row points at another class''s content.';
    return;
  end if;

  if n_assign > 0 then
    select string_agg(line, chr(10)) into bad_assign from (
      select 'ASSIGNMENT ' || a.id
             || ' ("' || coalesce(a.title, 'no title') || '")'
             || ' is in class "' || coalesce(ca.name, 'unknown') || '"'
             || ' but its scenario ' || s.id
             || ' ("' || coalesce(s.title, 'no title') || '")'
             || ' is in class "' || coalesce(cs.name, 'unknown') || '"' as line
        from public.assignments a
        join public.scenarios s  on s.id  = a.scenario_id
        left join public.classes ca on ca.id = a.class_id
        left join public.classes cs on cs.id = s.class_id
       where a.class_id is distinct from s.class_id
       order by a.id
       limit 20
    ) t;
    report := report || chr(10)
           || 'CHECK 1, an assignment using another class''s scenario. '
           || n_assign || ' row(s):' || chr(10) || coalesce(bad_assign, '');
  end if;

  if n_scenario > 0 then
    select string_agg(line, chr(10)) into bad_scenario from (
      select 'SCENARIO ' || s.id
             || ' ("' || coalesce(s.title, 'no title') || '")'
             || ' is in class "' || coalesce(cs.name, 'unknown') || '"'
             || ' but its rubric ' || r.id
             || ' is in class "' || coalesce(cr.name, 'unknown') || '"' as line
        from public.scenarios s
        join public.rubrics r   on r.id  = s.rubric_id
        left join public.classes cs on cs.id = s.class_id
        left join public.classes cr on cr.id = r.class_id
       where s.class_id is distinct from r.class_id
       order by s.id
       limit 20
    ) t;
    report := report || chr(10)
           || 'CHECK 2, a scenario scored by another class''s rubric. '
           || n_scenario || ' row(s):' || chr(10) || coalesce(bad_scenario, '');
  end if;

  if n_session > 0 then
    select string_agg(line, chr(10)) into bad_session from (
      select 'SESSION ' || se.id
             || ' is in class "' || coalesce(cse.name, 'unknown') || '"'
             || ' but its scenario ' || s.id
             || ' ("' || coalesce(s.title, 'no title') || '")'
             || ' is in class "' || coalesce(cs.name, 'unknown') || '"' as line
        from public.sessions se
        join public.scenarios s    on s.id   = se.scenario_id
        left join public.classes cse on cse.id = se.class_id
        left join public.classes cs  on cs.id  = s.class_id
       where se.class_id is distinct from s.class_id
       order by se.id
       limit 20
    ) t;
    report := report || chr(10)
           || 'CHECK 3, a session disagreeing with its scenario. '
           || n_session || ' row(s):' || chr(10) || coalesce(bad_session, '');
  end if;

  raise exception
    'GATE 4A PRE-FLIGHT 2 FAILED. % row(s) already point at another class''s content, so the new rules cannot be added. Show this whole message to Claude and do not repair anything by hand. NOTHING WAS CHANGED.%',
    n_assign + n_scenario + n_session, report;
end $$;


-- ---------------------------------------------------------------------------
-- The result. If you can read this row, both pre-flights passed.
-- ---------------------------------------------------------------------------
-- THE LAST COLUMN IS INFORMATION ONLY AND CAN BE ANY NUMBER, including a number
-- above zero, without anything being wrong.
--
-- ==> IT IS ALSO THE ANSWER TO A QUESTION SOMEBODY WILL ASK LATER: "there are
--     three same-class rules, why is there no fourth one comparing a session
--     with its ASSIGNMENT?" Because those two are allowed to disagree. <==
--
-- A session takes its class from its SCENARIO. An assignment takes its class
-- from the INSTRUCTOR WHO CREATED IT. Those are two different rules, on purpose,
-- because a session may have no assignment at all (free practice) and so cannot
-- take its class from one. Gate 3b relied on this: it deliberately did NOT put a
-- class filter on the instructor dashboard's submissions list, because such a
-- filter would hide real submissions whenever these two columns disagreed.
--
-- So this number is reported, never enforced. Query 6 of
-- supabase/gate-3b-tests.sql checks the same thing and also cannot fail.
select
  'PASSED. Both pre-flights are clear. You may run supabase/gate-4a-constraints.sql.'
    as gate_4a_preflight,
  (
    select count(*)
      from public.sessions se
      join public.assignments a on a.id = se.assignment_id
     where se.class_id is distinct from a.class_id
  ) as sessions_disagreeing_with_their_assignment_information_only,
  'That last number does not block anything and there is deliberately no rule for it. See the comment above this query.'
    as note;
