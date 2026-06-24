-- Relii Stage 5: private Storage for the webcam recordings.
--
-- PREREQUISITE (do this first, in the dashboard):
--   Storage  ->  New bucket  ->  name it exactly  session-videos
--   and leave the "Public bucket" toggle OFF (it must be private).
--
-- THEN: open the SQL Editor, paste this whole file, and click Run.
-- It is safe to run more than once.
--
-- What this sets up:
--   - A student can DOWNLOAD only the recordings inside their own folder.
--   - The bucket is private (created not-public above), so nothing in it is
--     ever publicly readable.
--   - There is deliberately NO student WRITE rule here. Uploads happen through a
--     one-time signed link that the SERVER mints with the service-role key,
--     exactly like session rows are server-written (data-model decision A). The
--     service-role key bypasses these rules and is the only thing that can mint
--     that upload link or read any file for playback.
--   - Playback in the app is gatekept by the server too: the results page only
--     hands out a short-lived download link after confirming the student owns
--     the session (the same ownership rule the sessions table already enforces).
--
-- Files are stored at the path:  <student-user-id>/<session-id>.webm
-- so the FIRST folder of every file is the owning student's id. The rule below
-- compares that first folder to the logged-in user's id.
--
-- DEFERRED to Stage 8 (instructor dashboard): letting instructors watch the
-- recordings attached to graded submissions. That read rule is added then,
-- mirroring how instructors already read submission rows.

drop policy if exists "students read own session videos" on storage.objects;
create policy "students read own session videos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'session-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
