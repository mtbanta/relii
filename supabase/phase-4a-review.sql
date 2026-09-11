-- Relii database setup for Phase 4a: the instructor review and grade override.
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", click "New
-- query", paste this whole file in, and click "Run". It is safe to run more than
-- once.
--
-- This file ADDS one column and two tables and one function. It does not change
-- or remove any existing table, column, rule or function. No existing data is
-- touched, and nothing any existing screen reads changes value.
--
-- ==> RUN THIS BEFORE THE CODE IS PUSHED, and that order is a rule rather than a
--     preference. The build now live never names either new table and never
--     names the new column; it reads sessions only through named column lists
--     and through the export's select("*"), which simply picks up one more
--     column that is null everywhere. So the window between this migration and
--     the deploy is behaviour neutral for a real user. Pushing first would give
--     the live code two tables to write to that do not exist, and the first
--     instructor to press Mark reviewed would get a 500. <==
--
-- ---------------------------------------------------------------------------
-- WHAT THIS PIECE IS FOR, IN ONE PARAGRAPH.
-- ---------------------------------------------------------------------------
-- The AI picks a performance level for each criterion of an uploaded rubric.
-- Phase 2c showed that its level can be wrong in ways worth auditing. So the
-- instructor gets to change it. The instructor picks a LEVEL, never a number,
-- and the points are looked up from the rubric on the server exactly as the
-- scoring does, so there is no zero, no value off the ladder, and Tom's 10 per
-- cent floor stands untouched.
--
-- ==> THERE IS NO NEW SESSION STATUS, AND THAT IS THE LOAD BEARING DECISION IN
--     THIS FILE. sessions_status_check permits exactly in_progress, completed
--     and scored, seventeen places in the code key on 'scored', and
--     lib/assignment-sessions.ts is only TOTAL (every kind and status pair
--     decided) while those three are all there are. A reviewed submission is
--     still finished, scored work. So "reviewed" is a COLUMN, and the constraint
--     is left exactly as it was. <==

-- ---------------------------------------------------------------------------
-- 1. THE MARKER: when this submission was reviewed, or null.
-- ---------------------------------------------------------------------------
-- This one column answers "has a human looked at this yet". Null means no.
--
-- ==> IT IS SAFE FOR A STUDENT TO SEE, AND THAT IS WHY IT MAY LIVE HERE. A
--     student can select every column of their own sessions row (the policy is
--     "students read own sessions, instructors read submissions", whose first
--     clause is auth.uid() = student_id). Phase 4b shows the student "Pending
--     review" and "Reviewed", so this column is not merely tolerable on that
--     row, it is the thing 4b needs. The AI's ORIGINAL score is the opposite
--     case and is why section 2 exists. <==
alter table public.sessions
  add column if not exists reviewed_at timestamptz;

comment on column public.sessions.reviewed_at is
  'Phase 4a. When an instructor last saved a review of this submission, or null '
  'if nobody has. It is a COLUMN and not a status on purpose: sessions_status_check '
  'permits exactly three statuses, seventeen code sites key on ''scored'', and '
  'lib/assignment-sessions.ts stops being total the moment a fourth is added. A '
  'reviewed submission is still finished, scored work.';

-- ==> THERE IS DELIBERATELY NO INDEX ON reviewed_at, AND THE FIRST DRAFT OF THIS
--     FILE HAD ONE. Nothing filters on it in SQL. The dashboard reads an
--     assignment's submissions (already indexed by assignment_id) and counts the
--     reviewed ones in JavaScript, and 4b's student surfaces read one session by
--     its primary key and render from the column rather than searching on it.
--
--     AN INDEX NOTHING USES IS A CLAIM THAT SOMETHING DOES. It would cost every
--     write to the busiest table in the app to buy nothing, and the next session
--     reading it would reasonably infer a query that does not exist. If a real
--     "find the unreviewed ones" query is ever written, it should arrive with
--     its own index in the same change. <==


-- ---------------------------------------------------------------------------
-- 2. THE AI'S ORIGINAL SCORE, KEPT WHERE NO STUDENT CAN REACH IT.
-- ---------------------------------------------------------------------------
-- ==> WHY THIS IS A SEPARATE TABLE RATHER THAN TWO MORE COLUMNS ON sessions.
--     After a review the student must see the INSTRUCTOR'S level and only that.
--     A student can read every column of their own sessions row, so an
--     ai_score column there would be published to them by the same rule that
--     lets them see their own grade. There is no way to hide one column of a
--     row from a reader who may read the row. So it lives here, in a table with
--     no student policy at all, written only by the server. <==
--
-- ONE ROW PER SUBMISSION, WRITTEN ONCE, NEVER UPDATED, NEVER DELETED. The
-- unique constraint on session_id is what makes "a later save must never
-- overwrite the AI original" a property of the database rather than a promise
-- in a comment. The route inserts with "on conflict do nothing" and then READS
-- THE ROW BACK, so a second save cannot even accidentally build its own idea of
-- what the AI said.
--
-- It carries a PLAIN class_id with no foreign key, exactly like the two audit
-- logs (public.submission_resets and public.assignment_deletes). That is a
-- decision, and the counter argument deserves stating: this is a VALUE rather
-- than a record of an action, and it is read live by the instructor's review
-- page, which is the case for giving it a foreign key and deleting it with the
-- class. It follows the audit precedent anyway, for two reasons. Destroying the
-- record of what a student was ORIGINALLY graded is precisely the thing this
-- table exists to prevent, and a class delete is the largest destruction in the
-- app. And with no foreign key, DELETE_ORDER in
-- app/api/admin/class/[id]/delete/route.ts needs no new entry, so no class
-- delete can fail halfway on account of this piece. The cost, accepted, is that
-- rows survive pointing at a session or a class that is gone, which is what the
-- two audit logs already do.
create table if not exists public.submission_ai_scores (
  id uuid primary key default gen_random_uuid(),

  -- WHICH submission. Unique: one original per submission, forever.
  session_id uuid not null unique,

  -- Plain copies, no foreign keys, for the same reason as the two audit logs.
  -- class_id is what the class export reads this table by.
  class_id      uuid,
  assignment_id uuid,
  student_id    uuid,

  -- The AI's score exactly as it stood before the FIRST override: the whole
  -- itemised jsonb (levels, points, comments) and the total.
  score       jsonb   not null,
  score_total numeric,

  created_at timestamptz not null default now()
);

-- ==> ROW LEVEL SECURITY ON, IN THE SAME FILE THAT CREATES THE TABLE, AND THAT
--     TIMING IS THE POINT. Supabase grants a new public table to anon and
--     authenticated by default. A table created without security on is readable
--     by every signed-in account until somebody remembers, and this is the one
--     table in the app whose whole reason for existing is that a student must
--     not read it. <==
alter table public.submission_ai_scores enable row level security;

-- ==> THERE IS DELIBERATELY NO STUDENT POLICY AND NO WRITE POLICY OF ANY KIND.
--     With security on, anything with no matching policy returns NO ROWS. The
--     server writes these rows with the service-role key, which bypasses
--     policies and never reaches a browser. The one policy below is the same
--     instructor backstop the two audit logs carry: no screen depends on it,
--     because the review page reads with the service-role key, and it is here
--     so that a hand-written query from an instructor's own browser answers the
--     same question the app would. <==
drop policy if exists "instructors read ai originals" on public.submission_ai_scores;
create policy "instructors read ai originals"
  on public.submission_ai_scores for select
  using (public.instructs_class(class_id));

-- The class export reads this table by class_id.
create index if not exists submission_ai_scores_class_idx
  on public.submission_ai_scores (class_id);


-- ---------------------------------------------------------------------------
-- 3. THE REVIEW LOG: one row per save, append only.
-- ---------------------------------------------------------------------------
-- A review is re-editable, and every save is logged. This is the log. It is a
-- record of a human changing a machine's grade, which is the most audit-worthy
-- event in the whole application, so it follows the two existing audit logs
-- exactly: plain snapshot copies rather than live links, no foreign keys, so
-- that no later delete of an account, an assignment, a session or a class can
-- remove or blank an entry.
--
-- It carries prior_score_total as well as the total it wrote, so each row is
-- legible on its own in the class export instead of only as a link in a chain.
-- That mirrors public.submission_resets, which keeps prior_score_total and
-- prior_score_max for the same reason.
create table if not exists public.submission_reviews (
  id uuid primary key default gen_random_uuid(),

  -- WHICH submission, and where it lived. Plain copies, no foreign keys.
  session_id    uuid not null,
  class_id      uuid,
  assignment_id uuid,

  -- WHICH student (a copy of their id and email, so the row still reads
  -- correctly after the account is gone).
  student_id    uuid,
  student_email text not null,

  -- WHO reviewed (a copy of the instructor's id and email).
  instructor_id    uuid,
  instructor_email text not null,

  -- The total that was in force IMMEDIATELY BEFORE this save. On the first
  -- review that is the AI's own total; on a re-edit it is the previous review's.
  prior_score_total numeric,

  -- What this save WROTE: the whole itemised jsonb and its total. These are the
  -- values that also went to sessions.score and sessions.score_total.
  score       jsonb   not null,
  score_total numeric not null,

  created_at timestamptz not null default now()
);

-- Same reasoning as section 2: security on in the file that creates the table.
alter table public.submission_reviews enable row level security;

-- No write policy of any kind: the server writes these with the service-role
-- key. The read policy is the same instructor backstop the other logs carry.
drop policy if exists "instructors read review log" on public.submission_reviews;
create policy "instructors read review log"
  on public.submission_reviews for select
  using (public.instructs_class(class_id));

-- ==> THE TWO INDEXES BELOW EACH ANSWER A QUERY THAT EXISTS. The class one is
--     what lib/class-export.ts reads this table by, exactly as Gate 1 added
--     submission_resets_class_idx and assignment_deletes_class_idx for the same
--     reader. The session one is a log's own natural key: "this submission's
--     reviews, newest first" is the only way a history is ever read, and it is
--     the shape submission_resets_assignment_idx already has on the sibling log.
create index if not exists submission_reviews_session_idx
  on public.submission_reviews (session_id, created_at desc);

-- The class export reads this table by class_id.
create index if not exists submission_reviews_class_idx
  on public.submission_reviews (class_id);


-- ---------------------------------------------------------------------------
-- 4. THE ONE FUNCTION. It writes the log row and the grade together.
-- ---------------------------------------------------------------------------
-- ==> WHY IT EXISTS, AND IT IS THE SAME REASON create_assignment_with_rubric()
--     EXISTS. Saving a review means two writes: the log row, and the grade on
--     the session. The app talks to the database through PostgREST, which has
--     no way to wrap two separate writes in one transaction. Without this
--     function a failure between them would either log a review that never
--     landed, or land a grade change with no record of who made it. The second
--     is the one that matters: "every save is logged" is a ruling, and a rule
--     that holds only when nothing goes wrong is not a rule. <==
--
-- ==> IT ALSO TAKES A ROW LOCK, WHICH THE ROUTE CANNOT DO FOR ITSELF. Two
--     instructors saving the same submission at the same moment would otherwise
--     each read the old total, and both log rows would claim the same prior
--     score, so the log would describe a history that never happened. The
--     "for update" below serialises them: the second waits, then reads the
--     total the first actually wrote. <==
--
-- IT IS MOSTLY DUMB, in the sense create_assignment_with_rubric() is: it
-- validates no levels, looks up no points, and decides nothing about WHO may
-- call it or which class they may act inside. All of that belongs to the route,
-- which has already done it, and putting any of it in here would create a second
-- place that answers an authorisation question.
--
-- ==> THE THREE THINGS IT DOES DECIDE, ALL OF THEM FACTS ABOUT THE ROW IT HAS
--     LOCKED RATHER THAN QUESTIONS ABOUT THE CALLER. That distinction is what
--     keeps them from being a second decider: none of them can be answered
--     correctly anywhere else, because "anywhere else" means before the lock.
--
--     ONE. Is this still a scored submission? An "Allow retake" landing between
--     the route's check and this write would otherwise have a review write a
--     grade onto a row that is now a practice back in the student's pool. Same
--     shape as the assignment delete route re-counting sessions inside the
--     request rather than trusting the count the page rendered from.
--
--     TWO. Has the AI's original been recorded? See the block at that check.
--
--     THREE. Which class, assignment and student is this? Read from the row, not
--     from a parameter, because the log row's class_id decides whether a class
--     export contains it. See the block at the lock. <==
--
-- NOT "security definer". It runs as whoever calls it, and the only role
-- allowed to call it is service_role, which the server already uses.
--
-- "set search_path = ''" means every name inside is written out in full.
create or replace function public.save_submission_review(
  p_session_id       uuid,
  p_student_email    text,
  p_instructor_id    uuid,
  p_instructor_email text,
  p_score            jsonb,
  p_score_total      numeric
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_kind          text;
  v_status        text;
  v_class_id      uuid;
  v_assignment_id uuid;
  v_student_id    uuid;
  v_prior_total   numeric;
  v_review_id     uuid;
begin
  -- ==> THE LOCK, AND EVERYTHING THAT IDENTIFIES THE ROW COMES OUT OF IT.
  --     class_id, assignment_id and student_id are read HERE rather than passed
  --     in, and that is not tidiness. The log row's class_id is what decides
  --     whether lib/class-export.ts puts the row in a class export, so it has to
  --     be the class of the row actually being changed. A parameter is a second
  --     source for that answer, and a review filed under the wrong class is a
  --     grade change that a class export would not contain and a fingerprint
  --     would not notice. One value, read under the lock, used once. <==
  select s.kind, s.status, s.class_id, s.assignment_id, s.student_id, s.score_total
    into v_kind, v_status, v_class_id, v_assignment_id, v_student_id, v_prior_total
    from public.sessions as s
   where s.id = p_session_id
     for update;

  if not found then
    raise exception 'That submission no longer exists.' using errcode = 'R0001';
  end if;

  if v_kind <> 'submission' or v_status <> 'scored' then
    raise exception 'That submission is no longer a scored submission.'
      using errcode = 'R0001';
  end if;

  -- ==> THE GRADE IS NOT ALLOWED TO MOVE UNTIL THE AI'S ORIGINAL IS SAFELY
  --     RECORDED, AND THIS IS WHERE THAT BECOMES A PROPERTY OF THE DATABASE
  --     RATHER THAN AN ORDERING IN ONE ROUTE.
  --
  --     The route inserts the original and then calls this, as two separate
  --     PostgREST requests. Without the check below, an insert that silently did
  --     nothing (a failure the route mishandled, a future edit that reordered
  --     two lines, a second caller written later that forgot) would let this
  --     function overwrite sessions.score, AND THE AI'S ORIGINAL WOULD BE GONE
  --     FOREVER: it exists nowhere else, and the row it was on has just been
  --     overwritten. That is the one irreversible mistake this whole piece is
  --     built to prevent, so it is checked at the moment of the write, under the
  --     lock, rather than trusted from up the call stack.
  --
  --     Its own error code, so the route can tell it from the conflict above:
  --     one means "reload and look again", this one means "something is wrong,
  --     nothing was changed". <==
  if not exists (
    select 1 from public.submission_ai_scores as a
     where a.session_id = p_session_id
  ) then
    raise exception 'The AI original for this submission has not been recorded, so its grade must not be changed.'
      using errcode = 'R0002';
  end if;

  -- The log row FIRST. If anything below fails, the whole transaction rolls
  -- back and neither the log nor the grade moved, which is the property this
  -- function exists to provide.
  --
  -- p_student_email is still a parameter and the id beside it is not, which is
  -- deliberate: the id ROUTES the row and must match what is being changed,
  -- while the email is a SNAPSHOT of a label, read by the route from the same
  -- student's profile so a deleted account still leaves a readable log.
  insert into public.submission_reviews (
    session_id, class_id, assignment_id, student_id, student_email,
    instructor_id, instructor_email, prior_score_total, score, score_total
  )
  values (
    p_session_id, v_class_id, v_assignment_id, v_student_id, p_student_email,
    p_instructor_id, p_instructor_email, v_prior_total, p_score, p_score_total
  )
  returning id into v_review_id;

  -- Then the grade. score and score_total move TOGETHER and in one statement,
  -- because the instructor dashboard reads the first and the student home reads
  -- the second, and a moment where those two disagree is a student and a
  -- teacher looking at different grades. now() is transaction time, so
  -- reviewed_at and the log row's created_at above are the same instant.
  update public.sessions
     set score       = p_score,
         score_total = p_score_total,
         reviewed_at = now()
   where id = p_session_id;

  return v_review_id;
end;
$$;

-- ==> WHO MAY CALL IT. Postgres grants EXECUTE on a new function to PUBLIC by
--     default, which in Supabase means the anon and authenticated roles that
--     every browser holds. These three lines take that back and give it to
--     service_role, the key the server uses and which never reaches a browser.
--
--     ==> THERE ARE TWO CONTROLS HERE AND THIS IS THE FIRST OF THEM, NOT THE
--         ONLY ONE. The second is row level security: this function is SECURITY
--         INVOKER, so it runs with the rights of whoever called it, and neither
--         public.submission_reviews nor public.sessions carries an insert or
--         update policy of any kind. A signed-in student who somehow reached
--         this function would therefore still be refused by the tables it
--         writes to.
--
--         SAYING SO IS NOT A REASON TO RELAX EITHER ONE. The revoke is the
--         cheaper and more legible of the two, because it refuses at the door
--         rather than three statements in, and it is the one that does not
--         depend on anybody remembering that a write policy must never be added
--         to sessions. Defence in depth means both, and CHECK 16 in
--         supabase/phase-4a-tests.sql measures the first one BY BEHAVIOUR: it
--         calls this function as the authenticated role and expects to be
--         refused. <==
revoke all on function public.save_submission_review(
  uuid, text, uuid, text, jsonb, numeric
) from public;

revoke all on function public.save_submission_review(
  uuid, text, uuid, text, jsonb, numeric
) from anon, authenticated;

grant execute on function public.save_submission_review(
  uuid, text, uuid, text, jsonb, numeric
) to service_role;

comment on function public.save_submission_review(
  uuid, text, uuid, text, jsonb, numeric
) is
  'Phase 4a. Writes one review log row and the reviewed grade on the session in '
  'one transaction, under a row lock on that session, so a save can never be '
  'applied without being logged. Deliberately does no validation and no level '
  'lookup: the calling route does both before it gets here. service_role only.';
