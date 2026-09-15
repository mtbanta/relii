-- Relii T1, CHECKS 2, 3 and 4: four in-progress sessions to mint voices for.
--
-- WHY PROBE ROWS RATHER THAN REAL PRACTICES
-- app/api/voice/token/route.ts refuses any session that is not still
-- in_progress, so the checks need sessions that are open right now. Every real
-- practice in B1 finished long ago.
--
-- ==> AND THERE IS A SECOND REASON, WHICH IS A SAFETY ONE. Starting a real
--     voice and video practice in a browser turns on a CAMERA. Driving that
--     from here means relying on the fake-media flags being spelled correctly,
--     and the cost of getting that wrong is opening the owner's real webcam.
--     These rows need no media at all: the token route reads the database and
--     calls OpenAI, and never touches a device. <==
--
-- WHAT EACH ROW IS FOR
--   S1  assignment f63ec110, whose voice is NULL       CHECK 3: null means cedar
--   S2  assignment 8ba0b8b0, whose voice is 'cedar'    CHECK 2: the cedar half
--   S3  assignment 57265ba6, whose voice is 'marin'    CHECK 2: the marin half
--   S4  NO ASSIGNMENT AT ALL                           CHECK 4: the 25 legacy rows
--
-- ==> S4 IS THE ONE THAT MATTERS MOST. Twenty-five sessions in this database
--     have a null assignment_id. They are pre-Stage-7 test practices, and the
--     standing rule in three files is that a session with no assignment is
--     conversation-only. After T1 the voice is read THROUGH the assignment, so
--     those rows have nothing to read it through. They must still mint rather
--     than fail, and S4 is how that gets measured instead of assumed. <==
--
-- THE PRACTICE CAP CANNOT FIRE ON ANY OF THESE. lib/practice.ts prunes on
-- (student_id, assignment_id, kind = 'practice', a FINISHED status). All four
-- rows stay at in_progress, so none of them is in scope. That matters here:
-- D2 lost B1's only voice transcript to exactly that prune.
--
-- IDS ARE FIXED RATHER THAN GENERATED, so the restore file can name the exact
-- four rows it deletes instead of matching on a description that would also fit
-- real data.
--
-- NOTHING IN TOM'S CLASS IS READ OR WRITTEN. Every id is written out in full
-- rather than by prefix, and every one is B1's:
--   class    196770e0-cdd5-4fe4-80e4-421ee6c7d13f  B1: A demo class
--   scenario 68bc4303-e5ae-4fdb-bcc4-0372631dc729  Presentation-Close: Alex
--   student  920c9ea3-c415-4013-94e4-1487fd2fe19e  2studentb1@gmail.com


-- ---------------------------------------------------------------------------
-- 1. The four probe sessions.
-- ---------------------------------------------------------------------------
-- class_id is NOT NULL on public.sessions. It is not in
-- supabase/stage-2-data-model.sql, which is where this file's first draft read
-- the shape from: a later gate added it, and the insert failed on it. The
-- column list below was taken from information_schema rather than from a
-- migration file, which is the only source that is current by construction.
insert into public.sessions (id, student_id, scenario_id, assignment_id, kind, mode, status, class_id)
values
  ('00000000-0000-4000-8000-0000000000a1'::uuid,
   '920c9ea3-c415-4013-94e4-1487fd2fe19e',
   '68bc4303-e5ae-4fdb-bcc4-0372631dc729',
   'f63ec110-46e8-4c65-ad4b-bb86ea3ba295',
   'practice', 'voice_video', 'in_progress',
   '196770e0-cdd5-4fe4-80e4-421ee6c7d13f'),

  ('00000000-0000-4000-8000-0000000000a2'::uuid,
   '920c9ea3-c415-4013-94e4-1487fd2fe19e',
   '68bc4303-e5ae-4fdb-bcc4-0372631dc729',
   '8ba0b8b0-ded2-41d1-ab14-a8d9ce823811',
   'practice', 'voice_video', 'in_progress',
   '196770e0-cdd5-4fe4-80e4-421ee6c7d13f'),

  ('00000000-0000-4000-8000-0000000000a3'::uuid,
   '920c9ea3-c415-4013-94e4-1487fd2fe19e',
   '68bc4303-e5ae-4fdb-bcc4-0372631dc729',
   '57265ba6-0939-478b-8e6c-b11849f0f7ab',
   'practice', 'voice_video', 'in_progress',
   '196770e0-cdd5-4fe4-80e4-421ee6c7d13f'),

  ('00000000-0000-4000-8000-0000000000a4'::uuid,
   '920c9ea3-c415-4013-94e4-1487fd2fe19e',
   '68bc4303-e5ae-4fdb-bcc4-0372631dc729',
   null,
   'practice', 'voice_video', 'in_progress',
   '196770e0-cdd5-4fe4-80e4-421ee6c7d13f')
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 2. Confirm the four rows are the shapes the checks need.
-- ---------------------------------------------------------------------------
-- Expect FOUR rows, all in_progress, all owned by 2studentb1, all on a B1
-- scenario, and the voice_the_assignment_carries column reading, in order:
-- (null), cedar, marin, (no assignment at all).
select
  s.id,
  coalesce(a.title, '(NO ASSIGNMENT: this is check 4)')      as assignment,
  coalesce(a.voice, case when s.assignment_id is null
                         then '(no assignment, so no voice to read)'
                         else '(NULL, which means cedar)' end) as voice_the_assignment_carries,
  s.status,
  p.email     as student,
  sc.class_id as class_must_be_b1
from public.sessions s
join public.profiles  p  on p.id  = s.student_id
join public.scenarios sc on sc.id = s.scenario_id
left join public.assignments a on a.id = s.assignment_id
where s.id in (
  '00000000-0000-4000-8000-0000000000a1'::uuid,
  '00000000-0000-4000-8000-0000000000a2'::uuid,
  '00000000-0000-4000-8000-0000000000a3'::uuid,
  '00000000-0000-4000-8000-0000000000a4'::uuid
)
order by s.id;
