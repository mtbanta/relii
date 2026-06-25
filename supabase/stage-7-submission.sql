-- Relii database setup for Stage 7: the assignment submission flow.
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", click "New
-- query", paste this whole file in, and click "Run". It is safe to run more than
-- once.
--
-- This file ADDS one safeguard. It does not change or remove any table or any
-- existing rule. No data is touched.
--
-- WHAT IT DOES: it guarantees, at the database level, that a student can have at
-- most ONE submission row per assignment, ever. The app already refuses to start
-- a second submission, but this index makes a second one physically impossible
-- (for example if two clicks land at the exact same instant). Practice rows are
-- not affected: a student can still have many practice rows for an assignment.
--
-- Why a "partial" unique index: the rule only applies to rows where
-- kind = 'submission'. Practice rows are ignored by it.

create unique index if not exists sessions_one_submission_per_assignment
  on public.sessions (student_id, assignment_id)
  where kind = 'submission';

-- ---------------------------------------------------------------------------
-- MANUAL RESET OF AN INTERRUPTED SUBMISSION (interim, until the Stage 8
-- instructor dashboard adds a button for this).
--
-- A graded submission is one continuous, one-shot attempt. If a student starts
-- one and then leaves or disconnects before submitting, that attempt is locked:
-- they cannot resume it or start a new one. To grant a clean retake, an
-- instructor deletes the locked attempt. After that, the student's home shows
-- "Start assignment" again.
--
-- STEP 1: find the locked attempt (replace the email with the student's):
--
--   select s.id, s.status, s.created_at, p.email, a.title
--   from public.sessions s
--   join public.profiles p on p.id = s.student_id
--   join public.assignments a on a.id = s.assignment_id
--   where s.kind = 'submission'
--     and s.status = 'in_progress'
--     and p.email = 'student@example.com';
--
-- STEP 2: copy the id from step 1 and delete that one row:
--
--   delete from public.sessions where id = '<paste-the-id-here>';
--
-- Deleting the attempt also clears its partial transcript and any partial video,
-- which is what you want for a fresh retake. Only delete an 'in_progress'
-- submission this way; a submission that is already 'scored' is a finished grade.
-- ---------------------------------------------------------------------------
