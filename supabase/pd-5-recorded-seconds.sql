-- Relii pre-demo sprint PD-5: the recorded length of one session, on sessions.
--
-- HOW TO USE: open your Supabase dashboard, click "SQL Editor" in the left
-- sidebar, click "New query", paste this whole file in, and click "Run"
-- (bottom right). It is safe to run more than once.
--
-- RUN THIS BEFORE THE NEW CODE GOES LIVE. The updated app reads and writes this
-- column, so if the code is deployed first it will fail with "column does not
-- exist" until this file has been run.
--
-- WHAT THIS IS
-- How long ONE practice or ONE submission ran, in whole seconds. It is the
-- number the app labels "Recording Length" on the student home, the student
-- results page, the instructor submissions table, and the instructor submission
-- view. It is always about that ONE session and is never a running total across
-- a student's attempts.
--
-- WHAT NUMBER GOES IN IT
-- Two cases, and the column holds whichever one applies:
--   1. A voice + video session with the CAMERA ON, so a recording exists: the
--      length of that recording, measured in the browser from the moment the
--      recorder starts to the moment it stops.
--   2. Everything else (a text session, or a voice + video session where the
--      student declined the camera so there is no recording): the elapsed
--      conversation time, start to end.
-- Because both cases land in the same column, nothing reading it has to know
-- which kind of session it came from. It just shows the number.
--
-- WHY A STORED NUMBER AND NOT A SECOND TIMESTAMP
-- The other way to do this was to add an "ended at" time and subtract the
-- session's created_at. That was rejected for two reasons. First, it is not the
-- recording's length: on a voice call the recorder starts a moment after the
-- call connects, so the subtraction answers a different question than case 1
-- asks. Second, it would be wrong even for the elapsed-time case, because a
-- voice session's row is created when the student clicks Practice, and they
-- then sit on a "Start call" screen for as long as they like before the
-- conversation actually begins. Subtracting from created_at would silently count
-- that waiting time, and the number would not match the count-up clock the
-- student watched during the meeting. One column holding the measured answer is
-- both smaller and more accurate than a timestamp something else has to derive.
--
-- NULLABLE ON PURPOSE, WITH NO DEFAULT
-- Empty means "we do not have a measured length for this session". That is true
-- of every session recorded before this column existed, and of an attempt that
-- never reached its normal ending (an interrupted graded submission). There is
-- deliberately no default and no NOT NULL rule, because inventing a number for
-- a session nobody measured would be making data up. Where the app can make a
-- reasonable estimate for one of those older rows from the timestamps it already
-- has, it shows the estimate; otherwise it shows a dash.
--
-- WHY THE NOT-NEGATIVE CHECK
-- A length cannot be less than zero. The app already rounds and floors the value
-- it sends, so this is the database saying the same thing, and it means a
-- nonsense number cannot get in by any route.
--
-- WHAT THIS DOES NOT DO
-- It creates no table, removes nothing, and changes no Row Level Security or
-- Storage rule. Sessions stay server-written with the service-role key (data
-- model decision A), so this column is filled in by the same server route that
-- already ends a session, and the browser cannot write it directly. It does not
-- touch scoring, the transcript, the recording upload, the retention cap, or the
-- graded-submission lock window.

-- ---------------------------------------------------------------------------
-- 1. The recorded length column.
-- ---------------------------------------------------------------------------
-- A whole number of seconds. Empty (null) means no measured length.
alter table public.sessions
  add column if not exists recorded_seconds integer;

-- ---------------------------------------------------------------------------
-- 2. The not-negative rule.
-- ---------------------------------------------------------------------------
-- Postgres has no "add constraint if not exists", so this checks for the rule
-- by name first and only adds it when it is missing. That is what makes the
-- file safe to run more than once.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_recorded_seconds_not_negative'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_recorded_seconds_not_negative
      check (recorded_seconds is null or recorded_seconds >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Check it worked (this changes nothing; it just shows you the result).
-- ---------------------------------------------------------------------------
-- Expect every existing session listed with an EMPTY recorded_seconds, which
-- means no measured length was ever taken for it, and with everything else
-- unchanged. Sessions finished after the new code goes live will show a number
-- here.
select
  id,
  kind,
  mode,
  status,
  recorded_seconds,
  video_path is not null as has_recording,
  created_at,
  scored_at
from public.sessions
order by created_at desc
limit 50;
