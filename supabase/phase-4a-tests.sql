-- PHASE 4a CHECKS. Run this AFTER supabase/phase-4a-review.sql.
--
-- Every check reads the database's own catalogue or its own behaviour. Nothing
-- here reads a file, and nothing here quotes another document, because this
-- project has already paid once for three documents quoting each other while
-- the thing they described was red.
--
-- ==> TWO PROPERTIES OF THIS PIECE CANNOT BE MEASURED IN THIS FILE, AND SAYING
--     SO IS PART OF THE RESULT.
--
--     1. THAT A STUDENT CANNOT READ public.submission_ai_scores. Every query in
--        here runs with the service-role key, which bypasses row level security
--        entirely, so a query in this file that "cannot see" a row would prove
--        nothing and a query that CAN see one proves nothing either. Checks 6
--        to 9 measure the machinery (security on, one policy, whose test is
--        instructs_class, no write policy). THE PROPERTY ITSELF IS MEASURED IN
--        THE BROWSER, with the student's own key, as a matched pair: their own
--        sessions row comes back and this table does not.
--
--     2. THAT A SAVE AND ITS LOG ROW ARE ONE TRANSACTION, and that two
--        instructors saving at once serialise. Section 4's function is where
--        that lives, and the honest test of it is the click-through.
--
--     3. THAT A STUDENT CANNOT CALL save_submission_review(). Section C gets
--        close by wearing the authenticated ROLE, which is the right
--        measurement for the GRANT. It is not the same as a student's browser
--        request, which also carries a JWT and therefore a row level security
--        identity. The browser half is measured in the click-through, where a
--        student's own signed-in session posts to the review route.
--
--     ==> AND IF A QUERY IN HERE EVER RETURNS "permission denied" WITH A
--         POSTGRES HINT SUGGESTING A GRANT, DO NOT RUN THE HINT. That is the
--         standing hazard recorded in PROJECT_STATE against public.scenarios,
--         and the same reflex would open this table to every signed-in
--         account. <==
--
-- Section A is the catalogue. Section B is a behavioural check that writes a
-- scratch row and removes it again. Section C calls the function as the
-- authenticated role and expects to be turned away. Section D is the one block
-- that must be run at a particular MOMENT of the live proof rather than
-- whenever, and it says so at its own head. Section E is the numbers to compare
-- against supabase/phase-4a-baseline.sql.
--
-- ==> SECTIONS B, C AND D EACH RETURN A RESULT SET RATHER THAN RAISING NOTICES,
--     AND THAT IS A CORRECTION MADE DURING THE RUN RATHER THAN A STYLE. The
--     first version used "raise notice", the Supabase MCP does not surface
--     notices, and the block came back EMPTY: indistinguishable from a block
--     that never ran, one whose every check failed, and a typo in a table name.
--     Each one now writes its answers into a temporary table and selects them,
--     so the last statement of the section is the evidence. <==

-- ===========================================================================
-- SECTION A. THE CATALOGUE.
-- ===========================================================================
with col as (
  select count(*) as n, min(is_nullable) as nullable, min(data_type) as kind
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions'
    and column_name = 'reviewed_at'
),

-- THE CONSTRAINT THAT MUST NOT HAVE MOVED. Phase 4 handoff item 3: the moment a
-- fourth status exists, lib/assignment-sessions.ts stops being total. This
-- phase adds a COLUMN, so this definition must be byte for byte what
-- supabase/phase-4a-baseline.sql query 7 printed.
status_check as (
  select pg_get_constraintdef(con.oid) as def
  from pg_constraint as con
  join pg_class as rel on rel.oid = con.conrelid
  join pg_namespace as ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public' and rel.relname = 'sessions'
    and con.conname = 'sessions_status_check'
),

tables as (
  select count(*) as n
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('submission_ai_scores', 'submission_reviews')
),

-- Row level security ON for BOTH new tables. relrowsecurity is the catalogue's
-- own answer, not ours.
rls as (
  select count(*) filter (where rel.relrowsecurity) as secured,
         count(*) as total
  from pg_class as rel
  join pg_namespace as ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname in ('submission_ai_scores', 'submission_reviews')
),

-- ==> HOW MANY POLICIES EACH NEW TABLE HAS, AND OF WHAT KIND. The answer must
--     be exactly one SELECT policy each and NOTHING ELSE. A single insert,
--     update or delete policy on either table would let a browser write a grade
--     or rewrite the record of the AI's original one. <==
pol as (
  select
    count(*) filter (where p.tablename = 'submission_ai_scores')                    as ai_total,
    count(*) filter (where p.tablename = 'submission_ai_scores' and p.cmd = 'SELECT') as ai_select,
    count(*) filter (where p.tablename = 'submission_reviews')                      as log_total,
    count(*) filter (where p.tablename = 'submission_reviews' and p.cmd = 'SELECT')   as log_select,
    -- Every policy's test must run through instructs_class(). A policy testing
    -- auth.uid() = student_id would be the leak this whole table exists to
    -- avoid, and it would pass a count of one.
    count(*) filter (where p.qual like '%instructs_class%')                         as via_instructs_class
  from pg_policies as p
  where p.schemaname = 'public'
    and p.tablename in ('submission_ai_scores', 'submission_reviews')
),

-- ONE ORIGINAL PER SUBMISSION, ENFORCED BY THE DATABASE. This is what makes
-- "a later save never overwrites the AI original" a property rather than a
-- promise.
uniq as (
  select count(*) as n
  from pg_constraint as con
  join pg_class as rel on rel.oid = con.conrelid
  join pg_namespace as ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public' and rel.relname = 'submission_ai_scores'
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) like '%(session_id)%'
),

-- ==> NO FOREIGN KEYS ON EITHER NEW TABLE, AND THIS CHECK IS THE CLASS-DELETE
--     DECISION MADE VISIBLE. Both tables follow the two audit logs: a plain
--     class_id with no link. That is why DELETE_ORDER in
--     app/api/admin/class/[id]/delete/route.ts needed no new entry, and why no
--     class delete can stop halfway on account of this piece. A foreign key
--     appearing here later is the signal to open that route in the same change.
fks as (
  select count(*) as n
  from pg_constraint as con
  join pg_class as rel on rel.oid = con.conrelid
  join pg_namespace as ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname in ('submission_ai_scores', 'submission_reviews')
    and con.contype = 'f'
),

idx as (
  select count(*) as n
  from pg_indexes
  where schemaname = 'public'
    and indexname in ('submission_ai_scores_class_idx',
                      'submission_reviews_session_idx',
                      'submission_reviews_class_idx')
),

fn as (
  select count(*) as n,
         bool_or(p.prosecdef) as is_definer,
         max(array_to_string(p.proconfig, ' ')) as config
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_submission_review'
),

-- ==> WHO MAY EXECUTE THE FUNCTION. This is the check that matters most in the
--     whole file. Postgres grants EXECUTE to PUBLIC by default, and in Supabase
--     PUBLIC includes the anon and authenticated roles every browser holds. If
--     anon or authenticated can execute this, a signed-in student can write
--     themselves any grade they like from their own browser. Expect
--     service_role yes, everyone else no. <==
grants as (
  select
    count(*) filter (where grantee = 'service_role')   as service_role,
    count(*) filter (where grantee = 'authenticated')  as authenticated,
    count(*) filter (where grantee = 'anon')           as anon,
    count(*) filter (where grantee = 'PUBLIC')         as public_role
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = 'save_submission_review'
    and privilege_type = 'EXECUTE'
)

select * from (
  select 1 as sort_order,
    'CHECK 1  sessions.reviewed_at exists and is nullable' as check_name,
    '1 / YES / timestamp with time zone' as expected,
    (select n || ' / ' || nullable || ' / ' || kind from col) as actual,
    case when (select n from col) = 1 and (select nullable from col) = 'YES'
         then 'PASSED' else 'FAILED' end as verdict

  union all
  -- ==> THE ONE THAT WOULD BREAK lib/assignment-sessions.ts. Compare this
  --     string with query 7 of the baseline: it must be identical.
  select 2, 'CHECK 2  sessions_status_check is UNCHANGED (three statuses, no fourth)',
    'CHECK ((status = ANY (ARRAY[''in_progress''::text, ''completed''::text, ''scored''::text])))',
    (select def from status_check),
    case when (select def from status_check) =
              'CHECK ((status = ANY (ARRAY[''in_progress''::text, ''completed''::text, ''scored''::text])))'
         then 'PASSED' else 'FAILED' end

  union all
  select 3, 'CHECK 3  both new tables exist', '2',
    (select n::text from tables),
    case when (select n from tables) = 2 then 'PASSED' else 'FAILED' end

  union all
  -- ==> ROW LEVEL SECURITY ON BOTH, IN THE SAME MIGRATION THAT CREATED THEM.
  --     Supabase grants a new public table to anon and authenticated by
  --     default, so a table created without this is readable by every signed-in
  --     account until somebody notices.
  select 4, 'CHECK 4  row level security is ON for both new tables', '2 of 2',
    (select secured || ' of ' || total from rls),
    case when (select secured from rls) = 2 and (select total from rls) = 2
         then 'PASSED' else 'FAILED' end

  union all
  select 5, 'CHECK 5  submission_ai_scores has exactly ONE policy, a SELECT', '1 / 1',
    (select ai_total || ' / ' || ai_select from pol),
    case when (select ai_total from pol) = 1 and (select ai_select from pol) = 1
         then 'PASSED' else 'FAILED' end

  union all
  select 6, 'CHECK 6  submission_reviews has exactly ONE policy, a SELECT', '1 / 1',
    (select log_total || ' / ' || log_select from pol),
    case when (select log_total from pol) = 1 and (select log_select from pol) = 1
         then 'PASSED' else 'FAILED' end

  union all
  -- A count of one is not enough on its own: a single policy reading
  -- "auth.uid() = student_id" would also count one, and would be the leak.
  select 7, 'CHECK 7  every new policy tests instructs_class(), so no student clause exists', '2',
    (select via_instructs_class::text from pol),
    case when (select via_instructs_class from pol) = 2 then 'PASSED' else 'FAILED' end

  union all
  select 8, 'CHECK 8  ONE AI original per submission, enforced by a unique constraint', '1',
    (select n::text from uniq),
    case when (select n from uniq) = 1 then 'PASSED' else 'FAILED' end

  union all
  -- The class-delete decision, made visible. See the note above.
  select 9, 'CHECK 9  neither new table has a foreign key (so DELETE_ORDER is unchanged)', '0',
    (select n::text from fks),
    case when (select n from fks) = 0 then 'PASSED' else 'FAILED' end

  union all
  -- Three, not four. There is deliberately no index on sessions.reviewed_at,
  -- because nothing filters on it: see section 1 of the migration.
  select 10, 'CHECK 10  all three indexes exist', '3',
    (select n::text from idx),
    case when (select n from idx) = 3 then 'PASSED' else 'FAILED' end

  union all
  select 11, 'CHECK 11  save_submission_review() exists, is NOT security definer, has a fixed search_path',
    '1 / false / search_path=',
    (select n || ' / ' || coalesce(is_definer::text, 'null') || ' / ' || coalesce(config, 'none') from fn),
    case when (select n from fn) = 1 and (select is_definer from fn) = false
              and (select config from fn) like 'search_path%'
         then 'PASSED' else 'FAILED' end

  union all
  -- ==> THE MOST IMPORTANT LINE IN THIS FILE. anon or authenticated holding
  --     EXECUTE here means a student can write their own grade from a browser.
  select 12, 'CHECK 12  only service_role may execute it (anon, authenticated, PUBLIC all 0)',
    'service_role 1, anon 0, authenticated 0, PUBLIC 0',
    (select 'service_role ' || service_role || ', anon ' || anon
            || ', authenticated ' || authenticated || ', PUBLIC ' || public_role from grants),
    case when (select service_role from grants) = 1
              and (select anon from grants) = 0
              and (select authenticated from grants) = 0
              and (select public_role from grants) = 0
         then 'PASSED' else 'FAILED' end
) as results
order by sort_order;


-- ===========================================================================
-- SECTION B. THE ONE BEHAVIOURAL CHECK, AND IT CLEANS UP AFTER ITSELF.
-- ===========================================================================
-- ==> WHY THIS IS NOT LEFT TO THE CATALOGUE. Check 8 above says a unique
--     constraint EXISTS. This says the second write actually loses. They are
--     different claims, and the second is the one the piece rests on: it is what
--     stops a re-edit recording the overridden score as though the AI had
--     chosen it.
--
--     IT USES A MADE-UP session_id THAT MATCHES NO SESSION, so it can touch no
--     student's work, and it deletes its own row at the end.
--
-- ==> WHY EVERY BLOCK BELOW WRITES ITS ANSWER INTO A TEMPORARY TABLE AND THEN
--     SELECTS IT, INSTEAD OF USING "raise notice". THE FIRST VERSION OF THIS
--     FILE USED NOTICES AND RETURNED NOTHING AT ALL. The Supabase MCP does not
--     surface notices, so the block ran and reported an empty result, which is
--     indistinguishable from a block that never ran, a block whose checks all
--     failed, and a typo. That is the same weakness as writing "expect zero
--     rows" instead of counting, and it turned up in this file one query after
--     the note warning about it. A result set is an answer; silence is not. <==
drop table if exists phase4a_checks;
create temp table phase4a_checks (n int, check_name text, detail text, verdict text);

do $$
declare
  v_fake_session uuid := '00000000-0000-4000-8000-0000000004a0';
  v_stored       jsonb;
  v_blocked      boolean := false;
begin
  delete from public.submission_ai_scores where session_id = v_fake_session;

  -- The first write: pretend this is the AI's original.
  insert into public.submission_ai_scores (session_id, score, score_total)
  values (v_fake_session, '{"marker":"the AI original"}'::jsonb, 70);

  -- The second write, with a DIFFERENT value, exactly as an overwriting re-edit
  -- would look. It must lose.
  begin
    insert into public.submission_ai_scores (session_id, score, score_total)
    values (v_fake_session, '{"marker":"an overwrite"}'::jsonb, 99);
  exception when unique_violation then
    v_blocked := true;
  end;

  select score into v_stored
    from public.submission_ai_scores where session_id = v_fake_session;

  insert into phase4a_checks values (
    13, 'a second AI original for the same submission is refused',
    case when v_blocked then 'unique_violation raised' else 'the second insert was ACCEPTED' end,
    case when v_blocked then 'PASSED' else 'FAILED' end);

  insert into phase4a_checks values (
    14, 'the stored original is still the FIRST value',
    v_stored::text,
    case when v_stored = '{"marker":"the AI original"}'::jsonb then 'PASSED' else 'FAILED' end);

  delete from public.submission_ai_scores where session_id = v_fake_session;

  insert into phase4a_checks values (
    15, 'section B left nothing behind',
    (select count(*)::text from public.submission_ai_scores where session_id = v_fake_session),
    case when (select count(*) from public.submission_ai_scores where session_id = v_fake_session) = 0
         then 'PASSED' else 'FAILED' end);
end $$;

select * from phase4a_checks order by n;


-- ===========================================================================
-- SECTION C. WHO MAY ACTUALLY CALL THE FUNCTION, MEASURED BY CALLING IT.
-- ===========================================================================
-- ==> CHECK 12 ABOVE READ THE GRANT TABLE. THIS ONE MAKES THE CALL. They are
--     different claims: one says the catalogue records no EXECUTE for
--     authenticated, the other says a caller wearing that role is actually
--     turned away. Verify at the layer that consumes the thing.
--
--     IT IS SAFE EVEN IF IT FAILS. The session id below matches no session, so
--     if the call DID get through, the function's own first guard finds no row
--     and stops before writing anything. The two outcomes are told apart by
--     their error codes rather than by their wording: 42501 is the revoke
--     refusing at the door (a PASS), and R0001 means it got as far as the lock,
--     which means authenticated could execute it (a FAIL).
drop table if exists phase4a_role_check;
create temp table phase4a_role_check (n int, check_name text, detail text, verdict text);

do $$
declare
  v_state text := '(it did not raise at all)';
begin
  set local role authenticated;
  begin
    perform public.save_submission_review(
      '00000000-0000-4000-8000-0000000004a1'::uuid,
      'nobody@example.com', null, 'nobody@example.com', '{}'::jsonb, 0
    );
  exception
    when insufficient_privilege then v_state := '42501 permission denied';
    when others then v_state := SQLSTATE || '  ' || SQLERRM;
  end;
  reset role;

  insert into phase4a_role_check values (
    16, 'calling save_submission_review() as authenticated is refused',
    v_state,
    case when v_state like '42501%' then 'PASSED'
         else 'FAILED (anything but 42501 means the role could execute it)' end);
end $$;

select * from phase4a_role_check order by n;


-- ===========================================================================
-- SECTION D. THE GRADE DOES NOT MOVE WITHOUT A RECORDED AI ORIGINAL.
-- ===========================================================================
-- ==> RUN THIS DURING THE LIVE PROOF, ON THE THROWAWAY SUBMISSION, BEFORE ITS
--     FIRST REVIEW IS SAVED. That moment is the only one where a real, valid,
--     scored submission genuinely has no row in public.submission_ai_scores,
--     which is exactly the state being tested. Paste its id in place of
--     PUT_SESSION_ID_HERE.
--
--     THE MATCHING SUCCESS IS THE APP'S OWN FIRST REVIEW, minutes later, on THIS
--     SAME SUBMISSION: the route records the original and then the identical
--     function call goes through. A refusal beside a matching success on the
--     same row is a measurement; a lone refusal is only a route that says no.
--
--     ==> AND THE REFUSAL IS NOT THE INTERESTING PART. Checks 18 and 19 are. A
--         function that raised AFTER writing its log row, or after moving the
--         grade, would look identical from the error message alone, and the
--         thing being protected is that the AI's original can never be
--         overwritten before it is recorded. <==
drop table if exists phase4a_original_check;
create temp table phase4a_original_check (n int, check_name text, detail text, verdict text);

do $$
declare
  v_session        uuid := 'PUT_SESSION_ID_HERE'::uuid;
  v_state          text := '(it did not raise at all)';
  v_reviews_before integer;
  v_reviews_after  integer;
  v_score_before   jsonb;
  v_score_after    jsonb;
  v_reviewed_after timestamptz;
begin
  select count(*) into v_reviews_before
    from public.submission_reviews where session_id = v_session;
  select score into v_score_before from public.sessions where id = v_session;

  begin
    perform public.save_submission_review(
      v_session, 'probe@example.com', null, 'probe@example.com',
      '{"marker":"this must not land"}'::jsonb, 1
    );
  exception when others then
    v_state := SQLSTATE || '  ' || SQLERRM;
  end;

  select count(*) into v_reviews_after
    from public.submission_reviews where session_id = v_session;
  select score, reviewed_at into v_score_after, v_reviewed_after
    from public.sessions where id = v_session;

  insert into phase4a_original_check values (
    17, 'with no AI original recorded, the function refuses',
    v_state,
    case when v_state like 'R0002%' then 'PASSED' else 'FAILED' end);

  insert into phase4a_original_check values (
    18, 'it wrote no log row',
    'before ' || v_reviews_before || ', after ' || v_reviews_after,
    case when v_reviews_before = v_reviews_after then 'PASSED' else 'FAILED' end);

  insert into phase4a_original_check values (
    19, 'it did not touch the grade or the reviewed marker',
    case when v_score_before is not distinct from v_score_after then 'score unchanged' else 'score CHANGED' end
      || ', reviewed_at ' || coalesce(v_reviewed_after::text, 'null'),
    case when v_score_before is not distinct from v_score_after and v_reviewed_after is null
         then 'PASSED' else 'FAILED' end);
end $$;

select * from phase4a_original_check order by n;


-- ===========================================================================
-- SECTION E. THE NUMBERS. Compare with supabase/phase-4a-baseline.sql.
-- ===========================================================================
-- These are not pass or fail. They are what the phase did, in numbers, so the
-- cleanup at the end can be checked against them.
with b1 as (select id from public.classes where name like 'B1%' limit 1)
select 'NUMBERS  B1 after' as label,
       (select count(*) from public.assignments        where class_id = (select id from b1)) as assignments,
       (select count(*) from public.rubrics            where class_id = (select id from b1)) as rubrics,
       (select count(*) from public.sessions           where class_id = (select id from b1)) as sessions,
       (select count(*) from public.submission_resets    where class_id = (select id from b1)) as submission_resets,
       -- EXPECTED TO BE 1 FROM THE BASELINE ONWARD, not 0. See the baseline file.
       (select count(*) from public.assignment_deletes   where class_id = (select id from b1)) as assignment_deletes,
       (select count(*) from public.submission_ai_scores where class_id = (select id from b1)) as ai_originals,
       (select count(*) from public.submission_reviews   where class_id = (select id from b1)) as reviews_logged,
       (select count(*) from public.sessions
         where class_id = (select id from b1) and reviewed_at is not null)                     as reviewed_now;
