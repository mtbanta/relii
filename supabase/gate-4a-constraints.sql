-- Relii Gate 4a: lock the class model down.
--
-- HOW TO USE: run supabase/gate-4a-preflight.sql FIRST. Then open your Supabase
-- dashboard, click "SQL Editor" in the left sidebar, click "New query", paste
-- this whole file in, and click "Run". It is safe to run more than once.
--
-- IF ANYTHING GOES WRONG: supabase/gate-4a-revert.sql undoes every single thing
-- in this file, including bringing back the function section 4 deletes. Read it
-- before you run this, not after.
--
-- ===========================================================================
-- ==> DO NOT RUN SECTION 3 UNTIL THE FOREIGN KEY HINTS ARE LIVE ON
--     relii.vercel.app. THIS FILE ONCE SAID THE OPPOSITE AND THE OPPOSITE WAS
--     WRONG, IN PRODUCTION, ON 2026-08-31. <==
-- ===========================================================================
-- WHAT HAPPENED, written out because it is the single most expensive thing this
-- piece got wrong and the mistake is very easy to make again.
--
-- Section 3 adds assignments_scenario_same_class_fkey ALONGSIDE the existing
-- assignments_scenario_id_fkey. Postgres is perfectly happy with two foreign
-- keys between the same pair of tables. THE SUPABASE API IS NOT.
--
-- Supabase resolves an embedded join, written in the app as
-- "scenarios ( title, persona_name )", by finding THE foreign key between the
-- two tables. With TWO it refuses to guess and returns an error instead of rows.
-- All three of the app's embedded reads destructure only `data` and ignore
-- `error`, so those pages rendered EMPTY: Manage Assignments, the instructor
-- dashboard selector (which empties the Submissions page with it), and THE
-- STUDENT HOME. No error on screen, nothing in the logs, and every row still
-- perfectly intact in the database.
--
-- THE FIX, already applied in the app: each of the three reads now names the key
-- to follow, "scenarios!assignments_scenario_id_fkey ( ... )". That hint is
-- valid whether or not the second key exists, so the deploy is safe to ship
-- first and is the reason this file is now second.
--
-- SO THE ORDER FOR THIS PIECE IS GATE 3a's, NOT THIS PROJECT'S USUAL ONE:
--   1. Sections 0, 1 and 2 (the requirement and the unique pairs) are safe at
--      any time and were run on 2026-08-31 without incident.
--   2. The deploy carrying the three hints goes live on relii.vercel.app.
--   3. THEN this file is re-run, which is what adds section 3's rules.
--
-- Sections 1 and 2 really are safe before the deploy, and the original reasoning
-- for that still holds: both browser write forms already refuse to write without
-- a class (Gate 3a), and the create-assignment dropdown reads through the
-- security rules so it can only offer same-class scenarios. NONE OF THAT WAS
-- WRONG. What was wrong was checking the new rules against Postgres and never
-- against the API layer every one of these pages reads through.
--
-- ===========================================================================
-- WHAT THIS FILE IS FOR
-- ===========================================================================
-- Gate 1 gave every row a class to belong to. Gate 2 made the database's
-- security rules read it. Gate 3a made every write fill it in and Gate 3b made
-- every read filter on it. All of that is done and live.
--
-- What is still missing is the database ENFORCING any of it. Today a class can
-- still be left empty, and nothing stops one class's assignment from using
-- another class's scenario. Both of those are unreachable through the app, but
-- "unreachable through the app" is a fact about today's code, not a rule. This
-- file turns the four things we rely on into rules the database will not let
-- anybody break.
--
-- FOUR THINGS, in this order and the order is not negotiable:
--   1. "not null" on all seven class_id columns.
--   2. A unique pair on rubrics and scenarios, which step 3 needs.
--   3. Three same-class rules.
--   4. Delete public.is_instructor(), which nothing uses any more.
--
-- ===========================================================================
-- ==> WHY SECTION 1 MUST COME BEFORE SECTION 3, AND WHY GETTING THIS WRONG
--     WOULD BE THE WORST POSSIBLE OUTCOME OF THIS FILE. <==
-- ===========================================================================
-- The three rules in section 3 are TWO-COLUMN rules: "this assignment's
-- scenario AND class must together match some scenario's id AND class".
--
-- A two-column rule in Postgres has a default behaviour called MATCH SIMPLE,
-- and MATCH SIMPLE means: IF ANY COLUMN OF THE PAIR IS EMPTY, SKIP THE CHECK
-- ENTIRELY. Not "fail". Not "warn". Skip.
--
-- So if section 3 ran before section 1, on a table where class_id can still be
-- empty, then:
--   * the three rules would be created,
--   * this file would report success,
--   * every check afterwards would show all three rules present and correct,
--   * and they would enforce NOTHING on any row with an empty class.
--
-- That is worse than not adding them at all, because everybody would then
-- believe cross-class references were prevented when they were not. A wrong
-- belief about a security rule is the exact thing this gate has spent five
-- pieces removing. Section 1 is above section 3, in this same file, for that
-- reason. Do not split them, do not reorder them, and do not "do the not null
-- part afterwards".
--
-- ===========================================================================
-- WHAT THIS FILE DOES NOT DO
-- ===========================================================================
-- No super admin, no adding or removing instructors, no cascade delete and no
-- export: all of that is Gate 4b. No read or write scoping changes: Gate 3a and
-- Gate 3b own that and it is finished. No Storage change. No change to the
-- student surface. No change to the role check on profiles or allowed_emails,
-- because Gate 4b decides how a super admin is identified and that decision may
-- need it.


-- ---------------------------------------------------------------------------
-- 0. PRE-FLIGHT. This file refuses to run if the data is not ready.
-- ---------------------------------------------------------------------------
-- The same two checks as supabase/gate-4a-preflight.sql, in short form, so that
-- skipping the pre-flight file cannot hurt you. It stops BEFORE anything is
-- changed, so a stop leaves the system exactly as it is now.
--
-- The pre-flight file is still the one to run first, because it lists the
-- offending rows and this one only counts them.
do $$
declare
  n_null       integer;
  n_crossclass integer;
begin
  select (select count(*) from public.rubrics            where class_id is null)
       + (select count(*) from public.scenarios          where class_id is null)
       + (select count(*) from public.assignments        where class_id is null)
       + (select count(*) from public.sessions           where class_id is null)
       + (select count(*) from public.allowed_emails     where class_id is null)
       + (select count(*) from public.submission_resets  where class_id is null)
       + (select count(*) from public.assignment_deletes where class_id is null)
    into n_null;

  if n_null > 0 then
    raise exception
      'GATE 4A STOPPED: % rows still have an empty class, so "not null" cannot be added. Run supabase/gate-4a-preflight.sql to see which tables, then supabase/gate-3a-repair.sql to fix them. NOTHING WAS CHANGED.',
      n_null;
  end if;

  select (select count(*)
            from public.assignments a
            join public.scenarios s on s.id = a.scenario_id
           where a.class_id is distinct from s.class_id)
       + (select count(*)
            from public.scenarios s
            join public.rubrics r on r.id = s.rubric_id
           where s.class_id is distinct from r.class_id)
       + (select count(*)
            from public.sessions se
            join public.scenarios s on s.id = se.scenario_id
           where se.class_id is distinct from s.class_id)
    into n_crossclass;

  if n_crossclass > 0 then
    raise exception
      'GATE 4A STOPPED: % rows already point at another class''s content, so the new rules cannot be added. Run supabase/gate-4a-preflight.sql, which lists exactly which rows and which rule each one breaks. NOTHING WAS CHANGED.',
      n_crossclass;
  end if;

  raise notice 'Gate 4a pre-flight passed. Locking the class model down.';
end $$;


-- ---------------------------------------------------------------------------
-- 1. Every class_id is now REQUIRED. All seven columns.
-- ---------------------------------------------------------------------------
-- Every gate piece so far deliberately left these optional, because nothing
-- filled them in yet and requiring one would have broken the app the moment it
-- ran. Gate 1 says so in its own comments; so does Gate 2.
--
-- That reason is gone. Gate 3a taught all nine write paths to set a class and
-- repaired every row that already existed, and it has been running in
-- production since 2026-08-29. Section 0 above has just confirmed the result
-- rather than trusting it.
--
-- WHAT THIS MEANS FROM NOW ON: a row that does not name a class cannot be
-- saved at all. That is the point. A row with no class is invisible to every
-- page (Gate 3b filters on this column) and manageable by nobody, so it is
-- better refused loudly at the moment it is written than saved and lost.
--
-- Running this twice is harmless: setting a requirement that is already there
-- changes nothing.
alter table public.rubrics            alter column class_id set not null;
alter table public.scenarios          alter column class_id set not null;
alter table public.assignments        alter column class_id set not null;
alter table public.sessions           alter column class_id set not null;
alter table public.allowed_emails     alter column class_id set not null;
alter table public.submission_resets  alter column class_id set not null;
alter table public.assignment_deletes alter column class_id set not null;


-- ---------------------------------------------------------------------------
-- 2. Two unique pairs. These look redundant. THEY ARE NOT A MISTAKE.
-- ---------------------------------------------------------------------------
-- ==> READ THIS BEFORE DELETING EITHER OF THEM. <==
--
-- "unique (id, class_id)" says no two rows may share the same id AND class
-- together. Since id is already the primary key, no two rows can share an id at
-- all, so this adds no restriction whatsoever. It is not doing any work.
--
-- IT IS HERE BECAUSE POSTGRES REQUIRES IT. Section 3 creates rules that point
-- at the PAIR (id, class_id). Postgres will not let a rule point at a set of
-- columns unless that exact set is declared unique, and it does not accept "id
-- is already unique on its own, so the pair must be too" as an argument, even
-- though that is plainly true. So these two lines exist purely to satisfy that
-- requirement, and section 3 fails with "there is no unique constraint matching
-- given keys" without them.
--
-- Drop one of these and the matching rule in section 3 disappears with it.
--
-- ==> THESE TWO ARE "ADD IF MISSING" RATHER THAN "DROP THEN ADD", WHICH IS THE
--     IDIOM THE REST OF THIS FILE USES, AND THE DIFFERENCE IS NOT COSMETIC. On a
--     SECOND run of this file, the rules in section 3 already exist and they
--     point AT these two. Postgres will not let a unique pair be dropped while
--     something points at it, so a "drop then add" here would fail on every run
--     after the first with "cannot drop constraint because other objects depend
--     on it", and the file would stop before section 3 and section 4. Asking
--     first is what keeps this file safe to run twice. <==
--
-- The section 3 rules can safely use "drop then add", because nothing points at
-- THEM. This is the same "ask first" pattern already used in
-- supabase/piece-2c-candidate-grouping.sql, for the same reason: Postgres has no
-- "add constraint if not exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rubrics_id_class_unique'
  ) then
    alter table public.rubrics
      add constraint rubrics_id_class_unique unique (id, class_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'scenarios_id_class_unique'
  ) then
    alter table public.scenarios
      add constraint scenarios_id_class_unique unique (id, class_id);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. The three same-class rules.
-- ---------------------------------------------------------------------------
-- In plain English:
--
--   assignments_scenario_same_class_fkey
--     An assignment must use a scenario from its own class.
--     Stops one instructor's assignment running another instructor's case.
--
--   scenarios_rubric_same_class_fkey
--     A scenario must be scored by a rubric from its own class.
--     Stops a results page showing scores with no item labels beside them,
--     which is what happens when the scenario and the rubric are read
--     separately and one of them is invisible to that student.
--
--   sessions_scenario_same_class_fkey
--     A session's class must agree with its scenario's class.
--     Stops a submission that no class-filtered view can see.
--
-- All three were reachable in principle before this file and prevented only by
-- the fact that the creation screens read through the security rules and can
-- therefore only ever offer same-class options. That is a fact about today's
-- code. These are rules.
--
-- The single-column links these sit alongside (assignments.scenario_id,
-- scenarios.rubric_id, sessions.scenario_id) are all LEFT IN PLACE. The new
-- rules are additional, not replacements. Removing a live link is a bigger
-- change than this piece was asked to make.
--
-- ==> "KEEPING BOTH COSTS NOTHING" IS WHAT THIS COMMENT USED TO SAY AND IT IS
--     FALSE. It costs an embedded join, because the Supabase API cannot choose
--     between two foreign keys and errors instead. See the warning at the top of
--     this file. Every embedded read in the app now names its key explicitly,
--     which is what makes keeping both safe. IF YOU EVER ADD A NEW EMBEDDED READ
--     BETWEEN assignments AND scenarios, scenarios AND rubrics, OR sessions AND
--     scenarios, IT MUST NAME ITS FOREIGN KEY THE SAME WAY. There are exactly
--     three such reads today, all assignments to scenarios: app/student/page.tsx,
--     app/instructor/page.tsx and app/instructor/assignments/page.tsx. <==
--
-- "on delete restrict on update restrict" matches the links already on these
-- tables: a scenario that is in use cannot be deleted, and a class cannot be
-- changed out from under content that points at it. Gate 4b's cascade delete
-- works by deleting in order (sessions, assignments, scenarios, rubrics) rather
-- than by relaxing any of this.
alter table public.assignments drop constraint if exists assignments_scenario_same_class_fkey;
alter table public.assignments
  add constraint assignments_scenario_same_class_fkey
  foreign key (scenario_id, class_id)
  references public.scenarios (id, class_id)
  on delete restrict on update restrict;

alter table public.scenarios drop constraint if exists scenarios_rubric_same_class_fkey;
alter table public.scenarios
  add constraint scenarios_rubric_same_class_fkey
  foreign key (rubric_id, class_id)
  references public.rubrics (id, class_id)
  on delete restrict on update restrict;

alter table public.sessions drop constraint if exists sessions_scenario_same_class_fkey;
alter table public.sessions
  add constraint sessions_scenario_same_class_fkey
  foreign key (scenario_id, class_id)
  references public.scenarios (id, class_id)
  on delete restrict on update restrict;

-- ===========================================================================
-- ==> THE SKIP-IF-EMPTY BEHAVIOUR EXPLAINED AT THE TOP OF THIS FILE IS A
--     HAZARD ONE SECTION UP AND IS THE CORRECT, WANTED BEHAVIOUR RIGHT HERE.
--     THIS IS NOT AN INCONSISTENCY. <==
-- ===========================================================================
-- The middle rule, scenarios_rubric_same_class_fkey, covers the pair
-- (rubric_id, class_id). class_id is now required. rubric_id IS NOT, and that
-- is deliberate: supabase/piece-2a-conversation-only.sql line 45 removed the
-- requirement so that a CONVERSATION-ONLY scenario can exist with no rubric at
-- all, which is how the app recognises a case that is practised but not scored.
--
-- MATCH SIMPLE therefore skips this rule for exactly those scenarios, because
-- one column of the pair is empty. Which is precisely what we want: a scenario
-- with no rubric cannot possibly point at the wrong class's rubric.
--
-- Same mechanic. In section 1's absence it would have silently disabled all
-- three rules. Here it correctly exempts the one case that should be exempt.
-- The difference is not the mechanic, it is whether the empty column is empty
-- BY DESIGN or empty BY OVERSIGHT.


-- ---------------------------------------------------------------------------
-- 4. Delete public.is_instructor(), but only after the DATABASE says it is safe.
-- ---------------------------------------------------------------------------
-- WHAT IT WAS. Since Stage 1, is_instructor() answered "is the person making
-- this request an instructor?" and it was the whole of every instructor-facing
-- security rule. That is the exact problem this gate exists to fix: it means ANY
-- instructor, never THIS instructor. Gate 2 moved six of the eight rules that
-- used it to instructs_class(), and Gate 3b moved the last two.
--
-- ==> THIS SECTION DOES NOT TRUST ANYBODY'S SEARCH OF THE CODE, INCLUDING
--     CLAUDE'S. <== It asks the live database four questions and deletes
--     nothing unless all four come back clear:
--
--   1. Does any security rule still mention it?
--   2. Does any other function's body still mention it?
--   3. Does anything at all in the database depend on it?
--   4. Does any check rule, column default, view or trigger mention it?
--
-- If any of them finds something, this file stops with an error naming what it
-- found, and NOTHING IN THIS SECTION IS CHANGED. Sections 1 to 3 above stand
-- perfectly well without this one, so a stop here is not a half-built state, and
-- re-running the whole file after the cause is fixed is safe.
--
-- A NOTE ON WHY THE OTHER TWO HELPERS ARE NOT AFFECTED: instructs_class() and
-- can_read_class() were each written from scratch and neither one calls
-- is_instructor(). can_read_class() calls instructs_class(). Question 2 above is
-- what proves that rather than asserting it.
do $$
declare
  fn          oid;
  n_policies  integer;
  n_functions integer;
  n_depends   integer;
  n_other     integer;
  found       text;
begin
  -- Does it even exist? to_regprocedure returns nothing instead of erroring when
  -- the function is absent, which is what makes this file safe to run twice.
  fn := to_regprocedure('public.is_instructor()');
  if fn is null then
    raise notice 'Gate 4a section 4: public.is_instructor() is already gone. Nothing to do.';
    return;
  end if;

  -- Question 1: any security rule still mentioning it.
  select count(*) into n_policies
    from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') like '%is_instructor%'
       or coalesce(with_check, '') like '%is_instructor%');

  -- Question 2: any OTHER function whose body mentions it.
  select count(*) into n_functions
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid <> fn
     and coalesce(p.prosrc, '') like '%is_instructor%';

  -- Question 3: anything in the database that depends on it. This is the
  -- catch-all: it is the same list Postgres itself would consult before
  -- refusing a delete, so it covers cases the three text searches would miss.
  -- refclassid pins the match to functions. Without it, an unrelated object
  -- that happens to carry the same internal number would read as a dependency.
  select count(*) into n_depends
    from pg_depend
   where refclassid = 'pg_proc'::regclass
     and refobjid = fn
     and deptype <> 'i';

  -- Question 4: check rules, column defaults, views and triggers.
  select
      (select count(*)
         from pg_constraint c
         join pg_namespace n on n.oid = c.connamespace
        where n.nspname = 'public'
          and pg_get_constraintdef(c.oid) like '%is_instructor%')
    + (select count(*)
         from pg_views
        where schemaname not in ('pg_catalog', 'information_schema')
          and definition like '%is_instructor%')
    + (select count(*)
         from pg_attrdef d
         join pg_class c on c.oid = d.adrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and pg_get_expr(d.adbin, d.adrelid) like '%is_instructor%')
    + (select count(*)
         from pg_trigger t
        where t.tgfoid = fn)
    into n_other;

  if n_policies + n_functions + n_depends + n_other > 0 then
    found := 'security rules ' || n_policies
          || ', other functions ' || n_functions
          || ', dependencies ' || n_depends
          || ', check rules or defaults or views or triggers ' || n_other;
    raise exception
      'GATE 4A STOPPED AT SECTION 4: public.is_instructor() is still in use, so it was NOT deleted. Found: %. Whether sections 1 to 3 above survived depends on how the SQL Editor grouped the statements, so do not assume either way: run queries 1 and 2 of supabase/gate-4a-tests.sql to see what is actually there. Nothing here is dangerous and nothing is half-built; sections 1 to 3 stand perfectly well on their own and re-running this file is safe. Show this message to Claude before doing anything else.',
      found;
  end if;

  drop function public.is_instructor();
  raise notice 'Gate 4a section 4: public.is_instructor() was confirmed unused by four separate database checks and has been deleted.';
end $$;


-- ---------------------------------------------------------------------------
-- 5. The result, so a successful run shows you something readable.
-- ---------------------------------------------------------------------------
-- EXPECTED: required_class_columns 7, same_class_rules 3, unique_pairs 2,
-- is_instructor_still_exists false.
--
-- supabase/gate-4a-tests.sql is the fuller check, and it includes four
-- deliberate attempts to break these rules, because a rule nobody has tried to
-- violate has not been tested.
select
  (select count(*)
     from information_schema.columns
    where table_schema = 'public'
      and column_name = 'class_id'
      and is_nullable = 'NO'
      and table_name in ('rubrics', 'scenarios', 'assignments', 'sessions',
                         'allowed_emails', 'submission_resets', 'assignment_deletes')
  ) as required_class_columns,
  (select count(*)
     from pg_constraint
    where conname in ('assignments_scenario_same_class_fkey',
                      'scenarios_rubric_same_class_fkey',
                      'sessions_scenario_same_class_fkey')
  ) as same_class_rules,
  (select count(*)
     from pg_constraint
    where conname in ('rubrics_id_class_unique', 'scenarios_id_class_unique')
  ) as unique_pairs,
  (to_regprocedure('public.is_instructor()') is not null) as is_instructor_still_exists;
