-- Relii T1: REMOVE THE FOUR PROBE SESSIONS.
--
-- Undoes supabase/t1-session-probes.sql and NOTHING ELSE.
--
-- IT DELETES EXACTLY FOUR ROWS, EACH NAMED BY ITS FULL ID. The ids were fixed
-- in the probe file rather than generated precisely so this file can name them.
--
-- ==> THE DANGEROUS VERSION OF THIS FILE IS THE ONE THAT MATCHES ON A
--     DESCRIPTION. "delete where assignment_id is null" would remove the
--     twenty-five real pre-Stage-7 sessions along with probe S4, and nothing
--     anywhere would report it. "delete where status = 'in_progress'" would
--     remove any practice a student happens to have open. Both read as
--     reasonable and both are wrong. That is why the statement below lists four
--     literal ids and nothing else. <==
--
-- None of the four was ever finished, so none has a transcript, a recording, a
-- score or a Storage object behind it. Deleting them leaves nothing orphaned.

-- ---------------------------------------------------------------------------
-- 1. What is about to be deleted. Run this first if you want to see it.
-- ---------------------------------------------------------------------------
select
  id,
  coalesce(assignment_id::text, '(null)') as assignment_id,
  status,
  kind,
  mode,
  video_path,
  jsonb_array_length(transcript) as transcript_turns,
  created_at
from public.sessions
where id in (
  '00000000-0000-4000-8000-0000000000a1'::uuid,
  '00000000-0000-4000-8000-0000000000a2'::uuid,
  '00000000-0000-4000-8000-0000000000a3'::uuid,
  '00000000-0000-4000-8000-0000000000a4'::uuid
)
order by id;


-- ---------------------------------------------------------------------------
-- 2. The delete. FOUR ROWS, BY ID.
-- ---------------------------------------------------------------------------
delete from public.sessions
where id in (
  '00000000-0000-4000-8000-0000000000a1'::uuid,
  '00000000-0000-4000-8000-0000000000a2'::uuid,
  '00000000-0000-4000-8000-0000000000a3'::uuid,
  '00000000-0000-4000-8000-0000000000a4'::uuid
);


-- ---------------------------------------------------------------------------
-- 3. Confirm. Three numbers, and each one guards a different mistake.
-- ---------------------------------------------------------------------------
-- probe_rows_left                 must be 0:  the probes are gone.
-- real_null_assignment_sessions   must be 25: nothing else was caught by the
--                                             null-assignment shape.
-- all_sessions                    must be 52: the count before the probes were
--                                             inserted, so nothing else went
--                                             with them.
select
  (select count(*) from public.sessions
     where id in (
       '00000000-0000-4000-8000-0000000000a1'::uuid,
       '00000000-0000-4000-8000-0000000000a2'::uuid,
       '00000000-0000-4000-8000-0000000000a3'::uuid,
       '00000000-0000-4000-8000-0000000000a4'::uuid
     ))                                            as probe_rows_left,
  (select count(*) from public.sessions
     where assignment_id is null)                  as real_null_assignment_sessions,
  (select count(*) from public.sessions)           as all_sessions;
